import { test, expect, type Page, type TestInfo } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { buildSync } from "esbuild";
import { attachmentExample } from "../fixtures/attachments";
import { parseSessionPackageJson } from "../../lib/designer/package";
import { parseSessionJson } from "../../lib/designer/contract";
import { drawScene } from "../../lib/tactical/drawing";
import type {} from "../fixtures/companion-browser";

const bundle = buildSync({ entryPoints: ["tests/fixtures/companion-browser.ts"], bundle: true, write: false, format: "iife", platform: "browser", target: "es2022" }).outputFiles[0].text;
const workspace = (page: Page) => page.getByRole("region", { name: "Local diagram workspace", exact: true });
const panel = (page: Page) => page.getByRole("region", { name: "Activity tactical diagrams", exact: true });
const diagram = (page: Page) => panel(page).locator(".scene-diagram");
async function coaching(p: Page) { const toggle = p.getByRole("button", { name: "Coaching information", exact: true }); if (await toggle.isVisible()) await toggle.click(); }

test("normalized complete plans recover without discarding raw whitespace in the text draft", async ({ page }) => {
  const source = await seed(page), id = await openPlan(page, source.documentId);
  await coaching(page);
  await page.getByLabel("Activity name", { exact: true }).fill("5v2 Rondo  ");
  await page.getByLabel("Setup & delivery instructions", { exact: true }).fill("Keep possession.\nRotate defenders.\n\n");
  await workspace(page).getByRole("button", { name: "Save complete plan", exact: true }).click();
  await expect(workspace(page)).toContainText("Complete local plan saved");
  await expect(workspace(page).locator(".diagram-dirty")).toHaveCount(0);
  const snapshot = await stored(page, id);
  expect(snapshot.ok && snapshot.value.status === "ready" && snapshot.value.snapshot.package.document.session.activities[0].name).toBe("5v2 Rondo");
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem(window.companionTest.DESIGNER_DRAFT_KEY) ?? "null")?.document?.session.activities[0].name)).toBe("5v2 Rondo  ");
  await page.reload(); await expect(workspace(page)).toContainText("Complete local plan recovered");
  await expect(page.getByRole("region", { name: "Diagram recovery", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Edit session", exact: true }).click(); await coaching(page);
  await expect(page.getByLabel("Activity name", { exact: true })).toHaveValue("5v2 Rondo  ");
  await expect(diagram(page)).toHaveAttribute("data-revision", "1");
  await expect(workspace(page).getByRole("button", { name: "Save complete plan", exact: true })).toBeEnabled();
  expect(await stored(page, source.documentId)).toEqual({ ok: true, value: { status: "ready", snapshot: source } });
});

test("opening the source browser keeps attached-preview labels until a candidate is chosen", async ({ page }) => {
  const source = await seed(page); await openPlan(page, source.documentId);
  await panel(page).getByRole("button", { name: "Add / replace diagram", exact: true }).click();
  await expect(panel(page).locator(".diagram-canvas-toolbar strong")).toHaveText("Attached diagram 1");
  await expect(diagram(page).locator("svg>title")).toHaveText("Attached diagram: 5v2 Rondo");
  await panel(page).getByRole("button", { name: "Expand diagram", exact: true }).click();
  const expanded = page.getByRole("dialog", { name: "Expanded activity diagram", exact: true });
  await expect(expanded).not.toContainText("Source preview"); await page.keyboard.press("Escape");
  await page.getByLabel("Local scene package", { exact: true }).selectOption(source.documentId);
  await page.getByLabel("Scene revision", { exact: true }).selectOption("1");
  await page.getByLabel("Representative seconds", { exact: true }).fill("4");
  await expect(panel(page).locator(".diagram-canvas-toolbar strong")).toHaveText("Source preview · not yet attached");
  await expect(diagram(page)).toHaveAttribute("data-revision", "2");
});

async function seed(page: Page) {
  const p = attachmentExample();
  const result = await page.evaluate((p) => window.companionTest.browserCompanionRepository().create(p), p);
  if (!result.ok) throw Error(JSON.stringify(result)); return result.value;
}
async function openPlan(page: Page, id: string) {
  await workspace(page).getByRole("button", { name: "Browse local plans", exact: true }).click();
  await workspace(page).getByText(/Saved local plans \(/).click();
  await workspace(page).getByRole("button", { name: `Review plan ${id}`, exact: true }).click();
  page.once("dialog", (d) => d.accept()); await page.getByRole("button", { name: "Open reviewed plan as independent copy", exact: true }).click();
  await expect(page.getByRole("region", { name: "Local session editor" })).toBeVisible();
  return new URL(page.url()).searchParams.get("localPlan")!;
}
async function browse(page: Page, source: string, scene = "0", time = "2") {
  await panel(page).getByRole("button", { name: "Add / replace diagram", exact: true }).click();
  await page.getByLabel("Local scene package", { exact: true }).selectOption(source);
  await page.getByLabel("Scene revision", { exact: true }).selectOption(scene);
  await page.getByLabel("Representative seconds", { exact: true }).fill(time);
}
async function stored(page: Page, id: string) { return page.evaluate((id) => window.companionTest.browserCompanionRepository().read(id), id); }
async function capture(page: Page, info: TestInfo, name: string) {
  await page.locator(".coaching-activity-detail").evaluate((el) => el.scrollTop = 0);
  await page.locator(".coaching-activity-layout").scrollIntoViewIfNeeded();
  if (name === "scene-browser") await page.getByRole("region", { name: "Local scene browser", exact: true }).scrollIntoViewIfNeeded();
  if (name.endsWith("-attached")) {
    const canvas = (await panel(page).locator(".activity-diagram-canvas").boundingBox())!, detail = (await page.locator(".coaching-activity-detail").boundingBox())!;
    expect(canvas.y).toBeGreaterThanOrEqual(detail.y); expect(canvas.y + canvas.height).toBeLessThanOrEqual(detail.y + detail.height);
    expect(canvas.y + canvas.height).toBeLessThanOrEqual(info.project.use.viewport!.height);
  }
  const path = info.outputPath(`${name}-${info.project.name}.png`); await page.screenshot({ path }); await info.attach(name, { path, contentType: "image/png" });
}
async function expandCapture(page: Page, info: TestInfo, name: string) {
  const before = await diagram(page).locator("g[data-entity-id]").evaluateAll((nodes) => nodes.map((n) => [n.getAttribute("data-entity-id"), n.getAttribute("data-world-x"), n.getAttribute("data-world-y")]));
  await panel(page).getByRole("button", { name: "Expand diagram", exact: true }).click();
  const modal = page.getByRole("dialog", { name: "Expanded activity diagram", exact: true });
  await expect(modal).toBeVisible(); await expect(modal.getByRole("button", { name: "Close diagram · Esc", exact: true })).toBeFocused();
  await page.keyboard.press("Tab"); await expect(modal.locator("summary")).toBeFocused(); await page.keyboard.press("Tab"); await expect(modal.getByRole("button")).toBeFocused();
  const after = await modal.locator("g[data-entity-id]").evaluateAll((nodes) => nodes.map((n) => [n.getAttribute("data-entity-id"), n.getAttribute("data-world-x"), n.getAttribute("data-world-y")])); expect(after).toEqual(before);
  await expect(modal.locator(".scene-diagram")).toHaveAttribute("data-clipped", "0");
  const path = info.outputPath(`${name}-${info.project.name}.png`); await page.screenshot({ path }); await info.attach(name, { path, contentType: "image/png" });
  await page.keyboard.press("Escape"); await expect(modal).toHaveCount(0); await expect(panel(page).getByRole("button", { name: "Expand diagram", exact: true })).toBeFocused();
}
async function download(page: Page, name: string) {
  const wait = page.waitForEvent("download"); await page.getByRole("button", { name, exact: true }).click(); return readFile((await (await wait).path())!, "utf8");
}
test.beforeEach(async ({ context, page }) => {
  await context.addInitScript({ content: bundle });
  await context.route("**/*", (route) => ["127.0.0.1", "localhost"].includes(new URL(route.request().url()).hostname) ? route.continue() : route.abort());
  await page.goto("/session-designer", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("button", { name: "Edit session", exact: true })).toBeEnabled();
});

test("open complete plan, preview exact geometry, manage multiple pins and export both formats", async ({ page }, info) => {
  const source = await seed(page), id = await openPlan(page, source.documentId), p = attachmentExample(); expect(id).not.toBe(source.documentId);
  await expect(diagram(page)).toHaveAttribute("data-scene-id", "example-rondo"); await expect(diagram(page)).toHaveAttribute("data-revision", "1"); await expect(diagram(page)).toHaveAttribute("data-time", "2");
  await expect(diagram(page)).toHaveAttribute("data-clipped", "0");
  const world = await diagram(page).locator("g[data-entity-id]").evaluateAll((nodes) => nodes.map((n) => [n.getAttribute("data-entity-id"), Number(n.getAttribute("data-world-x")), Number(n.getAttribute("data-world-y"))]));
  const drawing = drawScene(p.scenes[0], { width: 800, height: 400, seconds: 2 });
  const expected = drawing.nodes.filter((n) => n.tag === "g" && n.attrs?.["data-entity-id"]).map((n) => [n.attrs!["data-entity-id"], n.attrs!["data-world-x"], n.attrs!["data-world-y"]]); expect(world).toEqual(expected);
  await capture(page, info, "small-sided-attached");
  await expandCapture(page, info, "small-sided-expanded");
  await browse(page, source.documentId, "1", "4"); await expect(diagram(page)).toHaveAttribute("data-revision", "2");
  await capture(page, info, "scene-browser");
  await panel(page).getByRole("button", { name: "Attach as diagram 2", exact: true }).click(); await expect(workspace(page)).toContainText("owner v2");
  await panel(page).getByRole("button", { name: "Return to attached diagrams", exact: true }).click();
  await panel(page).getByRole("button", { name: /Diagram 2 .*example-rondo/ }).click(); await expect(diagram(page)).toHaveAttribute("data-time", "4");
  await capture(page, info, "multiple-diagrams");
  await browse(page, source.documentId, "0", "1"); await panel(page).getByRole("button", { name: "Replace diagram 2 with preview", exact: true }).click(); await expect(workspace(page)).toContainText("owner v3");
  await panel(page).getByRole("button", { name: "Return to attached diagrams", exact: true }).click();
  const complete = parseSessionPackageJson(await download(page, "Download complete package")), legacy = parseSessionJson(await download(page, "Download text & references JSON"));
  expect(complete.ok).toBe(true); if (complete.ok) { expect(complete.value.document).toEqual(legacy); expect(complete.value.document.session.activities[0].diagrams.map((p) => [p.scene.revision, p.representativeSeconds])).toEqual([[1, 2], [1, 1]]); }
  await panel(page).getByRole("button", { name: "Remove selected diagram", exact: true }).click(); await expect(workspace(page)).toContainText("owner v4");
  expect(await stored(page, source.documentId)).toEqual({ ok: true, value: { status: "ready", snapshot: source } });
});

test("activity switching and refresh retain stable attachment identities and full-pitch geometry", async ({ page }, info) => {
  const source = await seed(page), id = await openPlan(page, source.documentId);
  await page.getByRole("navigation", { name: "Session activities", exact: true }).getByRole("button", { name: /11v11 Team Shape/ }).click();
  await page.getByLabel("Diagram framing", { exact: true }).selectOption("pitch");
  await expect(diagram(page)).toHaveAttribute("data-scene-id", "example-11v11"); await expect(diagram(page)).toHaveAttribute("data-clipped", "0");
  expect(await diagram(page).locator("g[data-entity-id]").count()).toBe(25);
  await expect(diagram(page).locator('svg>desc')).toContainText("105 by 68");
  const pitch = diagram(page).locator('rect[data-field-marking="touchlines"]');
  expect(Number(await pitch.getAttribute("width")) / Number(await pitch.getAttribute("height"))).toBeCloseTo(105 / 68, 6);
  await capture(page, info, "full-pitch-attached");
  await expandCapture(page, info, "full-pitch-expanded");
  await coaching(page); await page.getByRole("button", { name: "Move activity up", exact: true }).click(); await workspace(page).getByRole("button", { name: "Save complete plan", exact: true }).click(); await expect(workspace(page)).toContainText("owner v2");
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem(window.companionTest.DESIGNER_DRAFT_KEY) ?? "null")?.document?.session.activities[0].id)).toBe("activity-2");
  await page.reload(); await expect(workspace(page)).toContainText("Complete local plan recovered"); await page.getByRole("button", { name: "Edit session", exact: true }).click(); await expect(diagram(page)).toHaveAttribute("data-scene-id", "example-11v11");
  expect(new URL(page.url()).searchParams.get("localPlan")).toBe(id);
});

test("first attachment creates a fresh companion and never overwrites the imported source", async ({ page }) => {
  const source = await seed(page), draft = attachmentExample().document; for (const a of draft.session.activities) a.diagrams = [];
  await page.getByLabel("Choose session JSON", { exact: true }).setInputFiles({ name: "text.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(draft)) });
  await page.getByRole("button", { name: "Open imported session", exact: true }).click(); await browse(page, source.documentId, "0", "2.5");
  await panel(page).getByRole("button", { name: "Attach as diagram 1", exact: true }).click(); await expect(workspace(page)).toContainText("Complete local plan saved");
  const id = new URL(page.url()).searchParams.get("localPlan")!; expect(id).not.toBe(source.documentId);
  const read = await stored(page, id); expect(read.ok && read.value.status === "ready" && read.value.snapshot.package.document.session.activities[0].diagrams[0].representativeSeconds).toBe(2.5);
  expect(await stored(page, source.documentId)).toEqual({ ok: true, value: { status: "ready", snapshot: source } });
});

test("invalid timestamps are rejected without clamping or saving", async ({ page }) => {
  const source = await seed(page), id = await openPlan(page, source.documentId), before = await stored(page, id);
  await browse(page, source.documentId, "0", "999"); await expect(panel(page)).toContainText("Exact diagram unavailable");
  await expect(panel(page).getByRole("button", { name: "Attach as diagram 2", exact: true })).toBeDisabled();
  await page.getByLabel("Representative seconds", { exact: true }).fill("-1"); await expect(panel(page).getByRole("button", { name: "Attach as diagram 2", exact: true })).toBeDisabled(); expect(await stored(page, id)).toEqual(before);
});

test("missing and changed source packages do not fall back to another revision", async ({ page }) => {
  const source = await seed(page), id = await openPlan(page, source.documentId); await browse(page, source.documentId);
  await page.evaluate(async ({ id, p }) => { const r = await window.companionTest.browserCompanionRepository().save(id, 1, p); if (!r.ok) throw Error(r.error.message); }, { id: source.documentId, p: { ...source.package, document: { ...source.package.document, session: { ...source.package.document.session, name: "Changed source" } } } });
  await panel(page).getByRole("button", { name: "Attach as diagram 2", exact: true }).click(); await expect(workspace(page)).toContainText("scene source is missing, invalid or changed");
  const read = await stored(page, id); expect(read.ok && read.value.status === "ready" && read.value.snapshot.ownerVersion).toBe(1);
});

test("linked missing package preserves the reference-only draft and offers explicit recovery", async ({ page }, info) => {
  const source = await seed(page); await openPlan(page, source.documentId);
  await expect.poll(() => page.evaluate(() => localStorage.getItem(window.companionTest.DESIGNER_DRAFT_KEY))).not.toBeNull();
  await page.goto("/session-designer?localPlan=missing-plan&localVersion=1"); await expect(workspace(page)).toContainText("linked local package is missing");
  await page.getByRole("button", { name: "Edit session", exact: true }).click(); await expect(panel(page)).toContainText("Reference-only diagram");
  await workspace(page).scrollIntoViewIfNeeded(); const path = info.outputPath(`missing-recovery-${info.project.name}.png`); await page.screenshot({ path });
  await page.getByRole("button", { name: "Keep reference-only text draft", exact: true }).click(); expect(new URL(page.url()).searchParams.has("localPlan")).toBe(false);
  expect(parseSessionJson(await download(page, "Download text & references JSON")).session.activities[0].diagrams[0].scene.revision).toBe(1);
});

test("corrupt current snapshot offers verified previous copy without repairing the damaged owner", async ({ page }) => {
  const source = await seed(page), id = await openPlan(page, source.documentId);
  await workspace(page).getByRole("button", { name: "Save complete plan", exact: true }).click(); await expect(workspace(page)).toContainText("owner v2");
  await page.evaluate(async (id) => { await window.companionTest.indexedDbCompanionStorage().transact("readwrite", (records) => { const record = records.find((r) => (r as { documentId: string }).documentId === id) as { snapshots: { packageJson: string }[] }; record.snapshots[0].packageJson = "{"; return { value: null, put: record as never }; }); }, id);
  await page.reload(); await expect(workspace(page)).toContainText("Linked package is invalid"); await expect(page.getByRole("region", { name: "Diagram recovery" })).toContainText("owner v1");
  page.once("dialog", (d) => d.accept()); await page.getByRole("button", { name: "Open reviewed plan as independent copy", exact: true }).click(); await expect(diagram(page)).toHaveAttribute("data-revision", "1");
  const damaged = await stored(page, id); expect(damaged.ok && damaged.value.status).toBe("invalid"); expect(new URL(page.url()).searchParams.get("localPlan")).not.toBe(id);
});

test("newer text draft versus complete snapshot requires a deliberate choice without automatic merging", async ({ page }) => {
  const source = await seed(page), id = await openPlan(page, source.documentId);
  await coaching(page); await page.getByLabel("Activity name", { exact: true }).fill("Unsaved text revision");
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem(window.companionTest.DESIGNER_DRAFT_KEY) ?? "null")?.document?.session.activities[0].name)).toBe("Unsaved text revision");
  await page.reload(); await expect(workspace(page)).toContainText("linked package version or text draft differs");
  expect((await download(page, "Download text & references JSON"))).toContain("Unsaved text revision");
  const saved = await stored(page, id); expect(saved.ok && saved.value.status === "ready" && saved.value.snapshot.package.document.session.activities[0].name).toBe("5v2 Rondo");
  page.once("dialog", (d) => d.dismiss()); await page.getByRole("button", { name: "Open reviewed plan as independent copy", exact: true }).click(); expect(await download(page, "Download text & references JSON")).toContain("Unsaved text revision");
  page.once("dialog", (d) => d.accept()); await page.getByRole("button", { name: "Keep current text & revalidate linked diagrams", exact: true }).click();
  await expect(diagram(page)).toHaveAttribute("data-scene-id", "example-rondo"); await expect(page.getByLabel("Activity name", { exact: true })).toHaveValue("Unsaved text revision");
  const complete = parseSessionPackageJson(await download(page, "Download complete package")); expect(complete.ok && complete.value.document.session.activities[0].name).toBe("Unsaved text revision");
  expect(new URL(page.url()).searchParams.get("localPlan")).not.toBe(id);
});

test("concurrent complete-owner save requires deliberate recovery and cannot overwrite a newer owner", async ({ page, context }) => {
  const source = await seed(page), id = await openPlan(page, source.documentId); await coaching(page); await page.getByLabel("Activity name", { exact: true }).fill("Draft A");
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem(window.companionTest.DESIGNER_DRAFT_KEY) ?? "null")?.document?.session.activities[0].name)).toBe("Draft A");
  await workspace(page).getByRole("button", { name: "Save complete plan", exact: true }).click(); await expect(workspace(page)).toContainText("owner v2");
  const second = await context.newPage(); await second.goto(page.url()); await expect(workspace(second)).toContainText("Complete local plan recovered");
  await second.evaluate(async (id) => { const repo = window.companionTest.browserCompanionRepository(), read = await repo.read(id); if (!read.ok || read.value.status !== "ready") throw Error("Missing owner"); const result = await repo.save(id, 2, read.value.snapshot.package); if (!result.ok) throw Error(result.error.message); }, id);
  await workspace(second).getByRole("button", { name: "Save complete plan", exact: true }).click(); await expect(workspace(second).getByRole("alert")).toBeVisible(); await expect(second.getByRole("region", { name: "Diagram recovery" })).toBeVisible();
  const current = await stored(page, id); expect(current.ok && current.value.status === "ready" && current.value.snapshot.ownerVersion).toBe(3);
});

test("a concurrent text edit blocks attachment without changing either the draft or complete owner", async ({ page, context }) => {
  const source = await seed(page), id = await openPlan(page, source.documentId);
  await expect(page.getByRole("status").filter({ hasText: "Draft saved in this browser" })).toBeVisible();
  const second = await context.newPage(); await second.goto(page.url()); await expect(workspace(second)).toContainText("Complete local plan recovered");
  await second.getByRole("button", { name: "Edit session", exact: true }).click();
  await coaching(second); await second.getByLabel("Activity name", { exact: true }).fill("Another coach's text");
  await expect.poll(() => second.evaluate(() => JSON.parse(localStorage.getItem(window.companionTest.DESIGNER_DRAFT_KEY) ?? "null")?.document?.session.activities[0].name)).toBe("Another coach's text");
  await browse(page, source.documentId); await panel(page).getByRole("button", { name: "Attach as diagram 2", exact: true }).click();
  await expect(workspace(page).getByRole("alert")).toContainText("Another tab changed the text draft");
  const read = await stored(page, id); expect(read.ok && read.value.status === "ready" && read.value.snapshot.ownerVersion).toBe(1);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem(window.companionTest.DESIGNER_DRAFT_KEY) ?? "null")?.document?.session.activities[0].name)).toBe("Another coach's text");
});

test("interrupted put rolls back the complete package and keeps the previous activity pins", async ({ page }) => {
  const source = await seed(page), id = await openPlan(page, source.documentId), before = await stored(page, id); await browse(page, source.documentId, "1", "4");
  await page.evaluate(() => { const original = IDBObjectStore.prototype.put; IDBObjectStore.prototype.put = function (...args) { IDBObjectStore.prototype.put = original; const req = original.apply(this, args); req.addEventListener("success", () => this.transaction.abort(), { once: true }); return req; }; });
  await panel(page).getByRole("button", { name: "Attach as diagram 2", exact: true }).click(); await expect(workspace(page).getByRole("alert")).toContainText("interrupted");
  expect(await stored(page, id)).toEqual(before); await panel(page).getByRole("button", { name: "Return to attached diagrams", exact: true }).click();
  await expect(panel(page).getByRole("navigation", { name: "Attached diagrams" }).getByRole("button")).toHaveCount(1);
});

test("text changed during IDB commit preserves both versions and never applies pins over the newer text", async ({ page }) => {
  const source = await seed(page), id = await openPlan(page, source.documentId); await browse(page, source.documentId, "1", "4");
  await page.evaluate(() => {
    const original = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (...args) {
      IDBObjectStore.prototype.put = original; const req = original.apply(this, args);
      req.addEventListener("success", () => { const h = window.companionTest, doc = h.companionExample().document; doc.session.name = "Concurrent text during commit"; localStorage.setItem(h.DESIGNER_DRAFT_KEY, h.encodeDraft(doc)); }, { once: true }); return req;
    };
  });
  await panel(page).getByRole("button", { name: "Attach as diagram 2", exact: true }).click();
  await expect(workspace(page).getByRole("alert")).toContainText("text changed meanwhile");
  const read = await stored(page, id); expect(read.ok && read.value.status === "ready" && read.value.snapshot.package.document.session.activities[0].diagrams.length).toBe(2);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem(window.companionTest.DESIGNER_DRAFT_KEY)!).document.session.name)).toBe("Concurrent text during commit");
  await panel(page).getByRole("button", { name: "Return to attached diagrams", exact: true }).click();
  await expect(panel(page).getByRole("navigation", { name: "Attached diagrams" }).getByRole("button")).toHaveCount(1);
});

test("unfinished text stays editable and previewable while complete saving remains strict", async ({ page }) => {
  const source = await seed(page), id = await openPlan(page, source.documentId), before = await stored(page, id);
  await coaching(page); await page.getByLabel("Activity name", { exact: true }).fill(""); await expect(diagram(page)).toHaveAttribute("data-scene-id", "example-rondo");
  await workspace(page).getByRole("button", { name: "Save complete plan", exact: true }).click(); await expect(workspace(page)).toContainText("Too small");
  await expect(page.getByLabel("Activity name", { exact: true })).toHaveValue(""); expect(await stored(page, id)).toEqual(before);
  await coaching(page); await page.getByLabel("Activity name", { exact: true }).fill("Completed coaching title");
  await workspace(page).getByRole("button", { name: "Save complete plan", exact: true }).click(); await expect(workspace(page)).toContainText("owner v2");
});

test("quota failure retains original pins and exposes the full candidate backup", async ({ page }, info) => {
  const source = await seed(page), id = await openPlan(page, source.documentId), before = await stored(page, id); await browse(page, source.documentId, "1", "4");
  await page.evaluate(() => { const original = IDBObjectStore.prototype.put; IDBObjectStore.prototype.put = function () { IDBObjectStore.prototype.put = original; throw new DOMException("Test quota", "QuotaExceededError"); }; });
  await panel(page).getByRole("button", { name: "Attach as diagram 2", exact: true }).click(); await expect(page.getByRole("region", { name: "Diagram recovery" })).toBeVisible(); expect(await stored(page, id)).toEqual(before);
  const backup = parseSessionPackageJson(await download(page, "Download complete candidate")); expect(backup.ok && backup.value.document.session.activities[0].diagrams.length).toBe(2);
  await workspace(page).scrollIntoViewIfNeeded(); await page.screenshot({ path: info.outputPath(`save-recovery-${info.project.name}.png`) });
});
