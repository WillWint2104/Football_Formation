import { z } from "zod";
import { idSchema } from "../domain/common";
import { decodeDraft } from "./drafts";
import type { DesignerDocument } from "./contract";
import { parseSessionPackageJson, serializeSessionPackageJson, SESSION_PACKAGE_LIMITS, type PackageDiagnostic, type SessionPackage } from "./package";

/** Repository budgets are separate from, and do not relax, the portable package contract. */
export const COMPANION_LIMITS = Object.freeze({ documents: 16, snapshots: 2, bytes: 64 * 1024 * 1024 });
export type CompanionError = { code: "invalid_package" | "invalid_record" | "invalid_target" | "conflict" | "quota" | "unavailable" | "interrupted"; message: string; diagnostics?: PackageDiagnostic[] };
export type CompanionResult<T> = { ok: true; value: T } | { ok: false; error: CompanionError };
export class CompanionStorageError extends Error {
  constructor(public code: CompanionError["code"], message: string) { super(message); }
}
const snapshotSchema = z.strictObject({ ownerVersion: z.number().int().positive().max(Number.MAX_SAFE_INTEGER), savedAt: z.iso.datetime(), packageJson: z.string().max(SESSION_PACKAGE_LIMITS.bytes), sha256: z.string().regex(/^[a-f0-9]{64}$/) });
const recordSchema = z.strictObject({ version: z.literal(1), documentId: idSchema, ownerVersion: z.number().int().positive().max(Number.MAX_SAFE_INTEGER), snapshots: z.array(z.unknown()).min(1).max(COMPANION_LIMITS.snapshots) });
export type CompanionSnapshot = z.infer<typeof snapshotSchema>;
export type CompanionRecord = Omit<z.infer<typeof recordSchema>, "snapshots"> & { snapshots: CompanionSnapshot[] };
/** work must be synchronous; an adapter commits a put and its CAS check in one transaction. */
export interface CompanionStorage {
  transact<T>(mode: "readonly" | "readwrite", work: (records: readonly unknown[]) => { value: T; put?: CompanionRecord }): Promise<T>;
}
export type RecoveredCompanion = CompanionSnapshot & { documentId: string; package: SessionPackage };
export type CompanionRead = { status: "missing"; documentId: string } | { status: "ready"; snapshot: RecoveredCompanion } |
  { status: "invalid"; documentId: string; messages: string[]; recoverable?: RecoveredCompanion };
export type CompanionEntry = { documentId: string; status: "ready" | "invalid"; ownerVersion: number | null; savedAt: string | null; recoverableOwnerVersion: number | null };
const bytes = (text: string) => new TextEncoder().encode(text).length;
const fail = <T = never>(code: CompanionError["code"], message: string, diagnostics?: PackageDiagnostic[]): CompanionResult<T> => ({ ok: false, error: { code, message, ...(diagnostics ? { diagnostics } : {}) } });
function storageFailure(error: unknown): CompanionResult<never> {
  return error instanceof CompanionStorageError ? fail(error.code, error.message) : fail("unavailable", "Local companion storage is unavailable. Keep in-memory work and downloads; reopen to verify the saved version before another save.");
}
async function sha256(text: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}
function target(id: string): boolean { return idSchema.safeParse(id).success; }
function find(records: readonly unknown[], id: string): unknown | undefined {
  const matches = records.filter((r) => r !== null && typeof r === "object" && "documentId" in r && r.documentId === id);
  if (matches.length > 1) throw new CompanionStorageError("invalid_record", "Duplicate local document identity. Preserve the stored data for recovery.");
  return matches[0];
}
function checkedHeader(raw: unknown, id: string) {
  const parsed = recordSchema.safeParse(raw);
  return parsed.success && parsed.data.documentId === id ? parsed.data : null;
}
async function recoverRecord(raw: unknown, id: string): Promise<CompanionRead> {
  if (raw === undefined) return { status: "missing", documentId: id };
  const header = checkedHeader(raw, id);
  if (!header) return { status: "invalid", documentId: id, messages: ["Invalid or incompatible companion envelope. It has not been modified."] };
  const messages: string[] = [], valid: RecoveredCompanion[] = [];
  for (const [index, candidate] of header.snapshots.entries()) {
    const parsed = snapshotSchema.safeParse(candidate), expectedVersion = header.ownerVersion - index;
    if (!parsed.success || parsed.data.ownerVersion !== expectedVersion || bytes(parsed.data.packageJson) > SESSION_PACKAGE_LIMITS.bytes) {
      messages.push(`Snapshot ${index + 1} has invalid metadata, version or size.`); continue;
    }
    const snapshot = parsed.data;
    if (await sha256(snapshot.packageJson) !== snapshot.sha256) { messages.push(`Snapshot ${index + 1} failed its integrity check.`); continue; }
    const pkg = parseSessionPackageJson(snapshot.packageJson);
    if (!pkg.ok) { messages.push(`Snapshot ${index + 1} is not a complete valid package: ${pkg.diagnostics.slice(0, 3).map((d) => d.message).join(" ")}`); continue; }
    valid.push({ ...snapshot, documentId: id, package: pkg.value });
  }
  if (header.snapshots.length !== Math.min(header.ownerVersion, COMPANION_LIMITS.snapshots)) messages.push("Expected recovery snapshot is missing.");
  if (valid.length === 2 && Date.parse(valid[0].savedAt) < Date.parse(valid[1].savedAt)) messages.push("Snapshot timestamps are inconsistent.");
  if (messages.length) return { status: "invalid", documentId: id, messages, ...(valid.length ? { recoverable: valid[0] } : {}) };
  return { status: "ready", snapshot: valid[0] };
}

/** Actual stored UTF-8 payloads are counted, never trusted size claims. No eviction of other plans. */
function enforceBudget(records: readonly unknown[], next: CompanionRecord): void {
  const replaced = find(records, next.documentId);
  if (records.length + (replaced === undefined ? 1 : 0) > COMPANION_LIMITS.documents)
    throw new CompanionStorageError("quota", "The local companion repository already holds 16 plans. Download plans before managing browser storage.");
  let total = 0;
  for (const raw of [...records.filter((r) => r !== replaced), next]) {
    const header = recordSchema.safeParse(raw);
    if (!header.success) throw new CompanionStorageError("invalid_record", "An incompatible local record prevents a safe quota calculation. Nothing was replaced.");
    for (const candidate of header.data.snapshots) {
      const snapshot = snapshotSchema.safeParse(candidate);
      if (!snapshot.success) throw new CompanionStorageError("invalid_record", "An invalid local snapshot prevents a safe quota calculation. Nothing was replaced.");
      const size = bytes(snapshot.data.packageJson);
      if (size > SESSION_PACKAGE_LIMITS.bytes) throw new CompanionStorageError("invalid_record", "A stored package exceeds its portable limit.");
      total += size;
    }
  }
  if (total > COMPANION_LIMITS.bytes) throw new CompanionStorageError("quota", "Saving would exceed the 64 MiB local companion payload budget. Existing plans are unchanged; keep a downloaded package.");
}

/** No legacy draft writes, implicit import replacement, automatic retries or automatic repairs. */
export class CompanionRepository {
  constructor(private storage: CompanionStorage, private options: { now?: () => number; newId?: () => string } = {}) {}
  /** Discover saved identities after refresh without an extra localStorage pointer or implicit selection. */
  async list(): Promise<CompanionResult<CompanionEntry[]>> {
    try {
      const records = await this.storage.transact("readonly", (records) => ({ value: records }));
      const entries: CompanionEntry[] = [], seen = new Set<string>();
      for (const raw of records) {
        const id = raw !== null && typeof raw === "object" && "documentId" in raw ? raw.documentId : null;
        if (typeof id !== "string" || !target(id) || seen.has(id)) return fail("invalid_record", "The repository contains an invalid or repeated local identity. Nothing was discarded or selected.");
        seen.add(id);
        const recovered = await recoverRecord(raw, id);
        if (recovered.status === "ready") entries.push({ documentId: id, status: "ready", ownerVersion: recovered.snapshot.ownerVersion, savedAt: recovered.snapshot.savedAt, recoverableOwnerVersion: null });
        else entries.push({ documentId: id, status: "invalid", ownerVersion: null, savedAt: null, recoverableOwnerVersion: recovered.status === "invalid" ? recovered.recoverable?.ownerVersion ?? null : null });
      }
      return { ok: true, value: entries.sort((a, b) => a.documentId.localeCompare(b.documentId)) };
    } catch (error) { return storageFailure(error); }
  }
  async read(documentId: string): Promise<CompanionResult<CompanionRead>> {
    if (!target(documentId)) return fail("invalid_target", "Use a stable local document ID.");
    try {
      const raw = await this.storage.transact("readonly", (records) => ({ value: find(records, documentId) }));
      return { ok: true, value: await recoverRecord(raw, documentId) };
    } catch (error) { return storageFailure(error); }
  }
  /** Import always creates a fresh local owner identity; file namespace and scene pins stay intact. */
  async create(input: unknown): Promise<CompanionResult<RecoveredCompanion>> { return this.write(null, null, input); }
  async save(documentId: string, expectedOwnerVersion: number, input: unknown): Promise<CompanionResult<RecoveredCompanion>> {
    if (!target(documentId) || !Number.isSafeInteger(expectedOwnerVersion) || expectedOwnerVersion < 1 || expectedOwnerVersion >= Number.MAX_SAFE_INTEGER)
      return fail("invalid_target", "Use the stable local ID and a valid base owner version with room for its successor.");
    return this.write(documentId, expectedOwnerVersion, input);
  }
  private async write(id: string | null, expected: number | null, input: unknown): Promise<CompanionResult<RecoveredCompanion>> {
    const serialized = serializeSessionPackageJson(input);
    if (!serialized.ok) return fail("invalid_package", "The complete package was rejected before storage. Existing drafts and plans are unchanged.", serialized.diagnostics);
    try {
      const pkg = parseSessionPackageJson(serialized.value);
      if (!pkg.ok) return fail("invalid_package", "The serialized package could not be validated.", pkg.diagnostics);
      const documentId = id ?? (this.options.newId ?? (() => crypto.randomUUID()))();
      if (!target(documentId)) return fail("invalid_target", "Local document identity allocation failed; no save was attempted.");
      const observed = id === null ? undefined : await this.storage.transact("readonly", (records) => ({ value: find(records, documentId) }));
      if (id !== null) {
        const recovered = await recoverRecord(observed, documentId);
        if (recovered.status === "missing") return fail("conflict", "The local plan is missing. Import as a new independent plan; do not recreate a missing owner implicitly.");
        if (recovered.status === "invalid") return fail("invalid_record", "The local plan needs explicit recovery. Download the recoverable package and import it as a new identity; no in-place repair was attempted.");
        if (recovered.snapshot.ownerVersion !== expected) return fail("conflict", "Another tab saved this plan. Keep your in-memory package, reopen the current version and resolve the difference explicitly.");
        if (recovered.snapshot.package.sceneNamespace !== null && pkg.value.sceneNamespace !== recovered.snapshot.package.sceneNamespace)
          return fail("invalid_package", "An existing local plan's scene namespace cannot be remapped. Import a different namespace as a new independent local plan.");
        // A retained native revision is immutable across owner saves as well as within one file.
        const retained = checkedHeader(observed, documentId)!;
        for (const rawSnapshot of retained.snapshots) {
          const old = parseSessionPackageJson(snapshotSchema.parse(rawSnapshot).packageJson);
          if (!old.ok) return fail("invalid_record", "A retained snapshot became invalid. Reopen for explicit recovery.");
          for (const scene of old.value.scenes) {
            const incoming = pkg.value.scenes.find((s) => s.organizationId === scene.organizationId && s.id === scene.id && s.revision === scene.revision);
            if (incoming && JSON.stringify(ordered(incoming)) !== JSON.stringify(ordered(scene)))
              return fail("invalid_package", "A retained immutable scene revision has different content. Use a new native scene revision and an explicit activity pin.", [{ code: "revision_conflict", path: ["scenes"], message: "Retained revision contents cannot be replaced.", reference: { namespace: scene.organizationId, id: scene.id, revision: scene.revision } }]);
          }
        }
      }
      const ownerVersion = expected === null ? 1 : expected + 1;
      const snapshot: CompanionSnapshot = { ownerVersion, savedAt: new Date((this.options.now ?? Date.now)()).toISOString(), packageJson: serialized.value, sha256: await sha256(serialized.value) };
      const header = observed === undefined ? null : checkedHeader(observed, documentId);
      if (header) {
        const previous = snapshotSchema.parse(header.snapshots[0]);
        if (Date.parse(snapshot.savedAt) < Date.parse(previous.savedAt)) return fail("invalid_record", "The device clock precedes the last saved snapshot. Keep a download and correct the clock before saving.");
      }
      const next: CompanionRecord = { version: 1, documentId, ownerVersion, snapshots: [snapshot, ...(header ? [snapshotSchema.parse(header.snapshots[0])] : [])] };
      const observedToken = JSON.stringify(observed);
      await this.storage.transact("readwrite", (records) => {
        if (JSON.stringify(find(records, documentId)) !== observedToken) throw new CompanionStorageError("conflict", "The local owner changed during this save. No overwrite or automatic retry was made.");
        enforceBudget(records, next);
        return { value: undefined, put: next };
      });
      return { ok: true, value: { ...snapshot, documentId, package: pkg.value } };
    } catch (error) { return storageFailure(error); }
  }
}

export type RecoveryOption = { kind: "complete-package"; savedAt: string; snapshot: RecoveredCompanion } |
  { kind: "reference-only-draft"; savedAt: string; document: DesignerDocument; draftJson: string };
export type RecoveryPlan = { status: "empty" | "complete" | "legacy-only" | "choice" | "blocked"; options: RecoveryOption[]; messages: string[] };
function ordered(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(ordered);
  if (value !== null && typeof value === "object") return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, ordered(v)]));
  return value;
}
/** Read-only recovery policy. A caller must display choices and never write either store on inspection. */
export function planCompanionRecovery(companion: CompanionRead, legacyText: string | null, now = Date.now()): RecoveryPlan {
  const messages = companion.status === "invalid" ? [...companion.messages] : [], options: RecoveryOption[] = [];
  const snapshot = companion.status === "ready" ? companion.snapshot : companion.status === "invalid" ? companion.recoverable : undefined;
  if (snapshot) options.push({ kind: "complete-package", savedAt: snapshot.savedAt, snapshot });
  let legacy: ReturnType<typeof decodeDraft> | undefined;
  if (legacyText !== null) {
    try { legacy = decodeDraft(legacyText, now); }
    catch { messages.push("The legacy draft is invalid or expired. Its original bytes remain untouched; keep them for manual recovery."); }
  }
  if (legacy && legacyText !== null) {
    const same = snapshot && JSON.stringify(ordered(legacy.document)) === JSON.stringify(ordered(snapshot.package.document));
    if (!same) options.push({ kind: "reference-only-draft", savedAt: legacy.savedAt, document: legacy.document, draftJson: legacyText });
    if (!same && snapshot) messages.push(Date.parse(legacy.savedAt) > Date.parse(snapshot.savedAt) ? "A newer text draft differs from the complete plan. Choose either the complete plan with diagrams or the newer reference-only draft; nothing has been merged." : "The text draft differs from the complete plan. Choose explicitly; timestamps alone do not establish ownership.");
  }
  if (companion.status === "invalid") return { status: options.length ? "choice" : "blocked", options, messages };
  if (options.length > 1) return { status: "choice", options, messages };
  return { status: options[0]?.kind === "complete-package" ? "complete" : options.length ? "legacy-only" : messages.length ? "blocked" : "empty", options, messages };
}
