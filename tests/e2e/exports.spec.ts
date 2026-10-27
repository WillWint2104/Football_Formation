import { test, expect, type Page } from "@playwright/test";
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { PDFDocument } from "pdf-lib";
import { exportFixture } from "../documents/export-fixtures";
import { guideHref } from "../../lib/documents/contracts";
import type { ObjectRecord } from "../../lib/server/repositories/documents";
import type { DomainBundle } from "../../lib/domain/validation";

type Reply = { status: number; headers: Record<string, string>; body: string; bundle: DomainBundle; version: number; records: ObjectRecord[]; blobs: Record<string, string> };
/** Run the actual generator/handlers in their server-only Node condition, without enabling hosted Auth or Storage. */
function worker(input: unknown): Promise<Reply> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["--conditions=react-server", "--import", "tsx", "tests/documents/export-worker.ts"], { cwd: process.cwd(), windowsHide: true });
    const timeout = setTimeout(() => { child.kill(); reject(new Error("Export test worker timed out")); }, 20_000);
    let stdout = "", stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; }); child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", (error) => { clearTimeout(timeout); reject(error); }); child.on("close", (code) => { clearTimeout(timeout); if (code) reject(new Error(stderr)); else { try { resolve(JSON.parse(stdout)); } catch (error) { reject(error); } } });
    child.stdin.end(JSON.stringify(input));
  });
}

/** Only Auth/snapshot/blob services are simulated; POST generation and GET authorization use production handlers. */
async function storage(page: Page, failure = false) {
  const initial = exportFixture("possession"); let bundle = initial.bundle, version = 4, posts = 0, records: ObjectRecord[] = [], blobs: Record<string, string> = {};
  await page.route("**/api/organizations", (route) => route.fulfill({ json: { organizations: [{ id: bundle.organizationId, name: "Synthetic PDF review club", version }] } }));
  await page.route("**/api/organizations/*/snapshot", (route) => route.fulfill({ json: { version, bundle } }));
  await page.route(/\/api\/organizations\/[^/]+\/sessions\/[^/]+\/\d+\/(exports|documents\/[^/]+\/\d+)$/, async (route) => {
    if (route.request().method() === "POST") posts++;
    const reply = await worker({ bundle, version, method: route.request().method(), url: route.request().url(), headers: route.request().headers(), failSave: failure, records, blobs });
    ({ bundle, version, records, blobs } = reply); await route.fulfill({ status: reply.status, headers: reply.headers, body: Buffer.from(reply.body, "base64") });
  });
  return { reference: initial.reference, original: structuredClone(bundle), bundle: () => bundle, posts: () => posts,
    reschedule: () => { const booking = structuredClone(bundle.events.find((event) => event.id === initial.reference.event)!); booking.revision = 2; booking.localDate = "2026-11-04";
      if (booking.startsAt) booking.startsAt = new Date(Date.parse(booking.startsAt) + 86_400_000).toISOString().replace(".000Z", "Z"); if (booking.endsAt) booking.endsAt = new Date(Date.parse(booking.endsAt) + 86_400_000).toISOString().replace(".000Z", "Z"); bundle.events.push(booking); version++; },
    later: () => { const session = bundle.sessions.find((s) => s.id === initial.reference.session)!; bundle.sessions.push({ ...structuredClone(session), revision: 2, content: { ...structuredClone(session.content), title: "Later changed coaching plan" } });
      const booking = bundle.events.find((e) => e.id === initial.reference.event)!; if (booking.kind === "training" || booking.kind === "testing") bundle.events.push({ ...structuredClone(booking), revision: 2, session: { id: session.id, revision: 2 } }); version++; } };
}

/** Wait for the saved graph before interacting with export controls. */
async function loaded(page: Page) { await expect(page.locator(".calendar-connection [role=status]")).toContainText("Loaded saved organisation snapshot"); }

test("generate a real private illustrated PDF, reopen it and download the historical exact revision", async ({ page }, info) => {
  const mock = await storage(page), errors: string[] = []; page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(guideHref(mock.reference)); await loaded(page);
  await page.getByRole("button", { name: "Generate illustrated PDF", exact: true }).click();
  const downloadButton = page.getByRole("button", { name: "Download illustrated PDF 1", exact: true }); await expect(downloadButton).toBeEnabled();
  await expect(page.getByText(/Original booking 2026-11-03 · booking revision 1/)).toBeVisible();
  expect(mock.posts()).toBe(1); expect(mock.bundle().sessions).toEqual(mock.original.sessions); expect(mock.bundle().events).toEqual(mock.original.events);
  expect(mock.bundle().templates).toEqual(mock.original.templates); expect(mock.bundle().scenes).toEqual(mock.original.scenes);
  await page.getByRole("heading", { name: "Illustrated coaching PDF", exact: true }).scrollIntoViewIfNeeded(); await page.screenshot({ path: info.outputPath("illustrated-export.png"), fullPage: false });
  mock.later(); await page.reload(); await loaded(page); await expect(page.getByText(/Historical snapshot or session viewed/)).toBeVisible();
  const [download] = await Promise.all([page.waitForEvent("download"), downloadButton.click()]);
  const bytes = await readFile((await download.path())!), pdf = await PDFDocument.load(bytes);
  expect(pdf.getTitle()).toBe("Rondos & Positional Play"); expect(JSON.parse(pdf.getSubject()!).session.revision).toBe(1); expect(pdf.getPageCount()).toBe(1);
  expect(mock.posts()).toBe(1); expect(errors).toEqual([]);
  await page.getByLabel("Document layout").selectOption("extended-pack"); await page.getByLabel("Include dedicated cover").check();
  await page.getByRole("button", { name: "Generate illustrated PDF", exact: true }).click(); const second = page.getByRole("button", { name: "Download illustrated PDF 2", exact: true }); await expect(second).toBeEnabled();
  const [packDownload] = await Promise.all([page.waitForEvent("download"), second.click()]);
  const pack = await PDFDocument.load(await readFile((await packDownload.path())!)); expect(JSON.parse(pack.getSubject()!).design).toMatchObject({ template: "extended-pack", cover: true }); expect(pack.getPageCount()).toBe(2);
  expect(mock.posts()).toBe(2);
});

test("rescheduling preserves and labels each export's original booking revision", async ({ page }) => {
  const mock = await storage(page); await page.goto(guideHref(mock.reference)); await loaded(page);
  await page.getByRole("button", { name: "Generate illustrated PDF", exact: true }).click(); await expect(page.getByRole("button", { name: "Download illustrated PDF 1", exact: true })).toBeEnabled();
  mock.reschedule(); await page.goto(guideHref({ ...mock.reference, bookingRevision: 2 })); await loaded(page);
  await expect(page.getByText(/Original booking 2026-11-03 · booking revision 1/)).toBeVisible();
  await page.getByRole("button", { name: "Generate illustrated PDF", exact: true }).click(); await expect(page.getByRole("button", { name: "Download illustrated PDF 2", exact: true })).toBeEnabled();
  await expect(page.getByText(/Original booking 2026-11-04 · booking revision 2/)).toBeVisible(); expect(mock.posts()).toBe(2);
});

test("an uncertain export blocks repeat writes until explicit reload and never claims success", async ({ page }) => {
  page.on("dialog", (dialog) => dialog.accept());
  const mock = await storage(page, true); await page.goto(guideHref(mock.reference)); await loaded(page);
  await page.getByRole("button", { name: "Generate illustrated PDF", exact: true }).click();
  await expect(page.getByRole("button", { name: "Generate illustrated PDF", exact: true })).toBeDisabled();
  await expect(page.getByRole("alert").filter({ hasText: "Export could not be confirmed" })).toBeVisible(); expect(mock.posts()).toBe(1);
  expect(mock.bundle().documents).toEqual(mock.original.documents); await expect(page.getByRole("button", { name: /Download illustrated PDF/ })).toHaveCount(0);
  await page.getByRole("button", { name: "Reload before saving", exact: true }).click(); await expect(page.getByRole("button", { name: "Generate illustrated PDF", exact: true })).toBeEnabled(); expect(mock.posts()).toBe(1);
});

test("sample guides cannot generate private exports", async ({ page }) => {
  await page.goto(guideHref({ session: "sample-3", revision: 1 }));
  await expect(page.getByRole("button", { name: "Generate illustrated PDF", exact: true })).toBeDisabled();
  await expect(page.getByText("Sign in to a configured organisation to generate and save private coaching PDFs.")).toBeVisible();
});
