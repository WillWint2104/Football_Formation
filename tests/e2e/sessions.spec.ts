import { test, expect, type Page } from "@playwright/test";
import { coachingSample } from "../../lib/coaching/sample";
import { domainBundleSchema } from "../../lib/domain/validation";
import { eventSession, latestEvents } from "../../lib/calendar/schedule";

/** A strict HTTP-contract stand-in; hosted Auth and cloud persistence require separate staging verification. */
async function storage(page: Page, status?: number) {
  let bundle = coachingSample(); let version = 4; let writes = 0;
  await page.route("**/api/organizations", (route) => route.fulfill({ json: { organizations: [{ id: bundle.organizationId, name: "Synthetic coaching club", version }] } }));
  await page.route("**/api/organizations/*/snapshot", async (route) => {
    if (route.request().method() === "POST") {
      writes++; const input = route.request().postDataJSON();
      expect(input.expectedVersion).toBe(version); expect(Object.keys(input).sort()).toEqual(["bundle", "expectedVersion"]);
      if (status) { await route.fulfill({ status, json: { error: "private provider detail" } }); return; }
      bundle = domainBundleSchema.parse(input.bundle); version++;
      await route.fulfill({ json: { version } });
    } else await route.fulfill({ json: { version, bundle } });
  });
  return { bundle: () => bundle, writes: () => writes, version: () => version };
}

/** Await the validated saved graph, independent of request and hydration timing. */
async function loaded(page: Page) { await expect(page.getByRole("status")).toContainText("Loaded saved organisation snapshot"); }

test("calendar opens its pinned session; coaching edits, activity order and nullable timings survive reopening", async ({ page }, info) => {
  const mock = await storage(page);
  await page.goto("/calendar?date=2026-11-03"); await loaded(page);
  await page.getByRole("button", { name: /Rondos & Positional Play, 2026/ }).click();
  await page.getByRole("link", { name: "Open session editor" }).click();
  const editor = page.getByRole("region", { name: "Session editor" });
  await editor.getByLabel("Session objective").fill("Progress through pressure with clear support angles.");
  await editor.getByLabel("Role for M. Lopez").selectOption("specialist");
  await editor.getByLabel("Duration (minutes)").fill("");
  await editor.getByRole("button", { name: "Move activity down" }).click();
  await editor.getByLabel("Participants").fill("10");
  await editor.getByLabel("Specify field dimensions").check();
  await editor.getByLabel("Length (m)").fill("24"); await editor.getByLabel("Width (m)").fill("18");
  await editor.getByLabel("Setup & delivery instructions").fill("Setup: place four cones.\nDelivery: rotate after each pass.\n");
  await editor.getByLabel("Coaching points", { exact: true }).fill("Scan before receiving.\nOpen body shape.");
  await editor.getByLabel("Progressions", { exact: true }).fill("Add a neutral player.");
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: info.outputPath("session-editor.png"), fullPage: true });
  await editor.getByRole("button", { name: "Save session", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Saved organisation snapshot v5");
  const booking = latestEvents(mock.bundle()).find((e) => e.title === "Rondos & Positional Play")!;
  const session = eventSession(mock.bundle(), booking)!;
  expect(booking.session?.revision).toBe(2); expect(booking.revision).toBe(2);
  expect(session.content.activities[1].content.playerCount).toBe(10);
  expect(session.content.activities[1].durationMinutes).toBeNull();
  expect(session.coaches.find((c) => c.coachId === "coach-lopez")?.role).toBe("specialist");
  await page.reload(); await loaded(page);
  await expect(editor.getByLabel("Session objective")).toHaveValue("Progress through pressure with clear support angles.");
  await editor.getByRole("link", { name: "Back to booking" }).click();
  await expect(page.getByRole("complementary", { name: "Session preview" })).toContainText("Progress through pressure with clear support angles.");
  await expect(page.locator(".calendar-month .calendar-event-time")).toHaveCount(0);
});

test("template copies create independent editable sessions without modifying the reusable source or sibling", async ({ page }, info) => {
  const mock = await storage(page);
  await page.goto("/templates"); await loaded(page);
  const source = structuredClone(mock.bundle().templates[0]);
  const ids: string[] = [];
  for (const title of ["Independent session A", "Independent session B"]) {
    await page.getByRole("button", { name: "Create independent session", exact: true }).click();
    await expect(page).toHaveURL(/\/sessions\?session=/);
    await expect(page.getByLabel("Session title")).toBeVisible();
    await page.getByLabel("Session title").fill(title);
    await page.getByLabel("Session objective").fill(`Objective for ${title}`);
    const expected = mock.version() + 1;
    await page.getByRole("button", { name: "Save session", exact: true }).click();
    await expect(page.getByRole("status")).toHaveText(`Saved organisation snapshot v${expected}.`);
    ids.push(new URL(page.url()).searchParams.get("session")!);
    await page.getByRole("navigation", { name: "Main navigation" }).getByRole("link", { name: "Templates", exact: true }).click();
  }
  expect(new Set(ids).size).toBe(2);
  expect(mock.bundle().templates[0]).toEqual(source);
  for (const [index, id] of ids.entries()) {
    const session = mock.bundle().sessions.filter((s) => s.id === id).at(-1)!;
    expect(session.content.title).toBe(`Independent session ${index === 0 ? "A" : "B"}`);
    expect(session.sourceTemplate).toEqual({ id: source.id, revision: 1 });
  }
  await page.getByLabel("Session objective").fill("Updated reusable source only");
  const expected = mock.version() + 1;
  await page.getByRole("button", { name: "Save template", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText(`Saved organisation snapshot v${expected}.`);
  expect(mock.bundle().templates.at(-1)?.revision).toBe(2);
  expect(mock.bundle().sessions.filter((s) => ids.includes(s.id)).every((s) => s.content.objective !== "Updated reusable source only")).toBe(true);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: info.outputPath("templates.png"), fullPage: true });
});

test("reusable exercises, testing sessions and optional warm-up/cool-down roles retain independent content", async ({ page }, info) => {
  const mock = await storage(page);
  await page.goto("/exercises"); await loaded(page);
  await page.getByRole("button", { name: "New exercise", exact: true }).click();
  await page.getByLabel("Activity name", { exact: true }).fill("Acceleration protocol");
  await page.getByLabel("Participants").fill("8");
  await page.getByRole("button", { name: "Add equipment", exact: true }).click();
  await page.getByLabel("Equipment 1", { exact: true }).fill("Timing gates");
  await page.getByLabel("Setup & delivery instructions").fill("Explain the start protocol.\nRun three attempts.");
  await page.getByRole("button", { name: "Save exercise", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Saved organisation snapshot v5");
  const exercise = mock.bundle().exercises.at(-1)!;
  await page.getByRole("navigation", { name: "Main navigation" }).getByRole("link", { name: "Sessions", exact: true }).click();
  await page.getByRole("button", { name: "New session", exact: true }).click();
  await page.getByLabel("Session title").fill("Preseason testing programme");
  await page.getByLabel("Session type", { exact: true }).selectOption("testing");
  await page.getByLabel("Exercise template", { exact: true }).selectOption(exercise.id);
  await page.getByRole("button", { name: "Add exercise snapshot", exact: true }).click();
  await page.getByLabel("Activity role", { exact: true }).selectOption("briefing");
  await page.getByLabel("Setup & delivery instructions").fill("Session-specific delivery");
  await page.getByRole("button", { name: "Add activity", exact: true }).click();
  await page.getByLabel("Activity name", { exact: true }).fill("Optional cool-down");
  await page.getByLabel("Activity role", { exact: true }).selectOption("cool-down");
  await page.getByRole("button", { name: "Save session", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Saved organisation snapshot v6");
  const session = mock.bundle().sessions.at(-1)!;
  expect(session.content.kind).toBe("testing");
  expect(session.content.activities[0].sourceExercise).toEqual({ id: exercise.id, revision: 1 });
  expect(session.content.activities[0].content.equipment[0].quantity).toBeNull();
  expect(session.content.activities[0].durationMinutes).toBeNull();
  expect(session.content.activities[1].role).toBe("cool-down");
  await page.getByRole("navigation", { name: "Main navigation" }).getByRole("link", { name: "Exercise Library", exact: true }).click();
  await page.locator(".coaching-catalog").getByRole("link", { name: /Acceleration protocol/ }).click();
  await expect(page.locator(".coaching-editor h2")).toHaveText("Acceleration protocol");
  await page.getByLabel("Setup & delivery instructions").fill("New source protocol only");
  await page.getByRole("button", { name: "Save exercise", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Saved organisation snapshot v7");
  expect(mock.bundle().sessions.find((s) => s.id === session.id)!.content.activities[0].content.instructions).toEqual(["Session-specific delivery"]);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: info.outputPath("exercise-library.png"), fullPage: true });
});

test("directory coaches can be assigned and reopened; historical team links cannot be removed", async ({ page }, info) => {
  const mock = await storage(page);
  await page.goto("/coaches"); await loaded(page);
  await page.getByRole("button", { name: "Add coach", exact: true }).click();
  await page.getByLabel("Coach name", { exact: true }).fill("J. Specialist");
  await page.getByLabel("First Team", { exact: true }).check();
  await page.getByRole("button", { name: "Save coach", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Saved organisation snapshot v5");
  const coach = mock.bundle().coaches.at(-1)!; expect(coach.membershipId).toBeNull();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: info.outputPath("coaches.png"), fullPage: true });
  await page.getByRole("navigation", { name: "Main navigation" }).getByRole("link", { name: "Sessions", exact: true }).click();
  await page.locator(".coaching-catalog").getByRole("link", { name: /Rondos & Positional Play/ }).click();
  await page.getByLabel("J. Specialist", { exact: true }).check();
  await page.getByLabel("Role for J. Specialist").selectOption("specialist");
  await page.getByRole("button", { name: "Save session", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Saved organisation snapshot v6");
  await page.getByRole("navigation", { name: "Main navigation" }).getByRole("link", { name: "Coaches", exact: true }).click();
  await page.getByRole("region", { name: "Coach records" }).getByRole("button", { name: /J. Specialist/ }).click();
  await page.getByLabel("First Team", { exact: true }).uncheck();
  await page.getByRole("button", { name: "Save coach", exact: true }).click();
  await expect(page.locator(".coaching-editor [role=alert]")).toContainText("historical"); expect(mock.writes()).toBe(2);
});

test("an independent saved plan can be scheduled and reopened from the calendar without another session copy", async ({ page }) => {
  const mock = await storage(page);
  await page.goto("/templates"); await loaded(page);
  await page.getByRole("button", { name: "Create independent session", exact: true }).click();
  await expect(page.getByRole("link", { name: "Schedule this saved session" })).toBeVisible();
  const planId = new URL(page.url()).searchParams.get("session")!;
  const count = mock.bundle().sessions.length;
  await page.getByRole("link", { name: "Schedule this saved session" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByLabel("Session content", { exact: true })).toHaveValue(`session:${planId}`);
  await dialog.getByLabel("Start date").fill("2026-11-11"); await dialog.getByLabel("End date").fill("2026-11-11");
  await dialog.getByRole("button", { name: "Save booking", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect(mock.bundle().sessions.length).toBe(count);
  const event = latestEvents(mock.bundle()).find((e) => e.session?.id === planId)!;
  await page.getByRole("link", { name: "Open session editor" }).click();
  await expect(page).toHaveURL(new RegExp(`event=${event.id}`));
  await expect(page.getByLabel("Session title")).toHaveValue("Rondos & Positional Play");
});

test("sample edits survive coaching-page navigation but never POST and disappear on reload; dirty links require confirmation", async ({ page }) => {
  let writes = 0;
  await page.route("**/api/organizations", (route) => route.fulfill({ status: 503, json: { error: "Unavailable" } }));
  page.on("request", (request) => { if (request.method() === "POST") writes++; });
  await page.goto("/sessions?event=sample-4&revision=1"); await expect(page.getByRole("status")).not.toContainText("Checking");
  await page.getByLabel("Session objective").fill("Memory-only session objective");
  page.once("dialog", (dialog) => dialog.dismiss());
  await page.getByRole("navigation", { name: "Main navigation" }).getByRole("link", { name: "Templates", exact: true }).click();
  await expect(page.getByLabel("Session objective")).toHaveValue("Memory-only session objective");
  await page.getByRole("button", { name: "Save session", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Sample change applied");
  await page.getByRole("link", { name: "Back to booking" }).click();
  await expect(page.getByRole("complementary", { name: "Session preview" })).toContainText("Memory-only session objective");
  expect(writes).toBe(0); expect(await page.evaluate(() => localStorage.length)).toBe(0);
  await page.reload();
  await expect(page.getByRole("complementary", { name: "Session preview" })).not.toContainText("Memory-only session objective");
});

for (const status of [409, 401]) {
  test(`session save ${status} requires reload, never retries and cannot claim durability`, async ({ page }) => {
    const mock = await storage(page, status);
    await page.goto("/sessions?event=sample-4&revision=1"); await loaded(page);
    await page.getByLabel("Session objective").fill("Conflicting unsaved objective");
    await page.getByRole("button", { name: "Save session", exact: true }).click();
    await expect(page.getByRole("status")).not.toContainText("snapshot v4");
    expect(mock.writes()).toBe(1);
    if (status === 409) await expect(page.getByRole("button", { name: "Save session", exact: true })).toBeDisabled();
    else await expect(page.getByText("Illustrative sample data · not saved", { exact: true })).toBeVisible();
    await expect(page.getByRole("status")).not.toContainText("private provider detail");
  });
}

test("missing and historical revisions are never silently edited as the current session", async ({ page }) => {
  await storage(page);
  await page.goto("/sessions?event=sample-4&revision=999"); await loaded(page);
  await expect(page.getByText("Requested revision is unavailable", { exact: true })).toBeVisible();
  await page.goto("/sessions?event=sample-4&revision=invalid");
  await expect(page.getByRole("heading", { name: "Invalid session reference" })).toBeVisible();
  await page.goto("/sessions?event=sample-4&revision=1"); await loaded(page);
  await page.getByLabel("Session objective").fill("New exact revision");
  await page.getByRole("button", { name: "Save session", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Saved organisation snapshot v5");
  await page.getByText("Saved revision history", { exact: true }).click();
  await page.getByRole("link", { name: "Booking v1 · session v1", exact: true }).click();
  await expect(page.getByLabel("Session objective")).toBeDisabled();
  await expect(page.getByLabel("Session objective")).not.toHaveValue("New exact revision");
});
