import { test, expect, type Page } from "@playwright/test";
import { libraryPreviewExample } from "../fixtures/library-preview";
import { domainBundleSchema } from "../../lib/domain/validation";
import { sessionCopyIds, type SessionCopyRequest } from "../../lib/coaching/session-copy";

/** Contract stand-in only: no authentication, hosted calls, credentials or C3 package writes. */
async function storage(page: Page, failure?: number | "lost-ack", multipleBookings = false) {
  let bundle = libraryPreviewExample(), version = 4, writes = 0;
  if (multipleBookings) {
    const original = bundle.events.find(e => e.id === "sample-4")!;
    bundle.events.push({ ...structuredClone(original), id: "other-rondo-booking", localDate: "2026-11-10",
      startsAt: "2026-11-10T06:00:00Z", endsAt: "2026-11-10T07:20:00Z" });
    bundle = domainBundleSchema.parse(bundle);
  }
  await page.context().route("**/*", (r) => ["127.0.0.1", "localhost"].includes(new URL(r.request().url()).hostname) ? r.continue() : r.abort());
  await page.route("**/api/**", (r) => r.abort());
  await page.route("**/api/organizations", (r) => r.fulfill({ json: { organizations: [{ id: bundle.organizationId, name: "Synthetic B1 coaching club", version }] } }));
  await page.route("**/api/organizations/*/snapshot", async (r) => {
    if (r.request().method() !== "POST") return r.fulfill({ json: { version, bundle } });
    writes++;
    const body = r.request().postDataJSON(); expect(Object.keys(body).sort()).toEqual(["bundle", "expectedVersion"]);
    if (body.expectedVersion !== version) return r.fulfill({ status: 409, json: { error: "Conflict" } });
    await new Promise((resolve) => setTimeout(resolve, 180));
    if (typeof failure === "number") return r.fulfill({ status: failure, json: { error: "Internal provider detail" } });
    bundle = domainBundleSchema.parse(body.bundle); version++;
    if (failure === "lost-ack") return r.abort();
    return r.fulfill({ json: { version } });
  });
  const source = bundle.sessions.find((s) => s.content.title === "Rondos & Positional Play")!;
  return { source, before: structuredClone(bundle), href: `/sessions?session=${source.id}&revision=1&organization=${bundle.organizationId}&view=preview`, bundle: () => bundle, writes: () => writes,
    newer() { bundle.sessions.push({ ...structuredClone(source), revision: 2, content: { ...structuredClone(source.content), objective: "A newer source objective" } }); version++; } };
}

test("Explorer preserves search and exact booking identity through preview, refresh, edit, copy cancellation and close", async ({ page }) => {
  const m = await storage(page, undefined, true);
  await page.goto("/sessions");
  await loaded(page);
  const search = page.getByRole("searchbox", { name: "Find sessions" });
  const type = page.getByRole("combobox", { name: "Filter session type" });
  await search.fill("5v2");
  await type.selectOption("possession");
  const results = page.locator(".explorer-list").getByRole("link", { name: /Rondos & Positional Play/ });
  await expect(results).toHaveCount(2);
  const secondBooking = results.filter({ hasText: "2026-11-10" });
  await secondBooking.focus();
  await page.keyboard.press("Enter");
  const preview = page.getByRole("region", { name: "Saved session preview" });
  await expect(preview).toBeVisible();
  await expect(page.locator(".coaching-editor")).toHaveCount(0);
  await expect(secondBooking).toHaveAttribute("aria-current", "true");
  await expect(results.filter({ hasNotText: "2026-11-10" })).not.toHaveAttribute("aria-current", "true");
  await expect(page).toHaveURL(/booking=other-rondo-booking&bookingRevision=1&q=5v2&type=possession/);
  await expect(preview.getByRole("link", { name: "Open Full Session" })).toHaveAttribute("href", /\/sessions\/view\?.*booking=other-rondo-booking&bookingRevision=1/);
  await page.reload();
  await loaded(page);
  await expect(search).toHaveValue("5v2");
  await expect(type).toHaveValue("possession");
  const edit = preview.getByRole("link", { name: "Edit session", exact: true });
  await expect(edit).toHaveAttribute("href", `/sessions?event=other-rondo-booking&revision=1&organization=${m.source.organizationId}&q=5v2&type=possession`);
  await edit.click();
  await expect(page.locator(".coaching-editor")).toBeVisible();
  await page.getByRole("link", { name: "Preview saved session", exact: true }).click();
  await expect(secondBooking).toHaveAttribute("aria-current", "true");
  await preview.getByRole("button", { name: "Schedule independent copy" }).click();
  await page.getByRole("button", { name: "Close scheduling form" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(secondBooking).toHaveAttribute("aria-current", "true");
  await preview.getByRole("link", { name: "Close preview" }).click();
  await expect(preview).toHaveCount(0);
  await expect(search).toHaveValue("5v2");
  await page.goBack();
  await expect(secondBooking).toHaveAttribute("aria-current", "true");
  const missingBooking = new URL(page.url());
  missingBooking.searchParams.set("bookingRevision", "999");
  await page.goto(missingBooking.toString());
  await expect(page.getByRole("heading", { name: "Requested revision is unavailable" })).toBeVisible();
  await expect(preview).toHaveCount(0);
  await page.goto("/sessions?event=other-rondo-booking&revision=1&organization=another-club");
  await loaded(page);
  await expect(page.getByRole("heading", { name: "Requested revision is unavailable" })).toBeVisible();
  await expect(page.locator(".coaching-editor")).toHaveCount(0);
  expect(m.writes()).toBe(0);
  expect(m.bundle()).toEqual(m.before);
});
async function loaded(page: Page) { await expect(page.locator(".calendar-connection [role=status]")).toContainText("Loaded saved organisation snapshot"); }
async function slot(page: Page) {
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Start date").fill("2026-11-11"); await dialog.getByLabel("End date").fill("2026-11-11");
  await dialog.getByLabel("Start time").fill("17:00"); await dialog.getByLabel("End time").fill("18:15");
  return dialog;
}

test("saved preview shows exact activity/diagram associations, unknown facts and keyboard navigation without mutating records", async ({ page }, info) => {
  const m = await storage(page); await page.goto("/sessions?event=sample-4&revision=1"); await loaded(page);
  await page.getByRole("link", { name: "Preview saved session", exact: true }).click();
  const preview = page.getByRole("region", { name: "Saved session preview" });
  await expect(preview.getByRole("heading", { name: "Rondos & Positional Play" })).toBeVisible();
  await expect(preview).toContainText("65 known min"); await expect(preview).toContainText("1 untimed");
  await expect(preview).toContainText("A. Carter (lead)"); await expect(preview).toContainText("M. Lopez (assistant)");
  await expect(preview.locator('.scene-diagram')).toHaveAttribute("data-revision", "1"); await expect(preview.locator('.scene-diagram')).toHaveAttribute("data-time", "2");
  await expect(preview).toContainText("Balls · quantity not specified");
  await preview.getByRole("button", { name: "Diagram 2 · r2", exact: true }).click();
  await expect(preview.locator('.scene-diagram')).toHaveAttribute("data-revision", "2"); await expect(preview.locator('.scene-diagram')).toHaveAttribute("data-time", "4");
  await page.screenshot({ path: info.outputPath("library-preview-viewport.png") });
  await page.screenshot({ path: info.outputPath("library-preview.png"), fullPage: true });
  const first = preview.getByRole("navigation", { name: "Preview activity sequence" }).getByRole("button").first(); await first.focus(); await page.keyboard.press("Enter");
  await expect(preview.getByRole("article", { name: "Preview activity details" })).toContainText("Duration not specified");
  await expect(preview.locator('.scene-diagram')).toHaveCount(0);
  await page.reload(); await loaded(page); await expect(page.getByRole("region", { name: "Saved session preview" })).toBeVisible();
  expect(m.writes()).toBe(0); expect(m.bundle()).toEqual(m.before);
});

test("schedule copy commits once, survives refresh and opens the correct calendar booking; original remains unchanged", async ({ page }, info) => {
  const m = await storage(page); await page.goto(m.href); await loaded(page);
  await page.getByRole("button", { name: "Schedule independent copy", exact: true }).click(); const dialog = await slot(page);
  await expect(dialog.getByLabel("Team", { exact: true })).toBeDisabled(); await expect(dialog.getByLabel("Session title", { exact: true })).toHaveValue(m.source.content.title);
  const requestId = new URL(page.url()).searchParams.get("copy")!;
  const request: SessionCopyRequest = { organizationId: m.source.organizationId, source: { id: m.source.id, revision: 1 }, requestId };
  await page.screenshot({ path: info.outputPath("schedule-copy-dialog.png") });
  await dialog.locator('form').evaluate((f: HTMLFormElement) => { f.requestSubmit(); f.requestSubmit(); });
  await expect(page.locator('.library-preview-completed')).toBeVisible(); expect(m.writes()).toBe(1);
  await page.screenshot({ path: info.outputPath("independent-copy-saved-viewport.png") });
  const ids = sessionCopyIds(request), copy = m.bundle().sessions.find((s) => s.id === ids.sessionId)!;
  expect(copy.content).toEqual(m.source.content); expect(copy.documents).toEqual([]);
  expect(m.bundle().sessions.filter((s) => s.id === m.source.id)).toEqual(m.before.sessions.filter((s) => s.id === m.source.id));
  expect(m.bundle().events.filter((e) => e.id !== ids.eventId)).toEqual(m.before.events);
  await page.reload(); await loaded(page); await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator('.library-preview-completed')).toBeVisible(); expect(m.writes()).toBe(1);
  await page.screenshot({ path: info.outputPath("independent-copy-saved.png"), fullPage: true });
  await page.getByRole("link", { name: "Open scheduled occurrence", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`event=${ids.eventId}`));
  await expect(page.getByRole("complementary", { name: "Session preview" })).toContainText("17:00");
  await page.getByRole("link", { name: "Open Session", exact: true }).click();
  await page.getByRole("textbox", { name: "Session objective", exact: true }).fill("Only the scheduled copy changes");
  await page.getByRole("button", { name: "Save Session & Return", exact: true }).click();
  await expect(page).toHaveURL(/bookingRevision=2/);
  expect(m.bundle().sessions.find((s) => s.id === m.source.id)!.content.objective).toEqual(m.source.content.objective);
  expect(m.bundle().sessions.find((s) => s.id === ids.sessionId && s.revision === 2)!.content.objective).toBe("Only the scheduled copy changes");
});

for (const failure of [409, 503] as const) test(`copy save ${failure} leaves no partial booking, disables resubmission and requires explicit reload`, async ({ page }, info) => {
  const m = await storage(page, failure); await page.goto(m.href); await loaded(page);
  await page.getByRole("button", { name: "Schedule independent copy", exact: true }).click(); const dialog = await slot(page);
  await dialog.getByRole("button", { name: "Save booking", exact: true }).click();
  await expect(page.getByRole("button", { name: "Reload before saving", exact: true })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Save booking", exact: true })).toBeDisabled();
  await expect(page.locator('.library-preview-completed')).toHaveCount(0); expect(m.writes()).toBe(1); expect(m.bundle()).toEqual(m.before);
  await expect(dialog.locator('[role=alert]')).not.toContainText("Internal provider detail");
  await page.screenshot({ path: info.outputPath(`recoverable-${failure}.png`) });
  await page.reload(); await loaded(page); await expect(page.getByRole("dialog")).toBeVisible(); expect(m.writes()).toBe(1);
});

test("lost save acknowledgement reloads the same request identity and discovers its one committed copy", async ({ page }) => {
  const m = await storage(page, "lost-ack"); await page.goto(m.href); await loaded(page);
  await page.getByRole("button", { name: "Schedule independent copy", exact: true }).click(); const dialog = await slot(page);
  const url = page.url(); await dialog.getByRole("button", { name: "Save booking", exact: true }).click();
  await expect(page.getByRole("button", { name: "Reload before saving", exact: true })).toBeVisible(); expect(m.writes()).toBe(1);
  await page.reload(); await loaded(page); expect(page.url()).toBe(url);
  await expect(page.locator('.library-preview-completed')).toBeVisible(); await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(m.writes()).toBe(1); expect(m.bundle().sessions.filter((s) => s.id.startsWith('scheduled-session-'))).toHaveLength(1);
});

test("wrong organisation, missing and stale revisions cannot schedule; C3 local storage is not read or uploaded", async ({ page }) => {
  const m = await storage(page); await page.goto(m.href); await loaded(page);
  await page.evaluate(() => localStorage.setItem('c4-local-boundary-sentinel', 'synthetic local package remains separate'));
  await page.goto(m.href.replace(`organization=${m.source.organizationId}`, 'organization=another-club')); await loaded(page);
  await expect(page.getByRole("heading", { name: "Requested revision is unavailable" })).toBeVisible();
  await page.goto(m.href.replace('revision=1', 'revision=999')); await loaded(page);
  await expect(page.getByRole("heading", { name: "Requested revision is unavailable" })).toBeVisible();
  m.newer(); await page.goto(m.href); await loaded(page);
  await expect(page.getByRole("button", { name: "Schedule independent copy", exact: true })).toBeDisabled();
  await expect(page.getByText("A newer source revision exists.", { exact: false })).toBeVisible();
  await page.getByRole("link", { name: "Use Latest Available Version", exact: true }).click();
  await expect(page.getByRole("region", { name: "Saved session preview" })).toContainText("A newer source objective");
  expect(await page.evaluate(() => localStorage.getItem('c4-local-boundary-sentinel'))).toBe('synthetic local package remains separate'); expect(m.writes()).toBe(0);
  await page.goto(m.href+'&copy=invalid'); await expect(page.getByRole("heading", { name: "Invalid session reference" })).toBeVisible();
});

test("review B distinguishes an invalid diagram index and keeps the exact attachments selectable", async ({ page }) => {
  const m = await storage(page);
  const links = m.source.content.activities[1];
  await page.goto(`${m.href}&activity=${links.id}&diagram=2`);
  const preview = page.getByRole("region", { name: "Saved session preview" });
  await expect(preview.locator(".scene-diagram")).toHaveAttribute("data-revision", "2");
  await expect(preview.locator(".scene-diagram")).toHaveAttribute("data-time", "4");

  links.content.diagrams.pop();
  await page.reload();
  await expect(preview.getByRole("alert")).toHaveText("The requested diagram is unavailable. Choose an attached diagram.");
  await expect(preview.locator(".scene-diagram")).toHaveCount(0);
  const diagram = preview.getByRole("button", { name: "Diagram 1 · r1" });
  const open = preview.getByRole("link", { name: "Open Full Session" });
  await expect(open).toHaveAttribute("href", /[?&]diagram=2(?:&|$)/);
  await open.click();
  const board = page.getByRole("region", { name: "Tactical workspace" });
  await expect(board.getByRole("alert")).toHaveText("The selected diagram revision is unavailable.");
  await expect(board.locator(".scene-diagram")).toHaveCount(0);
  await board.getByRole("button", { name: "Diagram 1", exact: true }).click();
  await expect(board.locator(".scene-diagram")).toHaveAttribute("data-time", "2");
  await page.goBack();
  await expect(diagram).toHaveAttribute("aria-pressed", "false");
  await diagram.click();
  await expect(preview.locator(".scene-diagram")).toHaveAttribute("data-revision", "1");
  await expect(preview.locator(".scene-diagram")).toHaveAttribute("data-time", "2");
  await preview.getByRole("navigation", { name: "Preview activity sequence" }).getByRole("button").first().click();
  await expect(preview.getByText("No diagram attached to this activity.")).toBeVisible();
  expect(m.writes()).toBe(0);
});
