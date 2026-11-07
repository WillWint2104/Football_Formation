import { test, expect, type Page } from "@playwright/test";
import { libraryPreviewExample } from "../fixtures/library-preview";
import { domainBundleSchema } from "../../lib/domain/validation";

/** Isolated synthetic HTTP contract. External hosts and all unhandled APIs are blocked. */
async function storage(page: Page, failure?: number | "lost-ack") {
  let bundle = libraryPreviewExample(), version = 4, writes = 0;
  const source = bundle.sessions.find((s) => s.content.title === "Rondos & Positional Play")!;
  const originalEvent = bundle.events.find((e) => e.session?.id === source.id)!;
  bundle.documents.push({ schemaVersion: "1.0", organizationId: bundle.organizationId, id: "historical-pdf", revision: 1, filename: "session-booked-2026-11-03-r1.pdf", mimeType: "application/pdf", byteLength: 20, storageKey: "synthetic/historical.pdf", state: "ready",
    source: { kind: "generated-guide", session: { id: source.id, revision: source.revision }, scenes: source.content.activities.flatMap((a) => a.content.diagrams.map((d) => d.scene)), rendererVersion: "synthetic-test" } });
  const recovery = { ...structuredClone(source), id: "recovery-plan", content: { ...structuredClone(source.content), kind: "recovery" as const, title: "Recovery & mobility" } };
  bundle.sessions.push(recovery);
  bundle.events.push({ ...structuredClone(originalEvent), kind: "training", id: "recovery-event", localDate: "2026-11-06", startsAt: null, endsAt: null, title: recovery.content.title, session: { id: recovery.id, revision: 1 } },
    { ...structuredClone(originalEvent), id: "match-event", localDate: "2026-11-07", startsAt: null, endsAt: null, title: "First Team v Visitors", kind: "fixture", session: null });
  bundle = domainBundleSchema.parse(bundle);
  const before = structuredClone(bundle);
  await page.context().route("**/*", (r) => ["127.0.0.1", "localhost"].includes(new URL(r.request().url()).hostname) ? r.continue() : r.abort());
  await page.route("**/api/**", (r) => r.abort());
  await page.route("**/api/organizations", (r) => r.fulfill({ json: { organizations: [{ id: bundle.organizationId, name: "Synthetic planning club", version }] } }));
  await page.route("**/api/organizations/*/snapshot", async (r) => {
    if (r.request().method() !== "POST") return r.fulfill({ json: { version, bundle } });
    writes++; const input = r.request().postDataJSON();
    expect(Object.keys(input).sort()).toEqual(["bundle", "expectedVersion"]);
    if (input.expectedVersion !== version) return r.fulfill({ status: 409, json: { error: "Conflict" } });
    await new Promise((resolve) => setTimeout(resolve, 180));
    if (typeof failure === "number") return r.fulfill({ status: failure, json: { error: "Private provider detail" } });
    bundle = domainBundleSchema.parse(input.bundle); version++;
    if (failure === "lost-ack") return r.abort();
    return r.fulfill({ json: { version } });
  });
  return { source, originalEvent, before, bundle: () => bundle, writes: () => writes,
    root: `/calendar?date=2026-11-11&view=week&organization=${bundle.organizationId}&team=first-team`,
    newer() { bundle.sessions.push({ ...structuredClone(source), revision: 2 }); version++; } };
}
async function loaded(page: Page) { await expect(page.locator(".calendar-connection [role=status]")).toContainText("Loaded saved organisation snapshot"); }
async function browse(page: Page) { await page.getByRole("button", { name: "Browse Session Library", exact: true }).first().click(); return page.getByRole("dialog"); }
async function preview(page: Page) {
  const picker = await browse(page);
  await picker.getByLabel("Find sessions").fill("5v2");
  await picker.getByLabel("Filter session type").selectOption("possession");
  await picker.getByRole("button", { name: "Preview session · r1", exact: true }).click();
  await expect(page.getByRole("region", { name: "Saved session preview" })).toBeVisible();
}
async function copy(page: Page) {
  await page.getByRole("button", { name: "Schedule independent copy", exact: true }).click();
  const form = page.getByRole("dialog", { name: "Schedule independent copy" });
  await expect(form.getByLabel("Start date")).toHaveValue("2026-11-11");
  await form.getByLabel("Start time").fill("17:00"); await form.getByLabel("End time").fill("18:15");
  return form;
}

test("Calendar context survives picker, preview, cancellation, refresh and Back/Forward without mutations", async ({ page }, info) => {
  const m = await storage(page); await page.goto(`${m.root}&event=${m.originalEvent.id}&bookingRevision=1`); await loaded(page);
  const origin = page.url(); await page.screenshot({ path: info.outputPath("calendar-selected-week.png") });
  const picker = await browse(page); await expect(picker).toContainText("2026-11-11 · week view · First Team");
  await page.screenshot({ path: info.outputPath("calendar-library-picker.png") });
  await picker.getByLabel("Find sessions").fill("5v2"); await picker.getByLabel("Filter session type").selectOption("possession"); await picker.getByRole("button", { name: "Preview session · r1", exact: true }).click();
  await expect(page.getByRole("region", { name: "Saved session preview" })).toBeVisible();
  const previewUrl = page.url();
  await page.reload(); await loaded(page); await expect(page.getByRole("region", { name: "Saved session preview" })).toBeVisible();
  await page.goBack(); await expect(page.getByRole("heading", { name: "Choose a coaching session" })).toBeVisible();
  await page.goForward(); expect(page.url()).toBe(previewUrl);
  await expect(page.locator('.scene-diagram').last()).toHaveAttribute("data-revision", "1");
  await page.getByRole("button", { name: "Cancel · return to Calendar" }).click();
  await expect(page).toHaveURL(origin); await expect(page.getByRole("button", { name: "Week", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByLabel("Team", { exact: true })).toHaveValue("first-team");
  await expect(page.getByRole("complementary", { name: "Session preview" })).toContainText(m.source.content.title);
  await expect(page.getByLabel("Selected date")).toBeFocused();
  expect(m.writes()).toBe(0); expect(m.bundle()).toEqual(m.before);
});

test("preview schedules one independent copy and returns to its actual date, team and weekly booking", async ({ page }, info) => {
  const m = await storage(page); await page.goto(`${m.root}&type=goalkeeper`); await loaded(page);
  await preview(page);
  const region = page.getByRole("region", { name: "Saved session preview" });
  await region.getByRole("button", { name: "Diagram 2 · r2", exact: true }).click();
  await expect(region.locator('.scene-diagram')).toHaveAttribute("data-time", "4");
  await page.screenshot({ path: info.outputPath("calendar-session-preview-viewport.png") });
  await page.screenshot({ path: info.outputPath("calendar-session-preview.png"), fullPage: true });
  const form = await copy(page); const request = new URL(page.url()).searchParams.get("copy")!;
  await expect(form.getByLabel("Team", { exact: true })).toBeDisabled();
  await page.screenshot({ path: info.outputPath("calendar-copy-scheduling.png") });
  await form.locator('form').evaluate((f: HTMLFormElement) => { f.requestSubmit(); f.requestSubmit(); });
  await expect(page).toHaveURL(new RegExp(`event=scheduled-event-${request}`));
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Week", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByLabel("Selected date")).toHaveValue("2026-11-11");
  await expect(page.getByLabel("Team", { exact: true })).toHaveValue("first-team");
  await expect(page.getByLabel("Session type", { exact: true })).toHaveValue("");
  const selected = page.locator('.calendar-event[aria-pressed=true]'); await expect(selected).toContainText("17:00 – 18:15");
  expect(m.writes()).toBe(1);
  const saved = m.bundle().sessions.find((s) => s.id === `scheduled-session-${request}`)!;
  expect(saved.content).toEqual(m.source.content); expect(saved.documents).toEqual([]);
  expect(m.bundle().sessions.filter((s) => s.id === m.source.id)).toEqual(m.before.sessions.filter((s) => s.id === m.source.id));
  expect(m.bundle().scenes).toEqual(m.before.scenes);
  await page.screenshot({ path: info.outputPath("calendar-independent-booking.png") });
  await page.reload(); await loaded(page); expect(m.writes()).toBe(1); await expect(selected).toBeVisible();
  await page.getByRole("link", { name: "Open coaching guide", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`session=scheduled-session-${request}.*revision=1.*event=scheduled-event-${request}.*bookingRevision=1`));
  await expect(page.getByText("No illustrated exports have been saved for this session revision.", { exact: true })).toBeVisible();
  expect(m.writes()).toBe(1);
});

test("cancel copy and revisit its request via Back/Forward never writes or invents another request", async ({ page }) => {
  const m = await storage(page); await page.goto(m.root); await loaded(page); await preview(page); await copy(page);
  const requestUrl = page.url(); await page.getByRole("dialog").getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  // replace on cancel leaves the prior preview in history, with no booking mutation.
  await page.goBack(); await expect(page.getByRole("region", { name: "Saved session preview" })).toBeVisible();
  await page.goto(requestUrl); await loaded(page); await expect(page.getByRole("dialog", { name: "Schedule independent copy" })).toBeVisible();
  expect(page.url()).toBe(requestUrl); expect(m.writes()).toBe(0); expect(m.bundle()).toEqual(m.before);
});

test("booking copy action preserves an all-team context and the picker supports keyboard cancellation", async ({ page }) => {
  const m = await storage(page); await page.goto(`${m.root.replace('&team=first-team', '')}&event=${m.originalEvent.id}&bookingRevision=1`); await loaded(page);
  await page.getByRole("button", { name: "Schedule Another Copy", exact: true }).click();
  await expect(page.getByRole("region", { name: "Saved session preview" })).toContainText("Saved session preview · revision 1");
  await page.keyboard.press("Escape"); await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByLabel("Team", { exact: true })).toHaveValue("");
  const picker = await browse(page); await expect(picker.getByLabel("Find sessions")).toBeFocused();
  for (let i = 0; i < 12; i++) {
    await page.keyboard.press("Tab");
    expect(await picker.evaluate((d) => d.contains(document.activeElement))).toBe(true);
  }
  await page.keyboard.press("Escape"); await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByLabel("Selected date")).toBeFocused(); expect(m.writes()).toBe(0);
});

for (const failure of [409, 503, "lost-ack"] as const) test(`Calendar copy ${failure} retains request context and requires deliberate recovery`, async ({ page }, info) => {
  const m = await storage(page, failure); await page.goto(m.root); await loaded(page); await preview(page); const form = await copy(page);
  const url = page.url(); await form.getByRole("button", { name: "Save booking", exact: true }).click();
  await expect(page.getByRole("button", { name: "Reload before saving", exact: true })).toBeVisible();
  await expect(form.getByRole("button", { name: "Save booking", exact: true })).toBeDisabled();
  await expect(form.locator('[role=alert]')).not.toContainText("Private provider detail");
  expect(m.writes()).toBe(1); expect(page.url()).toBe(url);
  await page.screenshot({ path: info.outputPath(`calendar-recovery-${failure}.png`) });
  await page.reload(); await loaded(page); expect(page.url()).toBe(url); expect(m.writes()).toBe(1);
  if (failure === "lost-ack") {
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.getByText("Independent occurrence found for this request", { exact: true })).toBeVisible();
    await page.getByRole("link", { name: "Open scheduled occurrence", exact: true }).click();
    await expect(page.getByRole("button", { name: "Week", exact: true })).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator('.calendar-event[aria-pressed=true]')).toBeVisible();
  } else { expect(m.bundle()).toEqual(m.before); await expect(page.getByRole("dialog")).toBeVisible(); }
});

test("deliberate Reload after lost acknowledgement retains the same request and finds its saved occurrence", async ({ page }) => {
  const m = await storage(page, "lost-ack"); await page.goto(m.root); await loaded(page); await preview(page); const form = await copy(page);
  const url = page.url(); await form.getByRole("button", { name: "Save booking", exact: true }).click();
  await expect(page.getByRole("button", { name: "Reload before saving", exact: true })).toBeVisible();
  await form.getByRole("button", { name: "Reload saved records", exact: true }).click(); await loaded(page);
  await expect(page.getByText("Independent occurrence found for this request", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Reload", exact: true }).click(); await loaded(page);
  expect(page.url()).toBe(url); await expect(page.getByText("Independent occurrence found for this request", { exact: true })).toBeVisible(); expect(m.writes()).toBe(1);
});

test("invalid, stale and cross-organisation/team links never substitute another source or authorize a write", async ({ page }) => {
  const m = await storage(page); await page.goto(m.root); await loaded(page);
  await page.evaluate(() => localStorage.setItem('c4-b2-local-boundary', 'synthetic local package'));
  for (const tail of ['&library=1&session=missing&revision=1', `&library=1&session=${m.source.id}&revision=999`]) {
    await page.goto(m.root + tail); await loaded(page); await expect(page.locator(".calendar-workspace [role=alert]")).toContainText("exact session revision is unavailable");
  }
  await page.goto(m.root.replace(`organization=${m.source.organizationId}`, 'organization=other-club')+'&library=1'); await loaded(page);
  await expect(page.locator(".calendar-workspace [role=alert]")).toContainText("different organisation"); await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Browse Session Library", exact: true }).first()).toBeDisabled();
  await page.goto(m.root.replace('team=first-team','team=youth-team')+`&library=1&session=${m.source.id}&revision=1`); await loaded(page);
  await expect(page.locator(".calendar-workspace [role=alert]")).toContainText("exact session revision is unavailable");
  await page.goto(`${m.root}&event=${m.originalEvent.id}&bookingRevision=999`); await loaded(page);
  await expect(page.locator(".calendar-workspace [role=alert]")).toContainText("has changed");
  m.newer(); await page.goto(m.root+`&library=1&session=${m.source.id}&revision=1`); await loaded(page);
  await expect(page.getByRole("button", { name: "Schedule independent copy", exact: true })).toBeDisabled();
  await page.goto(m.root+'&view=day'); await expect(page.getByRole("heading", { name: "Invalid Calendar context" })).toBeVisible();
  expect(m.writes()).toBe(0); expect(await page.evaluate(() => localStorage.getItem('c4-b2-local-boundary'))).toBe('synthetic local package');
});

test("weekly/monthly cards distinguish match and recovery; booking edits preserve session and guide pins", async ({ page }, info) => {
  const m = await storage(page); await page.goto(m.root.replace('2026-11-11','2026-11-03')); await loaded(page);
  await expect(page.getByRole("button", { name: "First Team v Visitors, 2026-11-07, Match", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Recovery & mobility, 2026-11-06, Recovery", exact: true })).toBeVisible();
  await page.screenshot({ path: info.outputPath("calendar-light-week.png") });
  await page.getByRole("button", { name: "Month", exact: true }).click();
  const card = page.getByRole("button", { name: /Rondos & Positional Play, 2026/ }); await expect(card).toHaveText(m.source.content.title);
  await expect(page.locator('.calendar-month .calendar-event-time')).toHaveCount(0);
  await page.screenshot({ path: info.outputPath("calendar-light-month.png") });
  await card.click();
  const panel = page.getByRole("complementary", { name: "Session preview" });
  await expect(panel.getByRole("link", { name: "Edit Session", exact: true })).toHaveAttribute("href", new RegExp(`^/sessions\\?event=${m.originalEvent.id}&revision=1&calendar=`));
  await panel.getByRole("button", { name: "Edit Booking", exact: true }).click();
  const form = page.getByRole("dialog"); await form.getByLabel("Start time").fill("17:00"); await form.getByLabel("End time").fill("18:00");
  await form.getByRole("button", { name: "Save booking", exact: true }).click();
  await expect(page).toHaveURL(/bookingRevision=2/);
  expect(m.bundle().sessions).toEqual(m.before.sessions);
  await expect(panel.getByRole("link", { name: "Open coaching guide", exact: true })).toHaveAttribute("href", new RegExp(`^/guides\\?session=${m.source.id}&revision=1&event=${m.originalEvent.id}&bookingRevision=2&calendar=`));
  await expect(panel).toContainText("saved PDFs are historical exports");
  await panel.getByRole("link", { name: "Open coaching guide", exact: true }).click();
  await expect(page.getByText("Original booking 2026-11-03 · booking revision 1. Saved schedule may differ from the current booking.", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Download illustrated PDF 1", exact: true })).toBeEnabled();
  expect(m.writes()).toBe(1); // Opening the old export list neither regenerates nor overwrites it.
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
