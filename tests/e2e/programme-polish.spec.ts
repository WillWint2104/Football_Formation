import { test, expect, type Page } from "@playwright/test";
import { inspectorExample } from "../fixtures/inspector";
import { domainBundleSchema } from "../../lib/domain/validation";

/** Same native synthetic snapshots and network boundary as B5b; no persistence writes. */
async function storage(page:Page,{busy=false,long=false}={}) {
  const bundle=inspectorExample(busy);let writes=0;const errors:string[]=[];
  if(long){
    const session=bundle.sessions.find(s=>s.id==='sample-3')!;
    session.content.title='Receiving under pressure and coordinated support across the thirds '.repeat(8).trim();
    bundle.events.find(e=>e.session?.id===session.id)!.title=session.content.title;
    session.content.objective='Create clear support angles and communicate before receiving. '.repeat(24);
    session.content.activities[1].content.coachingPoints=['Scan and adjust the support angle before each pass. '.repeat(20),'SupportAngle'.repeat(40)];
  }
  domainBundleSchema.parse(bundle);const before=structuredClone(bundle);
  page.on('pageerror',e=>errors.push(e.message));
  await page.context().route('**/*',r=>['localhost','127.0.0.1'].includes(new URL(r.request().url()).hostname)?r.continue():r.abort());
  await page.route('**/api/**',r=>r.abort());
  await page.route('**/api/organizations',r=>r.fulfill({json:{organizations:[{id:bundle.organizationId,name:'Synthetic B5c review club',version:4}]}}));
  await page.route('**/api/organizations/*/snapshot',r=>{if(r.request().method()!=='GET'){writes++;return r.abort();}return r.fulfill({json:{version:4,bundle}});});
  return {bundle,before,writes:()=>writes,errors,root:`/calendar?date=2026-11-05&view=week&organization=${bundle.organizationId}&team=first-team`};
}
async function loaded(page:Page){await expect(page.locator('.calendar-connection [role=status]')).toContainText('Loaded saved organisation snapshot');await expect(page.locator('.calendar-programme')).toHaveAttribute('aria-busy','false');}
const panel=(page:Page)=>page.getByRole('complementary',{name:'Session preview',exact:true});
const card=(page:Page)=>page.getByRole('button',{name:'First touch & support play, 2026-11-03, Technical',exact:true});
async function open(page:Page){await card(page).click();await expect(panel(page)).toBeVisible();await expect(page.locator('.calendar-programme')).toHaveAttribute('aria-busy','false');}

test('laptop planning actions share the heading row without reducing fonts or Calendar width',async({page},info)=>{
  const m=await storage(page);await page.goto(m.root);await loaded(page);await page.screenshot({path:info.outputPath('01-polish-closed.png')});
  await open(page);const heading=(await page.locator('.programme-page-heading').boundingBox())!;
  if(info.project.name==='laptop')expect(heading.height).toBeLessThanOrEqual(80);
  await expect(page.getByLabel('Team',{exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'This week',exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'Add session',exact:true}).first()).toBeVisible();
  const main=(await page.locator('.programme-week').boundingBox())!,aside=(await panel(page).boundingBox())!;
  expect(aside.width).toBe(info.project.name==='laptop'?320:380);expect(main.width).toBeGreaterThan(aside.width*2);
  expect(await page.locator('.programme-week .calendar-day').first().evaluate(e=>e.getBoundingClientRect().width)).toBeGreaterThanOrEqual(120);
  expect(await page.locator('.programme-week .calendar-event-title').first().evaluate(e=>parseFloat(getComputedStyle(e).fontSize))).toBeGreaterThanOrEqual(14);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await expect(panel(page).getByRole('link',{name:'Open Session',exact:true})).toBeInViewport();await expect(panel(page).getByRole('link',{name:'Coaching Guide',exact:true})).toBeInViewport();
  await page.screenshot({path:info.outputPath('02-polish-selected.png')});expect(m.writes()).toBe(0);expect(m.bundle).toEqual(m.before);expect(m.errors).toEqual([]);
});

test('pointer, keyboard, day context, booking selection and hover have distinct accessible states',async({page},info)=>{
  const m=await storage(page);await page.goto(m.root);await loaded(page);await open(page);
  const title=panel(page).getByRole('heading',{name:'First touch & support play',exact:true});await expect(title).toBeFocused();
  await expect(title).toHaveCSS('outline-style','none');await expect(title).toHaveCSS('box-shadow','none');
  await expect(page.getByRole('button',{name:'Select 2026-11-03',exact:true})).toHaveAccessibleDescription('Current Calendar date.');
  await expect(card(page)).toHaveAccessibleDescription('Selected Calendar booking.');await expect(card(page)).toHaveAttribute('aria-pressed','true');
  await page.screenshot({path:info.outputPath('03-pointer-selection.png')});
  await panel(page).getByRole('button',{name:'Dismiss session preview',exact:true}).click();await expect(panel(page)).toHaveCount(0);await expect(page.locator('.calendar-programme')).toHaveAttribute('aria-busy','false');await card(page).focus();await page.keyboard.press('Enter');
  await expect(title).toBeFocused();expect(await title.evaluate(e=>e.matches(':focus-visible'))).toBe(true);await expect(title).toHaveCSS('box-shadow',/rgb\(8, 122, 119\)/);
  await page.screenshot({path:info.outputPath('04-keyboard-title-focus.png')});await page.keyboard.press('Tab');
  const reading=panel(page).getByRole('region',{name:'Session coaching information',exact:true});await expect(reading).toBeFocused();await expect(reading).toHaveCSS('outline-style','solid');
  const other=page.getByRole('button',{name:'Mobility & activation, 2026-11-02, Recovery',exact:true});await other.hover();await expect(other).toHaveAttribute('aria-pressed','false');await expect(other).toHaveAccessibleDescription('Open the contextual inspector for this booking.');
  await page.screenshot({path:info.outputPath('05-keyboard-region-and-hover.png')});await page.keyboard.press('Escape');await expect(panel(page)).toHaveCount(0);await expect(page.getByLabel('Selected date',{exact:true})).toBeFocused();
  expect(m.writes()).toBe(0);expect(m.bundle).toEqual(m.before);expect(m.errors).toEqual([]);
});

test('long names and lengthy authored guidance remain readable and recoverable without horizontal scrolling',async({page},info)=>{
  const m=await storage(page,{long:true});await page.goto(m.root);await loaded(page);
  const event=m.bundle.events.find(e=>e.session?.id==='sample-3')!,booking=page.getByRole('button',{name:`${event.title}, 2026-11-03, Technical`,exact:true});
  await expect(booking).toHaveAttribute('title',event.title);const name=booking.locator('.calendar-event-title');
  expect(await name.evaluate(e=>e.getBoundingClientRect().height<=parseFloat(getComputedStyle(e).lineHeight)*3+1)).toBe(true);
  await booking.click();await expect(panel(page).getByRole('heading',{name:event.title,exact:true})).toHaveAttribute('title',event.title);
  const reading=panel(page).getByRole('region',{name:'Session coaching information',exact:true});await reading.getByText('SupportAngle'.repeat(40),{exact:true}).scrollIntoViewIfNeeded();
  expect(await reading.evaluate(e=>e.scrollWidth<=e.clientWidth+1)).toBe(true);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await expect(panel(page).getByRole('link',{name:'Open Session',exact:true})).toBeInViewport();await expect(panel(page).getByRole('link',{name:'Coaching Guide',exact:true})).toBeInViewport();
  await page.screenshot({path:info.outputPath('06-long-name-and-guidance.png')});expect(m.writes()).toBe(0);expect(m.bundle).toEqual(m.before);expect(m.errors).toEqual([]);
});

test('dense days, match hierarchy and full-width return preserve the accepted Programme',async({page},info)=>{
  const m=await storage(page,{busy:true});await page.goto(m.root);await loaded(page);await expect(page.locator('.calendar-week .calendar-event')).toHaveCount(13);
  await page.screenshot({path:info.outputPath('07-busy-closed.png')});await open(page);await page.screenshot({path:info.outputPath('08-busy-inspector.png')});
  const lane=page.locator('[data-date="2026-11-04"] .programme-day-sessions');await lane.locator('.calendar-event').last().scrollIntoViewIfNeeded();await expect(lane.locator('.calendar-event').last()).toBeInViewport();
  await page.getByRole('button',{name:'Riverside FC vs Western United, 2026-11-07, Match',exact:true}).click();await expect(panel(page).getByRole('heading',{name:'Match details',exact:true})).toBeVisible();await expect(panel(page).getByRole('link',{name:'Open Session',exact:true})).toHaveCount(0);
  await page.screenshot({path:info.outputPath('09-match-selected.png')});await panel(page).getByRole('button',{name:'Dismiss session preview',exact:true}).click();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);expect(m.writes()).toBe(0);expect(m.bundle).toEqual(m.before);expect(m.errors).toEqual([]);
});
