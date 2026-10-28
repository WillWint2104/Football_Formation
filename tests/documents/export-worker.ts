import { handleGuideExport } from "../../lib/server/guide-export-http";
import { handleDocument } from "../../lib/server/document-http";
import { domainBundleSchema } from "../../lib/domain/validation";
import { PersistenceError } from "../../lib/server/errors";
import type { ObjectRecord, DocumentStore } from "../../lib/server/repositories/documents";
import type { CoachingStore } from "../../lib/server/repositories/coaching";

/** Browser-test bridge to the real server handlers/generator; Auth and object storage are explicit local stand-ins. */
async function run() {
  let input = ""; for await (const chunk of process.stdin) input += chunk;
  const config = JSON.parse(input) as { bundle: unknown; version: number; method: string; url: string; headers: Record<string, string>; failSave?: boolean; records: ObjectRecord[]; blobs: Record<string, string> };
  let bundle = domainBundleSchema.parse(config.bundle), version = config.version;
  const records = config.records, blobs = config.blobs, actor = "00000000-0000-4000-8000-000000000001";
  const store: CoachingStore = { load: async (organization) => { if (organization !== bundle.organizationId) throw new PersistenceError(404, "Unavailable organisation"); return { bundle, version }; },
    save: async (_organization, _actor, expected, next) => { if (config.failSave) throw new PersistenceError(503, "Uncertain save"); if (expected !== version) throw new PersistenceError(409, "Changed"); bundle = domainBundleSchema.parse(next); return ++version; } };
  const documents: DocumentStore = { register: async (_actor, record) => { records.push(record); }, put: async (record, bytes) => { blobs[record.object_key] = Buffer.from(bytes).toString("base64"); },
    get: async (organization, id, revision) => { const record = records.find((r) => r.organization_id === organization && r.id === id && r.revision === revision); if (!record) throw new PersistenceError(404, "Unavailable document"); return record; },
    download: async (record) => new Uint8Array(Buffer.from(blobs[record.object_key], "base64")) };
  const parts = new URL(config.url).pathname.split("/"), route = { organizationId: parts[3], sessionId: parts[5], revision: parts[6], documentId: parts[8], documentRevision: parts[9] };
  const handler = config.method === "POST" ? handleGuideExport : handleDocument;
  const response = await handler(new Request(config.url, { method: config.method, headers: config.headers }), route, new URL(config.url).origin, async () => ({ actor, store, documents: () => documents }));
  const bytes = new Uint8Array(await response.arrayBuffer());
  process.stdout.write(JSON.stringify({ status: response.status, headers: Object.fromEntries(response.headers), body: Buffer.from(bytes).toString("base64"), bundle, version, records, blobs }));
}
run().catch((error) => { console.error(error); process.exitCode = 1; });
