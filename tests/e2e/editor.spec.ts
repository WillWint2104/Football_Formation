import { test, expect, type Page } from "@playwright/test";
import { editorExamples } from "../../lib/tactical/editor-examples";
import { coachingSample } from "../../lib/coaching/sample";
import { domainBundleSchema } from "../../lib/domain/validation";
import { diagramHref, type DiagramTarget } from "../../lib/tactical/persistence";
import { guideHref } from "../../lib/documents/contracts";
import { contextArea } from "../../lib/tactical/context";
import { tacticalPalette } from "../../lib/tactical/palette";

const target: DiagramTarget = { kind: "session", id: "sample-3", revision: 1, activity: "activity-1", event: "sample-4", booking: 1, diagram: null };
/** Strict request-level stand-in; real hosted Auth/RLS verification remains a separate release gate. */
async function storage(page: Page, status?: number) {
  let bundle = coachingSample(), version = 1, writes = 0;
  await page.route("**/api/organizations", (r) => r.fulfill({ json: { organizations: [{ id: bundle.organizationId, name: "Synthetic editor club", version }] } }));
  await page.route("**/api/organizations/*/snapshot", async (r) => {
    if (r.request().method() === "POST") {
      writes++; const input = r.request().postDataJSON(); expect(input.expectedVersion).toBe(version);
      if (status) return r.fulfill({ status, json: { error: "conflict" } });
      bundle = domainBundleSchema.parse(input.bundle); version++; return r.fulfill({ json: { version } });
    }
    return r.fulfill({ json: { version, bundle } });
  });
  return { bundle: () => bundle, writes: () => writes };
}
/** Wait for the validated organisation graph rather than a hydration timing assumption. */
async function loaded(page: Page) { await expect(page.locator(".calendar-connection [role=status]")).toContainText("Loaded saved organisation snapshot"); }
/** Explicitly apply an illustrative setup through the same authoring UI available to coaches. */
async function apply(page: Page, id: string) { await page.getByLabel("Example setup", { exact: true }).selectOption(id); await page.getByRole("button", { name: "Apply setup", exact: true }).click(); }
/** Inspect rendered world anchors by identity; SVG paint order is not scene-array order. */
async function coordinates(page: Page) { return page.locator(".editor-surface [data-entity-id]").evaluateAll((nodes) => nodes.map((n) => [n.getAttribute("data-entity-id"), n.getAttribute("data-world-x"), n.getAttribute("data-world-y")])); }

for (const example of editorExamples) test(`editor context: ${example.title} at a real desktop viewport`, async ({ page }, info) => {
  const errors: string[] = []; page.on("pageerror", (e) => errors.push(e.message)); await storage(page);
  await page.goto("/tactical-editor"); await loaded(page); await apply(page, example.id);
  const diagram = page.locator(".editor-surface .scene-diagram");
  await expect.poll(async () => Number(await diagram.getAttribute("data-width")) - (await diagram.boundingBox())!.width).toBe(0);
  await expect(diagram).toHaveAttribute("data-clipped", "0");
  expect(await diagram.locator("[data-entity-id]").count()).toBe(example.scene.entities.length);
  if (example.scene.context?.kind === "neutral") { await expect(diagram.locator("[data-field-marking=penalty-area]")).toHaveCount(0); await expect(diagram.locator("[data-field-marking=halfway]")).toHaveCount(0); }
  const before = await coordinates(page); await page.getByLabel("Camera rotation").selectOption("90"); expect(await coordinates(page)).toEqual(before);
  const area = contextArea(example.scene);
  await page.getByLabel("Camera rotation").selectOption(example.scene.context?.kind === "pitch" && area.width > area.length ? "270" : "0");
  await page.evaluate(() => window.scrollTo(0, 0)); await page.screenshot({ path: info.outputPath(`editor-${example.id}.png`) });
  expect((await diagram.boundingBox())!.y + (await diagram.boundingBox())!.height).toBeLessThanOrEqual(info.project.use.viewport!.height - 40);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true); expect(errors).toEqual([]);
});

test("drag, snapping, multi-object selection, numeric properties, undo and redo affect actual SVG geometry", async ({ page }, info) => {
  await storage(page); await page.goto("/tactical-editor"); await loaded(page); await apply(page, "rondo");
  await page.getByLabel("Grid spacing", { exact: true }).selectOption("1");
  const anchor = page.locator('.editor-surface [data-entity-id="a3"]'), id = await anchor.getAttribute("data-entity-id"), oldX = Number(await anchor.getAttribute("data-world-x")), oldY = Number(await anchor.getAttribute("data-world-y"));
  const box = (await anchor.locator("circle").first().boundingBox())!, scale = Number(await page.locator(".scene-diagram").getAttribute("data-scale"));
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.down(); await page.mouse.move(box.x + box.width / 2 + scale * 1.1, box.y + box.height / 2 + scale * .1, { steps: 10 }); await page.mouse.up();
  const movedX = Number(await anchor.getAttribute("data-world-x")); expect(movedX).toBe(Math.round(oldX + 1.1));
  await page.getByRole("button", { name: "↶ Undo", exact: true }).click(); await expect(anchor).toHaveAttribute("data-world-x", String(oldX)); await expect(anchor).toHaveAttribute("data-world-y", String(oldY));
  await page.getByRole("button", { name: "↷ Redo", exact: true }).click(); await expect(anchor).toHaveAttribute("data-world-x", String(movedX));
  await page.getByLabel("Object X", { exact: true }).fill("3.25"); await page.getByLabel("Object Y", { exact: true }).fill("4.5"); await page.getByRole("button", { name: "Apply object properties" }).click();
  await expect(page.locator(`[data-entity-id="${id}"]`)).toHaveAttribute("data-world-x", "3.25");
  await page.getByText(/Objects & keyboard selection/).click(); const buttons = page.locator(".editor-object-list button[data-object-id]"), ids = [await buttons.nth(0).getAttribute("data-object-id"), await buttons.nth(1).getAttribute("data-object-id")]; await buttons.nth(0).click(); await buttons.nth(1).click({ modifiers: ["Shift"] });
  await page.getByRole("button", { name: "Align Y", exact: true }).click(); const positions = (await coordinates(page)).filter((p) => ids.includes(p[0])); expect(positions[0][2]).toBe(positions[1][2]);
  await page.getByLabel("Centre spacing", { exact: true }).fill("2"); await page.getByRole("button", { name: "Apply spacing", exact: true }).click(); const spaced = (await coordinates(page)).filter((p) => ids.includes(p[0])); expect(Math.abs(Number(spaced[0][1]) - Number(spaced[1][1]))).toBe(2);
  const member = page.locator(`.editor-surface [data-entity-id="${ids[0]}"] circle`).first(), memberBox = (await member.boundingBox())!;
  await page.mouse.move(memberBox.x + memberBox.width / 2, memberBox.y + memberBox.height / 2); await page.mouse.down(); await page.mouse.move(memberBox.x + memberBox.width / 2 + scale, memberBox.y + memberBox.height / 2, { steps: 6 }); await page.mouse.up();
  const shifted = (await coordinates(page)).filter((p) => ids.includes(p[0])); const deltas = shifted.map((p, i) => Number(p[1]) - Number(spaced[i][1])); expect(deltas[0]).toBeCloseTo(deltas[1], 6); expect(deltas[0]).toBeGreaterThan(.1);
  await page.screenshot({ path: info.outputPath("editor-arrange.png"), fullPage: true });
});

test("all toolbar objects and overlays are editable; keyboard delete and undo restore them", async ({ page }) => {
  await storage(page); await page.goto("/tactical-editor"); await loaded(page);
  const count = await page.locator(".editor-surface [data-entity-id]").count();
  await page.getByRole("button", { name: "● Player", exact: true }).click(); await page.getByRole("button", { name: "Insert at centre" }).click();
  await page.getByLabel("Player number").fill("42"); await page.getByLabel("Marker colour").fill("#008877"); await page.getByRole("button", { name: "Apply object properties" }).click();
  await expect(page.locator(".editor-surface [data-entity-id]")).toHaveCount(count + 1); await expect(page.locator(".editor-surface circle[fill='#008877']")).toHaveCount(1);
  const editor = page.getByRole("region", { name: "Tactical diagram editor" }); await editor.focus(); await page.keyboard.press("Delete"); await expect(page.locator(".editor-surface [data-entity-id]")).toHaveCount(count);
  await page.keyboard.press("Control+z"); await expect(page.locator(".editor-surface [data-entity-id]")).toHaveCount(count + 1);
  for (const name of ["◉ Ball", "△ Equipment", "→ Pass", "⇢ Run", "⇢ Press", "↝ Rotation", "▧ Zone", "T Note"]) { await page.getByRole("button", { name, exact: true }).click(); await page.getByRole("button", { name: "Insert at centre" }).click(); }
  await page.getByLabel("Label", { exact: true }).fill("Scan and create angles"); await page.getByRole("button", { name: "Apply overlay properties" }).click(); await expect(page.locator(".editor-surface")).toContainText("Scan and create angles");
});

test("wheel zoom, pan, camera rotation, fullscreen and dimension edits preserve world coordinates", async ({ page }, info) => {
  await storage(page); await page.goto("/tactical-editor"); await loaded(page); await apply(page, "rondo"); const before = await coordinates(page), diagram = page.locator(".scene-diagram");
  const scale = Number(await diagram.getAttribute("data-scale")), b = (await diagram.boundingBox())!;
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2); await page.mouse.wheel(0, -140); await expect.poll(async () => Number(await diagram.getAttribute("data-scale"))).toBeGreaterThan(scale);
  await page.getByRole("button", { name: "✥ Pan", exact: true }).click(); await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2); await page.mouse.down(); await page.mouse.move(b.x + b.width / 2 + 30, b.y + b.height / 2 + 20, { steps: 5 }); await page.mouse.up();
  await page.getByRole("button", { name: "Fit exercise", exact: true }).click(); await page.getByLabel("Camera rotation").selectOption("270"); expect(await coordinates(page)).toEqual(before);
  await page.getByLabel("Area length (m)", { exact: true }).fill("16"); await page.getByRole("button", { name: "Apply dimensions" }).click(); expect(await coordinates(page)).toEqual(before);
  await page.getByRole("button", { name: "Expand board", exact: true }).click(); await expect(page.getByRole("dialog", { name: "Tactical diagram editor" })).toBeVisible();
  await page.screenshot({ path: info.outputPath("editor-expanded.png") }); await page.keyboard.press("Escape"); await expect(page.getByRole("dialog")).toHaveCount(0); await expect(page.getByRole("button", { name: "Expand board", exact: true })).toBeFocused(); expect(await coordinates(page)).toEqual(before);
});

test("neutral conversion is explicit, translated and undoable; physical region and attack changes only reframe", async ({ page }) => {
  await storage(page); await page.goto("/tactical-editor"); await loaded(page); await apply(page, "rondo"); const before = await coordinates(page);
  await page.getByText("Convert coordinate space", { exact: true }).click(); await page.getByRole("button", { name: "Convert to physical pitch", exact: true }).click();
  const after = await coordinates(page); expect(Number(after[0][1]) - Number(before[0][1])).toBe(35); expect(Number(after[0][2]) - Number(before[0][2])).toBe(20);
  await page.getByRole("button", { name: "↶ Undo", exact: true }).click(); expect(await coordinates(page)).toEqual(before);
  await apply(page, "full"); const full = await coordinates(page); await page.getByLabel("Physical region").selectOption("defensive-third"); await page.getByLabel("Attack direction").selectOption("negative-x"); await page.getByRole("button", { name: "Fit all", exact: true }).click(); expect(await coordinates(page)).toEqual(full);
});

test("calendar → activity → editor save/reopen → exact guide; history and reusable sources remain independent", async ({ page }, info) => {
  const errors: string[] = []; page.on("pageerror", (e) => errors.push(e.message)); const mock = await storage(page), initial = structuredClone(mock.bundle());
  await page.goto("/calendar?date=2026-11-03"); await loaded(page); await page.getByRole("button", { name: /Rondos & Positional Play, 2026/ }).click(); await page.getByRole("link", { name: "Open session editor" }).click();
  await page.getByRole("link", { name: "Create diagram", exact: false }).nth(1).click(); await expect(page).toHaveURL(/tactical-editor/); await apply(page, "rondo");
  await page.getByRole("button", { name: "Save diagram", exact: true }).click(); await expect(page).toHaveURL(/revision=2/); await expect(page.locator(".scene-diagram")).toHaveAttribute("data-revision", "1");
  const savedTarget = new URL(page.url()); const sceneId = await page.locator(".scene-diagram").getAttribute("data-scene-id");
  expect(mock.writes()).toBe(1); expect(mock.bundle().templates).toEqual(initial.templates); expect(mock.bundle().exercises).toEqual(initial.exercises);
  await page.reload(); await loaded(page); await expect(page.locator(".scene-diagram")).toHaveAttribute("data-scene-id", sceneId!);
  await page.getByRole("button", { name: "● Player", exact: true }).click(); await page.getByRole("button", { name: "Insert at centre" }).click(); await page.getByRole("button", { name: "Save diagram", exact: true }).click(); await expect(page).toHaveURL(/revision=3/); await expect(page.locator(".scene-diagram")).toHaveAttribute("data-revision", "2");
  await page.getByRole("link", { name: "Open exact guide", exact: false }).click(); await expect(page.locator(".guide-saved-diagram .scene-diagram")).toHaveAttribute("data-revision", "2"); await page.screenshot({ path: info.outputPath("editor-saved-guide.png"), fullPage: true });
  await page.goto(guideHref({ session: target.id, revision: 2, event: target.event, bookingRevision: 2 })); await expect(page.locator(".guide-saved-diagram .scene-diagram")).toHaveAttribute("data-revision", "1");
  await page.goto(savedTarget.href); await loaded(page); await expect(page.getByText("Historical snapshot · read only", { exact: true })).toBeVisible(); await expect(page.getByRole("button", { name: "Save diagram", exact: true })).toBeDisabled();
  expect(mock.writes()).toBe(2); expect(errors).toEqual([]);
});

test("exercise and template diagrams save independent owner revisions", async ({ page }) => {
  const mock = await storage(page), original = structuredClone(mock.bundle().sessions);
  for (const kind of ["exercise", "template"] as const) {
    const record = kind === "exercise" ? mock.bundle().exercises[0] : mock.bundle().templates[0];
    await page.goto(diagramHref({ kind, id: record.id, revision: 1, ...(kind === "template" ? { activity: "activity-0" } : {}), diagram: null })); await loaded(page);
    await apply(page, "conditioning"); await page.getByRole("button", { name: "Save diagram", exact: true }).click(); await expect(page).toHaveURL(/revision=2/); await page.reload(); await loaded(page); await expect(page.locator(".scene-diagram")).toHaveAttribute("data-revision", "1");
  }
  expect(mock.writes()).toBe(2); expect(mock.bundle().sessions).toEqual(original);
});

test("conflict blocks uncertain writes without retry; malformed and missing exact pins never substitute revisions", async ({ page }) => {
  const mock = await storage(page, 409); await page.goto(diagramHref(target)); await loaded(page); await apply(page, "rondo"); await page.getByRole("button", { name: "Save diagram", exact: true }).click();
  await expect(page.getByRole("button", { name: "Reload before saving", exact: true })).toBeVisible(); await expect(page.getByRole("button", { name: "Save diagram", exact: true })).toBeDisabled(); expect(mock.writes()).toBe(1);
  page.on("dialog", (d) => d.accept()); await page.goto(diagramHref({ ...target, revision: 99 })); await expect(page.getByRole("heading", { name: "Requested diagram is unavailable" })).toBeVisible();
  await page.goto("/tactical-editor?kind=session&revision=nope"); await expect(page.getByRole("heading", { name: "Invalid diagram reference" })).toBeVisible();
});

test("team edits retain palette inheritance unless the coach changes the custom colour", async ({ page }) => {
  const mock = await storage(page); await page.goto(diagramHref(target)); await loaded(page);
  await page.getByRole("button", { name: "● Player", exact: true }).click(); await page.getByRole("button", { name: "Insert at centre" }).click();
  await page.getByRole("combobox", { name: "Team", exact: true }).selectOption("b"); await page.getByRole("button", { name: "Apply object properties" }).click();
  await expect(page.getByLabel("Marker colour")).toHaveValue(tacticalPalette.b); await expect(page.locator(`.editor-surface circle[fill="${tacticalPalette.b}"]`)).toHaveCount(1);
  await page.getByRole("button", { name: "Save diagram", exact: true }).click(); await expect(page).toHaveURL(/revision=2/);
  expect(mock.bundle().scenes[0].entities[0]).not.toHaveProperty("color");
  await page.locator(".editor-surface [data-entity-id]").first().click();
  await page.getByLabel("Marker colour").fill("#008877"); await page.getByRole("button", { name: "Apply object properties" }).click();
  await page.getByRole("combobox", { name: "Team", exact: true }).selectOption("a"); await page.getByRole("button", { name: "Apply object properties" }).click();
  await expect(page.getByLabel("Marker colour")).toHaveValue("#008877");
});

test("canvas clicks and snap-collapsed short drags create visible routes and usable default zones", async ({ page }) => {
  await storage(page); await page.goto(diagramHref(target)); await loaded(page);
  const surface = page.locator(".editor-surface"), bounds = (await surface.boundingBox())!, centre = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
  for (const name of ["→ Pass", "⇢ Run", "⇢ Press", "↝ Rotation"]) {
    await page.getByRole("button", { name, exact: true }).click(); await page.mouse.click(centre.x, centre.y);
    expect(Number(await page.getByLabel("End X (m)", { exact: true }).inputValue()) - Number(await page.getByLabel("Start X (m)", { exact: true }).inputValue())).toBe(5);
  }
  await expect(surface.locator("g[data-annotation-id]")).toHaveCount(4);
  await page.mouse.move(centre.x, centre.y); await page.mouse.down(); await page.mouse.move(centre.x + 3, centre.y + 1, { steps: 3 }); await page.mouse.up();
  expect(Number(await page.getByLabel("End X (m)", { exact: true }).inputValue()) - Number(await page.getByLabel("Start X (m)", { exact: true }).inputValue())).toBe(5);
  await page.getByRole("button", { name: "▧ Zone", exact: true }).click(); await page.mouse.click(centre.x, centre.y);
  await expect(page.getByLabel("Length (m)", { exact: true })).toHaveValue("10"); await expect(page.getByLabel("Width (m)", { exact: true })).toHaveValue("8");
});
