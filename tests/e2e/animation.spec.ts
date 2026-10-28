import { test, expect, type Page } from "@playwright/test";
import { animationExamples } from "../../lib/tactical/animation-examples";
import { evaluateScene, sceneDuration } from "../../lib/tactical/evaluate";
import { coachingSample } from "../../lib/coaching/sample";
import { domainBundleSchema } from "../../lib/domain/validation";
import { diagramHref, type DiagramTarget } from "../../lib/tactical/persistence";
import { guideHref } from "../../lib/documents/contracts";
import { actionFrame } from "../../lib/tactical/framing";

const target: DiagramTarget = { kind: "session", id: "sample-3", revision: 1, activity: "activity-1", event: "sample-4", booking: 1, diagram: null };
/** Simulate only transport/Auth; all animation geometry and saved owner/scene contracts are production code. */
async function storage(page: Page) {
  let bundle = coachingSample(), version = 1, writes = 0;
  await page.route("**/api/organizations", (r) => r.fulfill({ json: { organizations: [{ id: bundle.organizationId, name: "Synthetic animation review club", version }] } }));
  await page.route("**/api/organizations/*/snapshot", (r) => {
    if (r.request().method() === "POST") { const body = r.request().postDataJSON(); expect(body.expectedVersion).toBe(version); bundle = domainBundleSchema.parse(body.bundle); version++; writes++; return r.fulfill({ json: { version } }); }
    return r.fulfill({ json: { version, bundle } });
  });
  return { bundle: () => bundle, writes: () => writes };
}
async function loaded(page: Page) { await expect(page.locator(".calendar-connection [role=status]")).toContainText("Loaded saved organisation snapshot"); }
async function apply(page: Page, id: string) { await page.getByLabel("Example setup", { exact: true }).selectOption(id); await page.getByRole("button", { name: "Apply setup", exact: true }).click(); await expect(page.getByRole("region", { name: "Animation timeline" })).toBeVisible(); }
async function seek(page: Page, seconds: number) { await page.getByLabel("Animation playhead").fill(String(seconds)); await expect(page.locator(".editor-surface .scene-diagram")).toHaveAttribute("data-time", String(seconds)); }
async function anchor(page: Page, id: string) { const element = page.locator(`.editor-surface [data-entity-id="${id}"]`); return { x: Number(await element.getAttribute("data-world-x")), y: Number(await element.getAttribute("data-world-y")) }; }
async function choose(page: Page, id: string) { const list = page.locator(".editor-object-list"); if (!(await list.getAttribute("open"))) await list.locator("summary").click(); await list.locator(`button[data-object-id="${id}"]`).click(); }

for (const example of animationExamples) test(`animation desktop acceptance: ${example.title}`, async ({ page }, info) => {
  const errors: string[] = []; page.on("pageerror", (error) => errors.push(error.message)); await storage(page); await page.goto("/tactical-editor"); await loaded(page); await apply(page, example.id);
  await page.getByRole("button", { name: "Overview", exact: true }).click();
  const duration = sceneDuration(example.scene);
  for (const time of [0, duration / 2, duration]) {
    await seek(page, time); const evaluated = evaluateScene(example.scene, time);
    for (const entity of evaluated.entities.filter((e) => e.kind !== "equipment")) { const actual = await anchor(page, entity.id); expect(actual.x).toBeCloseTo(entity.position.x, 5); expect(actual.y).toBeCloseTo(entity.position.y, 5); }
  }
  await seek(page, Math.min(1.5, duration / 2)); const moving = example.scene.entities.find((e) => e.kind === "ball") ?? example.scene.entities.find((e) => e.kind === "player")!; await choose(page, moving.id);
  await page.evaluate(() => window.scrollTo(0, 0)); await page.screenshot({ path: info.outputPath(`${example.id}.png`) });
  const surface = (await page.locator(".editor-surface").boundingBox())!; expect(surface.height).toBeGreaterThanOrEqual(230);
  const timeline = (await page.getByRole("region", { name: "Animation timeline" }).boundingBox())!; expect(timeline.y + timeline.height).toBeLessThanOrEqual(info.project.use.viewport!.height);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true); expect(errors).toEqual([]);
});
test("pose drag, keyframe editing, shared boundaries, undo/redo and stage operations update actual geometry", async ({ page }) => {
  await storage(page); await page.goto("/tactical-editor"); await loaded(page); await apply(page, "animation-passing");
  await page.getByLabel("Camera rotation", { exact: true }).selectOption("0");
  await choose(page, "ball"); await page.getByRole("button", { name: "End pose", exact: true }).click();
  await page.getByLabel("Pose X", { exact: true }).fill("4"); await page.getByLabel("Pose Y", { exact: true }).fill("5"); await page.getByRole("button", { name: "Record pose keyframe", exact: true }).click(); expect(await anchor(page, "ball")).toEqual({ x: 4, y: 5 });
  await page.getByRole("button", { name: "↶ Undo", exact: true }).click(); expect(await anchor(page, "ball")).toEqual({ x: 1, y: 4 });
  await page.getByRole("button", { name: "↷ Redo", exact: true }).click(); expect(await anchor(page, "ball")).toEqual({ x: 4, y: 5 });
  await page.getByLabel("Selected keyframe time").fill("2.5"); await page.getByRole("button", { name: "Move keyframe time", exact: true }).click();
  await page.getByLabel("Stage pose time").fill("1"); await page.getByLabel("Grid spacing", { exact: true }).selectOption("1");
  const marker = page.locator('.editor-surface [data-entity-id="ball"] circle').first(), box = (await marker.boundingBox())!, old = await anchor(page, "ball"), scale = Number(await page.locator(".scene-diagram").getAttribute("data-scale"));
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.down(); await page.mouse.move(box.x + box.width / 2 + scale, box.y + box.height / 2, { steps: 5 }); await page.mouse.up(); expect((await anchor(page, "ball")).x).toBe(Math.round(old.x + 1));
  await page.getByRole("button", { name: "↶ Undo", exact: true }).click(); expect((await anchor(page, "ball")).x).toBeCloseTo(old.x, 5);
  await page.getByLabel("Stage duration (seconds)").fill("6"); await page.getByRole("button", { name: "Apply stage timing", exact: true }).click(); await expect(page.getByLabel("Animation playhead")).toHaveAttribute("max", "9");
  await page.getByRole("button", { name: "Duplicate stage", exact: true }).click(); await expect(page.locator(".animation-stages button")).toHaveCount(3);
  await page.getByRole("button", { name: /Select stage 2: .*copy/ }).click(); await page.getByRole("button", { name: "Move stage later", exact: true }).click(); await expect(page.locator(".animation-stages button").last()).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Delete stage", exact: true }).click(); await expect(page.locator(".animation-stages button")).toHaveCount(2);
  await page.getByRole("button", { name: "+ Add stage", exact: true }).click(); await expect(page.locator(".animation-stages button")).toHaveCount(3);
});
test("stage visibility and annotation windows are local; ghosts are view-only", async ({ page }) => {
  const mock = await storage(page); await page.goto("/tactical-editor"); await loaded(page); await apply(page, "animation-passing"); await choose(page, "a1");
  await expect(page.locator("[data-ghost-id]")).toHaveCount(1); await page.getByLabel("Start / end ghosts").uncheck(); await expect(page.locator("[data-ghost-id]")).toHaveCount(0);
  await page.getByRole("button", { name: "Hide selected in stage", exact: true }).click(); await expect(page.locator('.editor-surface [data-entity-id="a1"]')).toHaveCount(0);
  await page.getByLabel("Start / end ghosts").check(); await expect(page.locator("[data-ghost-id]")).toHaveCount(0);
  await seek(page, 3); await expect(page.locator('.editor-surface [data-entity-id="a1"]')).toHaveCount(1);
  await page.getByRole("button", { name: "T Note", exact: true }).click(); await page.getByRole("button", { name: "Insert at centre", exact: true }).click();
  await page.getByLabel("Label", { exact: true }).fill("Release into space"); await page.getByRole("button", { name: "Apply overlay properties", exact: true }).click();
  await page.getByLabel("Annotation visible from").fill("1"); await page.getByLabel("Annotation visible until").fill("2"); await page.getByRole("button", { name: "Apply annotation timing", exact: true }).click();
  await seek(page, 3.5); await expect(page.locator(".editor-surface")).not.toContainText("Release into space"); await seek(page, 4); await expect(page.locator(".editor-surface")).toContainText("Release into space"); await seek(page, 5); await expect(page.locator(".editor-surface")).not.toContainText("Release into space"); expect(mock.writes()).toBe(0);
});
test("play, pause, speed, restart and scrub evaluate the same saved time without editing or writes", async ({ page }) => {
  const mock = await storage(page); await page.goto("/tactical-editor"); await loaded(page); await apply(page, "animation-rondo");
  await page.getByLabel("Playback speed").selectOption("2"); await page.getByRole("button", { name: "Play animation", exact: true }).click(); await expect.poll(async () => Number(await page.locator(".scene-diagram").getAttribute("data-time"))).toBeGreaterThan(.2);
  await page.getByRole("button", { name: "Pause animation", exact: true }).click(); const paused = Number(await page.locator(".scene-diagram").getAttribute("data-time")); await page.waitForTimeout(180); expect(Number(await page.locator(".scene-diagram").getAttribute("data-time"))).toBe(paused);
  await seek(page, 2); const first = await anchor(page, "ball"); await seek(page, 9); await seek(page, 2); expect(await anchor(page, "ball")).toEqual(first);
  await page.getByRole("button", { name: "↤ Restart", exact: true }).click(); await expect(page.locator(".scene-diagram")).toHaveAttribute("data-time", "0"); expect(mock.writes()).toBe(0);
});
test("save/reopen animated revisions and historical guides preserve old scenes and unrelated plans", async ({ page }, info) => {
  const mock = await storage(page), before = structuredClone(mock.bundle()); await page.goto(diagramHref(target)); await loaded(page); await apply(page, "animation-rondo");
  await page.getByRole("button", { name: "Save diagram", exact: true }).click(); await expect(page).toHaveURL(/revision=2/); const historical = page.url(), first = structuredClone(mock.bundle().scenes[0]);
  await page.reload(); await loaded(page); await expect(page.getByRole("region", { name: "Animation timeline" })).toBeVisible(); await seek(page, 2); expect(await anchor(page, "ball")).toEqual(evaluateScene(first, 2).entities.find((e) => e.id === "ball")!.position);
  await choose(page, "ball"); await page.getByLabel("Pose X", { exact: true }).fill("7"); await page.getByLabel("Pose Y", { exact: true }).fill("3"); await page.getByRole("button", { name: "Record pose keyframe", exact: true }).click();
  await page.getByRole("button", { name: "Save diagram", exact: true }).click(); await expect(page).toHaveURL(/revision=3/); expect(mock.writes()).toBe(2);
  await page.goto(historical); await loaded(page); await expect(page.getByText("Historical snapshot · read only", { exact: true })).toBeVisible(); await expect(page.getByRole("button", { name: "Save diagram", exact: true })).toBeDisabled(); await seek(page, 2); expect(await anchor(page, "ball")).toEqual(evaluateScene(first, 2).entities.find((e) => e.id === "ball")!.position);
  await page.screenshot({ path: info.outputPath("animation-historical.png") });
  await page.goto(guideHref({ session: target.id, revision: 2, event: target.event, bookingRevision: 2 })); await expect(page.locator(".guide-saved-diagram .scene-diagram")).toHaveAttribute("data-revision", "1");
  expect(mock.bundle().scenes[0]).toEqual(first); expect(mock.bundle().templates).toEqual(before.templates); expect(mock.bundle().exercises).toEqual(before.exercises);
});

test("fractional stage starts retain keyframe selection and retiming", async ({ page }) => {
  await storage(page); await page.goto("/tactical-editor"); await loaded(page); await apply(page, "animation-passing");
  await page.getByLabel("Stage duration (seconds)").fill("3.3"); await page.getByRole("button", { name: "Apply stage timing", exact: true }).click();
  await page.getByRole("button", { name: /Select stage 2:/ }).click(); await choose(page, "ball"); await page.getByLabel("Stage pose time").fill("1.2");
  await page.getByLabel("Pose X", { exact: true }).fill("4"); await page.getByLabel("Pose Y", { exact: true }).fill("5"); await page.getByRole("button", { name: "Record pose keyframe", exact: true }).click();
  await page.getByRole("button", { name: /^1\.20 s ·/ }).click(); await expect(page.getByLabel("Selected keyframe time")).toHaveValue("1.2");
  await page.getByLabel("Selected keyframe time").fill("1.4"); await page.getByRole("button", { name: "Move keyframe time", exact: true }).click();
  await page.getByRole("button", { name: /^1\.40 s ·/ }).click(); await expect(page.getByLabel("Selected keyframe time")).toHaveValue("1.4");
  expect(Number(await page.locator(".scene-diagram").getAttribute("data-time"))).toBeCloseTo(4.7, 6);
});

test("stage reorder, deletion and undo keep canvas, selected stage and local pose synchronized", async ({ page }) => {
  await storage(page); await page.goto("/tactical-editor"); await loaded(page); await apply(page, "animation-rondo");
  await page.getByRole("button", { name: /Select stage 2:/ }).click(); await page.getByLabel("Stage pose time").fill("1");
  await page.getByRole("button", { name: "Move stage later", exact: true }).click(); await expect(page.locator(".scene-diagram")).toHaveAttribute("data-time", "8"); await expect(page.locator(".animation-stages button").last()).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "↶ Undo", exact: true }).click(); await expect(page.locator(".scene-diagram")).toHaveAttribute("data-time", "5"); await expect(page.getByLabel("Stage pose time")).toHaveValue("1");
  await page.getByRole("button", { name: "Move stage later", exact: true }).click(); await page.getByRole("button", { name: "Delete stage", exact: true }).click();
  await expect(page.locator(".scene-diagram")).toHaveAttribute("data-time", "7"); await expect(page.getByLabel("Stage title", { exact: true })).toHaveValue("Switch the angle"); await expect(page.getByLabel("Stage pose time")).toHaveValue("3");
});

async function cameraState(page: Page) { return page.locator(".editor-surface .scene-diagram").evaluate((node) => ["scale", "center-x", "center-y"].map((key) => Number(node.getAttribute(`data-${key}`)))); }
for (const example of animationExamples) test(`magnification fits complete stage paths without moving world coordinates: ${example.id}`, async ({ page }) => {
  const mock = await storage(page); await page.goto("/tactical-editor"); await loaded(page); await apply(page, example.id);
  for (const [index, stage] of example.scene.stages.entries()) {
    await page.getByRole("button", { name: new RegExp(`Select stage ${index + 1}:`) }).click();
    await page.getByRole("button", { name: "Fit stage / Action", exact: true }).click();
    const view = await cameraState(page), frame = actionFrame(example.scene, stage.id)!;
    const start = example.scene.stages.slice(0, index).reduce((sum, s) => sum + s.durationSeconds, 0);
    for (const seconds of [start, start + stage.durationSeconds / 2, start + stage.durationSeconds - .01]) {
      await seek(page, seconds); expect(await cameraState(page)).toEqual(view);
      const surface = (await page.locator(".editor-surface .scene-diagram").boundingBox())!;
      for (const id of frame.entityIds) {
        const entity = page.locator(`.editor-surface [data-entity-id="${id}"]`), box = (await entity.boundingBox())!;
        expect(box.x).toBeGreaterThanOrEqual(surface.x); expect(box.y).toBeGreaterThanOrEqual(surface.y); expect(box.x + box.width).toBeLessThanOrEqual(surface.x + surface.width); expect(box.y + box.height).toBeLessThanOrEqual(surface.y + surface.height);
        expect(await anchor(page, id)).toEqual(evaluateScene(example.scene, seconds).entities.find((e) => e.id === id)!.position);
      }
    }
  }
  expect(mock.writes()).toBe(0);
});
test("detail, pointer zoom, pan and stage changes keep a held camera through playback and scrubbing", async ({ page }) => {
  const mock = await storage(page); await page.goto("/tactical-editor"); await loaded(page); await apply(page, "animation-corner");
  await page.getByRole("button", { name: /Select stage 2:/ }).click(); await page.getByRole("button", { name: "Fit stage / Action", exact: true }).click();
  const action = await cameraState(page); await choose(page, "a9"); await page.getByRole("button", { name: "Detail / Focus selection", exact: true }).click(); const detail = await cameraState(page); expect(detail[0]).toBeGreaterThan(action[0]);
  const surface = (await page.locator(".editor-surface").boundingBox())!;
  await page.mouse.move(surface.x + surface.width / 2, surface.y + surface.height / 2); await page.mouse.wheel(0, -120); await expect.poll(async () => (await cameraState(page))[0]).toBeGreaterThan(detail[0]);
  const zoomed = await cameraState(page); await page.mouse.move(surface.x + surface.width / 2, surface.y + surface.height / 2); await page.keyboard.down("Alt"); await page.mouse.down(); await page.mouse.move(surface.x + surface.width / 2 + 30, surface.y + surface.height / 2 + 20, { steps: 4 }); await page.mouse.up(); await page.keyboard.up("Alt");
  const panned = await cameraState(page); expect(panned[0]).toBe(zoomed[0]); expect(panned.slice(1)).not.toEqual(zoomed.slice(1));
  await page.getByRole("button", { name: /Select stage 1:/ }).click(); expect(await cameraState(page)).toEqual(panned);
  await seek(page, 2); await page.getByLabel("Playback speed").selectOption("2"); await page.getByRole("button", { name: "Play animation", exact: true }).click();
  await expect.poll(async () => Number(await page.locator(".scene-diagram").getAttribute("data-time"))).toBeGreaterThan(3.1); expect(await cameraState(page)).toEqual(panned); await page.getByRole("button", { name: "Pause animation", exact: true }).click();
  await seek(page, 4); const expected = evaluateScene(animationExamples.find((e) => e.id === "animation-corner")!.scene, 4).entities.find((e) => e.id === "a9")!.position;
  await page.getByRole("button", { name: "Fit stage / Action", exact: true }).click(); expect(await anchor(page, "a9")).toEqual(expected);
  await page.getByRole("button", { name: "Overview", exact: true }).click(); expect((await cameraState(page))[0]).toBeLessThan(action[0]); expect(mock.writes()).toBe(0);
});
test("camera changes stay out of immutable saves and history; reopening restores scene geometry", async ({ page }) => {
  const mock = await storage(page); await page.goto(diagramHref(target)); await loaded(page); await apply(page, "animation-full");
  await page.getByRole("button", { name: /Select stage 2:/ }).click(); await page.getByRole("button", { name: "Fit stage / Action", exact: true }).click(); await choose(page, "ball");
  await page.getByRole("button", { name: "Detail / Focus selection", exact: true }).click(); await page.getByRole("button", { name: "Zoom in", exact: true }).click();
  await page.getByRole("button", { name: "↶ Undo", exact: true }).click();
  // View controls did not insert an undo entry: the preceding scene setup is undone.
  await expect(page.getByRole("button", { name: "↶ Undo", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "↷ Redo", exact: true }).click();
  await page.getByRole("button", { name: "Save diagram", exact: true }).click(); await expect(page).toHaveURL(/revision=2/);
  const saved = structuredClone(mock.bundle().scenes[0]), source = animationExamples.find((e) => e.id === "animation-full")!.scene;
  expect(saved.entities).toEqual(source.entities); expect(saved.stages).toEqual(source.stages); expect(Object.keys(saved).sort()).toEqual(Object.keys(source).sort());
  await page.getByRole("button", { name: "Fit stage / Action", exact: true }).click(); await expect(page.getByRole("button", { name: "Save diagram", exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "↶ Undo", exact: true })).toBeDisabled(); await page.reload(); await loaded(page); await seek(page, 5);
  expect(mock.bundle().scenes[0]).toEqual(saved); expect(await anchor(page, "ball")).toEqual(evaluateScene(saved, 5).entities.find((e) => e.id === "ball")!.position); expect(mock.writes()).toBe(1);
});
test("framing an entirely hidden stage returns safely to overview", async ({ page }) => {
  await storage(page); await page.goto("/tactical-editor"); await loaded(page); await apply(page, "animation-passing");
  const list = page.locator(".editor-object-list"); await list.locator("summary").click();
  for (const [index, button] of (await list.locator("button[data-object-id]").all()).entries()) await button.click({ modifiers: index ? ["Shift"] : [] });
  await page.getByRole("button", { name: "Hide selected in stage", exact: true }).click(); await page.getByRole("button", { name: "Fit stage / Action", exact: true }).click();
  await expect(page.getByRole("button", { name: "Overview", exact: true })).toHaveAttribute("aria-pressed", "true"); await expect(page.locator(".editor-feedback")).toContainText("No visible action");
  await page.getByRole("button", { name: "Detail / Focus selection", exact: true }).click(); await expect(page.locator(".editor-feedback")).toContainText("Select a visible");
  await expect(page.locator(".scene-diagram-error")).toHaveCount(0);
});
test("End pose retains selected-stage visibility and overlays; timeline seeking still enters the next stage", async ({ page }) => {
  await storage(page); await page.goto("/tactical-editor"); await loaded(page); await apply(page, "animation-passing"); await page.getByRole("button", { name: "Overview", exact: true }).click();
  await choose(page, "a1"); await page.getByRole("button", { name: "Hide selected in stage", exact: true }).click();
  await page.getByRole("button", { name: /Select stage 2:/ }).click(); await page.getByRole("button", { name: "T Note", exact: true }).click(); await page.getByRole("button", { name: "Insert at centre", exact: true }).click();
  await page.getByLabel("Label", { exact: true }).fill("Next stage only"); await page.getByRole("button", { name: "Apply overlay properties", exact: true }).click();
  await page.getByRole("button", { name: /Select stage 1:/ }).click(); await choose(page, "a1"); const view = await cameraState(page); await page.getByRole("button", { name: "End pose", exact: true }).click();
  await expect(page.locator(".scene-diagram")).toHaveAttribute("data-time", "3"); await expect(page.locator(".editor-surface svg desc")).toContainText("Receive and open");
  await expect(page.locator('.editor-surface [data-entity-id="a1"]')).toHaveCount(0); await expect(page.locator("[data-ghost-id]")).toHaveCount(0); await expect(page.locator(".editor-surface")).not.toContainText("Next stage only"); expect(await cameraState(page)).toEqual(view);
  await seek(page, 3); await expect(page.locator(".editor-surface svg desc")).toContainText("Play the third player"); await expect(page.locator('.editor-surface [data-entity-id="a1"]')).toHaveCount(1); await expect(page.locator(".editor-surface")).toContainText("Next stage only");
});
