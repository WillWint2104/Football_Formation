import { test, expect, type Page, type TestInfo } from "@playwright/test";
import { buildSync } from "esbuild";
import { attachmentExample } from "../fixtures/attachments";
import type {} from "../fixtures/companion-browser";

const bundle = buildSync({ entryPoints: ["tests/fixtures/companion-browser.ts"], bundle: true, write: false, format: "iife", platform: "browser", target: "es2022" }).outputFiles[0].text;
const phase = process.env.B4_EVIDENCE_PHASE ?? "after";
const rail = (p: Page) => p.getByRole("navigation", { name: "Session activities", exact: true });
async function openPlan(p: Page) {
  const r = await p.evaluate((pkg) => window.companionTest.browserCompanionRepository().create(pkg), attachmentExample());
  if (!r.ok) throw new Error(r.error.message);
  const status = p.getByRole("region", { name: "Local diagram workspace", exact: true });
  await status.getByRole("button", { name: "Browse local plans", exact: true }).click(); await status.getByText(/Saved local plans \(/).click();
  await status.getByRole("button", { name: `Review plan ${r.value.documentId}`, exact: true }).click();
  p.once("dialog", (d) => d.accept()); await p.getByRole("button", { name: "Open reviewed plan as independent copy", exact: true }).click();
  await expect(rail(p)).toBeVisible();
}
async function shot(p: Page, info: TestInfo, name: string) {
  await p.evaluate(() => scrollTo(0, 0)); const file = info.outputPath(`${phase}-${name}-${info.project.name}.png`);
  await p.screenshot({ path: file }); await info.attach(`${phase}-${name}`, { path: file, contentType: "image/png" });
}
test.beforeEach(async ({ page, context }) => {
  await context.addInitScript({ content: bundle });
  await context.route("**/*", (r) => ["127.0.0.1", "localhost"].includes(new URL(r.request().url()).hostname) ? r.continue() : r.abort());
  await page.goto("/session-designer", { waitUntil: "domcontentloaded" }); await expect(page.getByRole("button", { name: "Edit session", exact: true })).toBeEnabled();
});
test("actual interface comparison: import, activity workspace, overview and local host", async ({ page }, info) => {
  await shot(page, info, "import"); await openPlan(page); await shot(page, info, "activity");
  await page.getByRole("button", { name: "Overview", exact: true }).click(); await shot(page, info, "overview");
  await page.getByRole("button", { name: "Edit session", exact: true }).click();
  await page.getByRole("button", { name: "Edit Diagram", exact: true }).click(); await expect(page.getByRole("region", { name: "Local tactical editor", exact: true })).toBeVisible();
  await shot(page, info, "local-host");
});
test("scoped light navigation resets on client route changes and does not recolour tactical geometry", async ({ page }) => {
  const shell = page.locator("body"), global = page.getByRole("navigation", { name: "Main navigation", exact: true });
  await expect(shell).toHaveCSS("--color-shell", "#f3f6f7");
  const active = global.getByRole("link", { name: "Session Designer", exact: true });
  await expect(active).toHaveAttribute("aria-current", "page"); await expect(active).toHaveCSS("background-color", "rgb(23, 99, 182)");
  await expect(active).toHaveCSS("color", "rgb(255, 255, 255)");
  await openPlan(page); const diagram = page.locator(".activity-diagram-canvas .scene-diagram");
  await expect(diagram).toHaveAttribute("data-scene-id", "example-rondo"); await expect(diagram).toHaveAttribute("data-time", "2");
  await expect(diagram).toHaveAttribute("data-revision", "1");
  await global.getByRole("link", { name: "Tactics", exact: true }).click(); await expect(page).toHaveURL(/lineup$/);
  await expect(shell).toHaveCSS("--color-shell", "#101e30");
  await global.getByRole("link", { name: "Session Designer", exact: true }).click();
  await expect(shell).toHaveCSS("--color-shell", "#f3f6f7");
});
test("activity panel can collapse independently without changing selection, text, diagram pins or B2 snapshots", async ({ page }, info) => {
  await openPlan(page); const planId = new URL(page.url()).searchParams.get("localPlan")!;
  const before = await page.evaluate((id) => window.companionTest.browserCompanionRepository().read(id), planId);
  const detail = page.getByLabel("Selected activity editing area", { exact: true }), beforeWidth = (await detail.boundingBox())!.width;
  await page.getByRole("button", { name: "Hide activities", exact: true }).click(); await expect(rail(page)).toBeHidden();
  const show = page.getByRole("button", { name: "Show activities", exact: true }); await expect(show).toHaveAttribute("aria-expanded", "false");
  expect((await detail.boundingBox())!.width).toBeGreaterThan(beforeWidth + 200); await expect(page.getByLabel("Activity name", { exact: true })).toHaveValue("5v2 Rondo");
  await shot(page, info, "activities-hidden"); await show.focus(); await page.keyboard.press("Enter");
  await expect(rail(page)).toBeVisible(); await expect(rail(page).locator('[aria-current="step"]')).toContainText("5v2 Rondo");
  await expect(rail(page).locator('[aria-current="step"]')).toContainText("1 diagram reference");
  await rail(page).getByRole("button").first().focus(); await page.keyboard.press("ArrowDown");
  await expect(rail(page).locator('[aria-current="step"]')).toBeFocused(); await expect(page.getByLabel("Activity name", { exact: true })).toHaveValue("11v11 Team Shape");
  expect(await rail(page).locator('[aria-current="step"]').evaluate((el) => getComputedStyle(el).outlineWidth)).toBe("3px");
  expect(await page.evaluate((id) => window.companionTest.browserCompanionRepository().read(id), planId)).toEqual(before);
});
test("readable cards and primary controls meet measured text contrast and remain in the desktop viewport", async ({ page }, info) => {
  await openPlan(page);
  const samples = await page.evaluate(() => {
    const luminance = (c: string) => { const channels = c.match(/[\d.]+/g)!.slice(0, 3).map(Number).map((n) => { n /= 255; return n <= .04045 ? n / 12.92 : ((n + .055) / 1.055) ** 2.4; }); return channels[0] * .2126 + channels[1] * .7152 + channels[2] * .0722; };
    const contrast = (fg: string, bg: string) => { const a = luminance(fg), b = luminance(bg); return (Math.max(a, b) + .05) / (Math.min(a, b) + .05); };
    const chosen = document.querySelector('.coaching-activity-list [aria-current="step"]')!, styles = getComputedStyle(chosen);
    const nav = document.querySelector('nav[aria-label="Main navigation"] [aria-current="page"]')!, n = getComputedStyle(nav);
    const sub = getComputedStyle(chosen.querySelector("small")!);
    return { nav: contrast(n.color, n.backgroundColor), card: contrast(styles.color, styles.backgroundColor), secondary: contrast(sub.color, styles.backgroundColor), font: parseFloat(sub.fontSize) };
  });
  expect(samples.nav).toBeGreaterThanOrEqual(4.5); expect(samples.card).toBeGreaterThanOrEqual(4.5); expect(samples.secondary).toBeGreaterThanOrEqual(4.5); expect(samples.font).toBeGreaterThanOrEqual(14);
  await info.attach(`contrast-${info.project.name}`, { body: JSON.stringify(samples, null, 2), contentType: "application/json" });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const railBox = (await rail(page).boundingBox())!; expect(railBox.y + railBox.height).toBeLessThanOrEqual((await page.viewportSize())!.height + 1);
});
test("removing the last activity with navigation hidden leaves Add activity available", async ({ page }) => {
  await openPlan(page); await page.getByRole("button", { name: "Hide activities", exact: true }).click();
  await page.getByRole("button", { name: "Remove activity", exact: true }).click(); await page.getByRole("button", { name: "Remove activity", exact: true }).click();
  await expect(rail(page)).toBeVisible(); await rail(page).getByRole("button", { name: "Add activity", exact: true }).click();
  await expect(page.getByLabel("Activity name", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Show activities", exact: true })).toBeVisible();
});
