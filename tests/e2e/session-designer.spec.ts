import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import sharp from "sharp";
import { PDFDocument } from "pdf-lib";
import { parseSessionJson } from "../../lib/designer/contract";
import { DESIGNER_DRAFT_KEY } from "../../lib/designer/drafts";

const samplePath = "public/samples/session-designer-possession.json";
async function open(page: Page) {
  await page.goto("/session-designer", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("button", { name: "Edit session", exact: true })).toBeEnabled();
}
async function acceptFile(page: Page, path = samplePath) {
  await page.getByLabel("Choose session JSON").setInputFiles(path);
  await expect(page.getByRole("region", { name: "Import preview" })).toBeVisible();
  await page.getByRole("button", { name: "Open imported session", exact: true }).click();
  await expect(page.getByRole("region", { name: "Local session editor" })).toBeVisible();
}
async function drop(page: Page, selector: string, name: string, mimeType: string, bytes: Buffer) {
  const dataTransfer = await page.evaluateHandle(({ base64, name, mimeType }) => {
    const transfer = new DataTransfer();
    transfer.items.add(new File([Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))], name, { type: mimeType }));
    return transfer;
  }, { base64: bytes.toString("base64"), name, mimeType });
  await page.locator(selector).dispatchEvent("drop", { dataTransfer }); await dataTransfer.dispose();
}

// This suite has no hosted service dependency, including when an operator has other browser sessions.
test.beforeEach(async ({ page }) => {
  await page.route("**/*", (route) => {
    const url = new URL(route.request().url());
    return ["127.0.0.1", "localhost"].includes(url.hostname) ? route.continue() : route.abort();
  });
});

test("five activities → edit → dropped transparent crest → brand → print PDF → download → recover → reimport", async ({ page }, info) => {
  test.setTimeout(60000);
  const apiRequests: string[] = [], errors: string[] = [];
  page.on("request", (r) => { if (new URL(r.url()).pathname.startsWith("/api/")) apiRequests.push(new URL(r.url()).pathname); });
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(() => { window.print = () => { document.documentElement.dataset.printInvoked = "true"; }; });
  await open(page);
  await page.getByLabel("Choose session JSON").setInputFiles(samplePath);
  await expect(page.getByRole("region", { name: "Import preview" }).locator("li")).toHaveCount(5);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: info.outputPath("designer-importer.png") });
  await page.getByRole("button", { name: "Open imported session", exact: true }).click();
  const editor = page.getByRole("region", { name: "Local session editor" });
  await editor.locator(".designer-session-details > summary").click();
  await editor.getByLabel("Session title").fill("Build Through Pressure — Edited");
  await editor.getByLabel("Team or age group").fill("First Team");
  await editor.locator(".designer-session-details > summary").click();
  await editor.getByLabel("Setup & delivery instructions", { exact: true }).fill("Set out two passing areas.\nMove after each pass and scan before receiving.");
  await editor.getByLabel("Duration (minutes)", { exact: true }).fill("12");
  const crest = await sharp(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="900" height="1200"><path d="M70 65H830V700L450 1130 70 700Z" fill="#245A42" stroke="#E4AE41" stroke-width="45"/><text x="450" y="500" text-anchor="middle" font-family="sans-serif" font-size="150" fill="white">REVIEW</text><text x="450" y="690" text-anchor="middle" font-family="sans-serif" font-size="115" fill="white">ONLY</text></svg>')).png().toBuffer();
  await drop(page, '[data-testid="logo-drop"]', "review-only-crest.png", "image/png", crest);
  await expect(page.getByAltText("Club logo preview")).toBeVisible();
  await page.getByLabel("Club name", { exact: true }).fill("Review Club · Example Only");
  for (const [label, hex] of [["Primary", "#245A42"], ["Secondary", "#24344E"], ["Accent", "#E4AE41"]])
    await page.getByLabel(`${label} HEX`, { exact: true }).fill(hex);
  await expect(page.getByRole("status")).toContainText("Draft saved in this browser");
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: info.outputPath("designer-editor.png") });
  await page.screenshot({ path: info.outputPath("designer-logo-upload-full.png"), fullPage: true });
  await page.getByRole("button", { name: "Branded preview", exact: true }).click();
  const preview = page.getByLabel("Branded session plan", { exact: true });
  await expect(preview).toContainText("Review Club · Example Only");
  await expect(preview.locator("article")).toHaveCount(5);
  await expect(preview).toContainText("Move after each pass and scan before receiving.");
  await expect(preview.locator(".designer-plan-header")).toHaveCSS("background-color", "rgb(36, 90, 66)");
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: info.outputPath("designer-branded-preview.png") });
  await page.getByRole("button", { name: "Print / Save as PDF", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-print-invoked", "true");
  const pdfBytes = await page.pdf({ path: info.outputPath("branded-session-plan.pdf"), printBackground: true, preferCSSPageSize: true });
  const pdf = await PDFDocument.load(pdfBytes); expect(pdf.getPageCount()).toBeGreaterThan(1); expect(pdf.getPageCount()).toBeLessThan(10);
  await page.emulateMedia({ media: "print" });
  await expect(page.locator(".designer-toolbar")).toBeHidden();
  await expect(preview).toBeVisible();
  await page.screenshot({ path: info.outputPath("designer-print-preview.png"), fullPage: true });
  await page.emulateMedia({ media: "screen" });
  const downloadEvent = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download JSON", exact: true }).click();
  const download = await downloadEvent, exported = await readFile((await download.path())!, "utf8"), portable = parseSessionJson(exported);
  await download.saveAs(info.outputPath("branded-session-round-trip.json"));
  expect(portable.session.activities[0].durationMinutes).toBe(12);
  expect(portable.branding.logo?.width).toBe(384); expect(portable.branding.logo?.height).toBe(512);
  const logoBytes = Buffer.from(portable.branding.logo!.dataUrl.split(",")[1], "base64"), pixels = await sharp(logoBytes).raw().toBuffer({ resolveWithObject: true });
  expect(pixels.info.channels).toBe(4); expect(pixels.data[3]).toBe(0);
  expect(exported).not.toContain("organizationId");
  await page.reload({ waitUntil: "domcontentloaded" }); await expect(page.getByRole("status")).toContainText("Draft recovered from this browser");
  await page.getByRole("button", { name: "Edit session", exact: true }).click();
  await expect(editor.getByLabel("Session title")).toHaveValue(portable.session.name);
  await expect(editor.getByLabel("Duration (minutes)", { exact: true })).toHaveValue("12");
  await expect(page.getByAltText("Club logo preview")).toHaveAttribute("src", portable.branding.logo!.dataUrl);
  await page.getByRole("button", { name: "Import JSON", exact: true }).click();
  await page.getByLabel("Choose session JSON").setInputFiles({ name: "round-trip.json", mimeType: "application/json", buffer: Buffer.from(exported) });
  await page.getByRole("button", { name: "Open imported session", exact: true }).click();
  const roundTripEvent = page.waitForEvent("download"); await page.getByRole("button", { name: "Download JSON", exact: true }).click();
  expect(parseSessionJson(await readFile((await (await roundTripEvent).path())!, "utf8"))).toEqual(portable);
  expect(apiRequests).toEqual([]); expect(errors).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("JSON drop accepts a different session without branding, diagrams or invented quantities", async ({ page }) => {
  await open(page);
  await drop(page, '[data-testid="json-drop"]', "recovery.json", "application/json", await readFile("public/samples/session-designer-recovery.json"));
  await expect(page.getByRole("region", { name: "Import preview" })).toContainText("2 activities");
  await page.getByRole("button", { name: "Open imported session" }).click();
  await expect(page.getByLabel("Session type", { exact: true })).toHaveValue("recovery");
  await expect(page.getByLabel("Duration (minutes)", { exact: true })).toHaveValue("");
  await expect(page.getByLabel("Participants", { exact: true })).toHaveValue("");
  await expect(page.getByAltText("Club logo preview")).toHaveCount(0);
  await page.getByRole("button", { name: "Branded preview", exact: true }).click();
  await expect(page.getByLabel("Branded session plan", { exact: true })).toContainText("0 known minutes");
  await expect(page.getByLabel("Branded session plan", { exact: true })).toContainText("2 untimed activities");
  await expect(page.getByLabel("Branded session plan", { exact: true }).locator(".designer-plan-references")).toHaveCount(0);
});

test("shared activity editor adds, reorders and removes independent activities and edits diagram references", async ({ page }) => {
  await open(page); await acceptFile(page);
  await page.getByRole("button", { name: "Add activity", exact: true }).click();
  await page.getByLabel("Activity name", { exact: true }).fill("Extra decision game");
  await page.getByLabel("Duration (minutes)", { exact: true }).fill("8");
  await page.getByRole("button", { name: "Move activity up", exact: true }).click();
  await expect(page.locator(".coaching-activity-list li").nth(4)).toContainText("Extra decision game");
  await page.getByRole("button", { name: "Add diagram reference", exact: true }).click();
  await page.getByLabel("Scene ID 1", { exact: true }).fill("custom-scene");
  await page.getByLabel("Revision 1", { exact: true }).fill("3");
  await page.getByLabel("Preview seconds 1", { exact: true }).fill("2.5");
  const event = page.waitForEvent("download"); await page.getByRole("button", { name: "Download JSON", exact: true }).click();
  const result = parseSessionJson(await readFile((await (await event).path())!, "utf8"));
  expect(result.session.activities[4].diagrams[0]).toEqual({ scene: { id: "custom-scene", revision: 3 }, representativeSeconds: 2.5 });
  await page.getByRole("button", { name: "Remove activity", exact: true }).click();
  await expect(page.locator(".coaching-activity-list li")).toHaveCount(5);
});

test("paste validation and file/logo guards report errors without replacing existing work", async ({ page }) => {
  await open(page);
  await page.getByLabel("Session JSON", { exact: true }).fill('{"format":');
  await page.getByRole("button", { name: "Validate & preview import" }).click();
  await expect(page.locator(".session-designer").getByRole("alert")).toContainText("not valid JSON");
  await page.getByLabel("Session JSON", { exact: true }).fill(await readFile(samplePath, "utf8"));
  await page.getByRole("button", { name: "Validate & preview import" }).click();
  await page.getByRole("button", { name: "Open imported session" }).click();
  await page.getByLabel("Choose club logo").setInputFiles({ name: "pretend.png", mimeType: "image/png", buffer: Buffer.from("<svg onload='alert(1)'></svg>") });
  await expect(page.locator(".session-designer").getByRole("alert")).toContainText("genuine PNG or JPEG");
  await expect(page.getByLabel("Session title")).toHaveValue("Build Through Pressure");
  await page.getByLabel("Primary HEX", { exact: true }).fill("#GG0000");
  await page.getByRole("button", { name: "Branded preview", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Complete these fields" })).toContainText("six-digit HEX");
  await expect(page.getByRole("region", { name: "Local session editor" })).toBeVisible();
});

test("logo browsing, JPEG replacement and removal round-trip without stretched image metadata", async ({ page }) => {
  await open(page); await acceptFile(page, "public/samples/session-designer-recovery.json");
  for (const [name, mimeType, width, height] of [["first.png", "image/png", 200, 100], ["replacement.jpg", "image/jpeg", 100, 200]] as const) {
    const image = sharp({ create: { width, height, channels: 3, background: "#36785A" } });
    const buffer = await (mimeType === "image/png" ? image.png() : image.jpeg()).toBuffer();
    await page.getByLabel("Choose club logo").setInputFiles({ name, mimeType, buffer });
    await expect(page.getByAltText("Club logo preview")).toHaveAttribute("width", String(width));
    await expect(page.getByAltText("Club logo preview")).toHaveAttribute("height", String(height));
  }
  await page.getByRole("button", { name: "Remove logo", exact: true }).click();
  await expect(page.getByAltText("Club logo preview")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Browse files", exact: true })).toBeVisible();
});

test("storage quota denial leaves export usable and does not claim a browser save", async ({ page }) => {
  await page.addInitScript(() => { Storage.prototype.setItem = () => { throw new DOMException("Quota exceeded", "QuotaExceededError"); }; });
  await open(page); await acceptFile(page);
  await expect(page.getByRole("status")).toContainText("Draft not saved");
  const download = page.waitForEvent("download"); await page.getByRole("button", { name: "Download JSON", exact: true }).click();
  expect((await download).suggestedFilename()).toBe("Build-Through-Pressure.json");
});

test("incomplete drafts recover, and another tab's draft is never silently overwritten", async ({ page }) => {
  await open(page); await acceptFile(page);
  await page.locator(".designer-session-details > summary").click();
  await page.getByLabel("Session title").fill("");
  await page.getByLabel("Duration (minutes)", { exact: true }).fill("0");
  await expect(page.getByRole("status")).toContainText("Draft saved in this browser");
  await page.reload(); await expect(page.getByRole("status")).toContainText("Draft recovered");
  await page.getByRole("button", { name: "Edit session", exact: true }).click();
  await expect(page.getByLabel("Session title")).toHaveValue("");
  await expect(page.getByLabel("Duration (minutes)", { exact: true })).toHaveValue("0");
  const stored = await page.evaluate((key) => { const existing = localStorage.getItem(key)!; const draft = JSON.parse(existing); draft.document.session.name = "Other tab work"; const text = JSON.stringify(draft); localStorage.setItem(key, text); return text; }, DESIGNER_DRAFT_KEY);
  await page.locator(".designer-session-details > summary").click();
  await page.getByLabel("Session title").fill("My independent draft");
  await expect(page.getByRole("status")).toContainText("Another tab changed this draft");
  expect(await page.evaluate((key) => localStorage.getItem(key), DESIGNER_DRAFT_KEY)).toBe(stored);
});

test("immediate client-side navigation flushes the current draft before leaving the designer", async ({ page }) => {
  await open(page); await acceptFile(page);
  await page.locator(".designer-session-details > summary").click();
  await page.getByLabel("Session title").fill("Draft retained when navigating away");
  await page.getByRole("navigation", { name: "Main navigation" }).getByRole("link", { name: "Tactics", exact: true }).click();
  await expect(page).toHaveURL(/\/lineup$/);
  const stored = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!).document.session.name, DESIGNER_DRAFT_KEY);
  expect(stored).toBe("Draft retained when navigating away");
  await page.getByRole("navigation", { name: "Main navigation" }).getByRole("link", { name: "Session Designer", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Draft recovered");
});
