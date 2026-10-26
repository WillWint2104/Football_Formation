import { test, expect, type Page } from "@playwright/test";
import { sampleCalendar } from "../../lib/calendar/sample";
import type { DomainBundle } from "../../lib/domain/validation";

/** Sample mode simulates an unavailable backend, with no writes accepted by the test. */
async function sample(page: Page) {
  await page.route("**/api/organizations", (route) => route.fulfill({ status: 503, json: { error: "Unavailable" } }));
  await page.goto("/calendar");
  await expect(page.getByRole("status")).not.toContainText("Checking");
}

/** Select the saved examples' November date rather than depending on the workstation clock. */
async function november(page: Page) {
  await page.getByLabel("Selected date").fill("2026-11-03");
}

test("independent month cards open the correct preview; month/week/day, filters and route alias work", async ({ page }, info) => {
  await sample(page);
  await expect(page.getByText("Illustrative sample data · not saved", { exact: true })).toBeVisible();
  const possession = page.getByRole("button", { name: "Rondos & Positional Play, 2026-11-03, Possession", exact: true });
  await possession.click();
  await expect(page.getByRole("complementary", { name: "Session preview" }).getByRole("heading", { name: "Rondos & Positional Play" })).toBeVisible();
  await expect(page.getByText("5v2 Rondo")).toBeVisible();
  await expect(page.locator(".calendar-month .calendar-event-time, .calendar-month .calendar-event-status")).toHaveCount(0);
  await expect(possession).toHaveText("Rondos & Positional Play");
  await expect(possession.locator("svg")).toHaveCount(1);
  await page.screenshot({ path: info.outputPath("calendar-month.png"), fullPage: true });
  await page.getByRole("button", { name: "GK handling & distribution, 2026-11-03, Goalkeeper", exact: true }).click();
  await expect(page.getByRole("complementary", { name: "Session preview" }).getByRole("heading", { name: "GK handling & distribution" })).toBeVisible();
  await expect(page.getByText("5v2 Rondo")).toHaveCount(0);
  await page.getByRole("button", { name: "Week", exact: true }).click();
  await expect(page.locator(".calendar-week .calendar-day")).toHaveCount(7);
  await expect(page.getByRole("button", { name: /GK handling & distribution, 2026/ })).toContainText("11:30 – 12:15");
  await page.screenshot({ path: info.outputPath("calendar-week.png"), fullPage: true });
  await page.getByRole("button", { name: "Day", exact: true }).click();
  await expect(page.locator(".calendar-view-day .calendar-day")).toHaveCount(1);
  await expect(page.locator(".calendar-event")).toHaveCount(2);
  await page.screenshot({ path: info.outputPath("calendar-day.png"), fullPage: true });
  await page.getByLabel("Session type", { exact: true }).selectOption("goalkeeper");
  await expect(page.locator(".calendar-event")).toHaveCount(1);
  await page.getByLabel("Team", { exact: true }).selectOption("youth-team");
  await expect(page.locator(".calendar-event")).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.goto("/team-schedule");
  await expect(page).toHaveURL(/\/calendar$/);
  await expect(page.getByRole("navigation", { name: "Main navigation" }).getByRole("link", { name: "Calendar", exact: true })).toHaveAttribute("aria-current", "page");
});

test("sample scheduling is keyboard accessible, independent and explicitly discarded on reload", async ({ page }) => {
  await sample(page);
  let writes = 0;
  page.on("request", (request) => { if (request.method() === "POST") writes++; });
  await page.getByRole("button", { name: "Add session", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByLabel("Session title", { exact: true })).toBeFocused();
  await dialog.getByLabel("Session title", { exact: true }).fill("Evening conditioning");
  await dialog.getByLabel("Session type", { exact: true }).selectOption("conditioning");
  await dialog.getByLabel("Lead coach").selectOption("coach-carter");
  await dialog.getByLabel("Start time").fill("17:00");
  await dialog.getByLabel("End time").fill("18:00");
  await dialog.getByRole("button", { name: "Apply sample change" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole("complementary", { name: "Session preview" }).getByRole("heading", { name: "Evening conditioning" })).toBeVisible();
  await expect(page.getByRole("status")).toHaveText("Sample change applied in memory only. Reloading discards it.");
  expect(writes).toBe(0);
  await page.reload();
  await expect(page.getByRole("button", { name: /Evening conditioning,/ })).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.length)).toBe(0);
});

test("rescheduling warns on overlaps and appends only the selected booking; Escape restores focus", async ({ page }) => {
  await sample(page);
  await page.getByRole("button", { name: /Rondos & Positional Play, 2026/ }).click();
  const reschedule = page.getByRole("button", { name: "Reschedule booking" });
  await reschedule.click();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(reschedule).toBeFocused();
  await reschedule.click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Start time").fill("11:00");
  await dialog.getByLabel("End time").fill("12:00");
  await dialog.getByRole("button", { name: "Apply sample change" }).click();
  await expect(dialog.getByText("Overlapping bookings", { exact: true })).toBeVisible();
  await dialog.getByLabel("Schedule despite these warnings").check();
  await dialog.getByRole("button", { name: "Apply sample change" }).click();
  await expect(dialog).toHaveCount(0);
  await page.getByRole("button", { name: "Day", exact: true }).click();
  await expect(page.getByRole("button", { name: /GK handling & distribution, 2026/ })).toContainText("11:30 – 12:15");
  await expect(page.getByRole("button", { name: /Rondos & Positional Play, 2026/ })).toContainText("11:00 – 12:00");
});

test("DST gaps cannot be saved and repeated hours require explicit occurrence selection", async ({ page }) => {
  await sample(page);
  await page.getByRole("button", { name: "Add session", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Session title", { exact: true }).fill("DST boundary test");
  await dialog.getByLabel("Start date").fill("2026-10-04");
  await dialog.getByLabel("End date").fill("2026-10-04");
  await dialog.getByLabel("Start time").fill("02:30");
  await dialog.getByLabel("End time").fill("04:00");
  await dialog.getByRole("button", { name: "Apply sample change" }).click();
  await expect(dialog.getByRole("alert")).toContainText("does not exist");
  await dialog.getByLabel("Start date").fill("2026-04-05");
  await dialog.getByLabel("End date").fill("2026-04-05");
  await dialog.getByRole("button", { name: "Apply sample change" }).click();
  await expect(dialog.getByRole("alert")).toContainText("occurs twice");
  await dialog.getByLabel("Start occurrence (UTC)").selectOption("2026-04-04T16:30:00Z");
  await dialog.getByRole("button", { name: "Apply sample change" }).click();
  await expect(dialog).toHaveCount(0);
});

test("extended date years cannot crash the calendar and a removed scheduling trigger restores focus to the date control", async ({ page }) => {
  await sample(page);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.getByLabel("Selected date").fill("20261-11-03");
  await expect(page.getByRole("heading", { name: "November 2026" })).toBeVisible();
  await page.getByRole("button", { name: "Day", exact: true }).click();
  await page.locator('[data-date="2026-11-03"]').getByRole("button", { name: "Add session", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Session title", { exact: true }).fill("Different day training");
  await dialog.getByLabel("Start date").fill("2026-11-04");
  await dialog.getByLabel("End date").fill("2026-11-04");
  await dialog.getByLabel("Start time").fill("15:00");
  await dialog.getByLabel("End time").fill("16:00");
  await dialog.getByRole("button", { name: "Apply sample change" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByLabel("Selected date")).toBeFocused();
  expect(errors).toEqual([]);
});

/** A contract-level HTTP stand-in, not evidence of hosted Supabase authentication or durability. */
async function savedApi(page: Page, rejectSave?: number, empty = false) {
  let bundle: DomainBundle = sampleCalendar(); let version = 3; let writes = 0;
  bundle.organizationId = "saved-test-club";
  for (const records of [bundle.teams, bundle.coaches, bundle.events, bundle.sessions]) {
    for (const record of records) record.organizationId = bundle.organizationId;
  }
  if (empty) { bundle.events = []; bundle.sessions = []; }
  await page.route("**/api/organizations", (route) => route.fulfill({ json: { organizations: [{ id: bundle.organizationId, name: "Mock organisation", version }] } }));
  await page.route("**/api/organizations/*/snapshot", async (route) => {
    if (route.request().method() === "POST") {
      writes++;
      if (rejectSave) { await route.fulfill({ status: rejectSave, json: { error: "PRIVATE DETAIL" } }); return; }
      const input = route.request().postDataJSON();
      expect(input.expectedVersion).toBe(version); expect(input.actor).toBeUndefined();
      expect(input.bundle.organizationId).toBe("saved-test-club");
      bundle = input.bundle; version++; await route.fulfill({ json: { version } });
    } else await route.fulfill({ json: { version, bundle } });
  });
  return { writes: () => writes, bundle: () => bundle };
}

test("authenticated-contract scheduling saves, reloads pinned history and never uploads sample records", async ({ page }) => {
  const mock = await savedApi(page);
  await page.goto("/calendar");
  await expect(page.getByRole("status")).toHaveText("Loaded saved organisation snapshot v3.");
  await november(page);
  await page.getByRole("button", { name: /Rondos & Positional Play, 2026/ }).click();
  await page.getByRole("button", { name: "Reschedule booking" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Start time").fill("14:00");
  await dialog.getByLabel("End time").fill("15:20");
  await dialog.getByRole("button", { name: "Save booking", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("Saved organisation snapshot v4.");
  expect(mock.writes()).toBe(1);
  expect(mock.bundle().events.filter((e) => e.id === "sample-4")).toHaveLength(2);
  await page.reload(); await expect(page.getByRole("status")).toContainText("snapshot v4"); await november(page);
  await page.getByRole("button", { name: "Day", exact: true }).click();
  await expect(page.getByRole("button", { name: /Rondos & Positional Play, 2026/ })).toContainText("14:00 – 15:20");
});

test("month cards hide metadata for every status and bound long titles while preserving full accessible names", async ({ page }) => {
  const bundle = sampleCalendar();
  const longTitle = "Tactical focus: creating support angles and progressing through pressure with coordinated rotations. ".repeat(3).trim();
  bundle.events[0].title = longTitle;
  bundle.events[0].status = "confirmed";
  bundle.events[1].status = "cancelled";
  await page.route("**/api/organizations", (route) => route.fulfill({ json: { organizations: [{ id: bundle.organizationId, name: "Illustrative test organisation", version: 1 }] } }));
  await page.route("**/api/organizations/*/snapshot", (route) => route.fulfill({ json: { version: 1, bundle } }));
  await page.goto("/calendar");
  await expect(page.getByRole("status")).toContainText("snapshot v1"); await november(page);
  for (const event of bundle.events) {
    const card = page.locator(".calendar-month .calendar-event").filter({ hasText: event.title });
    await expect(card).toHaveText(event.title);
    await expect(card.locator(":scope > *")).toHaveCount(1);
    await expect(card).toHaveAttribute("title", event.title);
  }
  const longCard = page.getByRole("button", { name: `${longTitle}, 2026-11-02, Conditioning`, exact: true });
  const title = longCard.locator("strong");
  expect(await title.evaluate((element) => element.getBoundingClientRect().height <= Number.parseFloat(getComputedStyle(element).lineHeight) * 2 + 1)).toBe(true);
  await longCard.click();
  await expect(page.getByRole("complementary", { name: "Session preview" }).getByRole("heading", { name: longTitle, exact: true })).toBeVisible();
  await expect(page.getByRole("complementary", { name: "Session preview" })).toContainText("confirmed");
  await page.getByRole("button", { name: "Week", exact: true }).click();
  await expect(page.getByRole("button", { name: `${longTitle}, 2026-11-02, Conditioning`, exact: true })).toContainText("10:00 – 11:00");
});

test("two new saved sessions retain their own types, coaches and pins after reopening an initially empty calendar", async ({ page }) => {
  const mock = await savedApi(page, undefined, true);
  await page.goto("/calendar");
  await expect(page.getByRole("status")).toContainText("snapshot v3");
  await november(page);
  await expect(page.locator(".calendar-event")).toHaveCount(0);
  for (const [title, kind, coach, start, end] of [
    ["Saved conditioning", "conditioning", "coach-carter", "10:00", "11:00"],
    ["Saved goalkeeper", "goalkeeper", "coach-lopez", "11:30", "12:15"],
  ]) {
    await page.getByRole("button", { name: "Add session", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Session title", { exact: true }).fill(title);
    await dialog.getByLabel("Session type", { exact: true }).selectOption(kind);
    await dialog.getByLabel("Lead coach").selectOption(coach);
    await dialog.getByLabel("Start time").fill(start);
    await dialog.getByLabel("End time").fill(end);
    await dialog.getByRole("button", { name: "Save booking", exact: true }).click();
    await expect(dialog).toHaveCount(0);
  }
  expect(mock.writes()).toBe(2);
  expect(mock.bundle().events).toHaveLength(2);
  expect(mock.bundle().sessions).toHaveLength(2);
  expect(new Set(mock.bundle().events.map((event) => event.session?.id)).size).toBe(2);
  expect(mock.bundle().sessions.map((session) => session.content.kind)).toEqual(["conditioning", "goalkeeper"]);
  expect(mock.bundle().sessions.map((session) => session.coaches[0].coachId)).toEqual(["coach-carter", "coach-lopez"]);
  await page.reload(); await expect(page.getByRole("status")).toContainText("snapshot v5"); await november(page);
  await expect(page.locator(".calendar-event")).toHaveCount(2);
  await expect(page.getByRole("button", { name: /Saved goalkeeper, 2026/ })).toBeVisible();
});

for (const status of [409, 503, 401]) {
  test(`failed save ${status} never claims success or retries and requires a reload`, async ({ page }) => {
    const mock = await savedApi(page, status);
    await page.goto("/calendar"); await expect(page.getByRole("status")).toContainText("snapshot v3"); await november(page);
    await page.getByRole("button", { name: /Rondos & Positional Play, 2026/ }).click();
    await page.getByRole("button", { name: "Reschedule booking" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Save booking", exact: true }).click();
    await expect(page.getByRole("status")).not.toContainText("snapshot v3");
    await expect(page.getByRole("status")).not.toContainText("PRIVATE");
    expect(mock.writes()).toBe(1);
    if (status !== 401) {
      await expect(page.getByRole("dialog").getByRole("button", { name: "Save booking", exact: true })).toBeDisabled();
      await page.getByRole("button", { name: "Close scheduling form" }).click();
    } else await expect(page.getByText("Illustrative sample data · not saved", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Reload before saving" }).click();
    await expect(page.getByRole("status")).toContainText("snapshot v3");
    expect(mock.writes()).toBe(1);
  });
}
