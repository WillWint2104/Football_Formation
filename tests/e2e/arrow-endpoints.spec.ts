import { expect, test, type Page } from "@playwright/test";
import { arrowEndpointFixture, initialFrom, initialTo, pitchFrom, pitchTo } from "../fixtures/arrow-endpoints";
import { openTacticalDisclosure } from "../fixtures/tactical-controls";
import { diagramHref } from "../../lib/tactical/persistence";

const board = (page: Page) => page.locator(".editor-surface .scene-diagram");
const handle = (page: Page, name: "Start" | "End") => board(page).getByRole("button", { name: name + " arrow endpoint", exact: true });
const coordinate = (page: Page, name: "Start" | "End", axis: "X" | "Y") => page.getByLabel(name + " " + axis + " (m)", { exact: true });

async function settled(page: Page) {
  await expect.poll(async () => {
    const measured = await board(page).boundingBox();
    return Math.abs(Number(await board(page).getAttribute("data-width")) - (measured?.width ?? 0)) +
      Math.abs(Number(await board(page).getAttribute("data-height")) - (measured?.height ?? 0));
  }).toBeLessThan(1);
}
async function midpoint(page: Page) {
  return board(page).locator('g[data-annotation-id="route"] polyline').first().evaluate((element: SVGPolylineElement) => {
    const a = element.points.getItem(0), b = element.points.getItem(1);
    const point = new DOMPoint((a.x + b.x) / 2, (a.y + b.y) / 2).matrixTransform(element.getScreenCTM()!);
    return { x: point.x, y: point.y };
  });
}
async function gesture(page: Page, origin: { x: number; y: number }, dx: number, dy: number) {
  await page.mouse.move(origin.x, origin.y);
  await page.mouse.down();
  await page.mouse.move(origin.x + dx, origin.y + dy, { steps: 6 });
}
async function centre(page: Page, name: "Start" | "End") {
  const box = (await handle(page, name).boundingBox())!;
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}
async function scale(page: Page) { return Number(await board(page).getAttribute("data-scale")); }
async function assertEndpoints(page: Page, from: typeof initialFrom, to: typeof initialTo) {
  for (const [name, point] of [["Start", from], ["End", to]] as const) {
    await expect.poll(async () => Number(await coordinate(page, name, "X").inputValue())).toBeCloseTo(point.x, 1);
    await expect.poll(async () => Number(await coordinate(page, name, "Y").inputValue())).toBeCloseTo(point.y, 1);
  }
}
async function assertHandlePosition(page: Page, handleName: "Start" | "End", point: typeof initialFrom) {
  await expect.poll(async () => {
    const title = await handle(page, handleName).getAttribute("title");
    const match = title?.match(/(-?\d+\.\d+), (-?\d+\.\d+) m$/);
    return match ? Math.max(Math.abs(Number(match[1]) - point.x), Math.abs(Number(match[2]) - point.y)) : Infinity;
  }).toBeLessThan(.05);
}
async function open(page: Page, url: string) {
  await page.goto(url);
  await expect(page.getByRole("region", { name: "Tactical diagram editor", exact: true })).toBeVisible();
  await board(page).scrollIntoViewIfNeeded();
  await settled(page);
}
async function selectRoute(page: Page) {
  const p = await midpoint(page);
  await page.mouse.click(p.x, p.y);
  await expect(handle(page, "Start")).toBeVisible();
  await expect(handle(page, "End")).toBeVisible();
}

test("straight arrow endpoint drags are independent, cancellable and one undo each", async ({ page }, info) => {
  const fixture = await arrowEndpointFixture(page);
  await open(page, fixture.url);
  await page.getByRole("button", { name: "Layout", exact: true }).click();
  await openTacticalDisclosure(page, "Fit");
  await page.getByRole("button", { name: "Fit all", exact: true }).click();
  await settled(page);
  await expect(handle(page, "Start")).toHaveCount(0);
  await selectRoute(page);
  await openTacticalDisclosure(page, "Grid & guides");
  await page.getByLabel("Snap to grid", { exact: true }).uncheck();
  await board(page).scrollIntoViewIfNeeded();
  const start = await centre(page, "Start"), px = await scale(page);
  await gesture(page, start, 1.5 * px, .5 * px);
  await board(page).evaluate(el => el.dispatchEvent(new PointerEvent("lostpointercapture", { pointerId: 99, bubbles: true })));
  const undo = page.getByRole("button", { name: "Undo", exact: true });
  await expect(undo).toBeDisabled();
  await assertHandlePosition(page, "Start", { x: 5.5, y: 12.5 });
  await page.mouse.wheel(0, -220);
  expect(await scale(page)).toBe(px);
  await page.screenshot({ path: info.outputPath("start-endpoint-drag.png") });
  await page.keyboard.press("Escape");
  await page.mouse.up();
  await assertEndpoints(page, initialFrom, initialTo);
  await expect(undo).toBeDisabled();

  const edge = (await board(page).boundingBox())!.x;
  const at = await centre(page, "Start");
  await gesture(page, at, edge - at.x - 12, 0);
  await expect(handle(page, "Start")).toBeFocused();
  await page.keyboard.press("Escape");
  await page.mouse.up();
  await assertEndpoints(page, initialFrom, initialTo);
  await expect(undo).toBeDisabled();

  const viewport = page.viewportSize()!;
  await gesture(page, await centre(page, "Start"), px, 0);
  await page.setViewportSize({ width: viewport.width - 40, height: viewport.height });
  await settled(page);
  await page.mouse.up();
  await assertEndpoints(page, initialFrom, initialTo);
  await expect(undo).toBeDisabled();
  await page.setViewportSize(viewport);
  await board(page).scrollIntoViewIfNeeded();
  await settled(page);

  await gesture(page, await centre(page, "Start"), 1.5 * px, .5 * px);
  await page.mouse.up();
  const movedStart = { x: 5.5, y: 12.5 };
  await assertEndpoints(page, movedStart, initialTo);
  await undo.click();
  await assertEndpoints(page, initialFrom, initialTo);
  await expect(undo).toBeDisabled();
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await assertEndpoints(page, movedStart, initialTo);

  await page.getByLabel("Grid spacing", { exact: true }).selectOption("1");
  await page.getByLabel("Snap to grid", { exact: true }).check();
  await board(page).scrollIntoViewIfNeeded();
  const endScale = await scale(page);
  await gesture(page, await centre(page, "End"), 1.65 * endScale, 1.4 * endScale);
  await page.mouse.up();
  const movedEnd = { x: 18, y: 9 };
  await assertEndpoints(page, movedStart, movedEnd);
  await page.screenshot({ path: info.outputPath("end-endpoint-snapped.png") });

  await openTacticalDisclosure(page, "Grid & guides");
  await page.getByLabel("Snap to grid", { exact: true }).uncheck();
  await board(page).scrollIntoViewIfNeeded();
  const bodyScale = await scale(page);
  await page.getByLabel("Snap to objects", { exact: true }).check();
  await board(page).scrollIntoViewIfNeeded();
  const anchor = fixture.scene.entities.find(entity => entity.id === "a1")!.position;
  const origin = await centre(page, "Start");
  await gesture(page, origin, (anchor.x - movedStart.x + .12) * bodyScale, (anchor.y - movedStart.y + .1) * bodyScale);
  await page.mouse.up();
  await assertEndpoints(page, anchor, movedEnd);
  await undo.click();
  await assertEndpoints(page, movedStart, movedEnd);
  await page.getByLabel("Snap to objects", { exact: true }).uncheck();
  await board(page).scrollIntoViewIfNeeded();
  await gesture(page, await midpoint(page), bodyScale, -bodyScale);
  await page.mouse.up();
  await assertEndpoints(page, { x: 6.5, y: 11.5 }, { x: 19, y: 8 });
  await undo.click();
  await assertEndpoints(page, movedStart, movedEnd);
  expect(fixture.writes()).toBe(0);
  expect(fixture.bundle()).toEqual(fixture.before);
});

test("keyboard, numeric validation and rotated pointer edits preserve metre geometry", async ({ page }, info) => {
  const fixture = await arrowEndpointFixture(page);
  await open(page, fixture.url);
  await selectRoute(page);
  await openTacticalDisclosure(page, "Grid & guides");
  await page.getByLabel("Snap to grid", { exact: true }).uncheck();
  await handle(page, "Start").focus();
  await page.keyboard.press("ArrowRight");
  await assertEndpoints(page, { ...initialFrom, x: 4.25 }, initialTo);
  await expect(handle(page, "Start")).toBeFocused();
  await page.keyboard.press("Enter");
  const startX = coordinate(page, "Start", "X");
  const validation = page.locator(".editor-arrow-endpoints").getByRole("alert");
  await expect(startX).toBeFocused();
  await startX.fill("10001");
  await startX.press("Enter");
  await expect(validation).toContainText("Coordinates exceed renderer limits");
  await expect(handle(page, "Start")).toHaveAttribute("title", /4\.25, 12\.00 m/);
  await startX.press("Escape");
  await expect(startX).toHaveValue("4.25");
  await expect(validation).toHaveCount(0);
  await startX.fill("16");
  await coordinate(page, "Start", "Y").fill("8");
  await startX.press("Enter");
  await expect(validation).toContainText("Arrow endpoints must be separate");
  await startX.press("Escape");
  await startX.fill("5.125");
  await startX.press("Enter");
  await expect(startX).toBeFocused();
  await assertEndpoints(page, { x: 5.125, y: 12 }, initialTo);

  await page.getByLabel("Camera rotation", { exact: true }).selectOption("90");
  await page.getByRole("button", { name: "Zoom in", exact: true }).click();
  await settled(page);
  const bounds = (await board(page).boundingBox())!;
  const centerBefore = await board(page).getAttribute("data-center-x");
  await page.keyboard.down("Alt");
  await gesture(page, { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 }, 0, 16);
  await page.mouse.up();
  await page.keyboard.up("Alt");
  await expect(board(page)).not.toHaveAttribute("data-center-x", centerBefore!);
  await assertEndpoints(page, { x: 5.125, y: 12 }, initialTo);
  const px = await scale(page);
  await gesture(page, await centre(page, "End"), -px, px);
  await page.mouse.up();
  await assertEndpoints(page, { x: 5.125, y: 12 }, { x: 17, y: 9 });
  await page.screenshot({ path: info.outputPath("rotated-endpoint.png") });
  expect(fixture.writes()).toBe(0);
});

test("saving endpoint edits preserves the other stage, historical scene and representative time", async ({ page }) => {
  const fixture = await arrowEndpointFixture(page);
  await open(page, fixture.url);
  await selectRoute(page);
  await coordinate(page, "Start", "X").fill("5.125");
  await coordinate(page, "End", "X").fill("17");
  const endY = coordinate(page, "End", "Y");
  await endY.fill("9");
  await endY.press("Enter");
  await assertEndpoints(page, { x: 5.125, y: 12 }, { x: 17, y: 9 });
  await page.getByRole("button", { name: /Select stage 2:/ }).click();
  await expect(handle(page, "Start")).toHaveCount(0);
  await board(page).scrollIntoViewIfNeeded();
  await settled(page);
  await selectRoute(page);
  await assertEndpoints(page, { x: 5, y: 4 }, { x: 12, y: 4 });
  expect(fixture.writes()).toBe(0);
  await page.getByRole("button", { name: "Save diagram", exact: true }).click();
  await expect(page).toHaveURL(/revision=2/);
  expect(fixture.writes()).toBe(1);
  const published = fixture.bundle().scenes.find(item => item.id === fixture.scene.id && item.revision === 2)!;
  const expected = structuredClone(fixture.scene);
  expected.revision = 2;
  const edited = expected.stages[0].tracks[0];
  if (edited.kind !== "annotation" || edited.annotation.kind !== "arrow") throw new Error("Expected arrow fixture");
  edited.annotation.from.x = 5.125;
  edited.annotation.to = { x: 17, y: 9 };
  expect(published).toEqual(expected);
  expect(fixture.bundle().scenes.find(item => item.id === fixture.scene.id && item.revision === 1)).toEqual(fixture.scene);
  await page.reload();
  await settled(page);
  await board(page).scrollIntoViewIfNeeded();
  await selectRoute(page);
  await assertEndpoints(page, { x: 5.125, y: 12 }, { x: 17, y: 9 });
  await open(page, diagramHref(fixture.target));
  await expect(page.getByText("Historical snapshot \u00b7 read only", { exact: true })).toBeVisible();
  const old = await midpoint(page);
  await page.mouse.click(old.x, old.y);
  await expect(handle(page, "Start")).toHaveCount(0);
  await assertEndpoints(page, initialFrom, initialTo);
  await expect(coordinate(page, "Start", "X")).toBeDisabled();

  await page.goto("/sessions/view?organization=" + fixture.scene.organizationId + "&session=sample-3&revision=2&booking=sample-4&bookingRevision=2&activity=activity-1&diagram=1");
  const viewer = page.getByRole("region", { name: "Tactical workspace" });
  await expect(viewer.locator(".scene-diagram")).toHaveAttribute("data-revision", "2");
  await expect(viewer.locator(".scene-diagram")).toHaveAttribute("data-time", "1.5");
  await expect(viewer.locator('[data-annotation-id="route"]')).toHaveCount(1);
  await expect(viewer.locator("[data-arrow-endpoint]")).toHaveCount(0);
  await expect(viewer.locator(".editor-arrow-endpoints")).toHaveCount(0);
  expect(fixture.writes()).toBe(1);
});

test("full-pitch endpoint handles survive expanded-board editing and restore focus", async ({ page }, info) => {
  const fixture = await arrowEndpointFixture(page, "full");
  await open(page, fixture.url);
  await expect(board(page)).toHaveAttribute("data-time", "1.5");
  await expect(board(page).locator('[data-field-marking="centre-circle"]')).toHaveCount(1);
  await selectRoute(page);
  await assertEndpoints(page, pitchFrom, pitchTo);
  await page.screenshot({ path: info.outputPath("full-pitch-selected.png") });

  const expand = page.getByRole("button", { name: "Expand board", exact: true });
  await expand.click();
  await expect(page.getByRole("dialog", { name: "Tactical diagram editor" })).toBeVisible();
  await settled(page);
  await page.getByRole("button", { name: "Hide properties", exact: true }).click();
  await settled(page);
  await handle(page, "End").press("Enter");
  const endX = coordinate(page, "End", "X");
  await expect(endX).toBeFocused();
  await openTacticalDisclosure(page, "Grid & guides");
  await page.getByLabel("Snap to grid", { exact: true }).uncheck();
  await board(page).scrollIntoViewIfNeeded();
  await settled(page);
  const px = await scale(page);
  await gesture(page, await centre(page, "End"), 2 * px, -px);
  await assertHandlePosition(page, "End", { x: 58, y: 39 });
  await page.screenshot({ path: info.outputPath("full-pitch-endpoint-drag.png") });
  await page.mouse.up();
  await assertEndpoints(page, pitchFrom, { x: 58, y: 39 });

  await handle(page, "End").press("Control+z");
  await assertEndpoints(page, pitchFrom, pitchTo);
  await handle(page, "End").press("Control+Shift+z");
  await assertEndpoints(page, pitchFrom, { x: 58, y: 39 });
  await handle(page, "End").press("Enter");
  await endX.fill("55");
  await endX.press("Escape");
  await expect(page.getByRole("dialog", { name: "Tactical diagram editor" })).toBeVisible();
  const expandedEditor = page.getByRole("dialog", { name: "Tactical diagram editor" });
  const boardInfo = await board(page).evaluate(el => ({
    center: Number(el.getAttribute("data-center-x")),
    width: Number(el.getAttribute("data-width")),
    scale: Number(el.getAttribute("data-scale")),
  }));
  const nearRightEdge = Math.floor(boardInfo.center + boardInfo.width / (2 * boardInfo.scale) - 2);
  await endX.fill(String(nearRightEdge));
  await endX.press("Enter");
  await handle(page, "End").press("Shift+ArrowRight");
  await expect(handle(page, "End")).toHaveCount(0);
  await expect(expandedEditor).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(expand).toBeFocused();
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await assertEndpoints(page, pitchFrom, { x: 58, y: 39 });

  // At full-pitch scale, a one-metre route has overlapping minimum-size pointer targets.
  await coordinate(page, "End", "X").fill("31");
  const endY = coordinate(page, "End", "Y");
  await endY.fill("28");
  await endY.press("Enter");
  await board(page).scrollIntoViewIfNeeded();
  await settled(page);
  const start = await centre(page, "Start"), end = await centre(page, "End");
  expect(Math.hypot(start.x - end.x, start.y - end.y)).toBeLessThan(12);
  await gesture(page, start, -2 * await scale(page), 0);
  await page.mouse.up();
  await assertEndpoints(page, { x: 28, y: 28 }, { x: 31, y: 28 });
  expect(fixture.writes()).toBe(0);
});
