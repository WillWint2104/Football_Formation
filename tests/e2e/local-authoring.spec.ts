import { test, expect, type Page, type TestInfo } from "@playwright/test";
import { buildSync } from "esbuild";
import { attachmentExample } from "../fixtures/attachments";
import type {} from "../fixtures/companion-browser";

const bundle = buildSync({ entryPoints: ["tests/fixtures/companion-browser.ts"], bundle: true, write: false, format: "iife", platform: "browser", target: "es2022" }).outputFiles[0].text;
const apiOperations = new WeakMap<Page, string[]>();
const host = (p: Page) => p.getByRole("region", { name: "Local tactical editor", exact: true });
const panel = (p: Page) => p.getByRole("region", { name: "Activity tactical diagrams", exact: true });
const status = (p: Page) => p.getByRole("region", { name: "Local diagram workspace", exact: true });
const context = (p: Page) => JSON.parse(new URL(p.url()).searchParams.get("localAuthoring")!);
async function coaching(p: Page) { const toggle = p.getByRole("button", { name: "Coaching information", exact: true }); if (await toggle.isVisible()) await toggle.click(); }

async function read(p: Page, id: string) {
  const r = await p.evaluate((id) => window.companionTest.browserCompanionRepository().read(id), id);
  if (!r.ok || r.value.status !== "ready") throw new Error(JSON.stringify(r)); return r.value.snapshot;
}
async function open(p: Page, noDiagrams = false) {
  const pkg = attachmentExample();
  if (noDiagrams) { pkg.sceneNamespace = null as never; pkg.scenes = []; pkg.document.session.activities.forEach((a) => a.diagrams = []); }
  const r = await p.evaluate((pkg) => window.companionTest.browserCompanionRepository().create(pkg), pkg);
  if (!r.ok) throw new Error(JSON.stringify(r));
  await status(p).getByRole("button", { name: "Browse local plans", exact: true }).click();
  await status(p).getByText(/Saved local plans \(/).click();
  await status(p).getByRole("button", { name: `Review plan ${r.value.documentId}`, exact: true }).click();
  p.once("dialog", (d) => d.accept()); await p.getByRole("button", { name: "Open reviewed plan as independent copy", exact: true }).click();
  await expect(panel(p)).toBeVisible();
  return read(p, new URL(p.url()).searchParams.get("localPlan")!);
}
async function edit(p: Page) { await panel(p).getByRole("button", { name: "Edit Diagram", exact: true }).click(); await expect(host(p)).toBeVisible(); await host(p).getByRole("button", { name: "Properties", exact: true }).click(); }
async function save(p: Page) { const previous = context(p).candidate?.version ?? 0; await host(p).getByRole("button", { name: "Save Local Copy", exact: true }).click(); await expect.poll(() => context(p).candidate?.version ?? 0).toBe(previous + 1); await expect(host(p).getByRole("button", { name: "Save Local Copy", exact: true })).toBeEnabled(); await expect(host(p).locator(".local-authoring-message")).toContainText("Local copy saved"); }
async function review(p: Page) { await host(p).getByRole("button", { name: "Return to Activity", exact: true }).click(); await expect(host(p).getByRole("heading", { name: "Review local diagram", exact: true })).toBeFocused(); }
async function shot(p: Page, info: TestInfo, name: string) { await p.evaluate(() => scrollTo(0, 0)); const path = info.outputPath(`${name}-${info.project.name}.png`); await p.screenshot({ path }); await info.attach(name, { path, contentType: "image/png" }); }

test.beforeEach(async ({ context, page }) => {
  const requests: string[] = []; apiOperations.set(page, requests); page.on("request", (r) => { if (new URL(r.url()).pathname.startsWith("/api/")) requests.push(`${r.method()} ${r.url()}`); });
  await context.addInitScript({ content: bundle });
  await context.route("**/*", (r) => ["localhost", "127.0.0.1"].includes(new URL(r.request().url()).hostname) ? r.continue() : r.abort());
  await page.goto("/session-designer", { waitUntil: "domcontentloaded" }); await expect(page.getByRole("button", { name: "Edit session", exact: true })).toBeEnabled();
});
test.afterEach(async ({ page }) => { expect(apiOperations.get(page)).toEqual([]); });

test("edit imported scene using real tools, append native revisions, explicitly accept exact time; zero organisation APIs", async ({ page }, info) => {
  const api: string[] = [], errors: string[] = []; page.on("request", (r) => { if (new URL(r.url()).pathname.startsWith("/api/")) api.push(r.url()); }); page.on("pageerror", (e) => errors.push(e.message));
  const origin = await open(page); await edit(page);
  await expect(host(page)).toContainText("editing a local copy");
  await page.getByRole("button", { name: "Layout", exact: true }).click();
  await page.getByRole("button", { name: "● Player", exact: true }).click(); await page.getByRole("button", { name: "Insert at centre", exact: true }).click();
  await save(page); const firstContext = context(page), first = await read(page, firstContext.candidate.id);
  expect(await read(page, origin.documentId)).toEqual(origin); expect(first.package.document).toEqual(origin.package.document);
  expect(first.package.scenes.at(-1)!.id).not.toBe(origin.package.scenes[0].id); expect(first.package.scenes.at(-1)!.entities.length).toBe(origin.package.scenes[0].entities.length + 1);
  const saveButton = host(page).getByRole("button", { name: "Save Local Copy", exact: true }); await saveButton.hover();
  await expect(saveButton).toHaveCSS("background-color", "rgb(18, 84, 155)");
  await shot(page, info, "local-editor");
  await page.getByRole("button", { name: "↶ Undo", exact: true }).click(); await save(page);
  const saved = await read(page, firstContext.candidate.id); expect(saved.package.scenes.slice(0, first.package.scenes.length)).toEqual(first.package.scenes); expect(saved.package.scenes.at(-1)!.revision).toBe(2);
  await review(page); await expect(host(page).locator(".scene-diagram")).toHaveAttribute("data-time", "2"); await expect(host(page).locator(".scene-diagram")).toHaveAttribute("data-revision", "2");
  await shot(page, info, "candidate-review"); await host(page).getByRole("button", { name: "Accept Diagram", exact: true }).click();
  await expect(host(page)).toHaveCount(0); await expect(panel(page).locator(".activity-diagram-canvas .scene-diagram")).toHaveAttribute("data-revision", "2");
  const accepted = await read(page, origin.documentId), expected = structuredClone(origin.package.document);
  expected.session.activities[0].diagrams[0].scene = { id: firstContext.sceneId, revision: 2 };
  expect(accepted.package.document).toEqual(expected); expect(accepted.package.scenes.slice(0, 3)).toEqual(origin.package.scenes);
  expect(new URL(page.url()).searchParams.has("localAuthoring")).toBe(false); expect(api).toEqual([]); expect(errors).toEqual([]);
  await shot(page, info, "accepted-local-copy");
});
test("create a new diagram in a null-namespace plan, use existing editor setup and accept as append", async ({ page }) => {
  const origin = await open(page, true); await panel(page).getByRole("button", { name: "Create Diagram", exact: true }).click();
  await page.getByLabel("Example setup", { exact: true }).selectOption("rondo"); await page.getByRole("button", { name: "Apply setup", exact: true }).click();
  await save(page); await review(page); await host(page).getByRole("button", { name: "Accept Diagram", exact: true }).click(); await expect(host(page)).toHaveCount(0);
  const saved = await read(page, origin.documentId); expect(saved.package.sceneNamespace).toMatch(/^local-/); expect(saved.package.document.session.activities[0].diagrams).toHaveLength(1);
  expect(saved.package.document.session.activities[1]).toEqual(origin.package.document.session.activities[1]);
});
test("cancel before and after save preserves original activity and keeps the saved candidate", async ({ page }) => {
  const origin = await open(page); await edit(page); await host(page).getByRole("button", { name: "Cancel", exact: true }).click(); expect(await read(page, origin.documentId)).toEqual(origin);
  await edit(page); await save(page); const ctx = context(page); await host(page).getByRole("button", { name: "Cancel", exact: true }).click();
  expect(await read(page, origin.documentId)).toEqual(origin); expect((await read(page, ctx.candidate.id)).package.scenes).toHaveLength(4);
  await expect(panel(page).locator(".activity-diagram-canvas .scene-diagram")).toHaveAttribute("data-scene-id", "example-rondo");
});
test("refresh recovers only verified saved candidate, resume real editor and save another revision", async ({ page }, info) => {
  const origin = await open(page); await edit(page); await save(page); const ctx = context(page); await page.reload();
  await page.getByRole("button", { name: "Recover Saved Candidate", exact: true }).click(); await expect(host(page)).toBeVisible();
  await expect(host(page).locator(".scene-diagram")).toHaveAttribute("data-scene-id", ctx.sceneId); expect(await read(page, origin.documentId)).toEqual(origin);
  await shot(page, info, "recovered-candidate"); await host(page).getByRole("button", { name: "Edit Saved Copy", exact: true }).click();
  await save(page); expect((await read(page, ctx.candidate.id)).package.scenes.at(-1)!.revision).toBe(2); await review(page);
  await host(page).getByRole("button", { name: "Accept Diagram", exact: true }).click(); await expect(host(page)).toHaveCount(0);
});
test("refresh before first save does not recover invented geometry", async ({ page }) => {
  const origin = await open(page); await edit(page); await page.reload();
  await page.getByRole("button", { name: "Recover Saved Candidate", exact: true }).click();
  await expect(page.getByRole("region", { name: "Local copy recovery" })).toContainText("No separate saved local copy"); expect(await read(page, origin.documentId)).toEqual(origin);
});
test("stale source saved by a second browser tab rejects return without changing attachment", async ({ page, context: browser }, info) => {
  const origin = await open(page); await edit(page); await save(page);
  const other = await browser.newPage(); await other.goto("/session-designer"); await other.evaluate(async (s) => { s.package.document.session.name = "Other tab coaching edits"; const r = await window.companionTest.browserCompanionRepository().save(s.documentId, s.ownerVersion, s.package); if (!r.ok) throw Error(r.error.message); }, origin); await other.close();
  await host(page).getByRole("button", { name: "Return to Activity", exact: true }).click(); await expect(host(page).getByRole("alert")).toContainText("changed in another tab");
  await expect(host(page).getByRole("button", { name: "Save Local Copy", exact: true })).toBeDisabled();
  expect((await read(page, origin.documentId)).package.document.session.activities).toEqual(origin.package.document.session.activities); await shot(page, info, "source-conflict");
});
test("legacy text conflict from another tab rejects acceptance and preserves both records", async ({ page }) => {
  const origin = await open(page); await edit(page); await save(page); await review(page);
  await page.evaluate(() => localStorage.setItem(window.companionTest.DESIGNER_DRAFT_KEY, "changed by another tab"));
  await host(page).getByRole("button", { name: "Accept Diagram", exact: true }).click(); await expect(host(page).getByRole("alert")).toContainText("Another tab changed"); expect(await read(page, origin.documentId)).toEqual(origin);
});
for (const fault of ["missing", "corrupt", "revision"] as const) test(`${fault} saved candidate rejects recovery without falling back`, async ({ page }) => {
  const origin = await open(page); await edit(page); await save(page); const ctx = context(page);
  await page.evaluate(async ({ id, fault }) => {
    if (fault === "revision") { const repo = window.companionTest.browserCompanionRepository(), r = await repo.read(id); if (r.ok && r.value.status === "ready") await repo.save(id, r.value.snapshot.ownerVersion, r.value.snapshot.package); return; }
    if (fault === "corrupt") { await window.companionTest.indexedDbCompanionStorage().transact("readwrite", (records) => { const r = records.find((r) => (r as { documentId: string }).documentId === id) as { snapshots: { packageJson: string }[] }; r.snapshots[0].packageJson = "{}"; return { value: null, put: r as never }; }); return; }
    await new Promise<void>((resolve, reject) => { const open = indexedDB.open("football-formation.session-designer.companions.v1", 1); open.onsuccess = () => { const db = open.result, tx = db.transaction("plans", "readwrite"); tx.objectStore("plans").delete(id); tx.oncomplete = () => { db.close(); resolve(); }; tx.onerror = () => reject(tx.error); }; });
  }, { id: ctx.candidate.id, fault });
  await host(page).getByRole("button", { name: "Return to Activity", exact: true }).click(); await expect(host(page).getByRole("alert")).toContainText(fault === "revision" ? "changed in another tab" : fault === "corrupt" ? "invalid" : "missing");
  expect(await read(page, origin.documentId)).toEqual(origin);
});
for (const fault of ["quota", "interrupted"] as const) test(`${fault} transactional write pauses saves without touching source`, async ({ page }, info) => {
  const origin = await open(page); await edit(page);
  await page.evaluate((fault) => { const original = IDBObjectStore.prototype.put; IDBObjectStore.prototype.put = function (...args) { IDBObjectStore.prototype.put = original; if (fault === "quota") throw new DOMException("Injected quota", "QuotaExceededError"); const req = original.apply(this, args); req.addEventListener("success", () => this.transaction.abort(), { once: true }); return req; }; }, fault);
  await host(page).getByRole("button", { name: "Save Local Copy", exact: true }).click(); await expect(host(page).getByRole("alert")).toContainText("Saving is paused");
  await expect(host(page).getByRole("button", { name: "Save Local Copy", exact: true })).toBeDisabled(); expect(await read(page, origin.documentId)).toEqual(origin); await shot(page, info, `${fault}-recovery`);
});
test("lost URL leaves candidate discoverable without automatic attachment", async ({ page }) => {
  const origin = await open(page); await edit(page); await save(page); const ctx = context(page), url = new URL(page.url()); url.searchParams.delete("localAuthoring");
  await page.goto(url.href); await expect(page.getByRole("button", { name: "Recover Saved Candidate", exact: true })).toHaveCount(0);
  await status(page).getByRole("button", { name: "Browse local plans", exact: true }).click(); await status(page).getByText(/Saved local plans \(/).click();
  await expect(status(page).getByRole("button", { name: `Review plan ${ctx.candidate.id}`, exact: true })).toBeVisible(); expect(await read(page, origin.documentId)).toEqual(origin);
});
test("shortening the actual animation requires a new representative time before acceptance", async ({ page }, info) => {
  const origin = await open(page); await edit(page);
  // Shorten every stage through the real animation controls; the original pin is at 2 seconds.
  const stages = page.locator(".animation-stages button");
  for (let i = 0; i < await stages.count(); i++) { await stages.nth(i).click(); await page.getByLabel("Stage duration (seconds)", { exact: true }).fill("0.25"); await page.getByRole("button", { name: "Apply stage timing", exact: true }).click(); }
  await save(page); await review(page);
  await expect(host(page).getByLabel("Representative time (seconds)")).toHaveValue("2");
  await expect(host(page).getByRole("button", { name: "Accept Diagram", exact: true })).toBeDisabled();
  await expect(host(page).locator(".scene-diagram")).toHaveCount(0); await shot(page, info, "choose-exact-time");
  await host(page).getByLabel("Representative time (seconds)").fill("0.125");
  await expect(host(page).locator(".scene-diagram")).toHaveAttribute("data-time", "0.125");
  await host(page).getByRole("button", { name: "Accept Diagram", exact: true }).click(); await expect(host(page)).toHaveCount(0);
  expect((await read(page, origin.documentId)).package.document.session.activities[0].diagrams[0].representativeSeconds).toBe(.125);
});
test("acknowledgement lost after durable commit leaves discoverable candidate and unchanged source", async ({ page }) => {
  const origin = await open(page); await edit(page);
  await page.evaluate(() => { const put = IDBObjectStore.prototype.put; IDBObjectStore.prototype.put = function (...args) { IDBObjectStore.prototype.put = put;
    // Deliberately suppress the adapter's completion acknowledgement after the actual IDB commit.
    this.transaction.oncomplete = () => { document.documentElement.dataset.lostAck = "committed"; };
    return put.apply(this, args); }; });
  await host(page).getByRole("button", { name: "Save Local Copy", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-lost-ack", "committed");
  expect(await read(page, origin.documentId)).toEqual(origin); await page.reload();
  await page.getByRole("button", { name: "Recover Saved Candidate", exact: true }).click();
  await expect(page.getByRole("region", { name: "Local copy recovery" })).toContainText("No separate saved local copy");
  const entries = await page.evaluate(() => window.companionTest.browserCompanionRepository().list());
  expect(entries.ok && entries.value.length).toBe(3); expect(await read(page, origin.documentId)).toEqual(origin);
});
test("text changes at source commit preserve the acknowledged complete plan and never overwrite newer draft", async ({ page }) => {
  const origin = await open(page); await edit(page); await save(page); await review(page);
  await page.evaluate(() => { const put = IDBObjectStore.prototype.put; IDBObjectStore.prototype.put = function (...args) { IDBObjectStore.prototype.put = put;
    const req = put.apply(this, args); req.addEventListener("success", () => localStorage.setItem(window.companionTest.DESIGNER_DRAFT_KEY, "newer text at acceptance commit"), { once: true }); return req; }; });
  await host(page).getByRole("button", { name: "Accept Diagram", exact: true }).click();
  await expect(host(page).getByRole("alert")).toContainText("saved, but this tab changed");
  expect((await read(page, origin.documentId)).ownerVersion).toBe(2);
  expect(await page.evaluate(() => localStorage.getItem(window.companionTest.DESIGNER_DRAFT_KEY))).toBe("newer text at acceptance commit");
});
test("legacy text-only import can create its first complete local plan without another scene store", async ({ page }) => {
  const pkg = attachmentExample(); pkg.document.session.activities.forEach((a) => a.diagrams = []);
  await page.getByLabel("Choose session JSON", { exact: true }).setInputFiles({ name: "legacy.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(pkg.document)) });
  await page.getByRole("button", { name: "Open imported session", exact: true }).click();
  await panel(page).getByRole("button", { name: "Create Diagram", exact: true }).click(); await expect(host(page)).toBeVisible();
  const ctx = context(page); expect(ctx.candidate).toBeNull(); const origin = await read(page, ctx.origin.id); expect(origin.package.scenes).toEqual([]); expect(origin.package.document).toEqual(pkg.document);
  await save(page); await review(page); await host(page).getByRole("button", { name: "Accept Diagram", exact: true }).click(); await expect(host(page)).toHaveCount(0);
  expect((await read(page, ctx.origin.id)).package.document.session.activities[0].diagrams[0].scene.id).toBe(ctx.sceneId);
});
test("incomplete activity text stays editable and prevents starting a candidate", async ({ page }) => {
  const origin = await open(page); await coaching(page); await page.getByLabel("Activity name", { exact: true }).fill("");
  await panel(page).getByRole("button", { name: "Edit Diagram", exact: true }).click();
  await expect(page.getByRole("region", { name: "Local copy recovery" }).getByRole("alert")).toBeVisible();
  await expect(page.getByLabel("Activity name", { exact: true })).toHaveValue(""); expect(await read(page, origin.documentId)).toEqual(origin);
  expect(new URL(page.url()).searchParams.has("localAuthoring")).toBe(false);
});

test("undo after a local save still warns before discarding newer editor state", async ({ page }) => {
  const origin = await open(page); await edit(page);
  await page.getByRole("button", { name: "Layout", exact: true }).click();
  await page.getByRole("button", { name: "● Player", exact: true }).click();
  await page.getByRole("button", { name: "Insert at centre", exact: true }).click();
  await save(page);
  await page.getByRole("button", { name: "↶ Undo", exact: true }).click();
  const confirmations: string[] = [];
  page.once("dialog", async dialog => { confirmations.push(dialog.message()); await dialog.dismiss(); });
  await host(page).getByRole("button", { name: "Return to Activity", exact: true }).click();
  expect(confirmations).toEqual(["Return to the last saved local copy? Unsaved editor changes will be discarded; the activity is unchanged."]);
  await expect(host(page).getByRole("button", { name: "Save Local Copy", exact: true })).toBeVisible();
  expect(await read(page, origin.documentId)).toEqual(origin);
  await save(page); await review(page);
  await expect(host(page).locator(".scene-diagram")).toHaveAttribute("data-revision", "2");
});
