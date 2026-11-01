import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { blankDesignerDocument, parseSessionJson, serializeSessionJson, type DesignerDocument } from "../../lib/designer/contract";
import { decodeDraft, encodeDraft } from "../../lib/designer/drafts";
import { parseSessionPackageJson, resolvePackageDiagram, serializeSessionPackageJson, SESSION_PACKAGE_LIMITS as L, validateSessionPackage, type PackageResult, type SessionPackage } from "../../lib/designer/package";
import { RENDER_LIMITS as R, evaluateScene } from "../../lib/tactical/evaluate";
import { drawScene, serializeDrawing } from "../../lib/tactical/drawing";
import type { AnimationStage, MovementTrack, TacticalScene } from "../../lib/domain/tactical-scene";

function value<T>(result: PackageResult<T>): T { assert.ok(result.ok, JSON.stringify(result)); return result.value; }
function rejected(result: PackageResult<unknown>, code?: string, limit?: string) {
  assert.equal(result.ok, false); if (result.ok) throw Error("Expected a rejection");
  assert.ok(result.diagnostics.length); assert.ok(!("value" in result));
  if (code) assert.ok(result.diagnostics.some((d) => d.code === code), JSON.stringify(result));
  if (limit) assert.ok(result.diagnostics.some((d) => d.limit?.name === limit), JSON.stringify(result));
  return result.diagnostics;
}
function scene(id = "drill", revision = 1): TacticalScene {
  return { schemaVersion: "1.0", organizationId: "local-review", id, revision, units: "metres", context: { kind: "neutral", boundary: true }, field: { length: 20, width: 20 }, entities: [], stages: [] };
}
function activity(id: string, pins = 0, sceneId = "drill") {
  return { id, name: `Activity ${id}`, role: "exercise" as const, durationMinutes: null, playerCount: null, area: null, equipment: [], instructions: [], coachingPoints: [], progressions: [], regressions: [], variations: [],
    diagrams: Array.from({ length: pins }, () => ({ scene: { id: sceneId, revision: 1 }, representativeSeconds: 0 })) };
}
function pkg(scenes: TacticalScene[] = [scene()], references = 1): SessionPackage {
  const document = blankDesignerDocument();
  for (let left = references, i = 0; left > 0; i++) { const n = Math.min(20, left); document.session.activities.push(activity(`a${i}`, n)); left -= n; }
  return { format: "football-formation-session-package", schemaVersion: "1.0", sceneNamespace: scenes.length || references ? "local-review" : null, document, scenes };
}
function stage(id: string, tracks: MovementTrack[] = [], durationSeconds = 1): AnimationStage { return { id, title: id, durationSeconds, tracks }; }
function notes(n: number): MovementTrack[] {
  return Array.from({ length: n }, (_, i) => ({ id: `t${i}`, kind: "annotation", visibleFrom: 0, visibleUntil: 1, annotation: { kind: "note", position: { x: 1, y: 1 }, text: "Scan" } }));
}
function entityScene(n: number, id = "drill"): TacticalScene {
  return { ...scene(id), entities: Array.from({ length: n }, (_, i) => ({ id: `p${i}`, kind: "player", team: "a", number: 1, position: { x: 1, y: 1 }, headingDegrees: 0, positionLabel: null })) };
}
function framesScene(n: number, id = "drill"): TacticalScene {
  const s = entityScene(1, id);
  s.stages = [stage("movement", [{ id: "run", kind: "player", entityId: "p0", movement: "run", keyframes: Array.from({ length: n }, (_, i) => ({ seconds: i, position: { x: 1, y: 1 } })) }], R.duration)];
  return s;
}
function distributed(total: number, maximum: number, make: (n: number, id: string) => TacticalScene): TacticalScene[] {
  const sizes: number[] = [];
  while (total > 0) { const n = Math.min(maximum, total); sizes.push(n); total -= n; }
  if (sizes.at(-1) === 1 && sizes.length > 1) { sizes[sizes.length - 2]--; sizes[sizes.length - 1]++; }
  return sizes.map((n, i) => make(n, `s${i}`));
}
function freeze<T>(input: T): T { if (input && typeof input === "object") { Object.values(input).forEach(freeze); Object.freeze(input); } return input; }
function reverseKeys(input: unknown): unknown {
  if (Array.isArray(input)) return input.map(reverseKeys);
  if (input && typeof input === "object") return Object.fromEntries(Object.entries(input).reverse().map(([k, v]) => [k, reverseKeys(v)]));
  return input;
}
const byteLength = (input: unknown) => new TextEncoder().encode(JSON.stringify(input)).length;

test("package parser reuses native data, returns independent values and round-trips deterministically", () => {
  const input = freeze(pkg()), before = JSON.stringify(input), parsed = value(parseSessionPackageJson(before));
  assert.deepEqual(parsed, input); assert.notEqual(parsed.document, input.document); assert.notEqual(parsed.scenes[0], input.scenes[0]);
  const text = value(serializeSessionPackageJson(parsed));
  assert.equal(text, value(serializeSessionPackageJson(reverseKeys(input))));
  assert.deepEqual(value(parseSessionPackageJson(text)), parsed); assert.equal(JSON.stringify(input), before);
});
test("legacy references, branding and draft bytes remain compatible and independent", () => {
  const input = pkg(); input.document.branding = { clubName: "Review club", primaryColor: "#245A42", secondaryColor: "#24344E", accentColor: "#E4AE41", logo: null };
  const legacy = serializeSessionJson(input.document), draft = encodeDraft(input.document, 1_800_000_000_000);
  const parsed = value(validateSessionPackage(input));
  assert.equal(serializeSessionJson(parsed.document), legacy); assert.deepEqual(parsed.document.branding, input.document.branding);
  assert.equal(encodeDraft(parsed.document, 1_800_000_000_000), draft); assert.deepEqual(decodeDraft(draft, 1_800_000_000_000).document, parsed.document);
  const referenceOnly = structuredClone(input.document); referenceOnly.session.activities[0].diagrams[0].scene.revision = 9;
  assert.deepEqual(parseSessionJson(serializeSessionJson(referenceOnly)), referenceOnly);
  assert.throws(() => parseSessionJson(JSON.stringify(input))); rejected(parseSessionPackageJson(legacy), "invalid_package");
});
test("all envelope fields are required; versions, unknown fields and malformed JSON fail atomically", () => {
  for (const key of Object.keys(pkg())) { const p: Record<string, unknown> = { ...pkg() }; delete p[key]; rejected(validateSessionPackage(p)); }
  for (const bad of [{ ...pkg(), format: "bundle" }, { ...pkg(), schemaVersion: "2.0" }, { ...pkg(), theme: "light" }]) rejected(validateSessionPackage(bad), "invalid_package");
  for (const text of ["", "{", "NaN", "[1,2]", "null"]) rejected(parseSessionPackageJson(text));
});
test("package activities require stable IDs rather than invoking the legacy random default", () => {
  const p = pkg(), a = p.document.session.activities[0] as Partial<ReturnType<typeof activity>>; delete a.id;
  assert.ok(parseSessionJson(JSON.stringify(p.document)).session.activities[0].id);
  const first = validateSessionPackage(p); rejected(first, "invalid_document"); assert.deepEqual(validateSessionPackage(p), first);
});
test("null namespaces are only valid for diagram-free packages; namespaces are metadata, never remapped", () => {
  assert.equal(value(validateSessionPackage(pkg([], 0))).sceneNamespace, null);
  rejected(validateSessionPackage({ ...pkg(), sceneNamespace: null }), "namespace_mismatch");
  rejected(validateSessionPackage({ ...pkg(), sceneNamespace: "another-org" }), "namespace_mismatch");
  rejected(validateSessionPackage(pkg([scene(), { ...scene("other"), organizationId: "other" }], 0)), "namespace_mismatch");
  const foreign = pkg(); foreign.sceneNamespace = foreign.scenes[0].organizationId = "foreign-descriptive-id";
  assert.equal(value(resolvePackageDiagram(foreign, "a0", 0)).namespace, "foreign-descriptive-id");
});
test("duplicates ignore object-key order but retain meaningful array order and immutable content", () => {
  const s = entityScene(2); const p = pkg([s, reverseKeys(s) as TacticalScene]);
  assert.equal(value(validateSessionPackage(p)).scenes.length, 1);
  const changed = structuredClone(s); changed.entities[0].position.x = 3;
  const errors = rejected(validateSessionPackage(pkg([s, changed])), "revision_conflict");
  assert.deepEqual(errors[0].reference, { namespace: "local-review", id: "drill", revision: 1 });
  rejected(validateSessionPackage(pkg([s, { ...s, entities: [...s.entities].reverse() }])), "revision_conflict");
});
test("exact resolution keeps pinned revision and timestamp even when a newer version exists", () => {
  const older = framesScene(2), newer = structuredClone(older); newer.revision = 2; newer.entities[0].position.x = 9;
  const p = pkg([newer, older]); p.document.session.activities[0].diagrams[0].representativeSeconds = 0.5;
  const result = value(resolvePackageDiagram(freeze(p), "a0", 0));
  assert.equal(result.scene.revision, 1); assert.equal(result.representativeSeconds, 0.5); assert.equal(result.scene.entities[0].position.x, 1);
  result.scene.entities[0].position.x = 10; assert.equal(p.scenes[1].entities[0].position.x, 1);
  rejected(resolvePackageDiagram(pkg([newer]), "a0", 0), "missing_revision");
});
test("stable activity IDs survive sequence changes; invalid targets never select another activity", () => {
  const p = pkg(); p.document.session.activities.unshift(activity("warmup"));
  assert.equal(value(resolvePackageDiagram(p, "a0", 0)).activityId, "a0");
  for (const index of [-1, 0.5, NaN, Infinity, 1, Number.MAX_SAFE_INTEGER]) rejected(resolvePackageDiagram(p, "a0", index), "invalid_target");
  rejected(resolvePackageDiagram(p, "missing", 0), "invalid_target"); rejected(resolvePackageDiagram(p, "warmup", 0), "invalid_target");
});
test("all failing references have useful paths and no partial accepted package", () => {
  const p = pkg([], 2); p.sceneNamespace = "local-review";
  const errors = rejected(validateSessionPackage(p), "missing_revision"); assert.equal(errors.length, 2);
  assert.deepEqual(errors[1].path, ["document", "session", "activities", 0, "diagrams", 1]);
  assert.equal(errors[1].reference?.representativeSeconds, 0);
});
test("zero, stage boundaries and exact duration resolve; out-of-range times are never clamped", () => {
  const s = scene(); s.stages = [stage("one"), stage("two")]; const p = pkg([s]);
  for (const seconds of [0, 1, 2]) { p.document.session.activities[0].diagrams[0].representativeSeconds = seconds; assert.equal(value(resolvePackageDiagram(p, "a0", 0)).representativeSeconds, seconds); }
  for (const seconds of [-Number.EPSILON, -1, 2 + Number.EPSILON * 2, Infinity, NaN]) { p.document.session.activities[0].diagrams[0].representativeSeconds = seconds; rejected(validateSessionPackage(p)); }
  p.document.session.activities[0].diagrams[0].representativeSeconds = 3;
  assert.equal(evaluateScene(s, 3).seconds, 2); rejected(validateSessionPackage(p), "invalid_time");
  const staticPackage = pkg(); assert.equal(value(resolvePackageDiagram(staticPackage, "a0", 0)).representativeSeconds, 0);
  staticPackage.document.session.activities[0].diagrams[0].representativeSeconds = Number.MIN_VALUE;
  rejected(validateSessionPackage(staticPackage), "invalid_time");
});
test("text remains data, renderer escaping is retained, and external branding URLs are rejected", () => {
  const p = pkg([entityScene(1)]), player = p.scenes[0].entities[0];
  if (player.kind !== "player") throw Error("fixture"); player.positionLabel = "<script>scan()</script> & move";
  const parsed = value(validateSessionPackage(p)); assert.equal(parsed.scenes[0].entities[0].kind, "player");
  const svg = serializeDrawing(drawScene(parsed.scenes[0], { width: 500, height: 400, seconds: 0 }), "Review");
  assert.ok(!svg.includes("<script>")); assert.ok(svg.includes("&lt;script&gt;"));
  const logo = { name: "external.png", mimeType: "image/png", width: 1, height: 1, dataUrl: "https://example.invalid/image.png" };
  rejected(validateSessionPackage({ ...p, document: { ...p.document, branding: { ...p.document.branding, logo } } }), "invalid_document");
});
test("object validation rejects lossy values, getters, custom serialization and cycles without calling them", () => {
  let called = 0; const p = pkg();
  const accessor = { ...p, get extra() { called++; return "unsafe"; } };
  const custom = { ...p, toJSON() { called++; return p; } };
  const cycle: Record<string, unknown> = { ...p }; cycle.loop = cycle;
  const sparse = Object.assign(new Array(1), { extra: "not an index" });
  for (const input of [undefined, BigInt(1), accessor, custom, cycle, { ...p, extra: undefined }, { ...p, extra: new Date(0) }, { ...p, scenes: new Array(1) }, { ...p, scenes: sparse }]) rejected(validateSessionPackage(input), "invalid_json");
  assert.equal(called, 0);
});

for (const [name, maximum, make, limit] of [
  ["raw scene entries", L.sceneEntries, (n: number) => pkg(Array.from({ length: n }, () => scene()), 0), "sceneEntries"],
  ["activities", 100, (n: number) => { const p = pkg([], 0); p.document.session.activities = Array.from({ length: n }, (_, i) => activity(`a${i}`)); return p; }, "activities"],
  ["references per activity", 20, (n: number) => { const p = pkg(); p.document.session.activities = [activity("a0", n)]; return p; }, "referencesPerActivity"],
  ["total references", L.diagramReferences, (n: number) => pkg([scene()], n), "diagramReferences"],
  ["aggregate entities", L.entities, (n: number) => pkg(distributed(n, R.entities, entityScene), 0), "entities"],
  ["aggregate stages", L.stages, (n: number) => pkg(distributed(n, R.stages, (c, id) => ({ ...scene(id), stages: Array.from({ length: c }, (_, i) => stage(`s${i}`)) })), 0), "stages"],
  ["aggregate tracks", L.tracks, (n: number) => pkg(distributed(n, R.tracks, (c, id) => ({ ...scene(id), stages: [stage("one", notes(c))] })), 0), "tracks"],
  ["aggregate keyframes", L.keyframes, (n: number) => pkg(distributed(n, R.keyframes, framesScene), 0), "keyframes"],
] as const) {
  test(`${name}: exact approved maximum ${maximum} passes; ${maximum + 1} fails`, () => {
    value(validateSessionPackage(make(maximum))); const errors = rejected(validateSessionPackage(make(maximum + 1)), "limit_exceeded", limit);
    assert.ok(errors.some((e) => e.limit?.name === limit && e.limit.actual === maximum + 1 && e.limit.maximum === maximum));
  });
}
for (const [key, maximum, make] of [
  ["entities", R.entities, entityScene],
  ["stages", R.stages, (n: number) => ({ ...scene(), stages: Array.from({ length: n }, (_, i) => stage(`s${i}`)) })],
  ["tracks", R.tracks, (n: number) => ({ ...scene(), stages: [stage("one", notes(n))] })],
  ["keyframes", R.keyframes, framesScene],
] as const) test(`per-scene ${key}: existing maximum ${maximum} passes; ${maximum + 1} fails before scene parsing`, () => {
  value(validateSessionPackage(pkg([make(maximum)], 0))); rejected(validateSessionPackage(pkg([make(maximum + 1)], 0)), "limit_exceeded", `scene.${key}`);
});
test("snapshot work: 262144 passes; 262145 fails, counting repeated references again", () => {
  const a = { ...scene(), stages: [stage("one", notes(2047))] }, b = { ...scene("second"), stages: [stage("one", notes(2048))] };
  const exact = pkg([a], 128); value(validateSessionPackage(exact));
  const extra = pkg([a, b], 128); extra.document.session.activities.at(-1)!.diagrams.at(-1)!.scene.id = "second";
  const errors = rejected(validateSessionPackage(extra), "limit_exceeded", "snapshotWork"); assert.equal(errors.at(-1)!.limit!.actual, L.snapshotWork + 1);
});
test("raw duplicate work is budgeted before deduplication", () => {
  const s = entityScene(512); rejected(validateSessionPackage(pkg(Array.from({ length: 9 }, () => s), 0)), "limit_exceeded", "entities");
});
test("existing duration/coordinate maxima pass; the next representable value beyond each fails", () => {
  const timed = scene(); timed.stages = [stage("one", [], R.duration)]; value(validateSessionPackage(pkg([timed], 0)));
  timed.stages[0].durationSeconds += Number.EPSILON * R.duration; rejected(validateSessionPackage(pkg([timed], 0)), "invalid_scene");
  for (const sign of [-1, 1]) { const s = entityScene(1); s.entities[0].position.x = sign * R.coordinate; value(validateSessionPackage(pkg([s], 0))); s.entities[0].position.x = sign * (R.coordinate + Number.EPSILON * R.coordinate); rejected(validateSessionPackage(pkg([s], 0)), "invalid_scene"); }
});
test("failed validation, serialization and resolution leave frozen sessions, diagrams and draft bytes intact", () => {
  const p = pkg([entityScene(1)]); p.scenes.push({ ...structuredClone(p.scenes[0]), field: { length: 21, width: 20 } });
  const before = JSON.stringify(p), draft = encodeDraft(p.document, 1_800_000_000_000); freeze(p);
  rejected(validateSessionPackage(p), "revision_conflict"); rejected(serializeSessionPackageJson(p), "revision_conflict"); rejected(resolvePackageDiagram(p, "a0", 0), "revision_conflict");
  assert.equal(JSON.stringify(p), before); assert.equal(encodeDraft(p.document, 1_800_000_000_000), draft);
});
test("native ID and revision upper bounds are retained", () => {
  const s = scene("x".repeat(128), Number.MAX_SAFE_INTEGER), p = pkg([s]); p.document.session.activities[0].diagrams[0].scene = { id: s.id, revision: s.revision };
  value(validateSessionPackage(p)); rejected(validateSessionPackage({ ...p, scenes: [{ ...s, id: s.id + "x" }] }), "invalid_scene");
  rejected(validateSessionPackage({ ...p, scenes: [{ ...s, revision: s.revision + 1 }] }), "invalid_scene");
});

function documentAtBytes(target: number): DesignerDocument {
  const d = blankDesignerDocument(); d.session.activities = [activity("a0")];
  let remaining = target - byteLength(d); const lines: string[] = d.session.activities[0].instructions;
  while (remaining > 200) {
    const list = lines.length < 200 ? lines : d.session.activities[0].coachingPoints;
    const overhead = list.length ? 3 : 2, n = Math.min(10_000, remaining - overhead);
    list.push("x".repeat(n)); remaining -= n + overhead;
  }
  d.session.name += "x".repeat(remaining); assert.equal(byteLength(d), target); return d;
}
test("embedded document: 2097152 UTF-8 bytes passes; 2097153 fails", () => {
  const p = pkg([], 0); p.document = documentAtBytes(L.documentBytes); value(validateSessionPackage(p));
  p.document.session.name += "x"; rejected(validateSessionPackage(p), "limit_exceeded", "documentBytes");
});
test("embedded document byte accounting counts multibyte characters, not UTF-16 length", () => {
  const p = pkg([], 0); p.document = documentAtBytes(L.documentBytes - 1);
  p.document.session.name = "é" + p.document.session.name.slice(1);
  assert.equal(byteLength(p.document), L.documentBytes); value(validateSessionPackage(p));
  p.document.session.name = "é" + p.document.session.name;
  rejected(validateSessionPackage(p), "limit_exceeded", "documentBytes");
});
test("whole input: 8388608 UTF-8 bytes passes including whitespace/BOM; 8388609 fails", () => {
  const p = pkg([], 0); p.document.session.name = "Coaching ⚽ café";
  const text = "\uFEFF" + JSON.stringify(p), exact = text + " ".repeat(L.bytes - new TextEncoder().encode(text).length);
  assert.notEqual(exact.length, L.bytes); value(parseSessionPackageJson(exact));
  const errors = rejected(parseSessionPackageJson(exact + " "), "limit_exceeded", "bytes"); assert.equal(errors[0].limit!.actual, L.bytes + 1);
});
function packageAtBytes(target: number): SessionPackage {
  const p = pkg([scene()], 0); p.scenes[0].stages = [stage("one")]; let remaining = target - byteLength(p), index = 0;
  while (remaining > 10_200) {
    const track = { ...notes(1)[0], id: `t${index++}` };
    if (track.kind !== "annotation" || track.annotation.kind !== "note") throw Error("fixture"); track.annotation.text = "x".repeat(10_000);
    const added = byteLength(track) + (p.scenes[0].stages[0].tracks.length ? 1 : 0);
    p.scenes[0].stages[0].tracks.push(track); remaining -= added;
  }
  // The last label is deliberately below its 10000-character bound.
  p.scenes[0].stages[0].title += "x".repeat(remaining); assert.ok(p.scenes[0].stages[0].title.length <= 10_000); assert.equal(byteLength(p), target); return p;
}
test("serialization falls back to compact JSON at 8 MiB and rejects the first byte beyond", () => {
  const p = packageAtBytes(L.bytes); const before = JSON.stringify(p), serialized = value(serializeSessionPackageJson(freeze(p)));
  assert.equal(new TextEncoder().encode(serialized).length, L.bytes); assert.ok(!serialized.endsWith("\n"));
  assert.equal(JSON.stringify(p), before); value(parseSessionPackageJson(serialized));
  const larger = packageAtBytes(L.bytes + 1); rejected(serializeSessionPackageJson(larger), "limit_exceeded", "bytes");
});
test("serialization also respects the compact embedded-document budget", () => {
  const p = pkg([], 0); p.document = documentAtBytes(L.documentBytes);
  const text = value(serializeSessionPackageJson(p)); assert.ok(!text.endsWith("\n")); value(parseSessionPackageJson(text));
});
test("documented example resolves revision 1 at 1 s, rather than revision 2", () => {
  const text = readFileSync(new URL("../../docs/examples/session-package.json", import.meta.url), "utf8");
  const p = value(parseSessionPackageJson(text)), resolved = value(resolvePackageDiagram(p, "activity-1", 0));
  assert.equal(resolved.scene.revision, 1); assert.equal(resolved.representativeSeconds, 1);
  assert.equal(evaluateScene(resolved.scene, resolved.representativeSeconds).entities[0].position.x, 5);
  assert.ok(p.scenes.some((s) => s.revision === 2));
});
test("deeply malformed JSON returns diagnostics instead of throwing while measuring a component", () => {
  const document = '{"unexpected":' + "[".repeat(20_000) + "0" + "]".repeat(20_000) + "}";
  const text = '{"format":"football-formation-session-package","schemaVersion":"1.0","sceneNamespace":null,"scenes":[],"document":' + document + "}";
  rejected(parseSessionPackageJson(text), "invalid_json");
});
