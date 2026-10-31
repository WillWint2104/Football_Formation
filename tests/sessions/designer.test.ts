import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import sharp from "sharp";
import { applySessionContent, blankDesignerDocument, exportDocument, logoSchema, MAX_SESSION_JSON_BYTES, parseSessionJson, serializeSessionJson, toSessionContent } from "../../lib/designer/contract";
import { decodeDraft, DRAFT_RETENTION_MS, encodeDraft } from "../../lib/designer/drafts";
import { rasterInfo } from "../../lib/designer/images";
import { sessionContentSchema } from "../../lib/domain/session";
import { contrastingInk } from "../../lib/designer/branding";

const sample = readFileSync(new URL("../../public/samples/session-designer-possession.json", import.meta.url), "utf8");
const recovery = readFileSync(new URL("../../public/samples/session-designer-recovery.json", import.meta.url), "utf8");

test("generic five-activity adapter produces strict reusable session content, without organisation identities", () => {
  const doc = parseSessionJson(sample), content = toSessionContent(doc);
  assert.equal(doc.session.activities.length, 5); assert.equal(content.activities[1].content.title, "5v2 Rondo");
  assert.deepEqual(sessionContentSchema.parse(content), content);
  assert.equal(doc.branding.clubName, null); assert.equal(doc.branding.primaryColor, null);
  assert.ok(!JSON.stringify(doc).includes("organizationId")); assert.ok(!JSON.stringify(doc).includes("teamId"));
});

test("unknown session facts remain unknown across recovery, editing and export", () => {
  const doc = parseSessionJson(recovery);
  assert.equal(doc.session.playerCount, null); assert.equal(doc.session.durationMinutes, null);
  assert.equal(doc.session.team, null); assert.equal(doc.session.activities[0].durationMinutes, null);
  assert.equal(doc.session.activities[1].area, null); assert.deepEqual(doc.session.activities[1].diagrams, []);
  assert.deepEqual(exportDocument(doc), doc);
  const minimal = parseSessionJson(JSON.stringify({ format: "football-formation-session", schemaVersion: "1.0", session: { name: "Independent session" } }));
  assert.equal(minimal.session.type, null); assert.equal(exportDocument(minimal).session.type, null);
});

test("editing/reordering content is independent of imported source and retains exact diagram pins", () => {
  const original = parseSessionJson(sample), source = structuredClone(original), content = toSessionContent(original);
  content.activities[1].content.instructions = ["A revised instruction."];
  content.activities[1].durationMinutes = 18; content.activities.reverse();
  const changed = applySessionContent(original, content), exported = exportDocument(changed);
  assert.deepEqual(original, source);
  assert.deepEqual(exported.session.activities[3].diagrams, source.session.activities[1].diagrams);
  assert.equal(exported.session.activities[3].durationMinutes, 18);
  assert.equal(exported.session.activities[3].instructions[0], "A revised instruction.");
  assert.equal(exported.session.durationMinutes, 80);
});

test("complete branded JSON round trip preserves raster, colours and every activity field", async () => {
  const bytes = await sharp({ create: { width: 40, height: 60, channels: 4, background: { r: 20, g: 80, b: 65, alpha: .5 } } }).png().toBuffer();
  const doc = parseSessionJson(sample);
  doc.branding = { clubName: "Example identity", primaryColor: "#245A42", secondaryColor: "#24344E", accentColor: "#E4AE41", logo: { name: "example.png", mimeType: "image/png", width: 40, height: 60, dataUrl: `data:image/png;base64,${bytes.toString("base64")}` } };
  const exported = exportDocument(doc), reimported = parseSessionJson(JSON.stringify(exported));
  assert.deepEqual(reimported, exported); assert.equal(reimported.branding.logo?.dataUrl, doc.branding.logo!.dataUrl);
});

test("unsupported versions, unrelated domain bundles and unrecognised fields are rejected", () => {
  const doc = JSON.parse(sample);
  for (const invalid of [{ ...doc, schemaVersion: "2.0" }, { ...doc, organizationId: "should-not-be-here" }, { ...doc, format: "football-formation-domain" }])
    assert.throws(() => parseSessionJson(JSON.stringify(invalid)));
});

test("duplicate activity IDs, invalid numeric facts and overlarge sequences cannot be accepted", () => {
  const doc = JSON.parse(sample);
  doc.session.activities[1].id = doc.session.activities[0].id;
  assert.throws(() => parseSessionJson(JSON.stringify(doc)), /Duplicate activity ID/);
  const clean = JSON.parse(sample); clean.session.activities[0].durationMinutes = 0;
  assert.throws(() => parseSessionJson(JSON.stringify(clean)));
  clean.session.activities = Array.from({ length: 101 }, (_, i) => ({ name: `Activity ${i}` }));
  assert.throws(() => parseSessionJson(JSON.stringify(clean)));
});

test("malformed, oversized and BOM-prefixed input is handled before editor acceptance", () => {
  assert.throws(() => parseSessionJson("{invalid"), /not valid JSON/);
  assert.throws(() => parseSessionJson(" ".repeat(MAX_SESSION_JSON_BYTES + 1)), /exceeds 2 MB/);
  assert.equal(parseSessionJson("\uFEFF" + sample).session.activities.length, 5);
});

test("formatting overhead cannot make a downloaded near-limit session impossible to reimport", () => {
  const doc = parseSessionJson(recovery);
  doc.session.activities = Array.from({ length: 100 }, (_, i) => ({ ...structuredClone(doc.session.activities[0]), id: `activity-${i}`, instructions: Array.from({ length: 60 }, () => "A short coaching instruction.") }));
  const compact = JSON.stringify(exportDocument(doc)).length;
  const remaining = MAX_SESSION_JSON_BYTES - compact - 100;
  doc.session.activities[0].coachingPoints = Array.from({ length: Math.floor(remaining / 10004) }, () => "a".repeat(10000));
  const residual = MAX_SESSION_JSON_BYTES - JSON.stringify(exportDocument(doc)).length - 50;
  if (residual > 0) doc.session.activities[0].coachingPoints.push("b".repeat(Math.min(residual, 10000)));
  const text = serializeSessionJson(doc);
  assert.ok(new TextEncoder().encode(text).length <= MAX_SESSION_JSON_BYTES);
  assert.deepEqual(parseSessionJson(text), exportDocument(doc));
});

test("blank editor lines are cleaned while missing quantities are not turned into zero", () => {
  const doc = parseSessionJson(sample); doc.session.objectives.push("  "); doc.session.activities[0].instructions.push(" ");
  doc.session.activities[0].equipment[0].quantity = null;
  const result = exportDocument(doc);
  assert.equal(result.session.objectives.length, 3); assert.equal(result.session.activities[0].instructions.length, 3);
  assert.equal(result.session.activities[0].equipment[0].quantity, null);
});

test("external image URLs, SVG payloads, mismatched dimensions and HEX injection are rejected", async () => {
  const bytes = await sharp({ create: { width: 2, height: 3, channels: 4, background: "transparent" } }).png().toBuffer();
  const logo = { name: "logo.png", mimeType: "image/png", width: 2, height: 3, dataUrl: `data:image/png;base64,${bytes.toString("base64")}` };
  assert.ok(logoSchema.safeParse(logo).success);
  for (const invalid of [{ ...logo, dataUrl: "https://example.test/logo.png" }, { ...logo, dataUrl: "data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=" }, { ...logo, width: 3 }, { ...logo, mimeType: "image/jpeg" }, { ...logo, width: 513 }])
    assert.ok(!logoSchema.safeParse(invalid).success);
  const doc = parseSessionJson(sample); doc.branding.primaryColor = "red;url"; assert.throws(() => exportDocument(doc));
});

test("raster header guards identify PNG/JPEG and reject truncated/non-raster files", async () => {
  const source = sharp({ create: { width: 80, height: 40, channels: 3, background: "#245A42" } });
  assert.deepEqual(rasterInfo(await source.clone().jpeg().toBuffer()), { mimeType: "image/jpeg", width: 80, height: 40 });
  assert.deepEqual(rasterInfo(await source.clone().png().toBuffer()), { mimeType: "image/png", width: 80, height: 40 });
  assert.equal(rasterInfo(new Uint8Array([255, 216, 255, 192, 0])), null);
  assert.equal(rasterInfo(new TextEncoder().encode("<svg>not an image</svg>")), null);
});

test("incomplete edits survive local draft recovery but cannot be exported as valid sessions", () => {
  const doc = blankDesignerDocument(); doc.session.name = ""; doc.session.durationMinutes = 0; doc.branding.accentColor = "#12";
  const recovered = decodeDraft(encodeDraft(doc)); assert.deepEqual(recovered.document, doc);
  assert.throws(() => exportDocument(recovered.document));
});

test("drafts are bounded, versioned and expired; corrupt drafts cannot silently become sessions", () => {
  const doc = parseSessionJson(sample), now = Date.now(), text = encodeDraft(doc, now);
  assert.deepEqual(decodeDraft(text, now).document, doc);
  assert.throws(() => decodeDraft(text, now + DRAFT_RETENTION_MS + 1), /expired/);
  assert.throws(() => decodeDraft(text, now - 300001), /invalid date/);
  assert.throws(() => decodeDraft("not-json"));
  assert.throws(() => decodeDraft(" ".repeat(MAX_SESSION_JSON_BYTES + 1)), /2 MB/);
  assert.throws(() => decodeDraft(text.replace('"version":1', '"version":2')));
});

test("user-picked light/dark headers receive readable black or white ink", () => {
  assert.equal(contrastingInk("#FFFFFF"), "#000000");
  assert.equal(contrastingInk("#101E30"), "#ffffff");
  assert.equal(contrastingInk("#E4AE41"), "#000000");
});
