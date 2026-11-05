import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { attachmentExample } from "../fixtures/attachments";
import { parseSessionPackageJson } from "../../lib/designer/package";

const workspace = (page: Page) => page.getByRole("region", { name: "Local diagram workspace", exact: true });
const diagrams = (page: Page) => page.getByRole("region", { name: "Activity tactical diagrams", exact: true });
async function importPlan(page: Page) {
  const pkg = attachmentExample();
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
