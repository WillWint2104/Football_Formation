import { test, expect, type Page, type TestInfo } from "@playwright/test";
import { readFile, writeFile } from "node:fs/promises";
import sharp from "sharp";
import { printExample } from "../fixtures/print-session";
import { preparePrintPage, previewPrintPlan, capturePrintOutput } from "../fixtures/print-browser";
import { parseSessionPackageJson, type SessionPackage } from "../../lib/designer/package";
import type {} from "../fixtures/companion-browser";

const workspace = (p: Page) => p.getByRole("region", { name: "Local diagram workspace", exact: true });
const panel = (p: Page) => p.getByRole("region", { name: "Activity tactical diagrams", exact: true });
const host = (p: Page) => p.getByRole("region", { name: "Local tactical editor", exact: true });
const operation = (p: Page) => JSON.parse(new URL(p.url()).searchParams.get("localAuthoring")!);
async function read(p: Page, id: string) {
  const r = await p.evaluate(id => window.companionTest.browserCompanionRepository().read(id), id);
  if (!r.ok || r.value.status !== "ready") throw Error(JSON.stringify(r));
  return r.value.snapshot;
}
async function capture(p: Page, info: TestInfo, name: string) {
  await p.evaluate(() => scrollTo(0, 0));
  expect(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await p.screenshot({ path: info.outputPath(`${name}-${info.project.name}.png`) });
}
async function importPackage(p: Page, pkg: SessionPackage, info?: TestInfo) {
  const before = await p.evaluate(() => window.companionTest.browserCompanionRepository().list());
  if (!before.ok) throw Error(before.error.message);
  await p.getByRole("button", { name: "Import JSON", exact: true }).click();
  await p.getByRole("button", { name: "Import Session & Diagrams", exact: true }).click();
  await p.getByLabel("Choose session and diagrams package").setInputFiles({ name: "coaching-package.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(pkg)) });
  const preview = p.getByRole("region", { name: "Package import preview", exact: true });
  await expect(preview).toContainText(pkg.document.session.name);
  await expect(preview.locator("dd")).toHaveText([String(pkg.document.session.activities.length), String(pkg.scenes.length), String(pkg.document.session.activities.reduce((n, a) => n + a.diagrams.length, 0))]);
  if (info) { await preview.scrollIntoViewIfNeeded(); await capture(p, info, "package-preview"); }
  await p.getByRole("checkbox", { name: "I confirm storing a new independent local package." }).check();
  await p.getByRole("button", { name: "Confirm & store locally", exact: true }).click();
  await expect(p.getByRole("region", { name: "Package import success" })).toBeVisible();
  const result = await p.evaluate(() => window.companionTest.browserCompanionRepository().list());
  if (!result.ok) throw Error(result.error.message);
  // The new import has a fresh owner even if an equivalent package already exists.
  const id = result.value.find(e => !before.value.some(old => old.documentId === e.documentId))?.documentId;
  if (!id) throw Error("Imported package not found intact");
  expect((await read(p, id)).package).toEqual(pkg);
  return id;
}
async function openPlan(p: Page, id: string) {
  await p.getByRole("button", { name: "Edit session", exact: true }).click();
  await workspace(p).getByRole("button", { name: "Browse local plans", exact: true }).click();
  const list = workspace(p).locator(".diagram-plan-list");
  if (await list.getAttribute("open") === null) await list.locator("summary").click();
  await workspace(p).getByRole("button", { name: `Review plan ${id}`, exact: true }).click();
  p.once("dialog", d => d.accept());
  await p.getByRole("button", { name: "Open reviewed plan as independent copy", exact: true }).click();
  await expect(panel(p)).toBeVisible();
  return new URL(p.url()).searchParams.get("localPlan")!;
}
async function coaching(p: Page) {
  const toggle = p.getByRole("button", { name: "Coaching information", exact: true });
  if (await toggle.isVisible()) await toggle.click();
}
async function edit(p: Page) { await panel(p).getByRole("button", { name: "Edit Diagram", exact: true }).click(); await expect(host(p)).toBeVisible(); }
async function saveCopy(p: Page) {
  const version = operation(p).candidate?.version ?? 0;
  await host(p).getByRole("button", { name: "Save Local Copy", exact: true }).click();
  await expect.poll(() => operation(p).candidate?.version ?? 0).toBe(version + 1);
  await expect(host(p).locator(".local-authoring-message")).toContainText("Local copy saved");
}

test.beforeEach(async ({ page, context }) => preparePrintPage(page, context));

test("C3 complete coaching workflow: import, author, pin, accept, recover, round-trip and print", async ({ page }, info) => {
  test.setTimeout(120000);
  const api: string[] = [], errors: string[] = [];
  page.on("request", r => { if (new URL(r.url()).pathname.startsWith("/api/")) api.push(r.url()); });
  page.on("pageerror", e => errors.push(e.message));
  const pkg = printExample(); pkg.document.session.activities[0].diagrams = [];
  const source = await importPackage(page, pkg, info), sourceBefore = await read(page, source);
  const id = await openPlan(page, source);
  await coaching(page);
  await page.getByLabel("Activity name", { exact: true }).fill("Rondo - receive, scan and support");
  await page.getByLabel("Setup & delivery instructions", { exact: true }).fill("Mark a 12 x 12 m area for five attackers and two defenders.\nScan before receiving and move to support the next pass.\nRotate defenders after each two-minute block.");
  await expect(workspace(page)).toContainText("Text edits are newer than the complete snapshot");
  await capture(page, info, "unsaved-coaching-information");
  await page.getByRole("button", { name: "Hide coaching information", exact: true }).click();
  for (const [scene, seconds] of [["0", "2"], ["1", "4"]]) {
    await panel(page).getByRole("button", { name: "Add / replace diagram", exact: true }).click();
    await page.getByLabel("Local scene package", { exact: true }).selectOption(source);
    await page.getByLabel("Scene revision", { exact: true }).selectOption(scene);
    await page.getByLabel("Representative seconds", { exact: true }).fill(seconds);
    await panel(page).getByRole("button", { name: `Attach as diagram ${Number(scene) + 1}`, exact: true }).click();
    await panel(page).getByRole("button", { name: "Return to attached diagrams", exact: true }).click();
  }
  await panel(page).getByRole("button", { name: /Diagram 2 .*example-rondo/ }).click();
  const before = await read(page, id);
  await edit(page);
  await host(page).getByRole("button", { name: "Properties", exact: true }).click();
  await page.getByRole("button", { name: "Layout", exact: true }).click();
  await page.getByRole("button", { name: "● Player", exact: true }).click();
  await page.getByRole("button", { name: "Insert at centre", exact: true }).click();
  await saveCopy(page); const candidate = operation(page);
  await capture(page, info, "real-tactical-editor");
  expect(await read(page, id)).toEqual(before);
  await host(page).getByRole("button", { name: "Return to Activity", exact: true }).click();
  await expect(host(page).getByRole("heading", { name: "Review local diagram", exact: true })).toBeFocused();
  await expect(host(page).locator(".scene-diagram")).toHaveAttribute("data-time", "4");
  await capture(page, info, "explicit-candidate-review");
  await host(page).getByRole("button", { name: "Accept Diagram", exact: true }).click();
  await expect(host(page)).toHaveCount(0);
  const accepted = await read(page, id);
  expect(accepted.package.scenes.slice(0, pkg.scenes.length)).toEqual(pkg.scenes);
  expect(accepted.package.document.session.activities[0].diagrams[0]).toEqual(before.package.document.session.activities[0].diagrams[0]);
  expect(accepted.package.document.session.activities.slice(1)).toEqual(before.package.document.session.activities.slice(1));
  expect(accepted.package.document.session.activities[0].diagrams[1]).toEqual({ scene: { id: candidate.sceneId, revision: 1 }, representativeSeconds: 4 });
  await expect(panel(page).locator(".activity-diagram-canvas .scene-diagram")).toHaveAttribute("data-clipped", "0");
  await capture(page, info, "accepted-activity-diagrams");
  await page.getByRole("button", { name: "Add activity", exact: true }).click(); await coaching(page);
  await page.getByLabel("Activity name", { exact: true }).fill("Cool-down - mobility and reflection");
  await page.getByLabel("Activity role", { exact: true }).selectOption("cool-down");
  await page.getByLabel("Duration (minutes)", { exact: true }).fill("5");
  await page.getByLabel("Setup & delivery instructions", { exact: true }).fill("Reduce intensity with light passing and comfortable mobility.\nReflect on support angles and the next passing option.");
  await page.getByRole("button", { name: "Move activity up", exact: true }).click();
  await page.getByRole("navigation", { name: "Session activities", exact: true }).getByRole("button", { name: /11v11 Team Shape/ }).click();
  await page.getByLabel("Activity name", { exact: true }).fill("11v11 - build through midfield");
  await page.getByRole("button", { name: "Hide coaching information", exact: true }).click();
  await page.getByLabel("Diagram framing", { exact: true }).selectOption("pitch");
  const touchlines = panel(page).locator('rect[data-field-marking="touchlines"]');
  expect(Number(await touchlines.getAttribute("width")) / Number(await touchlines.getAttribute("height"))).toBeCloseTo(105 / 68, 6);
  await capture(page, info, "full-pitch-activity");
  await page.getByRole("button", { name: "Club Branding", exact: true }).click();
  const png = await sharp(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="160" height="80"><path d="M16 8H144V48L80 76L16 48Z" fill="#17324D" stroke="#D7B46A" stroke-width="4"/><text x="80" y="48" text-anchor="middle" font-size="26" fill="white" font-family="Arial">TEST</text></svg>')).png().toBuffer();
  await page.getByLabel("Choose club logo").setInputFiles({ name: "example-crest.png", mimeType: "image/png", buffer: png });
  await page.getByLabel("Club name", { exact: true }).fill("Verification Club - example only");
  await page.getByRole("button", { name: "Close branding", exact: true }).click();
  await workspace(page).getByRole("button", { name: "Save complete plan", exact: true }).click();
  await expect(workspace(page).locator(".diagram-dirty")).toHaveCount(0);
  const saved = await read(page, id);
  expect(saved.package.document.session.activities).toHaveLength(4);
  expect(saved.package.document.session.activities[2].name).toBe("Cool-down - mobility and reflection");
  await page.reload(); await expect(workspace(page)).toContainText("Complete local plan recovered");
  await page.getByRole("button", { name: "Overview", exact: true }).click();
  await capture(page, info, "recovered-session-overview");
  const wait = page.waitForEvent("download");
  await workspace(page).getByRole("button", { name: "Download complete package", exact: true }).click();
  const bytes = await readFile((await (await wait).path())!, "utf8"), exported = parseSessionPackageJson(bytes);
  if (!exported.ok) throw Error(JSON.stringify(exported.diagnostics));
  expect(exported.value).toEqual(saved.package);
  await writeFile(info.outputPath("complete-session-package.json"), bytes);
  const imported = await importPackage(page, exported.value);
  expect((await read(page, imported)).package).toEqual(saved.package);
  const reopened = await openPlan(page, imported);
  expect((await read(page, reopened)).package).toEqual(saved.package);
  expect(await read(page, source)).toEqual(sourceBefore);
  await previewPrintPlan(page);
  const print = page.getByLabel("Branded session plan", { exact: true });
  await expect(print.locator("article")).toHaveCount(4);
  await expect(print.locator(".designer-print-scene")).toHaveCount(6);
  await expect(print).toContainText("Verification Club - example only");
  await expect(print).toContainText("Scan before receiving and move to support the next pass.");
  await expect(print).toContainText("Cool-down - mobility and reflection");
  const pages = await capturePrintOutput(page, info, "complete-coaching-session");
  await writeFile(info.outputPath("workflow-receipt.json"), JSON.stringify({ viewport: info.project.use.viewport, source, origin: id, candidate: candidate.candidate, reimported: imported, reopened, originalSourceUnchanged: true, olderPinsAndScenesUnchanged: true, roundTripEquivalent: true, activities: 4, diagrams: 6, pdfPages: pages, apiRequests: api, pageErrors: errors }, null, 2));
  expect(api).toEqual([]); expect(errors).toEqual([]);
});

test("C3 recovery acceptance: cancellation, stale candidate and corrupt complete source", async ({ page, context }, info) => {
  test.setTimeout(90000);
  const source = await importPackage(page, printExample()), id = await openPlan(page, source), original = await read(page, id);
  await edit(page); await saveCopy(page); const cancelled = operation(page);
  await host(page).getByRole("button", { name: "Cancel", exact: true }).click();
  expect(await read(page, id)).toEqual(original);
  expect((await read(page, cancelled.candidate.id)).package.scenes.at(-1)!.id).toBe(cancelled.sceneId);
  await edit(page); await saveCopy(page);
  const other = await context.newPage(); await other.goto("/session-designer");
  await other.evaluate(async s => { s.package.document.session.name = "Newer coaching plan from second tab"; const r = await window.companionTest.browserCompanionRepository().save(s.documentId, s.ownerVersion, s.package); if (!r.ok) throw Error(r.error.message); }, original);
  await other.close();
  await host(page).getByRole("button", { name: "Return to Activity", exact: true }).click();
  await expect(host(page).getByRole("alert")).toContainText("changed in another tab");
  await expect(host(page).getByRole("button", { name: "Save Local Copy", exact: true })).toBeDisabled();
  await capture(page, info, "stale-candidate-blocked");
  const newer = await read(page, id); expect(newer.package.document.session.activities).toEqual(original.package.document.session.activities);
  await host(page).getByRole("button", { name: "Cancel", exact: true }).click();
  await page.evaluate(async id => { await window.companionTest.indexedDbCompanionStorage().transact("readwrite", records => { const r = records.find(r => (r as { documentId: string }).documentId === id) as { snapshots: { packageJson: string }[] }; r.snapshots[0].packageJson = "{"; return { value: null, put: r as never }; }); }, id);
  await page.reload(); await expect(workspace(page)).toContainText("Linked package is invalid");
  await expect(workspace(page).getByRole("button", { name: "Save complete plan", exact: true })).toHaveCount(0);
  await capture(page, info, "corrupt-source-recovery");
  page.once("dialog", d => d.accept());
  await workspace(page).getByRole("button", { name: "Open reviewed plan as independent copy", exact: true }).click();
  await expect.poll(() => new URL(page.url()).searchParams.get("localPlan")).not.toBe(id);
  const recoveredId = new URL(page.url()).searchParams.get("localPlan")!;
  expect(recoveredId).not.toBe(id);
  expect((await read(page, recoveredId)).package).toEqual(original.package);
  const damaged = await page.evaluate(id => window.companionTest.browserCompanionRepository().read(id), id);
  expect(damaged.ok && damaged.value.status).toBe("invalid");
  await expect(panel(page).locator(".activity-diagram-canvas .scene-diagram")).toHaveAttribute("data-revision", "1");
  await capture(page, info, "explicit-recovery-copy");
});
