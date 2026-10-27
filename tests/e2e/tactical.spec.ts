import { test, expect } from "@playwright/test";
import { tacticalExamples } from "../../lib/tactical/examples";
import { coachingSample } from "../../lib/coaching/sample";
import { domainBundleSchema } from "../../lib/domain/validation";
import { guideHref } from "../../lib/documents/contracts";

for (const example of tacticalExamples) test(`${example.title}: real renderer adapts to desktop view and preserves world identity`, async ({ page }, info) => {
  const errors: string[] = []; page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/tactical-renderer"); await page.getByLabel("Exercise", { exact: true }).selectOption(example.id);
  const diagram = page.locator(".scene-diagram"); await expect(diagram).toHaveAttribute("data-scene-id", example.scene.id);
  await expect(diagram).toHaveAttribute("data-revision", "1");
  await expect.poll(async () => Number(await diagram.getAttribute("data-width")) - (await diagram.boundingBox())!.width).toBe(0);
  await expect(diagram).toHaveAttribute("data-clipped", "0");
  await expect(diagram).toHaveAttribute("data-label-collisions", "0");
  expect(await diagram.locator("g[data-entity-id]").count()).toBe(example.scene.entities.length);
  const before = await diagram.locator("g[data-entity-id]").evaluateAll((nodes) => nodes.map((n) => [n.getAttribute("data-entity-id"), n.getAttribute("data-world-x"), n.getAttribute("data-world-y")]));
  expect((await diagram.boundingBox())!.y + (await diagram.boundingBox())!.height).toBeLessThanOrEqual(info.project.use.viewport!.height);
  await page.screenshot({ path: info.outputPath(`${example.id}-exercise.png`) });
  await page.getByRole("button", { name: "Fit Pitch", exact: true }).click(); await expect(page.getByRole("button", { name: "Fit Pitch", exact: true })).toHaveAttribute("aria-pressed", "true");
  if (example.id === "rondo") await page.screenshot({ path: info.outputPath("rondo-before-fit.png") });
  await page.getByRole("button", { name: "Fit All", exact: true }).click();
  const after = await diagram.locator("g[data-entity-id]").evaluateAll((nodes) => nodes.map((n) => [n.getAttribute("data-entity-id"), n.getAttribute("data-world-x"), n.getAttribute("data-world-y")])); expect(after).toEqual(before);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true); expect(errors).toEqual([]);
});

test("snapshot stages, guides and fullscreen resize the drawing without editing saved data", async ({ page }, info) => {
  await page.goto("/tactical-renderer"); const diagram = page.locator(".scene-diagram");
  await page.getByLabel("Snapshot time (seconds)").fill("6"); await expect(diagram).toHaveAttribute("data-time", "6");
  await expect(diagram.locator("svg>desc")).toContainText("Release & support");
  await page.getByLabel("Movement paths", { exact: true }).selectOption("none"); await expect(diagram.locator("polyline")).toHaveCount(0);
  await page.getByLabel("Metric grid", { exact: true }).uncheck(); await expect(page.locator(".scene-diagram-caption")).toContainText("Grid off");
  await page.getByLabel("Thirds & channels", { exact: true }).check();
  const width = Number(await diagram.getAttribute("data-width"));
  await page.getByRole("button", { name: "Expand board", exact: true }).click(); await expect(page.getByRole("dialog", { name: "Expanded tactical board" })).toBeVisible();
  await expect.poll(async () => Number(await diagram.getAttribute("data-width"))).toBeGreaterThan(width);
  await expect(page.getByRole("button", { name: "Close board · Esc" })).toBeFocused();
  await page.screenshot({ path: info.outputPath("fullscreen.png") }); await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0); await expect(page.getByRole("button", { name: "Expand board", exact: true })).toBeFocused();
  await expect.poll(async () => Number(await diagram.getAttribute("data-width"))).toBe(width);
});

test("custom/half framing is view-only and rejects invalid dimensions", async ({ page }) => {
  await page.goto("/tactical-renderer"); await page.getByLabel("Field view", { exact: true }).selectOption("attacking-half");
  await page.getByText("Custom framing in metres", { exact: true }).click();
  await page.getByLabel("Length", { exact: true }).fill("0"); await expect(page.getByRole("button", { name: "Fit custom area" })).toBeDisabled();
  await page.getByLabel("Length", { exact: true }).fill("20"); await page.getByRole("button", { name: "Fit custom area" }).click();
  await expect(page.getByLabel("Field view", { exact: true })).toHaveValue("custom"); await expect(page.locator(".scene-diagram")).toHaveAttribute("data-revision", "1");
  await page.getByLabel("Length", { exact: true }).fill("0"); await expect(page.locator(".scene-diagram").getByRole("alert")).toContainText("Diagram unavailable");
  await page.getByLabel("Length", { exact: true }).fill("20"); await expect(page.locator(".scene-diagram").getByRole("alert")).toHaveCount(0);
  await expect.poll(async () => Number(await page.locator(".scene-diagram").getAttribute("data-width")) - (await page.locator(".scene-diagram").boundingBox())!.width).toBe(0);
});

test("calendar preview and guide use the exact pinned scene revision and representative time without writes", async ({ page }, info) => {
  const bundle = coachingSample(), session = bundle.sessions.find((s) => s.content.title === "Rondos & Positional Play")!, event = bundle.events.find((e) => e.session?.id === session.id)!;
  const fixture = tacticalExamples[0], old = { ...structuredClone(fixture.scene), organizationId: bundle.organizationId }, newer = { ...structuredClone(old), revision: 2 };
  newer.entities[0].position = { x: 80, y: 60 };
  bundle.scenes.push(old, newer); session.content.activities[0].content.area = fixture.area; session.content.activities[0].content.diagrams = [{ scene: { id: old.id, revision: 1 }, representativeSeconds: 1.5 }];
  domainBundleSchema.parse(bundle); let writes = 0;
  await page.route("**/api/organizations", (r) => r.fulfill({ json: { organizations: [{ id: bundle.organizationId, name: "Synthetic renderer club", version: 1 }] } }));
  await page.route("**/api/organizations/*/snapshot", (r) => { if (r.request().method() !== "GET") writes++; return r.fulfill({ json: { version: 1, bundle } }); });
  await page.goto(`/calendar?date=${event.localDate}`); await expect(page.getByRole("status").first()).toContainText("Loaded saved organisation snapshot");
  await expect(page.locator(".calendar-scene-preview .scene-diagram")).toHaveAttribute("data-revision", "1");
  await expect(page.locator(".calendar-scene-preview .scene-diagram")).toHaveAttribute("data-time", "1.5");
  await page.goto(guideHref({ session: session.id, revision: 1, event: event.id, bookingRevision: 1 }));
  await expect(page.locator(".guide-saved-diagram .scene-diagram")).toHaveAttribute("data-revision", "1");
  await expect(page.locator(".guide-saved-diagram .scene-diagram")).toHaveAttribute("data-time", "1.5");
  await expect(page.locator(".guide-saved-diagram [data-entity-id=ball]")).toHaveAttribute("data-world-x", "23.75");
  await page.screenshot({ path: info.outputPath("saved-guide-diagram.png"), fullPage: true }); expect(writes).toBe(0);
});
