import { test, expect, type Page } from "@playwright/test";
import { presentationFixture } from "../presentations/fixture";
import { validatePresentation, type Presentation } from "../../lib/presentations/contracts";
import { evaluateScene } from "../../lib/tactical/evaluate";
test.use({ video: { mode: "on", size: { width: 1280, height: 720 } } });
async function storage(page: Page) {
  const bundle = presentationFixture(), before = JSON.stringify(bundle); let writes = 0;
  const records: Presentation[] = [];
  await page.route("**/api/organizations", r => r.fulfill({ json: { organizations: [{ id: bundle.organizationId, name: "Synthetic presentation review club", version: 1 }] } }));
  await page.route("**/api/organizations/*/snapshot", r => { expect(r.request().method()).toBe("GET"); return r.fulfill({ json: { version: 1, bundle } }); });
  await page.route("**/api/organizations/*/presentations*", r => {
    if (r.request().method() === "POST") {
      const body = r.request().postDataJSON(), p = validatePresentation(body.presentation, bundle), head = Math.max(0, ...records.filter(s => s.id === p.id).map(s => s.revision));
      expect(body.expectedRevision).toBe(head); expect(p.revision).toBe(head + 1); records.push(p); writes++; return r.fulfill({ json: { revision: p.revision } });
    }
    const url = new URL(r.request().url()), id = url.searchParams.get("id"), revision = url.searchParams.get("revision");
    const latest = records.filter(p => p.revision === Math.max(...records.filter(r => r.id === p.id).map(r => r.revision)));
    return r.fulfill({ json: { presentations: (id ? records.filter(p => p.id === id && (!revision || p.revision === Number(revision))) : latest).toSorted((a,b) => b.revision-a.revision) } });
  });
  return { bundle, records, writes: () => writes, unchanged: () => expect(JSON.stringify(bundle)).toBe(before) };
}
async function loaded(page: Page) { await expect(page.locator(".calendar-connection [role=status]")).toContainText("Loaded saved organisation snapshot"); await expect(page.getByRole("button", { name: "New presentation", exact: true })).toBeEnabled(); }
async function newPresentation(page: Page) { await page.goto("/presentations"); await loaded(page); await page.getByRole("button", { name: "New presentation", exact: true }).click(); await page.getByLabel("Presentation title", { exact: true }).fill("Focused coaching demonstration"); }
async function add(page: Page, key: string) { await page.getByLabel("Saved presentation content", { exact: true }).selectOption(key); await page.getByRole("button", { name: "Add selected content", exact: true }).click(); }
async function show(page: Page) { await page.getByRole("button", { name: "Present this section", exact: true }).click(); await expect(page.getByRole("dialog", { name: "Coaching presentation" })).toBeVisible(); }
async function close(page: Page) { await page.getByRole("button", { name: "Return to overview", exact: true }).click(); await expect(page.getByRole("dialog", { name: "Coaching presentation" })).toBeHidden(); }
const diagram = (page: Page) => page.locator(".presentation-canvas .scene-diagram");

test("session conversion selects only two activities, reorders/duplicates independently and reopens immutable revisions", async ({ page }, info) => {
  const f = await storage(page), s = f.bundle.sessions.find(s => s.content.activities.length >= 4)!;
  await page.goto(`/sessions?session=${s.id}&revision=${s.revision}`); await expect(page.getByRole("link", { name: "Create presentation from this saved session →" })).toBeVisible();
  await page.getByRole("link", { name: "Create presentation from this saved session →" }).click(); await loaded(page);
  for (const a of s.content.activities.slice(2)) await page.getByLabel(a.content.title, { exact: true }).uncheck();
  await page.getByLabel("Session overview", { exact: true }).uncheck(); await page.getByLabel("Session summary", { exact: true }).uncheck();
  await page.getByRole("button", { name: "Create selected content", exact: true }).click();
  const sections = page.getByRole("navigation", { name: "Presentation sections" });
  for (const a of s.content.activities.slice(2)) await expect(sections).not.toContainText(a.content.title);
  await expect(sections).toContainText(s.content.activities[0].content.title); await expect(sections).toContainText(s.content.activities[1].content.title);
  await page.getByLabel("Presentation notes", { exact: true }).fill("Scan before receiving. Presentation note only.");
  await page.getByRole("button", { name: "Move section 1 later", exact: true }).click(); await page.getByRole("button", { name: "Duplicate section 2", exact: true }).click();
  await page.getByRole("button", { name: "Save presentation", exact: true }).click(); await expect(page.getByRole("status").last()).toContainText("Saved presentation v1"); f.unchanged();
  const saved = structuredClone(f.records[0]); await page.reload(); await loaded(page); await page.locator(".presentation-record").filter({ hasText: s.content.title }).click();
  await expect(page.getByLabel("Presentation title", { exact: true })).toHaveValue(s.content.title);
  await page.getByLabel("Presentation title", { exact: true }).fill("Revised coaching sequence"); await page.getByRole("button", { name: "Save presentation", exact: true }).click(); await expect(page.getByRole("status").last()).toContainText("Saved presentation v2");
  await page.getByRole("button", { name: "Load revision history", exact: true }).click(); await page.getByRole("button", { name: "Open v1", exact: true }).click(); await expect(page.getByLabel("Presentation title", { exact: true })).toBeDisabled();
  expect(f.records[0]).toEqual(saved); expect(f.writes()).toBe(2); f.unchanged();
  await page.screenshot({ path: info.outputPath("session-conversion-history.png") });
});
test("independent saved exercises and static rondo use live shared renderer with dominant desktop canvas", async ({ page }, info) => {
  const f = await storage(page); await newPresentation(page); await add(page, "exercise#presentation-exercise-0#1");
  await expect(page.getByRole("navigation", { name: "Presentation sections" })).toContainText("guidance");
  await page.screenshot({ path: info.outputPath("independent-builder.png") }); await show(page); await page.getByRole("button", { name: "Next section →", exact: true }).click();
  await expect(diagram(page)).toHaveAttribute("data-scene-id", "presentation-0"); await expect(page.getByRole("region", { name: "Presentation playback" })).toBeHidden();
  await expect(diagram(page)).toHaveAttribute("data-time", "0"); const box = (await diagram(page).boundingBox())!; expect(box.height).toBeGreaterThan(info.project.use.viewport!.height * .65);
  await page.getByLabel("Focus object", { exact: true }).selectOption("entity:a1"); await page.getByRole("button", { name: "Detail", exact: true }).click();
  const detailScale = Number(await diagram(page).getAttribute("data-scale")); await page.getByRole("button", { name: "Overview", exact: true }).click(); expect(Number(await diagram(page).getAttribute("data-scale"))).toBeLessThan(detailScale);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true); await page.screenshot({ path: info.outputPath("static-rondo-presentation.png") }); await close(page); f.unchanged();
});
test("passing playback, stage selection, pan/zoom and authored views save/reopen without source writes", async ({ page }, info) => {
  const errors: string[] = []; page.on("pageerror", e => errors.push(e.message)); const f = await storage(page); await newPresentation(page); await add(page, "scene#presentation-1#1"); await show(page);
  await page.getByRole("button", { name: "Overview", exact: true }).click(); await page.getByRole("button", { name: "Capture camera view", exact: true }).click();
  await page.getByLabel("Presentation playhead", { exact: true }).fill("4");
  const scene = f.bundle.scenes.find(s => s.id === "presentation-1")!, ball = evaluateScene(scene, 4).entities.find(e => e.id === "ball")!;
  await expect(page.locator('.presentation-canvas [data-entity-id="ball"]')).toHaveAttribute("data-world-x", String(ball.position.x));
  await page.getByRole("button", { name: "Action", exact: true }).click(); await page.getByRole("button", { name: "Capture camera view", exact: true }).click();
  const before = Number(await diagram(page).getAttribute("data-scale")); await page.getByRole("button", { name: "Zoom in", exact: true }).click(); expect(Number(await diagram(page).getAttribute("data-scale"))).toBeGreaterThan(before);
  await page.getByLabel("Authored stage views", { exact: true }).check(); await page.getByRole("button", { name: "Zoom out", exact: true }).click(); await expect(page.getByLabel("Authored stage views", { exact: true })).not.toBeChecked();
  const area = (await diagram(page).boundingBox())!, center = Number(await diagram(page).getAttribute("data-center-x")); await page.mouse.move(area.x + 14, area.y + area.height * .7); await page.mouse.down(); await page.mouse.move(area.x + 80, area.y + area.height * .7, { steps: 5 }); await page.mouse.up(); expect(Number(await diagram(page).getAttribute("data-center-x"))).not.toBe(center);
  await page.getByRole("button", { name: "Restart", exact: true }).click(); await page.getByRole("button", { name: "Play presentation animation", exact: true }).click(); await expect.poll(async () => Number(await diagram(page).getAttribute("data-time"))).toBeGreaterThan(.4);
  await page.getByRole("button", { name: "Pause presentation animation", exact: true }).click(); const paused = await diagram(page).getAttribute("data-time"); await page.waitForTimeout(120); await expect(diagram(page)).toHaveAttribute("data-time", paused!);
  await page.getByLabel("Presentation playhead", { exact: true }).fill("4"); await page.getByRole("button", { name: "Action", exact: true }).click(); await page.screenshot({ path: info.outputPath("passing-action-playback.png") });
  await close(page); await expect(page.locator(".presentation-shot")).toHaveCount(2); await page.locator('[aria-label^="Camera stage"]').first().selectOption(""); await page.locator('[aria-label^="Camera transition"]').last().fill("1");
  await page.getByRole("button", { name: "Save presentation", exact: true }).click(); await expect(page.getByRole("status").last()).toContainText("Saved presentation v1"); const saved = structuredClone(f.records[0]);
  await page.reload(); await loaded(page); await page.locator(".presentation-record").click(); await expect(page.locator(".presentation-shot")).toHaveCount(2); await show(page); await page.getByLabel("Authored stage views", { exact: true }).check(); await page.getByLabel("Presentation playhead", { exact: true }).fill("4");
  await page.waitForTimeout(1150); expect(f.records[0]).toEqual(saved);
  await page.getByLabel("Presentation playhead", { exact: true }).fill("6"); await page.getByRole("dialog", { name: "Coaching presentation" }).focus(); await page.keyboard.press("Space");
  await expect.poll(async () => Number(await diagram(page).getAttribute("data-time"))).toBeLessThan(6); await expect.poll(async () => Number(await diagram(page).getAttribute("data-time"))).toBeGreaterThan(.1);
  await page.getByRole("button", { name: "Pause presentation animation", exact: true }).click();
  await page.getByLabel("Presentation playhead", { exact: true }).focus(); await page.keyboard.press("Escape"); await expect(page.getByRole("dialog", { name: "Coaching presentation" })).toBeHidden();
  expect(errors).toEqual([]); f.unchanged();
});
test("corner overview/detail, reduced-motion cuts, native fullscreen and keyboard section navigation", async ({ page }, info) => {
  const f = await storage(page); await page.emulateMedia({ reducedMotion: "reduce" }); await newPresentation(page); await add(page, "scene#presentation-2#1"); await page.getByRole("button", { name: "Add notes", exact: true }).click(); await page.getByLabel("Presentation notes", { exact: true }).fill("Attack the delivery. Review the near-post run.");
  await page.getByRole("button", { name: "▶ Present", exact: true }).click(); await page.getByLabel("Presentation rotation", { exact: true }).selectOption("270"); await page.screenshot({ path: info.outputPath("corner-overview.png") });
  const overview = Number(await diagram(page).getAttribute("data-scale")); await page.getByLabel("Presentation playhead", { exact: true }).fill("4"); await page.getByLabel("Focus object", { exact: true }).selectOption("entity:a9"); await page.getByRole("button", { name: "Detail", exact: true }).click(); expect(Number(await diagram(page).getAttribute("data-scale"))).toBeGreaterThan(overview);
  await page.getByRole("button", { name: "Capture camera view", exact: true }).click(); await page.screenshot({ path: info.outputPath("corner-detail.png") }); await close(page);
  await page.getByRole("navigation", { name: "Presentation sections" }).locator(".presentation-section-row > button").first().click(); await page.locator('[aria-label^="Camera transition"]').fill("5");
  await show(page); await page.getByRole("button", { name: "Overview", exact: true }).click(); await page.getByLabel("Saved camera view", { exact: true }).selectOption({ label: "detail 1" });
  await expect.poll(async () => Number(await diagram(page).getAttribute("data-scale"))).toBeGreaterThan(overview); await page.getByRole("button", { name: "Fullscreen", exact: true }).click();
  await expect.poll(() => page.evaluate(() => document.fullscreenElement?.getAttribute("role"))).toBe("dialog");
  await page.keyboard.press("ArrowRight"); await expect(page.getByRole("dialog").getByRole("heading", { name: "Coaching notes", exact: true })).toBeVisible();
  await page.keyboard.press("Home"); await expect(diagram(page)).toBeVisible(); await page.keyboard.press("Escape"); await expect(page.getByRole("dialog", { name: "Coaching presentation" })).toBeHidden();
  await show(page); const speed = page.getByLabel("Presentation playback speed", { exact: true }); await speed.focus(); await speed.press("Alt+ArrowDown");
  await expect.poll(() => speed.evaluate(el => el.matches(":open"))).toBe(true); await page.keyboard.press("Escape"); await expect(page.getByRole("dialog", { name: "Coaching presentation" })).toBeVisible();
  await page.keyboard.press("Escape"); await expect(page.getByRole("dialog", { name: "Coaching presentation" })).toBeHidden(); f.unchanged();
});
for (const status of [409, 503, 401]) test(`presentation save ${status} blocks retries and handles private drafts safely`, async ({ page }) => {
  await storage(page); await newPresentation(page); await page.getByRole("button", { name: "Add notes", exact: true }).click();
  let writes = 0; await page.route("**/api/organizations/*/presentations", r => { if (r.request().method() === "POST") { writes++; return r.fulfill({ status, json: { error: "Unavailable" } }); } return r.fallback(); });
  await page.getByRole("button", { name: "Save presentation", exact: true }).click();
  await expect(page.getByRole("status").last()).toContainText(status === 409 ? "changed elsewhere" : status === 503 ? "Save outcome uncertain" : "Saved organisation unavailable");
  if (status === 401) await expect(page.getByLabel("Presentation title", { exact: true })).toBeHidden();
  else { await expect(page.getByRole("button", { name: "Save presentation", exact: true })).toBeDisabled(); await expect(page.getByLabel("Presentation title", { exact: true })).toHaveValue("Focused coaching demonstration"); }
  expect(writes).toBe(1);
});
test("access loss on initial presentation read clears private presentation source controls", async ({ page }) => {
  await storage(page); await page.route("**/api/organizations/*/presentations*", r => r.fulfill({ status: 401, json: { error: "Sign in" } }));
  await page.goto("/presentations"); await expect(page.getByRole("status").last()).toContainText("Saved organisation unavailable");
  await expect(page.getByLabel("Presentation source session", { exact: true })).toBeHidden(); await expect(page.getByRole("button", { name: "New presentation", exact: true })).toBeDisabled();
});

