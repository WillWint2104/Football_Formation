import { test, expect, type Page } from "@playwright/test";
import { PDFDocument } from "pdf-lib";
import { coachingSample } from "../../lib/coaching/sample";
import { reviseSession } from "../../lib/coaching/sessions";
import { guideHref, MAX_PDF_BYTES } from "../../lib/documents/contracts";
import { domainBundleSchema } from "../../lib/domain/validation";

/** Strict browser HTTP stand-in; real PDF validation/RLS are exercised separately, not claimed as hosted verification. */
async function storage(page: Page, failure?: number) {
  let bundle = coachingSample(), version = 4, writes = 0;
  const source = bundle.sessions.find((s) => s.content.title === "Rondos & Positional Play")!;
  const event = bundle.events.find((e) => e.session?.id === source.id)!;
  Object.assign(source.content.activities[0].content, { playerCount: 10, area: { origin: { x: 2, y: 3 }, length: 24, width: 18 },
    equipment: [{ name: "Balls", quantity: 6 }, { name: "Markers", quantity: null }], instructions: ["Place four cones to mark the area.", "Rotate after each pass."],
    coachingPoints: ["Scan before receiving."], progressions: ["Add a neutral player."], regressions: ["Increase the area."], variations: ["Switch direction on the coach signal."] });
  const original = structuredClone(source), reference = { session: source.id, revision: 1, event: event.id, bookingRevision: 1 };
  const blobs = new Map<string, Buffer>();
  await page.route("**/api/organizations", (route) => route.fulfill({ json: { organizations: [{ id: bundle.organizationId, name: "Synthetic guide club", version }] } }));
  await page.route("**/api/organizations/*/snapshot", (route) => route.fulfill({ json: { version, bundle: domainBundleSchema.parse(bundle) } }));
  await page.route("**/api/organizations/*/sessions/*/*/documents**", async (route) => {
    const request = route.request(), parts = new URL(request.url()).pathname.split("/");
    if (request.method() === "POST") {
      writes++; if (failure) { await route.fulfill({ status: failure, json: { error: "raw-provider-private-detail" } }); return; }
      expect(request.headers()["x-expected-version"]).toBe(String(version));
      expect(request.headers()["content-type"]).toBe("application/pdf");
      expect(request.headers()["x-booking-id"]).toBe(event.id);
      const filename = decodeURIComponent(request.headers()["x-document-filename"]), id = "uploaded-coaching-pdf";
      const bytes = request.postDataBuffer()!; blobs.set(id, bytes);
      const next = structuredClone(bundle);
      next.documents.push({ schemaVersion: "1.0", organizationId: bundle.organizationId, id, revision: 1, filename, mimeType: "application/pdf", byteLength: bytes.length, storageKey: `attachment-${id}`, state: "ready", source: { kind: "upload" } });
      const draft = structuredClone(bundle.sessions.find((s) => s.id === source.id && s.revision === 1)!); draft.documents.push({ id, revision: 1 });
      const result = reviseSession(next, draft, event.id); bundle = result.bundle; version++;
      await route.fulfill({ json: { version, session: { id: result.session.id, revision: result.session.revision }, event: { id: result.event!.id, revision: result.event!.revision } } });
    } else {
      const id = parts.at(-2)!; const bytes = blobs.get(id);
      if (!bytes || parts[6] !== "2") { await route.fulfill({ status: 404, json: { error: "Document unavailable" } }); return; }
      await route.fulfill({ contentType: "application/pdf", body: bytes, headers: { "Content-Disposition": "attachment; filename=coaching.pdf", "Cache-Control": "private, no-store" } });
    }
  });
  return { original, reference, bundle: () => bundle, writes: () => writes };
}

/** Wait for the shared graph rather than rendering synthetic data during hydration. */
async function loaded(page: Page) { await expect(page.getByRole("status", { exact: true }).first()).toContainText("Loaded saved organisation snapshot"); }
/** A passive upload fixture, unrelated to illustrated guide export. */
async function pdf() { const doc = await PDFDocument.create(); doc.addPage().drawText("Synthetic PDF attachment"); return Buffer.from(await doc.save()); }

test("calendar and editor open a complete exact guide with activity navigation, coaching details and honest diagram slots", async ({ page }, info) => {
  const mock = await storage(page); await page.goto("/calendar?date=2026-11-03"); await loaded(page);
  await page.getByRole("link", { name: "Open coaching guide", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Rondos & Positional Play");
  await expect(page.getByRole("region", { name: "Session guide summary" })).toContainText("A. Carter (lead)");
  const first = page.locator(".guide-activity").first();
  for (const text of ["10", "24 × 18 m", "2, 3 m", "Balls", "6", "Markers", "Not specified", "Place four cones to mark the area.", "Rotate after each pass.", "Scan before receiving.", "Add a neutral player.", "Increase the area.", "Switch direction on the coach signal."])
    await expect(first).toContainText(text);
  await expect(page.locator(".guide-diagram-slot")).toHaveCount(4);
  await expect(page.locator(".guide-diagram-slot").first()).toContainText("No diagram attached");
  const second = mock.original.content.activities[1];
  await page.getByRole("navigation", { name: "Guide activities" }).getByRole("link").nth(1).click();
  await expect(page).toHaveURL(new RegExp(`#activity-${second.id}`));
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.evaluate(() => window.scrollTo(0, 0)); await page.screenshot({ path: info.outputPath("coaching-guide.png"), fullPage: true });
  await page.getByRole("link", { name: "Open session editor", exact: true }).click();
  await page.getByRole("link", { name: "Open saved coaching guide" }).click();
  await expect(page).toHaveURL(new RegExp(`session=${mock.reference.session}.*revision=1`));
});

test("PDF upload appends one session revision and booking pin, reopens and securely downloads without changing history", async ({ page }, info) => {
  const mock = await storage(page), bytes = await pdf(); await page.goto(guideHref(mock.reference)); await loaded(page);
  await page.getByLabel("Coaching PDF", { exact: true }).setInputFiles({ name: "coaching-plan.pdf", mimeType: "application/pdf", buffer: bytes });
  await page.getByRole("button", { name: "Attach PDF to new revision", exact: true }).click();
  await expect(page).toHaveURL(/revision=2.*bookingRevision=2/);
  await expect(page.getByRole("button", { name: "Download coaching-plan.pdf", exact: true })).toBeEnabled();
  expect(mock.writes()).toBe(1);
  expect(mock.bundle().sessions.find((s) => s.id === mock.reference.session && s.revision === 1)).toEqual(mock.original);
  await page.reload(); await loaded(page);
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Download coaching-plan.pdf", exact: true }).click()]);
  expect(download.suggestedFilename()).toBe("coaching-plan.pdf");
  await expect(page.locator(".guide-document-list")).toContainText("revision 1 · ready");
  await page.locator(".guide-documents").scrollIntoViewIfNeeded(); await page.screenshot({ path: info.outputPath("pdf-attachments.png"), fullPage: false });
  await page.goto(guideHref(mock.reference)); await loaded(page);
  await expect(page.getByText("No PDFs are attached to this revision.", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Coaching PDF", { exact: true })).toBeDisabled();
});

test("historical, missing and mismatched guides do not silently resolve newer session content", async ({ page }) => {
  const mock = await storage(page); const source = mock.bundle().sessions.find((s) => s.id === mock.reference.session)!;
  const changed = structuredClone(source); changed.content.title = "Newer session title";
  const result = reviseSession(mock.bundle(), changed, mock.reference.event); mock.bundle().sessions.push(result.session); mock.bundle().events.push(result.event!);
  await page.goto(guideHref(mock.reference)); await loaded(page);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Rondos & Positional Play");
  await expect(page.getByLabel("Coaching PDF", { exact: true })).toBeDisabled();
  await page.goto(guideHref({ ...mock.reference, revision: 99 })); await loaded(page);
  await expect(page.getByRole("heading", { name: "Requested guide revision is unavailable" })).toBeVisible();
  await page.goto(guideHref({ ...mock.reference, bookingRevision: 2 })); await loaded(page);
  await expect(page.getByRole("heading", { name: "Requested guide revision is unavailable" })).toBeVisible();
  await page.goto("/guides?session=invalid&revision=1&revision=2"); await expect(page.getByRole("heading", { name: "Invalid guide reference" })).toBeVisible();
});

test("guides present all independent session types and never invent missing timings, participants or diagrams", async ({ page }, info) => {
  const mock = await storage(page);
  for (const kind of ["conditioning", "possession", "goalkeeper", "technical", "tactical", "recovery", "testing"]) {
    const source = mock.bundle().sessions.find((s) => s.content.kind === kind)!;
    await page.goto(guideHref({ session: source.id, revision: source.revision })); await loaded(page);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(source.content.title);
    await expect(page.locator(".guide-activity")).toHaveCount(source.content.activities.length);
    await expect(page.locator(".guide-diagram-slot img")).toHaveCount(0);
    if (kind === "testing") { await page.evaluate(() => window.scrollTo(0, 0)); await page.screenshot({ path: info.outputPath("testing-guide.png"), fullPage: true }); }
  }
});

for (const status of [400, 409, 401, 503]) test(`PDF upload ${status} never claims success or retries and requires explicit recovery`, async ({ page }) => {
  const mock = await storage(page, status); await page.goto(guideHref(mock.reference)); await loaded(page);
  await page.getByLabel("Coaching PDF", { exact: true }).setInputFiles({ name: "coaching-plan.pdf", mimeType: "application/pdf", buffer: await pdf() });
  await page.getByRole("button", { name: "Attach PDF to new revision", exact: true }).click();
  await expect(page.getByText("Attachment save could not be confirmed. Reload saved records before retrying.", { exact: true })).toBeVisible();
  expect(mock.writes()).toBe(1); await expect(page.getByRole("button", { name: "Attach PDF to new revision", exact: true })).toBeDisabled();
  await expect(page.locator("body")).not.toContainText("raw-provider-private-detail");
  if (status !== 401) {
    page.once("dialog", (dialog) => dialog.accept()); await page.getByRole("button", { name: "Reload before saving", exact: true }).click(); await loaded(page);
    await expect(page.getByRole("button", { name: "Attach PDF to new revision", exact: true })).toBeDisabled();
    await expect(page.getByLabel("Coaching PDF", { exact: true })).toBeEnabled();
  }
});

test("file chooser rejects invalid types and oversized files without POST; sample mode cannot upload", async ({ page }) => {
  const mock = await storage(page); await page.goto(guideHref(mock.reference)); await loaded(page);
  for (const choice of [{ name: "wrong.html", mimeType: "text/html", buffer: Buffer.from("not a PDF") }, { name: "oversized.pdf", mimeType: "application/pdf", buffer: Buffer.alloc(MAX_PDF_BYTES + 1) }]) {
    await page.getByLabel("Coaching PDF", { exact: true }).setInputFiles(choice);
    await expect(page.locator(".guide-documents [role=alert]")).toContainText("Choose a PDF up to 3 MiB");
    await expect(page.getByRole("button", { name: "Attach PDF to new revision", exact: true })).toBeDisabled();
  }
  expect(mock.writes()).toBe(0);
  await page.unrouteAll({ behavior: "wait" }); await page.route("**/api/organizations", (route) => route.fulfill({ status: 503, json: { error: "not configured" } }));
  await page.goto(guideHref(mock.reference)); await expect(page.getByText("Illustrative sample data · not saved", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Coaching PDF", { exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Attach PDF to new revision", exact: true })).toBeDisabled();
});

test("pending and rejected attachment metadata stay visible without enabling downloads; unavailable files fail safely", async ({ page }) => {
  const mock = await storage(page), source = mock.bundle().sessions.find((s) => s.id === mock.reference.session)!;
  for (const state of ["pending", "rejected", "ready"] as const) {
    const id = `example-${state}`;
    mock.bundle().documents.push({ schemaVersion: "1.0", organizationId: mock.bundle().organizationId, id, revision: 1, filename: `${state}.pdf`, mimeType: "application/pdf", byteLength: 1200, storageKey: `attachment-${id}`, state, source: { kind: "upload" } });
    source.documents.push({ id, revision: 1 });
  }
  await page.goto(guideHref(mock.reference)); await loaded(page);
  for (const state of ["pending", "rejected"]) {
    await expect(page.locator(".guide-document-list")).toContainText(`revision 1 · ${state}`);
    await expect(page.getByRole("button", { name: `Download ${state}.pdf`, exact: true })).toBeDisabled();
  }
  await page.getByRole("button", { name: "Download ready.pdf", exact: true }).click();
  await expect(page.locator(".guide-documents [role=alert]")).toContainText("session or document is unavailable");
});
