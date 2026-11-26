import { test, expect, type Page } from "@playwright/test";
import { coachingPresentationBundle } from "../fixtures/coaching-presentation";
import { preparePrintPage, openPrintPlan } from "../fixtures/print-browser";
import { printExample } from "../fixtures/print-session";

async function preview(page: Page, stages = 6, width = 20, savedSeconds?: number, customize?: (fixture: ReturnType<typeof coachingPresentationBundle>) => void) {
  const fixture = coachingPresentationBundle(stages, width);
  customize?.(fixture);
  const { bundle, session } = fixture;
  if (savedSeconds !== undefined) session.content.activities[1].content.diagrams[0].representativeSeconds = savedSeconds;
  const before = structuredClone(bundle);let writes = 0;
  await page.context().route("**/*", r => ["127.0.0.1", "localhost"].includes(new URL(r.request().url()).hostname) ? r.continue() : r.abort());
  await page.route("**/api/**", r => { if(r.request().method()!=="GET")writes++;return r.abort(); });
  await page.route("**/api/organizations", r => r.fulfill({json:{organizations:[{id:bundle.organizationId,name:"Synthetic presentation club",version:4}]}}));
  await page.route("**/api/organizations/*/snapshot", r => {if(r.request().method()!=="GET"){writes++;return r.abort();}return r.fulfill({json:{version:4,bundle}});});
  await page.goto(`/sessions?session=${session.id}&revision=1&organization=${bundle.organizationId}&view=preview`);
  await expect(page.locator('.coaching-diagram-preview')).toBeVisible();
  await expect(page.locator('.coaching-diagram-preview .scene-diagram')).toHaveAttribute('data-scene-id','presentation-practice');
  return { bundle, before, writes:()=>writes };
}

test("scene stages change actual geometry and visibility, endpoint poses stay in stage, saved pin survives reload",async({page})=>{
  const m=await preview(page), surface=page.locator('.coaching-diagram-preview'), scene=surface.locator('.scene-diagram');
  await expect(surface.getByRole('combobox',{name:'Scene stage'}).locator('option')).toHaveCount(6);
  await expect(scene).toHaveAttribute('data-time','1');await expect(scene.locator('[data-entity-id=p6]')).toHaveAttribute('data-world-x','3.5');
  await surface.getByRole('button',{name:'Next scene stage'}).click();await expect(scene.locator('[data-entity-id=p6]')).toHaveAttribute('data-world-x','4');await expect(scene.locator('[data-entity-id=cone]')).toHaveCount(0);
  await surface.getByRole('slider',{name:'Scene stage pose seconds'}).fill('2');await expect(scene).toHaveAttribute('data-time','4');await expect(scene.locator('svg>desc')).toContainText('Authored phase 2');
  await surface.getByRole('combobox',{name:'Scene stage'}).selectOption('phase-6');await expect(scene.locator('[data-entity-id=p6]')).toHaveAttribute('data-world-x','8');
  await expect(surface).toHaveAttribute('data-saved-time','1');await surface.getByRole('button',{name:'Saved moment · 1 s',exact:true}).click();await expect(scene).toHaveAttribute('data-time','1');
  await page.reload();await expect(scene).toHaveAttribute('data-time','1');expect(m.bundle).toEqual(m.before);expect(m.writes()).toBe(0);
});

test("a previous-stage endpoint at the saved timestamp is still transient and restores the exact saved stage",async({page})=>{
  const m=await preview(page,6,20,2),surface=page.locator('.coaching-diagram-preview'),scene=surface.locator('.scene-diagram');
  await expect(scene.locator('[data-entity-id=p6]')).toHaveAttribute('data-world-y','4');
  await surface.getByRole('combobox',{name:'Scene stage'}).selectOption('phase-1');await surface.getByRole('slider',{name:'Scene stage pose seconds'}).fill('2');
  await expect(scene).toHaveAttribute('data-time','2');await expect(scene.locator('[data-entity-id=p6]')).toHaveAttribute('data-world-y','6');
  await surface.getByRole('button',{name:'Saved moment · 2 s',exact:true}).click();await expect(scene.locator('[data-entity-id=p6]')).toHaveAttribute('data-world-y','4');expect(m.writes()).toBe(0);expect(m.bundle).toEqual(m.before);
});

test("arrow-free static practice and single authored stage do not invent navigation or movements",async({page})=>{
  const m=await preview(page,0,12);await expect(page.getByText('Static diagram',{exact:true})).toBeVisible();await expect(page.getByRole('combobox',{name:'Scene stage'})).toHaveCount(0);await expect(page.locator('.coaching-diagram-preview .scene-diagram polyline')).toHaveCount(0);expect(m.writes()).toBe(0);
});

test("12x20 framing keeps metric bounds, keyboard focus and read-only Fit All controls",async({page},info)=>{
  const m=await preview(page,1), surface=page.locator('.coaching-diagram-preview'), scene=surface.locator('.scene-diagram');
  await expect(scene).toHaveAttribute('data-frame-length','12');await expect(scene).toHaveAttribute('data-frame-width','20');await expect(scene).toHaveAttribute('data-clipped','0');
  const measured=await scene.evaluate(el=>({width:Number((el as HTMLElement).dataset.width),height:Number((el as HTMLElement).dataset.height),actual:el.getBoundingClientRect().height}));expect(measured.width).toBeGreaterThan(120);expect(measured.height).toBeCloseTo(measured.actual,0);
  await surface.getByRole('button',{name:'Fit all content',exact:true}).focus();await expect(surface.getByRole('button',{name:'Fit all content',exact:true})).toBeFocused();await page.keyboard.press('Enter');await expect(surface.getByRole('button',{name:'Fit all content',exact:true})).toHaveAttribute('aria-pressed','true');
  await surface.getByRole('button',{name:'Fit exercise',exact:true}).click();await expect(scene).toHaveAttribute('data-frame-length','12');expect(m.writes()).toBe(0);
  await scene.scrollIntoViewIfNeeded();await page.screenshot({path:info.outputPath('coaching-practice.png')});
});

test("three fit targets preserve the same saved moment and keep long annotations keyboard inspectable", async ({ page }, info) => {
  const text = "Receive on the half-turn, check the far shoulder, then support the next pass before the defender closes the lane.";
  const m = await preview(page, 1, 20, 1, ({ scene }) => {
    scene.field = { length: 60, width: 36 };
    scene.stages[0].tracks.push({ id: "long-note", kind: "annotation", visibleFrom: 0, visibleUntil: 2,
      annotation: { kind: "note", position: { x: 25, y: 5 }, text } });
    const first = scene.entities.find(entity => entity.id === "p1")!;
    scene.entities.find(entity => entity.id === "p2")!.position = { ...first.position };
  });
  const surface = page.locator(".coaching-diagram-preview"), board = surface.locator(".scene-diagram");
  await expect(board).toHaveAttribute("data-frame-length", "12");
  await expect(board).toHaveAttribute("data-cropped-details", "1");
  await expect(surface.getByRole("status")).toContainText("authored details outside view");
  await page.screenshot({ path: info.outputPath("fit-exercise.png") });
  await surface.getByRole("button", { name: "Fit pitch", exact: true }).click();
  await expect(board).toHaveAttribute("data-frame-length", "60");
  await expect(board).toHaveAttribute("data-frame-width", "36");
  await expect(board).toHaveAttribute("data-time", "1");
  await page.screenshot({ path: info.outputPath("fit-pitch.png") });
  await surface.getByRole("button", { name: "Fit all content", exact: true }).click();
  await expect(board).toHaveAttribute("data-frame-length", "25");
  await expect(board).toHaveAttribute("data-cropped-details", "0");
  const scale = await board.getAttribute("data-scale");
  await surface.getByLabel("Inspect diagram labels and players", { exact: true }).click();
  const note = surface.getByRole("button", { name: text, exact: true });
  await note.focus();
  await page.keyboard.press("Enter");
  await expect(note).toHaveAttribute("aria-pressed", "true");
  await expect(board.locator('[data-inspection-highlight="annotation:long-note"]')).toBeVisible();
  await expect(board).toHaveAttribute("data-scale", scale!);
  await expect(board.locator('[data-inspection-highlight="annotation:long-note"]')).toBeInViewport();
  await expect(board).toHaveAttribute("data-label-collisions", "0");
  expect(Number(await board.getAttribute("data-overlapping-players"))).toBeGreaterThanOrEqual(2);
  const first = board.locator("[data-entity-id=p1]"), second = board.locator("[data-entity-id=p2]");
  for (const coordinate of ["data-world-x", "data-world-y"]) expect(await first.getAttribute(coordinate)).toBe(await second.getAttribute(coordinate));
  await expect(board).toHaveAttribute("data-time", "1");
  await page.screenshot({ path: info.outputPath("fit-all-inspection.png") });
  const player = surface.getByRole("button", { name: /Team A · #1 ·/ });
  await player.focus();
  await page.keyboard.press("Enter");
  await expect(board.locator('[data-inspection-highlight="entity:p1"]')).toBeVisible();
  await expect(board.locator("[data-entity-id=p1]")).toHaveAttribute("data-world-x", "2");
  await page.screenshot({ path: info.outputPath("overlapping-player-inspection.png") });
  expect(m.bundle).toEqual(m.before);
  expect(m.writes()).toBe(0);
});

test("expanded local preview framing stays coordinated with the parent and preserves the complete package",async({page,context})=>{
  await preparePrintPage(page,context);const id=await openPrintPlan(page,printExample());
  const before=await page.evaluate(id=>window.companionTest.browserCompanionRepository().read(id),id);
  await page.getByRole('group',{name:'Fit diagram',exact:true}).getByRole('button',{name:'Fit all content',exact:true}).click();
  await page.getByRole('button',{name:'Expand diagram',exact:true}).click();const dialog=page.getByRole('dialog',{name:'Expanded activity diagram'});
  await dialog.getByRole('button',{name:'Fit exercise',exact:true}).click();
  await expect(dialog.locator('.scene-diagram')).toHaveAttribute('data-frame-length','12');
  await dialog.getByRole('combobox',{name:'Scene stage',exact:true}).selectOption('stage-2');
  await expect(dialog.locator('.scene-diagram')).toHaveAttribute('data-time','6');
  await dialog.getByRole('button',{name:'Fit all content',exact:true}).click();await expect(dialog.locator('.scene-diagram')).toHaveAttribute('data-time','6');
  await dialog.getByRole('button',{name:'Fit exercise',exact:true}).click();await expect(dialog.locator('.scene-diagram')).toHaveAttribute('data-time','6');
  await dialog.getByRole('button',{name:'Close diagram · Esc',exact:true}).click();
  await expect(page.getByRole('group',{name:'Fit diagram',exact:true}).getByRole('button',{name:'Fit exercise',exact:true})).toHaveAttribute('aria-pressed','true');
  expect(await page.evaluate(id=>window.companionTest.browserCompanionRepository().read(id),id)).toEqual(before);
});
