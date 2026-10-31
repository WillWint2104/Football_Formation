// No request URL, headers, body, cookie, provider message or exception text is recorded.
import { performance } from 'node:perf_hooks';
const codes = new Set(['ECONNRESET', 'ECONNREFUSED', 'ENOTFOUND', 'EACCES', 'ETIMEDOUT', 'UND_ERR_CONNECT_TIMEOUT', 'UND_ERR_HEADERS_TIMEOUT', 'UND_ERR_SOCKET']);
/** Classify transport failures using an allowlist without returning provider text or secrets. */
export function errorCategory(error, deadline = false) {
    if (deadline || error?.name === 'TimeoutError')
        return 'timeout';
    if (error?.name === 'AbortError')
        return 'aborted';
    const code = error?.cause?.code ?? error?.code;
    return codes.has(code) ? code : 'transport_error';
}
/** Read at most the supplied byte limit; never expose the body in diagnostic output. */
async function boundedBody(response, limit) {
    const reader = response.body?.getReader();
    if (!reader)
        return '';
    const parts = [];
    let bytes = 0;
    try {
        for (;;) {
            const { done, value } = await reader.read();
            if (done)
                break;
            bytes += value.byteLength;
            if (bytes > limit) {
                await reader.cancel();
                throw new RangeError('Response exceeds diagnostic limit');
            }
            parts.push(value);
        }
    }
    finally {
        reader.releaseLock();
    }
    return Buffer.concat(parts).toString('utf8');
}
/**
 * Send once with an independent header/body deadline, retaining received status on timeout.
 * A timeout does not establish database commit state. Reporting failure preserves the result.
 */
export async function measure(label, send, { timeoutMs = 30000, onResult = async () => { } } = {}) {
    if (!/^[a-z0-9.-]{1,64}$/.test(label) || !Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 60000)
        throw new Error('Invalid diagnostic specification');
    const start = performance.now(), controller = new AbortController();
    let status = null, headersMs = null, timedOut = false, timer;
    const base = () => ({ label, status, headersMs, elapsedMs: Math.round(performance.now() - start), attempts: 1, dbCommit: 'unknown' });
    const work = (async () => {
        try {
            const response = await send(controller.signal);
            status = response.status;
            headersMs = Math.round(performance.now() - start);
            const text = await boundedBody(response, 4096);
            let ackVersion = null;
            if (status === 200) {
                try {
                    const obj = JSON.parse(text);
                    if (Object.keys(obj).length !== 1 || !Number.isSafeInteger(obj.version) || obj.version < 0)
                        throw 0;
                    ackVersion = obj.version;
                }
                catch {
                    return { ...base(), completion: 'invalid_response', category: 'invalid_acknowledgement', ackVersion: null };
                }
            }
            return { ...base(), completion: 'response', category: status === 409 ? 'conflict' : status === 200 ? 'success' : 'unexpected_http', ackVersion };
        }
        catch (error) {
            return { ...base(), completion: timedOut ? 'timeout' : status === null ? 'rejected' : 'body_error', category: errorCategory(error, timedOut), ackVersion: null };
        }
    })();
    const timeout = new Promise(resolve => { timer = setTimeout(() => { timedOut = true; controller.abort(); resolve({ ...base(), completion: status === null ? 'timeout' : 'body_timeout', category: 'timeout', ackVersion: null }); }, timeoutMs); });
    const result = await Promise.race([work, timeout]);
    clearTimeout(timer);
    try {
        await onResult(result);
        return { ...result, reporting: 'complete' };
    }
    catch {
        return { ...result, reporting: 'failed' };
    }
}
/** Validate two distinct safe labels, then collect both outcomes without retries or fail-fast loss. */
export async function collectPair(specs, options) {
    if (specs.length !== 2)
        throw new Error('Exactly two requests required');
    if (new Set(specs.map(s => s.label)).size !== 2 || specs.some(s => !/^[a-z0-9.-]{1,64}$/.test(s.label) || typeof s.send !== 'function'))
        throw new Error('Invalid request pair');
    const settled = await Promise.allSettled(specs.map(s => measure(s.label, s.send, options)));
    return settled.map((s, i) => s.status === 'fulfilled' ? s.value : { label: specs[i].label, status: null, headersMs: null, elapsedMs: null, attempts: 1, completion: 'diagnostic_error', category: 'collector_error', ackVersion: null, dbCommit: 'unknown' });
}
/** Require separate HTTP, snapshot-history and reporting proofs before accepting a single commit. */
export function reconcile(before, after, results) {
    const old = new Map(before.snapshots.map(s => [s.organizationId + '@' + s.version, s.hash]));
    const now = new Map(after.snapshots.map(s => [s.organizationId + '@' + s.version, s.hash]));
    const historyPreserved = old.size === before.snapshots.length && now.size === after.snapshots.length && [...old].every(([key, hash]) => now.get(key) === hash);
    const added = after.snapshots.filter(s => !old.has(s.organizationId + '@' + s.version));
    const dbSingleCommit = historyPreserved && after.organizationId === before.organizationId && after.version === before.version + 1 && added.length === 1 && added[0].organizationId === before.organizationId && added[0].version === after.version;
    const httpPairProven = results.length === 2 && results.every(r => r.completion === 'response') && results.map(r => r.status).sort().join(',') === '200,409' && results.find(r => r.status === 200)?.ackVersion === before.version + 1;
    const reportingComplete = results.every(r => r.reporting !== 'failed');
    return { historyPreserved, addedSnapshots: added.length, dbSingleCommit, httpPairProven, reportingComplete, acceptancePassed: dbSingleCommit && httpPairProven && reportingComplete };
}
