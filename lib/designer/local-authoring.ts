import { z } from "zod";
import type { TacticalScene } from "../domain/tactical-scene";
import { prepareScene, sceneDuration } from "../tactical/evaluate";
import { attachmentCandidate, sameDocument } from "./attachments";
import { exportDocument, type DesignerDocument } from "./contract";
import { validateSessionPackage, type SessionPackage } from "./package";
import type { CompanionRepository, RecoveredCompanion } from "./companion";

const id = z.string().min(1).max(200), digest = z.string().regex(/^[a-f0-9]{64}$/);
const ref = z.strictObject({ id, version: z.number().int().positive().max(Number.MAX_SAFE_INTEGER), digest });
const pin = z.strictObject({ scene: z.strictObject({ id, revision: z.number().int().positive() }), representativeSeconds: z.number().finite().nonnegative() });
const contextSchema = z.strictObject({ version: z.literal(1), operation: z.uuid(), origin: ref, candidate: ref.nullable(),
  activityId: id, index: z.number().int().min(0).max(19).nullable(), original: pin.nullable(),
  draftDigest: digest, documentDigest: digest, sceneId: z.uuid(), namespace: id, seconds: z.number().finite().nonnegative() });
export type LocalAuthoringContext = z.infer<typeof contextSchema>;
export const AUTHORING_QUERY = "localAuthoring";
export function decodeAuthoringContext(raw: string): LocalAuthoringContext {
  if (raw.length > 6000) throw new Error("Local copy return reference is too large. Nothing was selected.");
  return contextSchema.parse(JSON.parse(raw));
}
export function encodeAuthoringContext(context: LocalAuthoringContext): string { return JSON.stringify(contextSchema.parse(context)); }
export function snapshotRef(s: RecoveredCompanion) { return { id: s.documentId, version: s.ownerVersion, digest: s.sha256 }; }
export async function contentDigest(value: unknown): Promise<string> {
  const ordered = (v: unknown): unknown => Array.isArray(v) ? v.map(ordered) : v !== null && typeof v === "object"
    ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, ordered(v)])) : v;
  const data = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(ordered(value))));
  return Array.from(new Uint8Array(data), (b) => b.toString(16).padStart(2, "0")).join("");
}
function checkedPackage(input: unknown): SessionPackage {
  const result = validateSessionPackage(input);
  if (!result.ok) throw new Error(result.diagnostics.slice(0, 4).map((d) => d.message).join(" "));
  return result.value;
}
/** URL values select exact B2 records only. No scene, draft or permission is recovered from a URL. */
export async function exactSnapshot(repository: CompanionRepository, expected: LocalAuthoringContext["origin"]) {
  const read = await repository.read(expected.id);
  if (!read.ok) throw new Error(read.error.message);
  if (read.value.status !== "ready") throw new Error(`Local copy package is ${read.value.status}. Nothing was substituted. Inspect saved local plans for deliberate recovery.`);
  const s = read.value.snapshot;
  if (s.ownerVersion !== expected.version || s.sha256 !== expected.digest) throw new Error("A local plan changed in another tab. Cancel and review its saved version; no automatic merge was attempted.");
  return s;
}
export async function beginLocalAuthoring(origin: RecoveredCompanion, document: DesignerDocument, activityId: string, index: number | null, confirmedSize?: { length: number; width: number }) {
  const pkg = attachmentCandidate(document, origin.package), activity = pkg.document.session.activities.find((a) => a.id === activityId);
  if (!activity) throw new Error("The selected activity no longer exists.");
  if (index !== null && (!Number.isInteger(index) || !activity.diagrams[index])) throw new Error("The selected attachment no longer exists.");
  if (index === null && activity.diagrams.length >= 20) throw new Error("This activity already has 20 diagrams.");
  const original = index === null ? null : activity.diagrams[index];
  const operation = crypto.randomUUID(), namespace = pkg.sceneNamespace ?? `local-${operation}`, sceneId = crypto.randomUUID();
  const imported = original ? pkg.scenes.find((s) => s.id === original.scene.id && s.revision === original.scene.revision) : undefined;
  if (original && !imported) throw new Error("The exact original scene is missing.");
  const initial: TacticalScene = imported ? { ...structuredClone(imported), id: sceneId, revision: 1 } : {
    schemaVersion: "1.0", id: sceneId, organizationId: namespace, revision: 1, units: "metres", field: confirmedSize ? { ...confirmedSize } : { length: 105, width: 68 },
    context: confirmedSize ? { kind: "neutral", boundary: true } : { kind: "pitch", region: "full", attack: "positive-x" }, entities: [], stages: [] };
  const context: LocalAuthoringContext = { version: 1, operation, origin: snapshotRef(origin), candidate: null,
    activityId, index, original: structuredClone(original), draftDigest: await contentDigest(document),
    documentDigest: await contentDigest(pkg.document), sceneId, namespace, seconds: original?.representativeSeconds ?? 0 };
  contextSchema.parse(context); prepareScene(initial);
  return { context, initial, package: pkg };
}
export async function checkCurrentDocument(context: LocalAuthoringContext, document: DesignerDocument) {
  if (await contentDigest(document) !== context.draftDigest) throw new Error("The session text or original attachment changed. Cancel and review the current plan; no edits were overwritten.");
  const activity = document.session.activities.find((a) => a.id === context.activityId);
  if (!activity || (context.index !== null && !sameDocument(activity.diagrams[context.index], context.original))) throw new Error("The original activity attachment changed or is missing.");
}
/** Check lineage from authoritative complete packages, not claims in the return reference. */
export async function verifyLocalCandidate(repository: CompanionRepository, context: LocalAuthoringContext) {
  contextSchema.parse(context);
  const origin = await exactSnapshot(repository, context.origin);
  if (!context.candidate || context.candidate.id === context.origin.id) throw new Error("No separate saved local copy is available. Unsaved editor changes cannot be recovered after refresh.");
  const candidate = await exactSnapshot(repository, context.candidate), p = candidate.package, base = origin.package;
  if (await contentDigest(p.document) !== context.documentDigest) throw new Error("Saved candidate text differs from the captured session.");
  if (p.sceneNamespace !== context.namespace || (base.sceneNamespace !== null && base.sceneNamespace !== p.sceneNamespace)
    || (base.sceneNamespace === null && context.namespace !== `local-${context.operation}`)) throw new Error("Local copy namespace differs from its source. No namespace conversion was attempted.");
  if (base.scenes.some((s) => s.id === context.sceneId)) throw new Error("Local copy identity conflicts with an existing scene.");
  for (const s of base.scenes) if (!p.scenes.some((n) => sameDocument(n, s))) throw new Error("The candidate changed or removed an original immutable scene.");
  const family = p.scenes.filter((s) => s.id === context.sceneId).sort((a, b) => a.revision - b.revision);
  if (!family.length || p.scenes.length !== base.scenes.length + family.length || family.some((s, i) => s.revision !== i + 1 || s.organizationId !== context.namespace)) throw new Error("The saved local copy has conflicting or incomplete scene revisions.");
  const activity = p.document.session.activities.find((a) => a.id === context.activityId);
  if (!activity || (context.index === null ? context.original !== null || activity.diagrams.length >= 20 : !sameDocument(activity.diagrams[context.index], context.original))) throw new Error("The saved candidate no longer matches the intended activity attachment.");
  return { origin, candidate, scene: family.at(-1)! };
}
/** Candidate saves retain the complete source and all prior native revisions; no attachment changes. */
export function candidatePackage(base: SessionPackage, previous: SessionPackage | null, context: LocalAuthoringContext, scene: TacticalScene): SessionPackage {
  if (scene.id !== context.sceneId || scene.organizationId !== context.namespace) throw new Error("The editor scene identity or namespace changed.");
  const revisions = previous?.scenes.filter((s) => s.id === context.sceneId) ?? [];
  const next = { ...structuredClone(scene), revision: revisions.length + 1 };
  prepareScene(next);
  return checkedPackage({ ...structuredClone(base), sceneNamespace: context.namespace, scenes: [...structuredClone(previous?.scenes ?? base.scenes), next] });
}
export function acceptedLocalPackage(document: DesignerDocument, candidate: SessionPackage, context: LocalAuthoringContext, scene: TacticalScene, seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0 || seconds > sceneDuration(scene)) throw new Error(`Choose an explicit representative time between 0 and ${sceneDuration(scene)} seconds. The previous time was not clamped or reset.`);
  // exportDocument validates real coaching text, never synthesises missing content.
  const next = structuredClone(document), activity = next.session.activities.find((a) => a.id === context.activityId);
  if (!activity) throw new Error("The activity no longer exists.");
  const chosen = { scene: { id: scene.id, revision: scene.revision }, representativeSeconds: seconds };
  if (context.index === null) activity.diagrams.push(chosen); else {
    if (!sameDocument(activity.diagrams[context.index], context.original)) throw new Error("The original attachment changed.");
    activity.diagrams[context.index] = chosen;
  }
  return { document: next, package: checkedPackage({ ...candidate, document: exportDocument(next) }) };
}
