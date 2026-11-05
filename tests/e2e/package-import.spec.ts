import { test, expect, type Page, type TestInfo } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { buildSync } from "esbuild";
import { companionExample, maximumCompanionPackage } from "../fixtures/companion";
import { parseSessionPackageJson } from "../../lib/designer/package";
import type {} from "../fixtures/companion-browser";

const bundle = buildSync({ entryPoints: ["tests/fixtures/companion-browser.ts"], bundle: true, write: false, format: "iife", platform: "browser", target: "es2022" }).outputFiles[0].text;
const preview = (page: Page) => page.getByRole("region", { name: "Package import preview", exact: true });
const confirmation = (page: Page) => page.getByRole("checkbox", { name: "I confirm storing a new independent local package." });
async function choose(page: Page, pkg: unknown = companionExample()) {
  await page.getByLabel("Choose session and diagrams package").setInputFiles({ name: "complete-package.json", mimeType: "application/json", buffer: Buffer.from(typeof pkg === "string" ? pkg : JSON.stringify(pkg)) });
}
async function storeNew(page: Page, pkg: unknown = companionExample()) {
  await choose(page, pkg); await expect(preview(page)).toBeVisible(); await confirmation(page).check(); await page.getByRole("button", { name: "Confirm & store locally", exact: true }).click();
  await expect(page.getByRole("region", { name: "Package import success" })).toBeVisible();
  const result = await page.evaluate(() => window.companionTest.browserCompanionRepository().list()); if (!result.ok) throw Error(JSON.stringify(result)); return result.value;
}
async function replaceTarget(page: Page, id: string) {
  await page.getByRole("button", { name: `Inspect local package ${id}`, exact: true }).click();
  await expect(page.getByRole("region", { name: "Inspected local package" })).toBeVisible();
  await page.getByRole("button", { name: "Use this package as replacement target", exact: true }).click();
}
async function replace(page: Page) { await page.getByRole("checkbox", { name: "I confirm replacing this selected local package." }).check(); await page.getByRole("button", { name: "Confirm replacement & store", exact: true }).click(); }
async function data(page: Page, id: string) { return page.evaluate((id) => window.companionTest.browserCompanionRepository().read(id), id); }
async function capture(page: Page, info: TestInfo, name: string) { const path = info.outputPath(`${name}-${info.project.name}.png`); await page.screenshot({ path }); await info.attach(name, { path, contentType: "image/png" }); }

test.beforeEach(async ({ context, page }) => {
  await context.addInitScript({ content: bundle });
  await context.route("**/*", (route) => ["127.0.0.1", "localhost"].includes(new URL(route.request().url()).hostname) ? route.continue() : route.abort());
  await page.goto("/session-designer", { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Import Session & Diagrams", exact: true }).click();
});

test("validate → preview → confirm → store → export preserves exact revisions and the legacy draft", async ({ page }, info) => {
  const pkg = companionExample(), newer = structuredClone(pkg.scenes[0]); newer.revision = 2; pkg.scenes.push(newer);
  const requests: string[] = []; page.on("request", (r) => { if (new URL(r.url()).pathname.startsWith("/api/")) requests.push(r.url()); });
  await choose(page, pkg); await expect(preview(page)).toContainText("Complete local plan");
  await expect(preview(page).locator("dd")).toHaveText(["1", "2", "1"]);
  await preview(page).getByText("Review diagram attachments (1)", { exact: true }).click();
  await expect(preview(page).locator("tbody tr")).toContainText("movement"); await expect(preview(page).locator("tbody td").nth(2)).toHaveText("1"); await expect(preview(page).locator("tbody td").nth(3)).toHaveText("1 s");
  await expect(page.getByRole("button", { name: "Confirm & store locally", exact: true })).toBeDisabled();
  await preview(page).scrollIntoViewIfNeeded(); await capture(page, info, "import-preview");
  await confirmation(page).check(); await page.getByRole("button", { name: "Confirm & store locally", exact: true }).click();
  const success = page.getByRole("region", { name: "Package import success" }); await expect(success).toContainText("version 1"); await success.scrollIntoViewIfNeeded(); await capture(page, info, "import-success");
  const download = page.waitForEvent("download"); await success.getByRole("button", { name: "Download stored package", exact: true }).click();
  const exported = parseSessionPackageJson(await readFile((await (await download).path())!, "utf8")); expect(exported.ok).toBe(true);
  if (exported.ok) { expect(exported.value.sceneNamespace).toBe("file-namespace"); expect(exported.value.document.session.activities[0].diagrams[0]).toEqual({ scene: { id: "movement", revision: 1 }, representativeSeconds: 1 }); expect(exported.value.scenes.map((s) => s.revision)).toEqual([1, 2]); }
  expect(await page.evaluate(() => localStorage.getItem(window.companionTest.DESIGNER_DRAFT_KEY))).toBeNull(); expect(requests).toEqual([]);
});
test("cancel and unconfirmed replacement preserve all saved records", async ({ page }) => {
  const [entry] = await storeNew(page), before = await data(page, entry.documentId), pkg = companionExample(); pkg.document.session.name = "Replacement";
  await choose(page, pkg); await replaceTarget(page, entry.documentId);
  await expect(page.getByRole("button", { name: "Confirm replacement & store", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Cancel package import", exact: true }).click(); await expect(preview(page)).toHaveCount(0);
  expect(await data(page, entry.documentId)).toEqual(before);
});
test("replacement is scoped to the selected owner and retains the prior complete snapshot", async ({ page }) => {
  const [first] = await storeNew(page); await confirmation(page).check(); await page.getByRole("button", { name: "Confirm & store locally", exact: true }).click();
  await expect(page.getByRole("button", { name: /^Inspect local package / })).toHaveCount(2);
  const all = await page.evaluate(() => window.companionTest.browserCompanionRepository().list()); if (!all.ok) throw Error("List failed"); const other = all.value.find((e) => e.documentId !== first.documentId)!;
  const before = await data(page, other.documentId), next = companionExample(); next.document.session.name = "Explicit replacement";
  await choose(page, next); await replaceTarget(page, first.documentId); await replace(page);
  await expect(page.getByRole("region", { name: "Package import success" })).toContainText("owner v2"); expect(await data(page, other.documentId)).toEqual(before);
  const raw = await page.evaluate(async (id) => window.companionTest.indexedDbCompanionStorage().transact("readonly", (records) => ({ value: records.find((r) => (r as { documentId: string }).documentId === id) })), first.documentId) as { snapshots: { ownerVersion: number }[] };
  expect(raw.snapshots.map((s) => s.ownerVersion)).toEqual([2, 1]);
});
test("missing scenes, conflicting revisions, bad times and unsupported envelopes never replace valid local packages", async ({ page }) => {
  const [first] = await storeNew(page), before = await data(page, first.documentId);
  const missing = companionExample(); missing.scenes[0].revision = 2;
  const conflict = companionExample(); conflict.scenes.push({ ...structuredClone(conflict.scenes[0]), field: { length: 40, width: 20 } });
  const timed = companionExample(); timed.document.session.activities[0].diagrams[0].representativeSeconds = 100;
  for (const pkg of [missing, conflict, timed, { ...companionExample(), schemaVersion: "2.0" }, "{"]) { await choose(page, pkg); await expect(page.getByRole("alert").filter({ hasText: "Package import needs attention" })).toBeVisible(); await expect(preview(page)).toHaveCount(0); }
  const invalidUtf8 = Buffer.from(JSON.stringify(companionExample())); invalidUtf8[invalidUtf8.indexOf("Complete local plan")] = 0xff;
  await page.getByLabel("Choose session and diagrams package").setInputFiles({ name: "invalid-utf8.json", mimeType: "application/json", buffer: invalidUtf8 });
  await expect(page.getByRole("alert").filter({ hasText: "Package import needs attention" })).toBeVisible(); await expect(preview(page)).toHaveCount(0);
  expect(await data(page, first.documentId)).toEqual(before);
});
test("identical duplicate revisions use B1 canonical handling", async ({ page }) => {
  const pkg = companionExample(); pkg.scenes.push(structuredClone(pkg.scenes[0])); await choose(page, pkg);
  await expect(preview(page).locator("dd")).toHaveText(["1", "1", "1"]);
});
test("interrupted transaction after successful put retains the old owner and exposes deliberate recovery", async ({ page }, info) => {
  const [first] = await storeNew(page), before = await data(page, first.documentId), next = companionExample(); next.document.session.name = "Interrupted candidate";
  await choose(page, next); await replaceTarget(page, first.documentId);
  await page.evaluate(() => { const original = IDBObjectStore.prototype.put; IDBObjectStore.prototype.put = function (...args) { IDBObjectStore.prototype.put = original; const request = original.apply(this, args); request.addEventListener("success", () => this.transaction.abort(), { once: true }); return request; }; });
  await replace(page); await expect(page.getByRole("region", { name: "Import save recovery" })).toBeVisible();
  expect(await data(page, first.documentId)).toEqual(before); await page.getByRole("region", { name: "Import save recovery" }).scrollIntoViewIfNeeded(); await capture(page, info, "interrupted-recovery");
  await expect(page.getByRole("button", { name: "Review as a new independent copy" })).toBeDisabled();
  await page.getByRole("button", { name: "Recheck local packages", exact: true }).click(); await page.getByRole("button", { name: "Review as a new independent copy" }).click();
  await expect(confirmation(page)).not.toBeChecked(); expect(await data(page, first.documentId)).toEqual(before);
});
test("quota denial preserves the last valid package and leaves independent backup download usable", async ({ page }, info) => {
  const [first] = await storeNew(page), before = await data(page, first.documentId), next = companionExample(); next.document.session.name = "Quota candidate";
  await choose(page, next); await replaceTarget(page, first.documentId);
  await page.evaluate(() => { const original = IDBObjectStore.prototype.put; IDBObjectStore.prototype.put = function () { IDBObjectStore.prototype.put = original; throw new DOMException("Test quota", "QuotaExceededError"); }; });
  await replace(page); await expect(page.getByRole("alert").filter({ hasText: "Package import needs attention" })).toContainText("quota"); expect(await data(page, first.documentId)).toEqual(before);
  await page.getByRole("region", { name: "Import save recovery" }).scrollIntoViewIfNeeded(); await capture(page, info, "quota-recovery");
  const download = page.waitForEvent("download"); await page.getByRole("button", { name: "Download validated package", exact: true }).click(); const backup = parseSessionPackageJson(await readFile((await (await download).path())!, "utf8")); expect(backup.ok && backup.value.document.session.name).toBe("Quota candidate");
});
test("two application tabs detect stale replacement and require explicit inspection of the new base", async ({ page, context }) => {
  const [first] = await storeNew(page), second = await context.newPage(); await second.goto("/session-designer"); await second.getByRole("button", { name: "Import Session & Diagrams", exact: true }).click();
  const a = companionExample(), b = companionExample(); a.document.session.name = "Tab A replacement"; b.document.session.name = "Tab B candidate";
  await choose(page, a); await choose(second, b); await replaceTarget(page, first.documentId); await replaceTarget(second, first.documentId);
  await replace(page); await expect(page.getByRole("region", { name: "Package import success" })).toContainText("owner v2");
  await replace(second); await expect(second.getByRole("region", { name: "Import save recovery" })).toBeVisible();
  const current = await data(page, first.documentId); expect(current.ok && current.value.status === "ready" && current.value.snapshot.package.document.session.name).toBe("Tab A replacement");
  await replaceTarget(second, first.documentId); await replace(second); await expect(second.getByRole("region", { name: "Package import success" })).toContainText("owner v3");
});
test("refresh discovers saved packages without silently replacing the editing draft", async ({ page }) => {
  const [first] = await storeNew(page); await page.evaluate(() => localStorage.setItem(window.companionTest.DESIGNER_DRAFT_KEY, window.companionTest.encodeDraft(window.companionTest.companionExample().document)));
  const legacy = await page.evaluate(() => localStorage.getItem(window.companionTest.DESIGNER_DRAFT_KEY)); await page.reload();
  await page.getByRole("button", { name: "Import Session & Diagrams", exact: true }).click(); await page.getByRole("button", { name: `Inspect local package ${first.documentId}`, exact: true }).click();
  await expect(page.getByRole("region", { name: "Inspected local package" })).toContainText("Complete local plan");
  expect(await page.evaluate(() => localStorage.getItem(window.companionTest.DESIGNER_DRAFT_KEY))).toBe(legacy);
});
test("corrupt current package offers a verified previous snapshot and a new recovery identity", async ({ page }, info) => {
  const [first] = await storeNew(page); await choose(page); await replaceTarget(page, first.documentId); await replace(page); await expect(page.getByRole("region", { name: "Package import success" })).toContainText("owner v2");
  await page.evaluate(async (id) => {
    const h = window.companionTest;
    await h.indexedDbCompanionStorage().transact("readwrite", (records) => { const record = records.find((r) => (r as { documentId: string }).documentId === id) as { snapshots: { packageJson: string }[] }; record.snapshots[0].packageJson = "{"; return { value: undefined, put: record as never }; });
  }, first.documentId);
  await page.getByRole("button", { name: "Refresh local packages", exact: true }).click(); await page.getByRole("button", { name: `Inspect local package ${first.documentId}`, exact: true }).click();
  const recovery = page.getByRole("region", { name: "Corrupt package recovery" }); await expect(recovery).toContainText("owner v1"); await recovery.scrollIntoViewIfNeeded(); await capture(page, info, "corrupt-recovery");
  await page.getByRole("button", { name: "Review recovery as a new copy", exact: true }).click(); await confirmation(page).check(); await page.getByRole("button", { name: "Confirm & store locally", exact: true }).click();
  await expect(page.getByRole("button", { name: /^Inspect local package / })).toHaveCount(2); const damaged = await data(page, first.documentId); expect(damaged.ok && damaged.value.status).toBe("invalid");
});
test("legacy JSON remains a separate working import flow and its unsaved fields survive package mode", async ({ page }) => {
  await page.getByRole("button", { name: "Legacy session JSON", exact: true }).click();
  await page.getByLabel("Choose session JSON", { exact: true }).setInputFiles("public/samples/session-designer-recovery.json"); await page.getByRole("button", { name: "Open imported session", exact: true }).click();
  await page.getByRole("button", { name: "Import JSON", exact: true }).click(); await page.getByRole("button", { name: "Import Session & Diagrams", exact: true }).click();
  await storeNew(page); await page.getByRole("button", { name: "Edit session", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Recovery & Mobility", exact: true }).first()).toBeVisible();
});
test("namespace changes cannot replace an existing owner but can be imported explicitly as an independent unchanged copy", async ({ page }) => {
  const [first] = await storeNew(page), foreign = companionExample(); foreign.sceneNamespace = foreign.scenes[0].organizationId = "preserved-organisation-id";
  await choose(page, foreign); await replaceTarget(page, first.documentId); await replace(page);
  await expect(page.getByRole("alert").filter({ hasText: "Package import needs attention" })).toContainText("cannot be remapped");
  await page.getByRole("button", { name: "Recheck local packages", exact: true }).click(); await page.getByRole("button", { name: "Review as a new independent copy" }).click();
  await confirmation(page).check(); await page.getByRole("button", { name: "Confirm & store locally", exact: true }).click(); await expect(page.getByRole("button", { name: /^Inspect local package / })).toHaveCount(2);
  const all = await page.evaluate(() => window.companionTest.browserCompanionRepository().list()); if (!all.ok) throw Error("List failed"); const copy = await data(page, all.value.find((e) => e.documentId !== first.documentId)!.documentId);
  expect(copy.ok && copy.value.status === "ready" && copy.value.snapshot.package.sceneNamespace).toBe("preserved-organisation-id");
});
test("maximum package import uses the 8 MiB B1 boundary and rejects the next byte without changing saved records", async ({ page }) => {
  test.setTimeout(60000); const max = maximumCompanionPackage(); const [first] = await storeNew(page, max); const before = await data(page, first.documentId);
  await choose(page, maximumCompanionPackage(8 * 1024 * 1024 + 1)); await expect(page.getByRole("alert").filter({ hasText: "Package import needs attention" })).toContainText("8 MiB"); expect(await data(page, first.documentId)).toEqual(before);
});
