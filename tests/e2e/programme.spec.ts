import { test, expect, type Page } from "@playwright/test";
import { programmeBusyExample, programmeExample } from "../fixtures/programme";
import { domainBundleSchema } from "../../lib/domain/validation";

/** Synthetic graph only; no hosted calls or production browser profile. */
async function storage(page:Page,initial=programmeExample()){
  let bundle=initial,version=4,writes=0;const before=structuredClone(bundle);
  await page.context().route('**/*',r=>['localhost','127.0.0.1'].includes(new URL(r.request().url()).hostname)?r.continue():r.abort());
  await page.route('**/api/**',r=>r.abort());
  await page.route('**/api/organizations',r=>r.fulfill({json:{organizations:[{id:bundle.organizationId,name:'Concept 01 review club · synthetic',version}]}}));
  await page.route('**/api/organizations/*/snapshot',async r=>{
    if(r.request().method()==='POST'){writes++;const input=r.request().postDataJSON();expect(input.expectedVersion).toBe(version);bundle=domainBundleSchema.parse(input.bundle);version++;return r.fulfill({json:{version}});}
    return r.fulfill({json:{version,bundle}});
  });
  return {root:`/calendar?date=2026-11-05&view=week&organization=${bundle.organizationId}&team=first-team`,writes:()=>writes,bundle:()=>bundle,before};
}
async function loaded(page:Page){await expect(page.locator('.calendar-connection [role=status]')).toContainText('Loaded saved organisation snapshot');await expect(page.locator('.calendar-programme')).toHaveAttribute('aria-busy','false');}

test('Concept 01 frame, full-width seven-day week and actual fixture context at both desktop sizes',async({page},info)=>{
  const m=await storage(page),errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(m.root);await loaded(page);
  await expect(page.getByRole('heading',{name:'2 – 8 November 2026',exact:true})).toBeVisible();
  await expect(page.locator('.calendar-week .calendar-day')).toHaveCount(7);await expect(page.locator('.calendar-week .calendar-event')).toHaveCount(6);
  await expect(page.getByRole('region',{name:'Weekly programme context'})).toContainText('Riverside FC vs Western United');
  await expect(page.locator('[data-date="2026-11-02"] .calendar-day-number')).toContainText('D−5');
  await expect(page.locator('[data-date="2026-11-07"] .calendar-day-number')).toContainText('Match day');
  await expect(page.locator('.programme-week-summary')).toContainText('5 training sessions · 1 fixture');
  await expect(page.locator('.calendar-week .scene-diagram')).toHaveCount(1);
  await expect(page.locator('.calendar-week .scene-diagram')).toHaveAttribute('data-revision','1');
  await expect(page.locator('.calendar-week .scene-diagram')).toHaveAttribute('data-time','2');
  await expect(page.locator('.calendar-week img')).toHaveCount(0);
  await expect(page.getByRole('navigation',{name:'Primary navigation',exact:true}).getByRole('link')).toHaveCount(5);
  await expect(page.getByRole('navigation',{name:'Main navigation',exact:true}).getByRole('link')).toHaveCount(5);
  await expect(page.locator('.programme-week-summary')).not.toContainText('Focus:');
  await expect(page.locator('.calendar-planning .calendar-preview[aria-label]')).toHaveCount(0);
  const board=(await page.locator('.programme-week').boundingBox())!,main=(await page.locator('.calendar-planning').boundingBox())!;
  expect(Math.abs(board.width-main.width)).toBeLessThan(2);expect(board.x+board.width).toBeLessThanOrEqual(info.project.use.viewport!.width);
  expect(await page.locator('.programme-frame-header').evaluate(e=>getComputedStyle(e).color)).toBe('rgb(243, 247, 251)');
  expect(await page.locator('body > aside').evaluate(e=>getComputedStyle(e).width)).toBe('104px');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  const day=page.locator('[data-date="2026-11-03"] .programme-day-sessions'),last=page.getByRole('button',{name:'Distribution drills, 2026-11-03, Goalkeeper',exact:true});
  expect((await last.boundingBox())!.y+(await last.boundingBox())!.height).toBeLessThanOrEqual((await day.boundingBox())!.y+(await day.boundingBox())!.height+1);
  await page.screenshot({path:info.outputPath('programme-week-closed.png')});
  if(info.project.name==='desktop'){await page.setViewportSize({width:1672,height:941});await page.screenshot({path:info.outputPath('programme-reference-size.png')});await page.setViewportSize({width:1920,height:1080});}
  expect(m.writes()).toBe(0);expect(m.bundle()).toEqual(m.before);expect(errors).toEqual([]);
});

test('quiet week stays content-sized, dense week remains reachable, and match / empty days are explicit',async({page},info)=>{
  const m=await storage(page,programmeBusyExample());await page.goto(m.root);await loaded(page);
  await expect(page.locator('.calendar-week .calendar-event')).toHaveCount(13);
  await expect(page.locator('.programme-week-summary')).toContainText('12 training sessions · 1 fixture');
  await expect(page.locator('.calendar-week .scene-diagram')).toHaveCount(1);
  for(const day of ['2026-11-02','2026-11-04']) {
    const lane=page.locator(`[data-date="${day}"] .programme-day-sessions`);
    const last=lane.locator('.calendar-event').last();await last.scrollIntoViewIfNeeded();await expect(last).toBeInViewport();
    await lane.evaluate(e=>e.scrollTop=0);
  }
  await page.screenshot({path:info.outputPath('programme-busy-week.png')});
  await page.getByRole('button',{name:'Select 2026-11-07',exact:true}).click();
  await expect(page.locator('[data-date="2026-11-07"]')).toHaveClass(/calendar-date-selected/);
  await expect(page.locator('[data-date="2026-11-08"]')).toContainText('No sessions scheduled');
  await page.screenshot({path:info.outputPath('programme-match-empty.png')});
  expect(m.writes()).toBe(0);expect(m.bundle()).toEqual(m.before);
});

test('quiet grid does not stretch with taller windows and primary navigation retains keyboard focus',async({page},info)=>{
  const m=await storage(page);await page.goto(m.root);await loaded(page);
  await expect(page.locator('.calendar-week .scene-diagram')).toHaveCount(1);
  const before=(await page.locator('.programme-week').boundingBox())!.height;
  await page.setViewportSize({width:info.project.use.viewport!.width,height:info.project.use.viewport!.height+300});
  expect((await page.locator('.programme-week').boundingBox())!.height).toBe(before);
  const programme=page.getByRole('navigation',{name:'Primary navigation',exact:true}).getByRole('link',{name:'Programme',exact:true});
  await programme.focus();await page.keyboard.press('Tab');
  await expect(page.getByRole('navigation',{name:'Primary navigation',exact:true}).getByRole('link',{name:'Sessions',exact:true})).toBeFocused();
  expect(m.writes()).toBe(0);
});

test('existing selected-session preview and exact actions remain intact; dismissal releases Calendar space',async({page},info)=>{
  const m=await storage(page);await page.goto(m.root);await loaded(page);const wide=(await page.locator('.calendar-main').boundingBox())!.width;
  await page.getByRole('button',{name:'First touch & support play, 2026-11-03, Technical',exact:true}).click();
  const panel=page.getByRole('complementary',{name:'Session preview'});await expect(panel).toBeVisible();
  await expect(panel.locator('.scene-diagram')).toHaveAttribute('data-revision','1');await expect(panel.locator('.scene-diagram')).toHaveAttribute('data-time','2');
  await expect(panel.getByRole('link',{name:'Open Session',exact:true})).toHaveAttribute('href',/^\/sessions\?event=sample-4&revision=1&calendar=/);
  await page.screenshot({path:info.outputPath('programme-existing-preview.png')});
  await page.getByRole('button',{name:'Dismiss session preview',exact:true}).click();await expect(panel).toHaveCount(0);
  expect((await page.locator('.calendar-main').boundingBox())!.width).toBe(wide);
  expect(m.writes()).toBe(0);expect(m.bundle()).toEqual(m.before);
});

test('week controls keep actual dates, team/type filtering, native picker and compact Month cards',async({page},info)=>{
  const m=await storage(page);await page.goto(m.root);await loaded(page);
  await page.getByRole('button',{name:'Next period',exact:true}).click();await expect(page).toHaveURL(/date=2026-11-12/);
  await page.getByRole('button',{name:'Previous period',exact:true}).click();await expect(page).toHaveURL(/date=2026-11-05/);
  await page.getByLabel('Session type',{exact:true}).selectOption('goalkeeper');await expect(page.locator('.calendar-event')).toHaveCount(1);
  await expect(page.getByRole('region',{name:'Weekly programme context'})).toContainText('Riverside FC vs Western United');
  await page.getByLabel('Team',{exact:true}).selectOption('youth-team');await expect(page.locator('.calendar-event')).toHaveCount(0);
  await expect(page.getByRole('region',{name:'Weekly programme context'})).toContainText('No fixture scheduled');
  await expect(page.locator('.programme-overview')).toContainText('Focus not specified');
  await page.screenshot({path:info.outputPath('programme-empty-team.png')});
  await page.getByLabel('Team',{exact:true}).selectOption('first-team');await page.getByLabel('Session type',{exact:true}).selectOption('');
  await page.locator('[data-date="2026-11-04"]').getByRole('button',{name:'Choose session',exact:true}).click();
  await expect(page.getByRole('dialog')).toContainText('2026-11-04 · week view · First Team');
  await page.getByRole('button',{name:'Cancel · return to Calendar',exact:true}).click();await expect(page.getByLabel('Selected date')).toBeFocused();
  await page.getByRole('button',{name:'Month',exact:true}).click();await expect(page.locator('.calendar-month .calendar-event-time')).toHaveCount(0);
  await expect(page.getByRole('button',{name:'Corners & free kicks, 2026-11-06, Tactical',exact:true})).toHaveText('Corners & free kicks');
  await page.screenshot({path:info.outputPath('programme-month-preserved.png')});expect(m.writes()).toBe(0);
});

test('Calendar frame is scoped and existing C3 / native session routes retain their shell',async({page})=>{
  const m=await storage(page);await page.goto(m.root);await loaded(page);
  await page.getByRole('navigation',{name:'Primary navigation'}).getByRole('link',{name:'Sessions',exact:true}).click();await expect(page).toHaveURL(/\/sessions$/);
  await expect(page.locator('.programme-frame-header')).toHaveCount(0);expect(await page.locator('body > aside').evaluate(e=>getComputedStyle(e).width)).toBe('240px');
  await page.goto('/session-designer');await expect(page.locator('.programme-frame-header')).toHaveCount(0);await expect(page.getByRole('navigation',{name:'Main navigation'}).getByRole('link',{name:'Session Designer',exact:true})).toHaveAttribute('aria-current','page');
  expect(m.writes()).toBe(0);
});
