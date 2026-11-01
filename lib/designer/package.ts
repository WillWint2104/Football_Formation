import { z } from "zod";
import { idSchema } from "../domain/common";
import type { TacticalScene } from "../domain/tactical-scene";
import { prepareScene, RENDER_LIMITS, sceneDuration } from "../tactical/evaluate";
import { MAX_ACTIVITIES, MAX_SESSION_JSON_BYTES, portableSessionSchema, type DesignerDocument } from "./contract";

/** Optional, local-file contract. These budgets do not change legacy JSON or renderer contracts. */
export const SESSION_PACKAGE_LIMITS = Object.freeze({
  bytes: 8 * 1024 * 1024, documentBytes: MAX_SESSION_JSON_BYTES,
  sceneEntries: 32, diagramReferences: 128, entities: 4_096, stages: 512,
  tracks: 8_192, keyframes: 32_768, snapshotWork: 262_144,
});
export type SessionPackage = {
  format: "football-formation-session-package";
  schemaVersion: "1.0";
  sceneNamespace: string | null;
  document: DesignerDocument;
  scenes: TacticalScene[];
};
type Path = (string | number)[];
export type PackageDiagnostic = {
  code: "invalid_json" | "invalid_package" | "invalid_document" | "invalid_scene" | "limit_exceeded" |
    "namespace_mismatch" | "revision_conflict" | "missing_revision" | "invalid_time" | "invalid_target";
  path: Path;
  message: string;
  limit?: { name: string; maximum: number; actual: number };
  reference?: { namespace: string | null; id: string; revision: number; representativeSeconds?: number };
};
export type PackageResult<T> = { ok: true; value: T } | { ok: false; diagnostics: PackageDiagnostic[] };
export type ResolvedPackageDiagram = {
  namespace: string;
  activityId: string;
  diagramIndex: number;
  representativeSeconds: number;
  scene: TacticalScene;
};

const envelopeSchema = z.strictObject({
  format: z.literal("football-formation-session-package"), schemaVersion: z.literal("1.0"),
  sceneNamespace: idSchema.nullable(), document: z.unknown(), scenes: z.array(z.unknown()),
});
const bytes = (text: string) => new TextEncoder().encode(text).length;
const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);
const failure = <T = never>(...diagnostics: PackageDiagnostic[]): PackageResult<T> => ({ ok: false, diagnostics });
const issue = (code: PackageDiagnostic["code"], path: Path, message: string): PackageDiagnostic => ({ code, path, message });
function over(name: string, actual: number, maximum: number, path: Path): PackageDiagnostic[] {
  return actual > maximum ? [{ code: "limit_exceeded", path, message: `${name} exceeds ${maximum} (received ${actual}).`, limit: { name, maximum, actual } }] : [];
}
function schemaIssues(error: z.ZodError, code: PackageDiagnostic["code"], prefix: Path): PackageDiagnostic[] {
  return error.issues.map((e) => issue(code, [...prefix, ...e.path.map((p) => typeof p === "number" ? p : String(p))], e.message));
}

/** Reject getters, toJSON/classes, cycles and lossy JSON values before serialization can run user code. */
function jsonText(value: unknown): PackageResult<string> {
  const active = new Set<object>();
  const stack: { value: unknown; leaving?: boolean }[] = [{ value }];
  while (stack.length) {
    const next = stack.pop()!, v = next.value;
    if (v === null || typeof v === "string" || typeof v === "boolean") continue;
    if (typeof v === "number" && Number.isFinite(v)) continue;
    if (typeof v !== "object") return failure(issue("invalid_json", [], "Use plain JSON values, including finite numbers only."));
    if (next.leaving) { active.delete(v); continue; }
    if (active.has(v)) return failure(issue("invalid_json", [], "A package cannot contain circular references."));
    const array = Array.isArray(v), proto = Object.getPrototypeOf(v);
    if ((array ? proto !== Array.prototype : proto !== Object.prototype && proto !== null) || Object.getOwnPropertySymbols(v).length)
      return failure(issue("invalid_json", [], "Use plain JSON objects and arrays, without custom serialization."));
    const descriptors = Object.getOwnPropertyDescriptors(v);
    if (array && Object.keys(descriptors).length !== v.length + 1)
      return failure(issue("invalid_json", [], "Arrays must be dense JSON arrays with no additional properties."));
    active.add(v); stack.push({ value: v, leaving: true });
    for (const [key, descriptor] of Object.entries(descriptors)) {
      if (array && key === "length") continue;
      if (array && (!/^(0|[1-9]\d*)$/.test(key) || Number(key) >= v.length))
        return failure(issue("invalid_json", [], "Arrays cannot carry non-index JSON properties."));
      if (!descriptor.enumerable || !("value" in descriptor))
        return failure(issue("invalid_json", [], "JSON properties must be enumerable data, not getters or setters."));
      stack.push({ value: descriptor.value });
    }
  }
  try { return { ok: true, value: JSON.stringify(value) }; }
  catch { return failure(issue("invalid_json", [], "The value cannot be represented as a JSON package.")); }
}

/** Sort object keys only. Array order and validated string content remain significant. */
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (record(value)) return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  return value;
}
const sceneKey = (namespace: string, id: string, revision: number) => JSON.stringify([namespace, id, revision]);
type Counts = { entities: number; stages: number; tracks: number; keyframes: number };
function counts(value: unknown): Counts {
  const result: Counts = { entities: 0, stages: 0, tracks: 0, keyframes: 0 };
  if (!record(value)) return result;
  result.entities = Array.isArray(value.entities) ? value.entities.length : 0;
  if (Array.isArray(value.stages)) {
    result.stages = value.stages.length;
    for (const stage of value.stages) if (record(stage) && Array.isArray(stage.tracks)) {
      result.tracks += stage.tracks.length;
      for (const track of stage.tracks) if (record(track) && Array.isArray(track.keyframes)) result.keyframes += track.keyframes.length;
    }
  }
  return result;
}

/** Raw cardinality guards run before the existing validators clone or traverse scene/document contents. */
function preflight(document: unknown, scenes: unknown[]): PackageDiagnostic[] {
  const diagnostics = over("sceneEntries", scenes.length, SESSION_PACKAGE_LIMITS.sceneEntries, ["scenes"]);
  if (diagnostics.length) return diagnostics;
  const total: Counts = { entities: 0, stages: 0, tracks: 0, keyframes: 0 };
  for (let i = 0; i < scenes.length; i++) {
    const raw = scenes[i];
    if (record(raw)) {
      const early = [
        ...over("scene.entities", Array.isArray(raw.entities) ? raw.entities.length : 0, RENDER_LIMITS.entities, ["scenes", i, "entities"]),
        ...over("scene.stages", Array.isArray(raw.stages) ? raw.stages.length : 0, RENDER_LIMITS.stages, ["scenes", i, "stages"]),
      ];
      if (early.length) return [...diagnostics, ...early];
    }
    const c = counts(scenes[i]);
    for (const k of ["entities", "stages", "tracks", "keyframes"] as const) {
      diagnostics.push(...over(`scene.${k}`, c[k], RENDER_LIMITS[k], ["scenes", i, k])); total[k] += c[k];
    }
  }
  for (const k of ["entities", "stages", "tracks", "keyframes"] as const)
    diagnostics.push(...over(k, total[k], SESSION_PACKAGE_LIMITS[k], ["scenes"]));
  if (record(document) && record(document.session) && Array.isArray(document.session.activities)) {
    const activities = document.session.activities;
    diagnostics.push(...over("activities", activities.length, MAX_ACTIVITIES, ["document", "session", "activities"]));
    if (activities.length > MAX_ACTIVITIES) return diagnostics;
    let references = 0;
    activities.forEach((activity, i) => {
      if (!record(activity)) return;
      const path: Path = ["document", "session", "activities", i];
      // Existing legacy parsing can allocate a random ID; a pure package boundary must not do so.
      if (!Object.hasOwn(activity, "id")) diagnostics.push(issue("invalid_document", [...path, "id"], "Package activities require explicit stable IDs. Export a legacy session to materialize its IDs first."));
      if (Array.isArray(activity.diagrams)) {
        references += activity.diagrams.length;
        diagnostics.push(...over("referencesPerActivity", activity.diagrams.length, 20, [...path, "diagrams"]));
      }
      for (const [key, maximum] of Object.entries({ instructions: 200, coachingPoints: 200, progressions: 200, regressions: 200, variations: 200, equipment: 100 })) {
        const items = activity[key];
        if (Array.isArray(items)) diagnostics.push(...over(`document.${key}`, items.length, maximum, [...path, key]));
      }
    });
    diagnostics.push(...over("diagramReferences", references, SESSION_PACKAGE_LIMITS.diagramReferences, ["document", "session", "activities"]));
  }
  return diagnostics;
}

function validateValue(input: unknown): PackageResult<SessionPackage> {
  // Avoid even the shallow Zod array clone for an oversized file's scene library.
  if (record(input) && Array.isArray(input.scenes)) {
    const sceneBudget = over("sceneEntries", input.scenes.length, SESSION_PACKAGE_LIMITS.sceneEntries, ["scenes"]);
    if (sceneBudget.length) return failure(...sceneBudget);
  }
  const header = envelopeSchema.safeParse(input);
  if (!header.success) return failure(...schemaIssues(header.error, "invalid_package", []));
  if (!record(input) || !Object.hasOwn(input, "document")) return failure(issue("invalid_package", ["document"], "The document field is required."));
  const raw = header.data, guarded = preflight(raw.document, raw.scenes);
  if (guarded.length) return failure(...guarded);
  const documentText = JSON.stringify(raw.document);
  if (documentText === undefined) return failure(issue("invalid_document", ["document"], "A portable session document is required."));
  const documentBudget = over("documentBytes", bytes(documentText), SESSION_PACKAGE_LIMITS.documentBytes, ["document"]);
  if (documentBudget.length) return failure(...documentBudget);
  const parsedDocument = portableSessionSchema.safeParse(raw.document);
  if (!parsedDocument.success) return failure(...schemaIssues(parsedDocument.error, "invalid_document", ["document"]));
  const document = parsedDocument.data;
  const normalizedBudget = over("documentBytes", bytes(JSON.stringify(document)), SESSION_PACKAGE_LIMITS.documentBytes, ["document"]);
  if (normalizedBudget.length) return failure(...normalizedBudget);
  const diagnostics: PackageDiagnostic[] = [], scenes: TacticalScene[] = [];
  const index = new Map<string, { scene: TacticalScene; canonical: string; work: number }>();
  raw.scenes.forEach((candidate, i) => {
    let scene: TacticalScene;
    try { scene = prepareScene(candidate); }
    catch (error) {
      diagnostics.push(...(error instanceof z.ZodError ? schemaIssues(error, "invalid_scene", ["scenes", i]) : [issue("invalid_scene", ["scenes", i], error instanceof Error ? error.message : "Invalid scene.")]));
      return;
    }
    if (scene.organizationId !== raw.sceneNamespace) {
      diagnostics.push(issue("namespace_mismatch", ["scenes", i, "organizationId"], "Scene metadata must match the package namespace. No remapping or hosted lookup is performed.")); return;
    }
    const key = sceneKey(scene.organizationId, scene.id, scene.revision), content = JSON.stringify(canonical(scene));
    const previous = index.get(key);
    if (previous && previous.canonical !== content) {
      diagnostics.push({ ...issue("revision_conflict", ["scenes", i], "Different scene contents claim the same immutable revision."), reference: { namespace: raw.sceneNamespace, id: scene.id, revision: scene.revision } }); return;
    }
    if (!previous) {
      const c = counts(scene);
      index.set(key, { scene, canonical: content, work: c.entities + c.stages + c.tracks + c.keyframes }); scenes.push(scene);
    }
  });
  let references = 0, work = 0;
  document.session.activities.forEach((activity, ai) => activity.diagrams.forEach((pin, di) => {
    references++;
    const path: Path = ["document", "session", "activities", ai, "diagrams", di];
    const reference = { namespace: raw.sceneNamespace, id: pin.scene.id, revision: pin.scene.revision, representativeSeconds: pin.representativeSeconds };
    const exact = raw.sceneNamespace === null ? undefined : index.get(sceneKey(raw.sceneNamespace, pin.scene.id, pin.scene.revision));
    if (!exact) { diagnostics.push({ ...issue("missing_revision", path, "The exact scene namespace, ID and revision are unavailable."), reference }); return; }
    work += exact.work;
    if (pin.representativeSeconds > sceneDuration(exact.scene))
      diagnostics.push({ ...issue("invalid_time", [...path, "representativeSeconds"], "Snapshot time exceeds this exact scene's duration. It has not been clamped."), reference });
  }));
  if (raw.sceneNamespace === null && (raw.scenes.length || references))
    diagnostics.push(issue("namespace_mismatch", ["sceneNamespace"], "A null namespace requires no scenes and no diagram references."));
  diagnostics.push(...over("snapshotWork", work, SESSION_PACKAGE_LIMITS.snapshotWork, ["document", "session", "activities"]));
  if (diagnostics.length) return failure(...diagnostics);
  const value: SessionPackage = { format: raw.format, schemaVersion: raw.schemaVersion, sceneNamespace: raw.sceneNamespace, document, scenes };
  const outputBudget = over("bytes", bytes(JSON.stringify(value)), SESSION_PACKAGE_LIMITS.bytes, []);
  return outputBudget.length ? failure(...outputBudget) : { ok: true, value };
}

/** Non-throwing, atomic boundary for already-decoded JSON values; no state or input is changed. */
export function validateSessionPackage(input: unknown): PackageResult<SessionPackage> {
  try {
    const text = jsonText(input);
    if (!text.ok) return text;
    const budget = over("bytes", bytes(text.value), SESSION_PACKAGE_LIMITS.bytes, []);
    return budget.length ? failure(...budget) : validateValue(input);
  } catch { return failure(issue("invalid_json", [], "The input cannot be processed as plain bounded JSON.")); }
}

/** Whole input, including whitespace/BOM, is measured in UTF-8 bytes before JSON parsing. */
export function parseSessionPackageJson(text: string): PackageResult<SessionPackage> {
  const budget = over("bytes", bytes(text), SESSION_PACKAGE_LIMITS.bytes, []);
  if (budget.length) return failure(...budget);
  let input: unknown;
  try { input = JSON.parse(text.replace(/^\uFEFF/, "")); }
  catch { return failure(issue("invalid_json", [], "This is not valid package JSON.")); }
  try { return validateValue(input); }
  catch { return failure(issue("invalid_json", [], "The input cannot be processed as plain bounded JSON.")); }
}

/** Canonical object keys, meaningful array order, pretty output where both byte budgets permit it. */
export function serializeSessionPackageJson(input: unknown): PackageResult<string> {
  const parsed = validateSessionPackage(input);
  if (!parsed.ok) return parsed;
  const sorted = canonical(parsed.value), pretty = JSON.stringify(sorted, null, 2) + "\n";
  if (bytes(pretty) <= SESSION_PACKAGE_LIMITS.bytes && bytes(JSON.stringify(canonical(parsed.value.document), null, 2)) <= SESSION_PACKAGE_LIMITS.documentBytes)
    return { ok: true, value: pretty };
  return { ok: true, value: JSON.stringify(sorted) };
}

/** Resolve a stable activity ID and reference index in a fully valid package, never a latest version. */
export function resolvePackageDiagram(input: unknown, activityId: string, diagramIndex: number): PackageResult<ResolvedPackageDiagram> {
  const parsed = validateSessionPackage(input);
  if (!parsed.ok) return parsed;
  if (!idSchema.safeParse(activityId).success || !Number.isSafeInteger(diagramIndex) || diagramIndex < 0)
    return failure(issue("invalid_target", ["target"], "Use an existing stable activity ID and a nonnegative integer diagram index."));
  const activity = parsed.value.document.session.activities.find((a) => a.id === activityId), pin = activity?.diagrams[diagramIndex];
  if (!activity || !pin) return failure(issue("invalid_target", ["target", activity ? "diagramIndex" : "activityId"], "The requested activity or diagram reference is unavailable."));
  const namespace = parsed.value.sceneNamespace;
  const scene = parsed.value.scenes.find((s) => s.organizationId === namespace && s.id === pin.scene.id && s.revision === pin.scene.revision);
  if (namespace === null || !scene) return failure(issue("missing_revision", ["target"], "The exact scene revision is unavailable."));
  return { ok: true, value: { namespace, activityId, diagramIndex, representativeSeconds: pin.representativeSeconds, scene } };
}
