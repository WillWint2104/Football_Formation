import { test, expect, type Page } from "@playwright/test";
import { programmeBusyExample, programmeExample } from "../fixtures/programme";

const days = [2, 3, 4, 5, 6, 7, 8].map(day => "2026-11-0" + day);
const weekStrip = (page: Page) => page.getByRole("navigation", { name: "Seven days", exact: true });
const week = (page: Page) => page.getByRole("region", { name: "Weekly overview and focused day", exact: true });
const scheduled = (page: Page) => week(page).getByRole("list", { name: "Scheduled bookings" }).getByRole("button");
const inspector = (page: Page) => page.getByRole("complementary", { name: "Session preview", exact: true });

async function openWeek(page: Page, bundle = programmeExample()) {
  const before = structuredClone(bundle), errors: string[] = [];
  let writes = 0;
  page.on("pageerror", error => errors.push(error.message));
  await page.route("**/api/**", route => route.abort());
  await page.route("**/api/organizations", route => route.fulfill({
    json: { organizations: [{ id: bundle.organizationId, name: "Synthetic programme", version: 4 }] },
  }));
  await page.route("**/api/organizations/*/snapshot", route => {
    if (route.request().method() !== "GET") {
      writes++;
      return route.abort();
    }
    return route.fulfill({ json: { version: 4, bundle } });
  });
  await page.goto("/calendar?date=2026-11-03&view=week&organization=" + bundle.organizationId + "&team=first-team");
  await expect(page.locator(".calendar-connection [role=status]")).toContainText("Loaded saved organisation snapshot");
  await expect(page.locator(".calendar-programme")).toHaveAttribute("aria-busy", "false");
  return () => {
    expect(writes).toBe(0);
    expect(bundle).toEqual(before);
    expect(errors).toEqual([]);
  };
}

async function selectDate(page: Page, date: string) {
  const button = weekStrip(page).getByRole("button", { name: "Select " + date, exact: true });
  await expect(button).toBeEnabled();
  await button.press("Enter");
  await expect(button).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".calendar-programme")).toHaveAttribute("aria-busy", "false");
}

test("Week announces all seven days, football families and quiet dates without rendering a booking grid", async ({ page }) => {
  const unchanged = await openWeek(page);
  await expect(page.getByRole("heading", { name: "2 – 8 November 2026", exact: true })).toBeVisible();
  await expect(weekStrip(page).getByRole("button")).toHaveCount(7);
  await expect(weekStrip(page).getByRole("button", { name: "Select 2026-11-03" })).toHaveAccessibleDescription(/2 bookings.*Training, Goalkeeper/);
  await expect(weekStrip(page).getByRole("button", { name: "Select 2026-11-02" })).toHaveAccessibleDescription(/1 booking.*Recovery/);
  await expect(weekStrip(page).getByRole("button", { name: "Select 2026-11-07" })).toHaveAccessibleDescription(/1 booking.*Match/);
  await expect(weekStrip(page).getByRole("button", { name: "Select 2026-11-08" })).toHaveAccessibleDescription(/0 bookings/);
  await expect(page.getByRole("button", { name: "Open next fixture, Riverside FC vs Western United" })).toBeVisible();
  await expect(week(page).locator(".scene-diagram")).toHaveCount(0);
  await expect(page.getByRole("navigation", { name: "Primary navigation", exact: true }).getByRole("link")).toHaveCount(5);
  await expect(page.getByRole("navigation", { name: "Main navigation", exact: true }).getByRole("link")).toHaveCount(5);
  await expect(page.locator(".calendar-frame-header")).toHaveCSS("background-color", "rgb(255, 255, 255)");
  await expect(page.locator("body > aside")).toHaveCSS("width", "104px");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  unchanged();
});

test("keyboard date selection exposes all 13 bookings, including three on Monday in chronological order", async ({ page }) => {
  const unchanged = await openWeek(page, programmeBusyExample());
  await selectDate(page, days[0]);
  await expect(scheduled(page).locator("time")).toHaveText(["09:00", "11:00", "17:00"]);
  await expect(scheduled(page).last()).toBeInViewport();
  const bookingIds = () => scheduled(page).evaluateAll(rows => rows.map(row => row.getAttribute("data-booking")!));
  const seen = new Set(await bookingIds());
  for (const day of days.slice(1)) {
    await selectDate(page, day);
    for (const id of await bookingIds()) seen.add(id);
  }
  expect(seen.size).toBe(13);
  await expect(week(page).getByText("No bookings for this day", { exact: true })).toBeVisible();
  unchanged();
});

test("quiet day stays content sized and primary navigation remains keyboard accessible", async ({ page }, info) => {
  const unchanged = await openWeek(page);
  await selectDate(page, days[6]);
  const before = (await week(page).boundingBox())!.height;
  const { width, height } = info.project.use.viewport!;
  await page.setViewportSize({ width, height: height + 300 });
  expect((await week(page).boundingBox())!.height).toBe(before);
  const navigation = page.getByRole("navigation", { name: "Primary navigation", exact: true });
  await navigation.getByRole("link", { name: "Programme", exact: true }).focus();
  await page.keyboard.press("Tab");
  await expect(navigation.getByRole("link", { name: "Sessions", exact: true })).toBeFocused();
  unchanged();
});

test("selection preserves the booked scene, toggles the inspector and releases Calendar width", async ({ page }) => {
  const unchanged = await openWeek(page);
  const wide = (await week(page).boundingBox())!.width;
  await scheduled(page).first().click();
  await expect(inspector(page).locator(".scene-diagram")).toHaveAttribute("data-revision", "1");
  await expect(inspector(page).locator(".scene-diagram")).toHaveAttribute("data-time", "2");
  const snapshot = inspector(page).getByText("Saved snapshot", { exact: true });
  await snapshot.press("Enter");
  await expect(inspector(page).getByText("Revision 1 · 2 seconds", { exact: true })).toBeVisible();
  await snapshot.press("Enter");
  await expect(inspector(page).getByRole("link", { name: "Open Session", exact: true })).toHaveAttribute("href", /^\/sessions\?event=sample-4&revision=1&calendar=/);
  await scheduled(page).last().click();
  await expect(inspector(page).getByRole("heading", { name: "Distribution drills", exact: true })).toBeVisible();
  await expect(inspector(page).locator(".scene-diagram")).toHaveCount(0);
  await inspector(page).getByRole("button", { name: "Dismiss session preview" }).click();
  await expect(inspector(page)).toHaveCount(0);
  expect((await week(page).boundingBox())!.width).toBe(wide);
  unchanged();
});

test("filters, cancelled bookings, Session Library and Month and Day retain their existing behaviour", async ({ page }) => {
  const bundle = programmeExample();
  bundle.events.find(event => event.id === "sample-6")!.status = "cancelled";
  const unchanged = await openWeek(page, bundle);
  await page.getByRole("button", { name: "Next period" }).click();
  await expect(page).toHaveURL(/date=2026-11-10/);
  await page.getByRole("button", { name: "Previous period" }).click();
  await expect(page).toHaveURL(/date=2026-11-03/);
  await page.getByLabel("Session type", { exact: true }).selectOption("goalkeeper");
  await expect(scheduled(page)).toHaveCount(1);
  await expect(scheduled(page).first()).toHaveAttribute("data-status", "cancelled");
  await expect(scheduled(page).first()).toContainText("cancelled");
  await expect(scheduled(page).first()).toHaveAccessibleDescription(/cancelled/);
  await scheduled(page).first().click();
  await inspector(page).getByText("Booking & reuse", { exact: true }).click();
  await expect(inspector(page).getByRole("button", { name: "Edit Booking" })).toBeDisabled();
  await page.getByLabel("Team", { exact: true }).selectOption("youth-team");
  await expect(scheduled(page)).toHaveCount(0);
  await expect(week(page).locator(".focused-programme-next")).toHaveCount(0);
  await page.getByLabel("Team", { exact: true }).selectOption("first-team");
  await page.getByLabel("Session type", { exact: true }).selectOption("");
  await selectDate(page, days[2]);
  await week(page).getByRole("button", { name: "Choose session", exact: true }).click();
  const picker = page.getByRole("dialog", { name: "Choose a coaching session" });
  await expect(picker).toContainText("2026-11-04 · week view · First Team");
  await picker.getByRole("button", { name: "Cancel · return to Calendar" }).click();
  await expect(picker).toBeHidden();
  await expect(page.getByLabel("Selected date")).toBeFocused();
  await page.getByRole("button", { name: "Month", exact: true }).click();
  await expect(page.locator(".calendar-month .calendar-event-time")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Corners & free kicks, 2026-11-06, Tactical", exact: true })).toHaveText("Corners & free kicks");
  await page.getByRole("button", { name: "Day", exact: true }).click();
  await expect(page.locator(".calendar-view-day .calendar-day")).toHaveCount(1);
  await expect(page.getByLabel("Selected date")).toHaveValue(days[2]);
  unchanged();
});

test("Calendar light navigation preserves Saved Sessions and Session Designer routes", async ({ page }) => {
  const unchanged = await openWeek(page);
  const navigation = page.getByRole("navigation", { name: "Primary navigation", exact: true });
  await navigation.getByRole("link", { name: "Sessions", exact: true }).click();
  await expect(page).toHaveURL(/\/sessions$/);
  await expect(navigation.getByRole("link", { name: "Sessions", exact: true })).toHaveAttribute("aria-current", "page");
  await page.goto("/sessions?event=sample-4&revision=1");
  await expect(page.locator(".programme-frame-header")).toBeHidden();
  await expect(page.locator("body > aside")).toHaveCSS("width", "240px");
  await page.goto("/session-designer");
  const designerHeader = page.locator(".programme-frame-header.authoring-frame-header");
  await expect(designerHeader).toBeVisible();
  await expect(designerHeader).toHaveCSS("background-color", "rgb(255, 255, 255)");
  await expect(navigation.getByRole("link", { name: "Sessions", exact: true })).toHaveAttribute("aria-current", "location");
  await expect(page.getByRole("navigation", { name: "Main navigation" }).getByRole("link", { name: "Session Designer", exact: true })).toHaveAttribute("aria-current", "page");
  unchanged();
});
