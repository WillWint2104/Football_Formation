import { test, expect, type Page, type BrowserContext } from "@playwright/test";
import { buildSync } from "esbuild";
import { mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type { CompanionRecord } from "../../lib/designer/companion";
import type {} from "../fixtures/companion-browser";

const bundle = buildSync({ entryPoints: ["tests/fixtures/companion-browser.ts"], bundle: true, write: false, format: "iife", platform: "browser", target: "es2022" }).outputFiles[0].text;
async function prepare(context: BrowserContext) {
  await context.route("**/*", (route) => {
    const url = new URL(route.request().url());
    if (!["localhost", "127.0.0.1"].includes(url.hostname)) return route.abort();
    if (url.pathname === "/__companion-b2") return route.fulfill({ contentType: "text/html", body: "<!doctype html><title>B2 persistence harness</title><p>Test-only local storage harness. No application integration.</p>" });
    return route.continue();
  });
  await context.addInitScript({ content: bundle });
}
async function create(page: Page) {
  return page.evaluate(async () => {
    const h = window.companionTest, result = await h.browserCompanionRepository().create(h.companionExample());
    if (!result.ok) throw Error(JSON.stringify(result)); return { id: result.value.documentId, version: result.value.ownerVersion, text: result.value.packageJson };
  });
}
async function read(page: Page, id: string) { return page.evaluate((id) => window.companionTest.browserCompanionRepository().read(id), id); }
async function mutate(page: Page, id: string, change: "malformed" | "missing-revision" | "history" | "version") {
  await page.evaluate(async ({ id, change }) => {
    const h = window.companionTest;
    const record = await new Promise<CompanionRecord>((resolve, reject) => {
      const request = indexedDB.open(h.COMPANION_DATABASE, 1); request.onerror = () => reject(request.error);
      request.onsuccess = () => { const db = request.result, tx = db.transaction(h.COMPANION_STORE, "readonly"), get = tx.objectStore(h.COMPANION_STORE).get(id); tx.oncomplete = () => { db.close(); resolve(get.result); }; tx.onabort = () => { db.close(); reject(tx.error); }; };
    });
    if (change === "version") record.version = 2 as 1;
    else if (change === "history") record.snapshots.pop();
    else if (change === "malformed") record.snapshots[0].packageJson = "{";
    else {
      const p = JSON.parse(record.snapshots[0].packageJson); p.scenes = []; record.snapshots[0].packageJson = JSON.stringify(p);
      const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(record.snapshots[0].packageJson)); record.snapshots[0].sha256 = Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
    }
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open(h.COMPANION_DATABASE, 1); request.onerror = () => reject(request.error);
      request.onsuccess = () => { const db = request.result, tx = db.transaction(h.COMPANION_STORE, "readwrite"); tx.objectStore(h.COMPANION_STORE).put(record); tx.oncomplete = () => { db.close(); resolve(); }; tx.onabort = () => { db.close(); reject(tx.error); }; };
    });
  }, { id, change });
}
test.beforeEach(async ({ context, page }) => { await prepare(context); await page.goto("/__companion-b2"); });

test("real IndexedDB complete package survives refresh and a new page without touching legacy or unrelated storage", async ({ page, context }) => {
  await page.evaluate(() => { localStorage.setItem("unrelated", "Keep me"); localStorage.setItem(window.companionTest.DESIGNER_DRAFT_KEY, "existing legacy bytes"); });
  const first = await create(page), second = await create(page); expect(second.id).not.toBe(first.id);
  await page.reload(); const recovered = await read(page, first.id); expect(recovered.ok).toBe(true);
  const directory = await page.evaluate(() => window.companionTest.browserCompanionRepository().list());
  expect(directory.ok && directory.value.map((e) => e.documentId).sort()).toEqual([first.id, second.id].sort());
  if (!recovered.ok || recovered.value.status !== "ready") throw Error(JSON.stringify(recovered));
  expect(recovered.value.snapshot.packageJson).toBe(first.text); expect(recovered.value.snapshot.ownerVersion).toBe(1);
  const other = await context.newPage(); await other.goto("/__companion-b2"); expect(await read(other, first.id)).toEqual(recovered);
  expect(await page.evaluate(() => [localStorage.getItem("unrelated"), localStorage.getItem(window.companionTest.DESIGNER_DRAFT_KEY)])).toEqual(["Keep me", "existing legacy bytes"]);
});
test("closing and reopening a persistent browser profile retains exact owner and diagram references", async ({ browser, baseURL }, info) => {
  const tempRoot = await realpath(tmpdir()), profile = await mkdtemp(join(tempRoot, "ff-"));
  const options = { headless: true, channel: process.env.PLAYWRIGHT_CHANNEL };
  let context: BrowserContext | undefined;
  try {
    context = await browser.browserType().launchPersistentContext(profile, options); await prepare(context);
    const page = await context.newPage(); await page.goto(`${baseURL}/__companion-b2`); const first = await create(page);
    await context.close(); context = undefined;
    context = await browser.browserType().launchPersistentContext(profile, options); await prepare(context);
    const other = await context.newPage(); await other.goto(`${baseURL}/__companion-b2`); const r = await read(other, first.id);
    expect(r.ok).toBe(true); if (!r.ok || r.value.status !== "ready") throw Error(JSON.stringify(r));
    const pin = await other.evaluate((pkg) => window.companionTest.resolvePackageDiagram(pkg, "activity-1", 0), r.value.snapshot.package);
    expect(pin.ok).toBe(true); if (pin.ok) { expect(pin.value.scene.revision).toBe(1); expect(pin.value.representativeSeconds).toBe(1); expect(pin.value.namespace).toBe("file-namespace"); }
    await info.attach("reopened-owner.json", { body: JSON.stringify({ documentId: first.id, ownerVersion: r.value.snapshot.ownerVersion, pin }), contentType: "application/json" });
  } finally {
    try { await context?.close(); }
    finally {
      if (dirname(await realpath(profile)) !== tempRoot) throw Error("Unexpected test profile cleanup target");
      await rm(profile, { recursive: true, force: true });
    }
  }
});
test("incompatible and missing companions differ and corrupted newest data offers its older complete package", async ({ page }) => {
  expect(await read(page, "absent")).toEqual({ ok: true, value: { status: "missing", documentId: "absent" } });
  const first = await create(page);
  await page.evaluate(async (id) => { const h = window.companionTest; await h.browserCompanionRepository().save(id, 1, h.companionExample()); }, first.id);
  await mutate(page, first.id, "malformed"); await page.reload(); const r = await read(page, first.id);
  expect(r.ok && r.value.status).toBe("invalid"); if (!r.ok || r.value.status !== "invalid") throw Error(JSON.stringify(r));
  expect(r.value.recoverable?.ownerVersion).toBe(1);
  const plan = await page.evaluate((r) => window.companionTest.planCompanionRecovery(r, null), r.value); expect(plan.status).toBe("choice");
  const save = await page.evaluate((id) => { const h = window.companionTest; return h.browserCompanionRepository().save(id, 2, h.companionExample()); }, first.id); expect(!save.ok && save.error.code).toBe("invalid_record");
  const second = await create(page); await mutate(page, second.id, "version"); const incompatible = await read(page, second.id); expect(incompatible.ok && incompatible.value.status).toBe("invalid");
});
test("hash-valid incomplete packages and missing recovery slots are rejected on reopen", async ({ page }) => {
  const first = await create(page); await mutate(page, first.id, "missing-revision"); const invalid = await read(page, first.id);
  expect(invalid.ok && invalid.value.status).toBe("invalid"); if (invalid.ok && invalid.value.status === "invalid") expect(invalid.value.messages.join()).toContain("exact scene");
  const second = await create(page); await page.evaluate((id) => { const h = window.companionTest; return h.browserCompanionRepository().save(id, 1, h.companionExample()); }, second.id);
  await mutate(page, second.id, "history"); expect((await read(page, second.id)).ok).toBe(true);
  const missing = await read(page, second.id); expect(missing.ok && missing.value.status).toBe("invalid");
});
test("real transaction abort after a put succeeds rolls back both current and previous package state", async ({ page }) => {
  const first = await create(page), original = await read(page, first.id);
  const failed = await page.evaluate(async (id) => {
    const originalPut = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (...args) { const request = originalPut.apply(this, args); request.addEventListener("success", () => this.transaction.abort(), { once: true }); return request; };
    try { const h = window.companionTest, p = h.companionExample(); p.document.session.name = "Interrupted"; return await h.browserCompanionRepository().save(id, 1, p); }
    finally { IDBObjectStore.prototype.put = originalPut; }
  }, first.id);
  expect(!failed.ok && failed.error.code).toBe("interrupted"); await page.reload(); expect(await read(page, first.id)).toEqual(original);
});
test("browser quota and denied access failures preserve data and never claim a completed save", async ({ page }) => {
  const first = await create(page), original = await read(page, first.id);
  const failed = await page.evaluate(async (id) => {
    const originalPut = IDBObjectStore.prototype.put; IDBObjectStore.prototype.put = function () { throw new DOMException("Injected quota", "QuotaExceededError"); };
    try { const h = window.companionTest; return await h.browserCompanionRepository().save(id, 1, h.companionExample()); }
    finally { IDBObjectStore.prototype.put = originalPut; }
  }, first.id); expect(!failed.ok && failed.error.code).toBe("quota"); expect(await read(page, first.id)).toEqual(original);
  const denied = await page.evaluate(async (id) => {
    const originalOpen = IDBFactory.prototype.open; IDBFactory.prototype.open = function () { throw new DOMException("Denied", "SecurityError"); };
    try { return await window.companionTest.browserCompanionRepository().read(id); } finally { IDBFactory.prototype.open = originalOpen; }
  }, first.id); expect(!denied.ok && denied.error.code).toBe("unavailable");
});
test("two actual tabs saving the same base have one winner and one conflict", async ({ page, context }) => {
  const first = await create(page), other = await context.newPage(); await other.goto("/__companion-b2");
  const results = await Promise.all([page, other].map((tab, i) => tab.evaluate(async ({ id, i }) => { const h = window.companionTest, p = h.companionExample(); p.document.session.name = `Tab ${i}`; return h.browserCompanionRepository().save(id, 1, p); }, { id: first.id, i })));
  expect(results.filter((r) => r.ok)).toHaveLength(1); const loser = results.find((r) => !r.ok); expect(loser && !loser.ok && loser.error.code).toBe("conflict");
  const r = await read(page, first.id); expect(r.ok && r.value.status === "ready" && r.value.snapshot.ownerVersion).toBe(2);
});
test("newer legacy draft yields two downloadable recovery choices without changing either store", async ({ page }) => {
  const first = await create(page);
  const result = await page.evaluate(async (id) => {
    const h = window.companionTest, r = await h.browserCompanionRepository().read(id); if (!r.ok || r.value.status !== "ready") throw Error("Missing package");
    const p = structuredClone(r.value.snapshot.package.document); p.session.activities[0].name = "";
    const now = Date.parse(r.value.snapshot.savedAt) + 1000, text = h.encodeDraft(p, now); localStorage.setItem(h.DESIGNER_DRAFT_KEY, text);
    const plan = h.planCompanionRecovery(r.value, text, now);
    return { status: plan.status, kinds: plan.options.map((o) => o.kind), draftPreserved: localStorage.getItem(h.DESIGNER_DRAFT_KEY) === text, completeDownload: plan.options.some((o) => o.kind === "complete-package" && h.parseSessionPackageJson(o.snapshot.packageJson).ok), draftDownload: plan.options.some((o) => o.kind === "reference-only-draft" && o.draftJson === text) };
  }, first.id);
  expect(result).toEqual({ status: "choice", kinds: ["complete-package", "reference-only-draft"], draftPreserved: true, completeDownload: true, draftDownload: true });
});
test("maximum supported 8 MiB package survives real browser storage and refresh", async ({ page }) => {
  test.setTimeout(60000);
  const saved = await page.evaluate(async () => { const h = window.companionTest, r = await h.browserCompanionRepository().create(h.maximumCompanionPackage()); if (!r.ok) throw Error(JSON.stringify(r)); return { id: r.value.documentId, size: new TextEncoder().encode(r.value.packageJson).length, sha256: r.value.sha256 }; });
  expect(saved.size).toBe(8 * 1024 * 1024); await page.reload();
  const result = await page.evaluate(async (id) => { const r = await window.companionTest.browserCompanionRepository().read(id); if (!r.ok || r.value.status !== "ready") throw Error(JSON.stringify(r)); return { size: new TextEncoder().encode(r.value.snapshot.packageJson).length, sha256: r.value.snapshot.sha256, version: r.value.snapshot.ownerVersion }; }, saved.id);
  expect(result).toEqual({ size: saved.size, sha256: saved.sha256, version: 1 });
});
