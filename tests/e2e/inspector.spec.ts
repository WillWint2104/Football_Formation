import { test, expect, type Page } from "@playwright/test";
import { inspectorExample } from "../fixtures/inspector";

async function storage(page:Page,{busy=false,invalid=false,longTitle=false,failure=0}={}) {
  const bundle=inspectorExample(busy);let writes=0;
  if(longTitle){const title='Receiving under pressure and coordinated support across the thirds '.repeat(8).trim();bundle.events.find(e=>e.session?.id==='sample-3')!.title=title;bundle.sessions.find(s=>s.id==='sample-3')!.content.title=title;}
  if(invalid){
    bundle.organizationId="unavailable-inspector-club";
    for(const values of [bundle.teams,bundle.coaches,bundle.events,bundle.sessions,bundle.templates,bundle.exercises,bundle.scenes,bundle.documents]) for(const record of values) record.organizationId=bundle.organizationId;
    bundle.scenes=bundle.scenes.filter(s=>!(s.id==="example-rondo" && s.revision===1));
  }
  const before=structuredClone(bundle),errors:string[]=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.context().route('**/*',r=>['127.0.0.1','localhost'].includes(new URL(r.request().url()).hostname)?r.continue():r.abort());
  await page.route('**/api/**',r=>r.abort());
  await page.route('**/api/organizations',r=>r.fulfill({json:{organizations:[{id:bundle.organizationId,name:'Synthetic inspector review club',version:4}]}}));
  await page.route('**/api/organizations/*/snapshot',r=>{if(r.request().method()!=='GET'){writes++;return failure ? r.fulfill({status:failure,json:{error:'Synthetic conflict'}}) : r.abort();}return r.fulfill({json:{version:4,bundle}});});
  return {root:`/calendar?date=2026-11-05&view=week&organization=${bundle.organizationId}&team=first-team`,bundle,before,writes:()=>writes,errors};
}
async function loaded(page:Page){await expect(page.locator('.calendar-connection [role=status]')).toContainText('Loaded saved organisation snapshot');await expect(page.locator('.calendar-programme')).toHaveAttribute('aria-busy','false');}
const panel=(page:Page)=>page.getByRole('complementary',{name:'Session preview',exact:true});
async function open(page:Page){await page.getByRole('button',{name:'First touch & support play, 2026-11-03, Technical',exact:true}).click();await expect(panel(page)).toBeVisible();}

test('inspector opens read-only beside a dominant seven-day Calendar; closing restores full width',async({page},info)=>{
  const m=await storage(page);await page.goto(m.root);await loaded(page);
  const full=(await page.locator('.programme-week').boundingBox())!.width;
  await page.screenshot({path:info.outputPath('01-inspector-closed.png')});await open(page);
  await expect(panel(page).getByRole('heading',{name:'First touch & support play',exact:true})).toBeFocused();
  const board=(await page.locator('.programme-week').boundingBox())!,inspector=(await panel(page).boundingBox())!;
  expect(board.width).toBeGreaterThan(inspector.width*2);expect(inspector.x+inspector.width).toBeLessThanOrEqual(info.project.use.viewport!.width);
  expect(inspector.y).toBeLessThan(board.y);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  expect(await page.locator('.programme-week .calendar-day').first().evaluate(e=>e.getBoundingClientRect().width)).toBeGreaterThanOrEqual(120);
  await expect(panel(page).getByRole('link',{name:'Open Session',exact:true})).toBeVisible();await expect(panel(page).getByRole('link',{name:'Coaching Guide',exact:true})).toBeVisible();
  await expect(panel(page).locator('.scene-diagram')).toHaveAttribute('data-revision','1');await expect(panel(page).locator('.scene-diagram')).toHaveAttribute('data-time','2');
  await page.screenshot({path:info.outputPath('02-inspector-training.png')});
  if(info.project.name==='desktop'){await page.setViewportSize({width:1672,height:941});await page.screenshot({path:info.outputPath('concept-size-1672x941.png')});await page.setViewportSize({width:1920,height:1080});}
  await panel(page).getByRole('button',{name:'Dismiss session preview',exact:true}).click();await expect(panel(page)).toHaveCount(0);
  expect((await page.locator('.programme-week').boundingBox())!.width).toBe(full);await expect(page.getByLabel('Selected date',{exact:true})).toBeFocused();
  expect(m.writes()).toBe(0);expect(m.bundle).toEqual(m.before);expect(m.errors).toEqual([]);
});

test('switching sessions, Back/Forward and refresh preserve booking context and reset only local diagram selection',async({page},info)=>{
  const m=await storage(page);await page.goto(m.root);await loaded(page);await open(page);const first=page.url();
  await panel(page).getByRole('button',{name:'Diagram 2 · r2',exact:true}).click();await expect(panel(page).locator('.scene-diagram')).toHaveAttribute('data-time','4');
  await page.getByRole('button',{name:'Pressing & defensive shape, 2026-11-05, Tactical',exact:true}).click();
  await expect(panel(page).getByRole('heading',{name:'Pressing & defensive shape',exact:true})).toBeVisible();await expect(panel(page)).toContainText('No tactical diagrams attached');
  await page.screenshot({path:info.outputPath('03-inspector-switched.png')});
  await page.goBack();await expect(page).toHaveURL(first);await expect(panel(page).locator('.scene-diagram')).toHaveAttribute('data-revision','1');
  await page.goForward();await expect(panel(page)).toContainText('Pressing & defensive shape');await page.reload();await loaded(page);
  await expect(page.getByLabel('Team',{exact:true})).toHaveValue('first-team');await expect(page.getByLabel('Selected date',{exact:true})).toHaveValue('2026-11-05');
  expect(m.writes()).toBe(0);expect(m.bundle).toEqual(m.before);expect(m.errors).toEqual([]);
});

test('multiple diagrams and activity selection use exact authored pins; coaching region scrolls independently',async({page},info)=>{
  const m=await storage(page);await page.goto(m.root);await loaded(page);await open(page);
  await panel(page).getByRole('button',{name:'Diagram 2 · r2',exact:true}).click();await expect(panel(page).locator('.scene-diagram')).toHaveAttribute('data-revision','2');await expect(panel(page).locator('.scene-diagram')).toHaveAttribute('data-time','4');
  await page.screenshot({path:info.outputPath('04-inspector-multiple-diagrams.png')});
  await panel(page).getByLabel('Diagram activity',{exact:true}).selectOption('activity-2');await expect(panel(page).locator('.scene-diagram')).toHaveAttribute('data-scene-id','example-half');await expect(panel(page).locator('.scene-diagram')).toHaveAttribute('data-time','3');
  const region=panel(page).getByRole('region',{name:'Session coaching information',exact:true});
  const pageY=await page.evaluate(()=>scrollY);await region.focus();await page.keyboard.press('PageDown');
  await expect.poll(()=>region.evaluate(e=>e.scrollTop)).toBeGreaterThan(0);expect(await page.evaluate(()=>scrollY)).toBe(pageY);
  await page.screenshot({path:info.outputPath('08-inspector-keyboard-scroll.png')});
  await panel(page).getByRole('button',{name:'Show diagram for 5v2 Rondo',exact:true}).click();await expect(panel(page).locator('.scene-diagram')).toHaveAttribute('data-revision','1');
  await expect(panel(page).locator('.scene-diagram')).toBeInViewport();await expect(panel(page).getByRole('heading',{name:'Session diagram',exact:true})).toBeFocused();
  await page.screenshot({path:info.outputPath('10-activity-diagram-revealed.png')});
  await page.keyboard.press('Escape');await expect(panel(page)).toHaveCount(0);await expect(page.getByLabel('Selected date',{exact:true})).toBeFocused();
  expect(m.writes()).toBe(0);expect(m.bundle).toEqual(m.before);expect(m.errors).toEqual([]);
});

test('match and no-diagram bookings show actual details without invented coaching sources',async({page},info)=>{
  const m=await storage(page);await page.goto(m.root);await loaded(page);
  await page.getByRole('button',{name:'Riverside FC vs Western United, 2026-11-07, Match',exact:true}).click();
  await expect(panel(page).getByRole('heading',{name:'Match details',exact:true})).toBeVisible();await expect(panel(page)).toContainText('Main Pitch');
  await expect(panel(page).getByRole('link',{name:'Open Session',exact:true})).toHaveCount(0);await expect(panel(page).locator('.scene-diagram')).toHaveCount(0);
  await page.screenshot({path:info.outputPath('05-inspector-match.png')});
  await panel(page).getByRole('button',{name:'Edit Booking',exact:true}).click();await expect(page.getByRole('dialog')).toBeVisible();await page.getByRole('button',{name:'Cancel',exact:true}).click();
  await page.getByRole('button',{name:'Distribution drills, 2026-11-03, Goalkeeper',exact:true}).click();await expect(panel(page)).toContainText('No tactical diagrams attached to this session.');
  await page.screenshot({path:info.outputPath('06-inspector-no-diagram.png')});expect(m.writes()).toBe(0);expect(m.bundle).toEqual(m.before);
});

test('invalid referenced scene is rejected by the native graph boundary instead of substituting a different source',async({page},info)=>{
  const m=await storage(page,{invalid:true});await page.goto(`${m.root}&event=sample-4&bookingRevision=1`);
  await expect(page.locator('.calendar-connection [role=status]')).toContainText('could not be validated');
  await expect(page.locator('.calendar-context-warning[role=alert]')).toBeVisible();await expect(panel(page)).toHaveCount(0);
  await page.screenshot({path:info.outputPath('06b-missing-revision-source-rejected.png')});expect(m.writes()).toBe(0);expect(m.errors).toEqual([]);
});

test('busy programme retains readable lanes and context-pinned editor / guide navigation',async({page},info)=>{
  const m=await storage(page,{busy:true});await page.goto(m.root);await loaded(page);await open(page);
  await expect(page.locator('.programme-week .calendar-event')).toHaveCount(13);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:info.outputPath('07-inspector-busy-week.png')});
  const openLink=panel(page).getByRole('link',{name:'Open Session',exact:true}),guide=panel(page).getByRole('link',{name:'Coaching Guide',exact:true});
  await expect(openLink).toHaveAttribute('href',/^\/sessions\?event=sample-4&revision=1&calendar=/);await expect(guide).toHaveAttribute('href',/^\/guides\?session=sample-3&revision=1&event=sample-4&bookingRevision=1&calendar=/);
  await openLink.click();await expect(page.getByRole('heading',{name:'Edit scheduled session',exact:true})).toBeVisible();await page.getByRole('link',{name:'Cancel / Return to Calendar',exact:true}).click();
  await expect(panel(page).locator('.scene-diagram')).toHaveAttribute('data-revision','1');
  await panel(page).getByRole('link',{name:'Coaching Guide',exact:true}).click();await expect(page.locator('.guide-saved-diagram .scene-diagram').first()).toHaveAttribute('data-revision','1');
  await page.getByRole('link',{name:'Return to Calendar',exact:true}).click();await expect(panel(page)).toContainText('First touch & support play');expect(m.writes()).toBe(0);expect(m.bundle).toEqual(m.before);expect(m.errors).toEqual([]);
});

test('long titles retain full accessible text without consuming the reading region or hiding primary actions',async({page},info)=>{
  const m=await storage(page,{longTitle:true});await page.goto(`${m.root}&event=sample-4&bookingRevision=1`);await loaded(page);
  const title=m.bundle.events.find(e=>e.id==='sample-4')!.title;
  const heading=panel(page).getByRole('heading',{name:title,exact:true});await expect(heading).toHaveAttribute('title',title);
  expect((await panel(page).getByRole('region',{name:'Session coaching information',exact:true}).boundingBox())!.height).toBeGreaterThan(160);
  await expect(panel(page).getByRole('link',{name:'Open Session',exact:true})).toBeVisible();await expect(panel(page).getByRole('link',{name:'Coaching Guide',exact:true})).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:info.outputPath('09-inspector-long-title.png')});expect(m.writes()).toBe(0);expect(m.errors).toEqual([]);
});

test('save conflict keeps source history intact and still allows read-only inspector dismissal',async({page},info)=>{
  const m=await storage(page,{failure:409});await page.goto(m.root);await loaded(page);const full=(await page.locator('.programme-week').boundingBox())!.width;await open(page);
  await panel(page).getByRole('button',{name:'Edit Booking',exact:true}).click();const dialog=page.getByRole('dialog');
  await dialog.getByLabel('Start time',{exact:true}).fill('16:00');await dialog.getByLabel('End time',{exact:true}).fill('17:15');await dialog.getByRole('button',{name:'Save booking',exact:true}).click();
  await expect(dialog.getByRole('button',{name:'Save booking',exact:true})).toBeDisabled();await page.getByRole('button',{name:'Close scheduling form',exact:true}).click();
  await panel(page).getByRole('button',{name:'Dismiss session preview',exact:true}).click();await expect(panel(page)).toHaveCount(0);
  expect((await page.locator('.programme-week').boundingBox())!.width).toBe(full);await expect(page.locator('.calendar-connection [role=status]')).toContainText('Reload');
  await page.screenshot({path:info.outputPath('11-conflict-inspector-dismissed.png')});expect(m.writes()).toBe(1);expect(m.bundle).toEqual(m.before);expect(m.errors).toEqual([]);
});
