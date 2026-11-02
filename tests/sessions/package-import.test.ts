import test from "node:test";
import assert from "node:assert/strict";
import { packageImportSummary, previewPackageImport } from "../../lib/designer/package-import";
import { serializeSessionPackageJson } from "../../lib/designer/package";
import { serializeSessionJson } from "../../lib/designer/contract";
import { companionExample } from "../fixtures/companion";

test("package import preview preserves exact namespace, revision, timestamp and source values", () => {
  const pkg = companionExample(), newer = structuredClone(pkg.scenes[0]); newer.revision = 2; pkg.scenes.push(newer); const before = JSON.stringify(pkg);
  const result = previewPackageImport(JSON.stringify(pkg)); assert.ok(result.ok);
  const summary = packageImportSummary(result.value);
  assert.equal(summary.activities, 1); assert.equal(summary.scenes, 2); assert.equal(summary.namespace, "file-namespace");
  assert.deepEqual(summary.attachments, [{ activityId: "activity-1", activityName: "Support", diagramIndex: 0, sceneId: "movement", revision: 1, seconds: 1 }]);
  assert.equal(JSON.stringify(pkg), before);
  const exported = serializeSessionPackageJson(result.value); assert.ok(exported.ok); assert.deepEqual(previewPackageImport(exported.value), result);
});
test("package preview rejects missing scenes, conflicting duplicate revisions and out-of-range pins without fallback", () => {
  const missing = companionExample(); missing.scenes[0].revision = 2;
  const duplicate = companionExample(); duplicate.scenes.push({ ...structuredClone(duplicate.scenes[0]), field: { length: 40, width: 20 } });
  const time = companionExample(); time.document.session.activities[0].diagrams[0].representativeSeconds = 3;
  for (const [pkg, code] of [[missing, "missing_revision"], [duplicate, "revision_conflict"], [time, "invalid_time"]] as const) {
    const before = JSON.stringify(pkg), result = previewPackageImport(before); assert.equal(result.ok, false);
    if (!result.ok) assert.ok(result.diagnostics.some((d) => d.code === code)); assert.equal(JSON.stringify(pkg), before);
  }
});
test("the explicit package path cannot reinterpret legacy JSON or malformed versions", () => {
  assert.equal(previewPackageImport(serializeSessionJson(companionExample().document)).ok, false);
  assert.equal(previewPackageImport("{").ok, false);
  assert.equal(previewPackageImport(JSON.stringify({ ...companionExample(), schemaVersion: "2.0" })).ok, false);
});
test("identical duplicate revisions are canonicalized by B1 and attachment counts remain accurate", () => {
  const pkg = companionExample(); pkg.scenes.push(structuredClone(pkg.scenes[0]));
  const result = previewPackageImport(JSON.stringify(pkg)); assert.ok(result.ok);
  assert.equal(packageImportSummary(result.value).scenes, 1); assert.equal(packageImportSummary(result.value).attachments.length, 1);
});
