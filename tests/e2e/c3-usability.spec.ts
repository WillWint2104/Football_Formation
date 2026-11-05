import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { attachmentExample } from "../fixtures/attachments";
import { parseSessionPackageJson } from "../../lib/designer/package";

const workspace = (page: Page) => page.getByRole("region", { name: "Local diagram workspace", exact: true });
const diagrams = (page: Page) => page.getByRole("region", { name: "Activity tactical diagrams", exact: true });
async function importPlan(page: Page, pkg = attachmentExample()) {
  await page.getByRole("button", { name: "Import JSON", exact: true }).click();
  await page.getByRole("button", { name: "Import Session & Diagrams", exact: true }).click();
  await page.getByLabel("Choose session and diagrams package").setInputFiles({ name: "rondo-package.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(pkg)) });
  await page.getByRole("checkbox", { name: "I confirm storing a new independent local package." }).check();
  await page.getByRole("button", { name: "Confirm & store locally", exact: true }).click();
  await expect(page.getByRole("region", { name: "Package import success" })).toBeVisible();
  await page.getByRole("button", { name: "Review & open imported plan", exact: true }).click();
  await expect(page.getByRole("region", { name: "Diagram recovery" })).toBeVisible();
  page.once("dialog", d => d.accept());
  await page.getByRole("button", { name: "Open reviewed plan as independent copy", exact: true }).click();
  await expect(diagrams(page)).toBeVisible();
  return pkg;
}
test.beforeEach(async ({ page, context }) => {
  await context.route("**/*", r => ["localhost", "127.0.0.1"].includes(new URL(r.request().url()).hostname) && !new URL(r.request().url()).pathname.startsWith("/api/") ? r.continue() : r.abort());
  await page.goto("/session-designer");
  await expect(page.getByRole("button", { name: "New session", exact: true })).toBeEnabled();
});

test("U02 refresh resumes overview, selected activity and exact diagram; stale preferences cannot restore content", async ({ page }, info) => {
  const pkg = attachmentExample();
  pkg.document.session.activities[0].diagrams.push({ scene: { id: pkg.scenes[0].id, revision: 2 }, representativeSeconds: 4 });
  await importPlan(page, pkg);
  const rail = page.getByRole("navigation", { name: "Session activities", exact: true });
  await rail.getByRole("button", { name: /11v11 Team Shape/ }).click();
  await page.getByRole("button", { name: "Overview", exact: true }).click();
  const key = "football-formation.session-designer.navigation.v1";
  await expect.poll(() => page.evaluate(key => JSON.parse(sessionStorage.getItem(key) ?? "{}").view, key)).toBe("overview");
  await page.reload();
  await expect(page.getByRole("button", { name: "Overview", exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Edit session", exact: true }).click();
  await expect(page.locator(".designer-selected-heading h2")).toHaveText("11v11 Team Shape");
  await rail.getByRole("button", { name: /5v2 Rondo/ }).click();
  await diagrams(page).getByRole("button", { name: /^Diagram 2 / }).click();
  await expect.poll(() => page.evaluate(key => JSON.parse(sessionStorage.getItem(key) ?? "{}").diagrams?.[0]?.revision, key)).toBe(2);
  await page.reload();
  await expect(page.locator(".designer-selected-heading h2")).toHaveText("5v2 Rondo");
  await expect(diagrams(page).getByRole("button", { name: /^Diagram 2 / })).toHaveAttribute("aria-pressed", "true");
  await page.screenshot({ path: info.outputPath("u02-after-refresh.png") });
  await page.evaluate(key => { const value = JSON.parse(sessionStorage.getItem(key)!); value.digest = "0".repeat(64); sessionStorage.setItem(key, JSON.stringify(value)); }, key);
  await page.reload();
  await expect(page.getByRole("button", { name: "Import JSON", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(workspace(page)).toContainText("Complete local plan recovered");
});

test("U01 imported plan opens through explicit review and complete backup retains exact scenes", async ({ page }, info) => {
  const pkg = await importPlan(page);
  await expect(workspace(page).locator("summary")).toContainText("Saved local plans (2)");
  await expect(page.getByRole("button", { name: "Back up session & diagrams", exact: true })).toBeEnabled();
  await expect(page.getByRole("button", { name: "Download text & references JSON", exact: true })).toBeVisible();
  const event = page.waitForEvent("download");
  await page.getByRole("button", { name: "Back up session & diagrams", exact: true }).click();
  const download = await event, file = await download.path();
  if (!file) throw Error("Complete backup not downloaded");
  const restored = parseSessionPackageJson(await readFile(file, "utf8"));
  expect(restored.ok).toBe(true); if (restored.ok) expect(restored.value).toEqual(pkg);
  await diagrams(page).getByRole("button", { name: "Add / replace diagram", exact: true }).click();
  await page.getByLabel("Local scene package").selectOption(new URL(page.url()).searchParams.get("localPlan")!);
  await expect(page.getByLabel("Scene revision").locator("option").nth(1)).toContainText("5v2 Rondo");
  await page.getByLabel("Scene revision").selectOption("0");
  await diagrams(page).locator(".diagram-pin-details summary").click();
  await expect(diagrams(page).locator(".diagram-exact-pin")).toContainText(pkg.scenes[0].id);
  await page.screenshot({ path: info.outputPath("u01-after.png") });
});

test("U03 name and duration are direct controls; known dimensions require confirmation before new authoring", async ({ page }, info) => {
  page.once("dialog", d => d.accept());
  await page.getByRole("button", { name: "New session", exact: true }).click();
  await page.getByRole("button", { name: "Add activity", exact: true }).click();
  await expect(page.getByLabel("Activity name", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Duration (minutes)", { exact: true })).toBeVisible();
  await expect(page.getByRole("region", { name: "Activity coaching information" })).toBeHidden();
  await page.getByLabel("Activity name", { exact: true }).fill("Support in a 12 x 15 grid");
  await page.getByLabel("Duration (minutes)", { exact: true }).fill("15");
  await expect(diagrams(page)).toContainText("Choose Create Diagram");
  await page.getByRole("button", { name: "Coaching information", exact: true }).click();
  await page.getByLabel("Specify field dimensions").check();
  await page.getByLabel("Length (m)", { exact: true }).fill("12");
  await page.getByLabel("Width (m)", { exact: true }).fill("15");
  page.once("dialog", async d => { expect(d.message()).toContain("12 × 15 m"); await d.dismiss(); });
  await diagrams(page).getByRole("button", { name: "Create Diagram", exact: true }).click();
  await expect(page.getByRole("region", { name: "Local tactical editor", exact: true })).toHaveCount(0);
  expect(new URL(page.url()).searchParams.has("localPlan")).toBe(false);
  await page.screenshot({ path: info.outputPath("u03-quick-activity.png") });
  page.once("dialog", d => d.accept());
  await diagrams(page).getByRole("button", { name: "Create Diagram", exact: true }).click();
  const host = page.getByRole("region", { name: "Local tactical editor", exact: true });
  await expect(host).toBeVisible();
  await host.getByRole("button", { name: "Properties", exact: true }).click();
  await expect(host.getByLabel("Area length (m)")).toHaveValue("12");
  await expect(host.getByLabel("Area width (m)")).toHaveValue("15");
  await expect(host).toContainText("Independent training area");
  await page.screenshot({ path: info.outputPath("u03-confirmed-training-area.png") });
});

test("U04 drawing guidance follows the selected tool without changing the original scene", async ({ page }, info) => {
  await importPlan(page);
  await diagrams(page).getByRole("button", { name: "Edit Diagram", exact: true }).click();
  const host = page.getByRole("region", { name: "Local tactical editor", exact: true });
  await expect(host).toBeVisible();
  const guidance = host.getByRole("status", { name: "Drawing guidance", exact: true });
  await expect(guidance).toContainText("Drag a player");
  await expect(guidance).toContainText("Shift + click toggles selection");
  await host.getByRole("button", { name: "→ Pass", exact: true }).click();
  await expect(guidance).toContainText("Drag from passer to receiver");
  await expect(guidance).toContainText("single click creates");
  await host.getByRole("button", { name: "⇢ Run", exact: true }).click();
  await expect(guidance).toContainText("end of the run");
  await host.getByRole("button", { name: "▧ Zone", exact: true }).click();
  await expect(guidance).toContainText("opposite corners");
  await expect(guidance).toContainText("Esc cancels");
  await host.getByRole("button", { name: "Expand board", exact: true }).click();
  await expect(guidance).toContainText("exits the expanded board");
  await host.getByRole("dialog", { name: "Tactical diagram editor", exact: true }).press("Escape");
  await expect(host.getByRole("region", { name: "Tactical diagram editor", exact: true })).toBeVisible();
  await page.screenshot({ path: info.outputPath("u04-tool-guidance.png") });
  await host.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(diagrams(page).locator(".scene-diagram")).toHaveAttribute("data-scene-id", attachmentExample().scenes[0].id);
});

test("review: unattached scenes retain complete backup and distinct exact scene choices", async ({ page }) => {
  const pkg = attachmentExample();
  pkg.document.session.activities.forEach(a => { a.diagrams = []; });
  await importPlan(page, pkg);
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Back up session & diagrams", exact: true }).click();
  expect(JSON.parse(await readFile((await (await download).path())!, "utf8"))).toEqual(pkg);
  await expect(page.getByRole("button", { name: "Download text & references JSON", exact: true })).toBeVisible();
  await diagrams(page).getByRole("button", { name: "Add / replace diagram", exact: true }).click();
  await page.getByLabel("Local scene package").selectOption(new URL(page.url()).searchParams.get("localPlan")!);
  const options = page.getByLabel("Scene revision").locator("option");
  await expect(options).toHaveCount(pkg.scenes.length + 1);
  const labels = (await options.allTextContents()).slice(1);
  expect(new Set(labels).size).toBe(pkg.scenes.length);
  pkg.scenes.forEach((s, i) => expect(labels[i]).toContain(s.id));
});

test("review: choosing another package clears stale import actions without losing the stored plan", async ({ page }) => {
  await importPlan(page);
  await page.getByRole("button", { name: "Import JSON", exact: true }).click();
  await expect(page.getByRole("region", { name: "Package import success" })).toBeVisible();
  const saved = page.getByRole("button", { name: /^Inspect local package / });
  const count = await saved.count();
  await page.getByLabel("Choose session and diagrams package").setInputFiles({ name: "invalid.json", mimeType: "application/json", buffer: Buffer.from("{") });
  await expect(page.getByRole("alert").filter({ hasText: "Package import needs attention" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Package import success" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Review & open imported plan", exact: true })).toHaveCount(0);
  await expect(saved).toHaveCount(count);
  await saved.first().click();
  await expect(page.getByRole("region", { name: "Inspected local package" })).toContainText(attachmentExample().document.session.name);
});
