import { expect, test, type Page } from "@playwright/test";
import { coachingPresentationBundle } from "../fixtures/coaching-presentation";
import { domainBundleSchema } from "../../lib/domain/validation";

async function viewerFixture(page: Page, { activityCount, areaLength }: { activityCount?: number; areaLength?: number } = {}) {
  const { bundle, session, scene } = coachingPresentationBundle();
  const activity = session.content.activities[1];
  if (areaLength !== undefined && activity.content.area) activity.content.area.length = areaLength;
  const sibling = bundle.scenes.find(s => s.id === "example-rondo" && s.revision === 2)!;
  activity.content.diagrams.push({ scene: { id: sibling.id, revision: sibling.revision }, representativeSeconds: 4 });
  activity.content.instructions = Array.from({ length: 18 }, (_, i) => `Step ${i + 1}. Check shoulders before receiving and support the spare player to break the line.`);
  scene.stages[0].tracks.push({ id: "coach-note", kind: "annotation", visibleFrom: 0, visibleUntil: 2,
    annotation: { kind: "note", position: { x: 15, y: 7 }, text: "Turn out of pressure before looking forward." } });
  if (activityCount) {
    const activities = session.content.activities;
    session.content.activities = [...activities, ...Array.from({ length: activityCount - activities.length }, (_, index) => ({
      ...structuredClone(activity), id: `viewer-check-${index + 1}`,
    }))];
  }
  bundle.sessions.push({ ...structuredClone(session), revision: 2, content: { ...structuredClone(session.content), title: "Revised plan" } });
  const snapshot = domainBundleSchema.parse(bundle);
  const original = structuredClone(snapshot);
  let served = snapshot, writes = 0;
  await page.context().route("**/*", r => ["127.0.0.1", "localhost"].includes(new URL(r.request().url()).hostname) ? r.continue() : r.abort());
  await page.route("**/api/**", r => { if (r.request().method() !== "GET") writes++; return r.abort(); });
  await page.route("**/api/organizations", r => r.fulfill({ json: { organizations: [{ id: snapshot.organizationId, name: "Synthetic coaching club", version: 4 }] } }));
  await page.route("**/api/organizations/*/snapshot", r => {
    if (r.request().method() === "GET") return r.fulfill({ json: { version: 4, bundle: served } });
    writes++;
    return r.abort();
  });
  const url = `/sessions/view?session=${session.id}&revision=1&organization=${bundle.organizationId}&booking=sample-4&bookingRevision=1&activity=${activity.id}&diagram=1`;
  return { url, snapshot, original, writes: () => writes,
    withoutScene() { served = { ...served, scenes: served.scenes.filter(s => s.id !== scene.id) }; } };
}

test("opens the exact Explorer selection and returns to its booking, search, filter, activity and diagram", async ({ page }) => {
  const fixture = await viewerFixture(page);
  await page.goto("/sessions?q=Rondos&type=possession");
  await page.getByRole("link", { name: /Rondos & Positional Play/ }).click();
  const preview = page.getByRole("region", { name: "Saved session preview" });
  await preview.getByRole("button", { name: "Diagram 2 · r2" }).click();
  const open = preview.getByRole("link", { name: "Open Full Session" });
  await open.focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/sessions\/view\?.*booking=sample-4&bookingRevision=1&q=Rondos&type=possession/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Rondos & Positional Play");
  const board = page.locator(".viewer-tactical .scene-diagram");
  await expect(board).toHaveAttribute("data-revision", "2");
  await expect(board).toHaveAttribute("data-time", "4");
  await page.reload();
  await expect(board).toHaveAttribute("data-time", "4");
  await page.getByRole("button", { name: "Previous activity" }).click();
  await expect(page.getByText("No diagram attached to this activity.")).toBeVisible();
  await expect(page.getByRole("group", { name: "Attached diagrams" })).toHaveCount(0);
  await expect(board).toHaveCount(0);
  await page.getByRole("button", { name: "Next activity" }).click();
  await expect(board).toHaveAttribute("data-revision", "3");
  await page.getByRole("link", { name: "Saved Sessions", exact: true }).click();
  await expect(preview.getByRole("button", { name: "Diagram 2 · r2" })).toHaveAttribute("aria-pressed", "true");
  await expect(preview.locator(".scene-diagram")).toHaveAttribute("data-time", "4");
  await expect(page.getByRole("searchbox", { name: "Find sessions" })).toHaveValue("Rondos");
  await expect(page.getByRole("combobox", { name: "Filter session type" })).toHaveValue("possession");
  expect(fixture.writes()).toBe(0);
  expect(fixture.snapshot).toEqual(fixture.original);
});

test("separates activity, diagram and authored stages and keeps the pitch stable while reading or going fullscreen", async ({ page }) => {
  const fixture = await viewerFixture(page);
  await page.goto(fixture.url);
  const tactical = page.getByRole("region", { name: "Tactical workspace" });
  const board = tactical.locator(".scene-diagram");
  await expect(board).toHaveAttribute("data-frame-fit", "all");
  await expect(board).toHaveAttribute("data-cropped-details", "0");
  await tactical.getByRole("button", { name: "Fit exercise", exact: true }).click();
  await expect(board).toHaveAttribute("data-frame-length", "12");
  await expect(board).toHaveAttribute("data-frame-width", "20");
  await expect(board.locator("[data-entity-id=p6]")).toHaveAttribute("data-world-x", "3.5");
  await expect(board.locator("[data-entity-id=cone]")).toHaveCount(1);
  const savedBounds = await board.boundingBox();
  await tactical.getByRole("button", { name: "Next scene stage" }).click();
  await expect(board).toHaveAttribute("data-time", "2");
  await expect(board).toHaveAttribute("data-frame-fit", "exercise");
  await expect(board.locator("[data-entity-id=p6]")).toHaveAttribute("data-world-x", "4");
  await expect(board.locator("[data-entity-id=cone]")).toHaveCount(0);
  expect(await board.boundingBox()).toEqual(savedBounds);
  const stage = tactical.getByRole("combobox", { name: "Scene stage" });
  await stage.focus();
  await page.keyboard.press("ArrowDown");
  await expect(stage.locator("option:checked")).toHaveText("3 of 6 · Authored phase 3");
  await expect(board.locator("[data-entity-id=p6]")).toHaveAttribute("data-world-x", "5");
  await expect(board).toHaveAttribute("data-frame-fit", "exercise");
  await tactical.getByRole("button", { name: "Saved view" }).click();
  await expect(board).toHaveAttribute("data-time", "1");
  await tactical.getByRole("button", { name: "Fit all", exact: true }).click();
  await expect(board).toHaveAttribute("data-frame-fit", "all");
  await expect(board).toHaveAttribute("data-cropped-details", "0");
  await tactical.getByRole("button", { name: "Fit pitch", exact: true }).click();
  await expect(board).toHaveAttribute("data-frame-fit", "pitch");
  await tactical.getByRole("button", { name: "Fit exercise", exact: true }).click();
  await expect(board).toHaveAttribute("data-time", "1");
  const bounds = (await board.boundingBox())!;
  expect(bounds.width).toBeGreaterThan(780);
  expect(bounds.height).toBeGreaterThan(320);
  expect(bounds.y + bounds.height).toBeLessThanOrEqual(page.viewportSize()!.height);
  const guidance = page.getByRole("complementary", { name: "Coaching information" });
  const instructions = guidance.getByRole("tabpanel", { name: "Coaching", exact: true });
  await expect(instructions.getByRole("heading", { name: "How to run" })).toBeVisible();
  await expect(instructions.getByText("Step 18. Check shoulders before receiving and support the spare player to break the line.")).toBeAttached();
  await instructions.focus();
  await page.keyboard.press("PageDown");
  await expect.poll(() => instructions.evaluate(el => el.scrollTop)).toBeGreaterThan(0);
  expect(await board.boundingBox()).toEqual(bounds);
  await guidance.getByRole("tab", { name: "Coaching" }).focus();
  await page.keyboard.press("ArrowRight");
  const equipment = guidance.getByRole("tab", { name: "Equipment" });
  await expect(equipment).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(equipment).toHaveAttribute("aria-selected", "true");
  await expect(guidance.getByRole("tabpanel", { name: "Equipment", exact: true })).toContainText("Balls");
  const notes = guidance.getByRole("tab", { name: "Notes", exact: true });
  await notes.click();
  await expect(notes).toHaveAttribute("aria-selected", "true");
  await expect(guidance.getByRole("tabpanel", { name: "Notes", exact: true })).toContainText("Turn out of pressure");
  await tactical.getByRole("button", { name: "Fullscreen tactical board" }).click();
  await expect.poll(() => page.evaluate(() => document.fullscreenElement?.getAttribute("aria-label"))).toBe("Tactical workspace");
  await expect.poll(async () => (await board.boundingBox())!.height).toBeGreaterThan(bounds.height);
  await tactical.getByRole("button", { name: "Exit fullscreen" }).click();
  await expect.poll(() => page.evaluate(() => document.fullscreenElement)).toBeNull();
  await expect(board).toHaveAttribute("data-time", "1");
  await expect(tactical.getByRole("button", { name: "Fullscreen tactical board" })).toBeFocused();
  const nextDiagram = tactical.getByRole("button", { name: "Next diagram" });
  await nextDiagram.click();
  await expect(nextDiagram).toBeFocused();
  await expect(board).toHaveAttribute("data-time", "4");
  await expect(board).toHaveAttribute("data-revision", "2");
  await expect(board).toHaveAttribute("data-frame-fit", "all");
  await expect(board).toHaveAttribute("data-clipped", "0");
  await expect(board).toHaveAttribute("data-cropped-details", "0");
  await expect(tactical.getByText("This attachment sits outside the activity area.", { exact: false })).toBeVisible();
  await tactical.getByRole("button", { name: "Fit exercise", exact: true }).click();
  await expect(tactical.getByRole("status")).toContainText("outside view");
  await tactical.getByRole("button", { name: "Show all", exact: true }).click();
  await expect(board).toHaveAttribute("data-clipped", "0");
  await expect(board).toHaveAttribute("data-time", "4");
  expect(fixture.writes()).toBe(0);
  expect(fixture.snapshot).toEqual(fixture.original);
});

test("an unavailable attachment, booking or invalid snapshot never substitutes a scene", async ({ page }) => {
  const fixture = await viewerFixture(page);
  await page.goto(fixture.url.replace("diagram=1", "diagram=9"));
  await expect(page.getByRole("region", { name: "Tactical workspace" }).getByRole("alert")).toHaveText("The selected diagram revision is unavailable.");
  await expect(page.locator(".scene-diagram")).toHaveCount(0);
  await page.getByRole("combobox", { name: "Attached diagram" }).selectOption("0");
  await expect(page.locator(".scene-diagram")).toHaveAttribute("data-revision", "3");
  await page.goto(fixture.url.replace("bookingRevision=1", "bookingRevision=99"));
  await expect(page.getByRole("heading", { name: "Saved session unavailable" })).toBeVisible();
  await expect(page.locator(".scene-diagram")).toHaveCount(0);
  await page.goto(fixture.url.replace("revision=1", "revision="));
  await expect(page.getByRole("heading", { name: "Invalid session reference" })).toBeVisible();
  fixture.withoutScene();
  await page.goto(fixture.url);
  await expect(page.getByRole("heading", { name: "Saved session unavailable" })).toBeVisible();
  await expect(page.locator(".scene-diagram")).toHaveCount(0);
  expect(fixture.writes()).toBe(0);
});

test("keeps a long activity sequence in one row and reveals selection without losing keyboard focus", async ({ page }) => {
  const fixture = await viewerFixture(page, { activityCount: 12 });
  await page.goto(fixture.url);
  const sequence = page.getByRole("navigation", { name: "Activity sequence" });
  const strip = sequence.locator(".viewer-activity-steps");
  const cards = strip.getByRole("button");
  const next = page.getByRole("button", { name: "Next activity" });
  const visible = (index: number) => cards.nth(index).evaluate(card => {
    const item = card.getBoundingClientRect(), viewport = card.parentElement!.getBoundingClientRect();
    return item.left >= viewport.left - 1 && item.right <= viewport.right + 1;
  });
  await expect(cards).toHaveCount(12);
  await expect.poll(() => visible(11)).toBe(false);
  const stripHeight = (await strip.boundingBox())!.height;
  await next.focus();
  for (let step = 2; step < 12; step++) await page.keyboard.press("Enter");
  await expect(cards.last()).toHaveAttribute("aria-current", "step");
  await expect.poll(() => visible(11)).toBe(true);
  await expect(next).toBeFocused();
  await expect(next).toBeDisabled();
  expect((await strip.boundingBox())!.height).toEqual(stripHeight);
  await cards.last().focus();
  await page.keyboard.press("Home");
  await expect(cards.first()).toBeFocused();
  await expect(cards.first()).toHaveAttribute("aria-current", "step");
  await expect.poll(() => visible(0)).toBe(true);
  expect(fixture.writes()).toBe(0);
});

test("header actions use the existing exact editor and copy confirmation without writing from the viewer", async ({ page }) => {
  const fixture = await viewerFixture(page);
  await page.goto(`${fixture.url}&q=Rondos&type=possession`);
  const editor = page.getByRole("link", { name: "Edit Session" });
  await expect(editor).toHaveAttribute("href", /\/sessions\?event=sample-4&revision=1&organization=.*&q=Rondos&type=possession/);
  await expect(page.getByRole("button", { name: "Schedule independent copy" })).toHaveCount(0);
  await editor.click();
  await expect(page.locator(".coaching-editor")).toBeVisible();
  const current = new URL(fixture.url, page.url());
  current.searchParams.set("revision", "2");
  current.searchParams.delete("booking");
  current.searchParams.delete("bookingRevision");
  current.searchParams.set("q", "Revised plan");
  await page.goto(current.href);
  await page.getByRole("button", { name: "Schedule independent copy" }).click();
  await expect(page.getByRole("dialog", { name: "Schedule independent copy" })).toBeVisible();
  await page.getByRole("button", { name: "Close scheduling form" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("searchbox", { name: "Find sessions" })).toHaveValue("Revised plan");
  expect(fixture.writes()).toBe(0);
  expect(fixture.snapshot).toEqual(fixture.original);
});

test("review A opens a saved-session link for a second membership and refuses an unlisted organisation", async ({ page }) => {
  const fixture = await viewerFixture(page);
  const firstId = fixture.snapshot.organizationId;
  const secondId = "synthetic-second-club";
  const second = domainBundleSchema.parse(JSON.parse(JSON.stringify(fixture.snapshot).replaceAll(`"${firstId}"`, `"${secondId}"`)));
  second.sessions.find(session => session.id === new URL(fixture.url, "http://localhost").searchParams.get("session") && session.revision === 1)!.content.title = "Second club coaching session";
  const reads: string[] = [];
  let rejectSecond = false;
  await page.route("**/api/organizations", r => r.fulfill({ json: { organizations: [
    { id: firstId, name: "First synthetic club", version: 4 },
    { id: secondId, name: "Second synthetic club", version: 4 },
  ] } }));
  await page.route("**/api/organizations/*/snapshot", r => {
    if (r.request().method() !== "GET") return r.fallback();
    const id = new URL(r.request().url()).pathname.split("/").at(-2)!;
    reads.push(id);
    if (id === firstId) return r.fulfill({ json: { version: 4, bundle: fixture.snapshot } });
    if (id === secondId && !rejectSecond) return r.fulfill({ json: { version: 4, bundle: second } });
    return r.fulfill({ status: 404, json: { error: "Saved records are unavailable" } });
  });
  const target = fixture.url.replace(`organization=${firstId}`, `organization=${secondId}`);
  await page.goto(target);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Second club coaching session");
  await expect(page.locator(".viewer-tactical .scene-diagram")).toHaveAttribute("data-revision", "3");
  expect(reads).toContain(secondId);

  rejectSecond = true;
  await page.reload();
  const load = page.getByRole("button", { name: "Load Second synthetic club" });
  await expect(load).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Saved session unavailable");
  await expect(page.locator(".scene-diagram")).toHaveCount(0);
  rejectSecond = false;
  await load.click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Second club coaching session");

  await page.goto(target.replace(secondId, "unlisted-club"));
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Saved session unavailable");
  await expect(page.getByRole("button", { name: /^Load / })).toHaveCount(0);
  expect(reads).not.toContain("unlisted-club");
  expect(fixture.writes()).toBe(0);
});

test("review D shows a framing warning and renders the exact diagram with its saved context", async ({ page }) => {
  const fixture = await viewerFixture(page, { areaLength: 0.005 });
  await page.goto(fixture.url);
  const tactical = page.getByRole("region", { name: "Tactical workspace" });
  await expect(tactical.getByText(/Activity dimensions cannot frame this diagram/)).toBeVisible();
  await tactical.getByRole("button", { name: "Fit exercise", exact: true }).click();
  const board = tactical.locator(".scene-diagram");
  await expect(board).toHaveAttribute("data-frame-length", "12");
  await expect(board).toHaveAttribute("data-frame-width", "20");
  await expect(board).toHaveAttribute("data-revision", "3");
  await expect(board).toHaveAttribute("data-time", "1");
  await expect(board.locator("[data-entity-id=p6]")).toHaveAttribute("data-world-x", "3.5");
  expect(fixture.writes()).toBe(0);
  expect(fixture.snapshot).toEqual(fixture.original);
});
