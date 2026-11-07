import { test, expect, type Page } from "@playwright/test";
import { libraryPreviewExample } from "../fixtures/library-preview";
import { domainBundleSchema } from "../../lib/domain/validation";
import { latestEvents } from "../../lib/calendar/schedule";

/** Isolated synthetic organisation storage; unhandled APIs and external hosts never receive traffic. */
async function storage(page:Page, options:{ historical?:boolean; crossTeam?:boolean; failure?:number|'lost-ack' }={}) {
  let bundle=libraryPreviewExample(),version=4,writes=0;
  const source=bundle.sessions.find(s=>s.content.title==='Rondos & Positional Play')!,event=bundle.events.find(e=>e.session?.id===source.id)!;
  if(options.crossTeam) source.coaches=source.coaches.filter(c=>c.coachId==='coach-carter');
  if(options.historical) bundle.sessions.push({...structuredClone(source),revision:2,content:{...structuredClone(source.content),objective:'Latest version explicitly reviewed'}});
  const before=structuredClone(bundle);
  await page.context().route('**/*',r=>['127.0.0.1','localhost'].includes(new URL(r.request().url()).hostname)?r.continue():r.abort());
  await page.route('**/api/**',r=>r.abort());
  await page.route('**/api/organizations',r=>r.fulfill({json:{organizations:[{id:bundle.organizationId,name:'Synthetic B3 coaching club',version}]}}));
  await page.route('**/api/organizations/*/snapshot',async r=>{
    if(r.request().method()!=='POST')return r.fulfill({json:{version,bundle}});
    writes++;const input=r.request().postDataJSON();
    if(input.expectedVersion!==version)return r.fulfill({status:409,json:{error:'Conflict'}});
    await new Promise(resolve=>setTimeout(resolve,150));
    if(typeof options.failure==='number')return r.fulfill({status:options.failure,json:{error:'Private provider detail'}});
    bundle=domainBundleSchema.parse(input.bundle);version++;
    if(options.failure==='lost-ack')return r.abort();
    return r.fulfill({json:{version}});
  });
  return {source,event,before,bundle:()=>bundle,writes:()=>writes,root:`/calendar?date=2026-11-11&view=week&organization=${bundle.organizationId}&team=first-team&event=${event.id}&bookingRevision=1`};
}
async function loaded(page:Page){await expect(page.locator('.calendar-connection [role=status]')).toContainText('Loaded saved organisation snapshot');}
async function openEditor(page:Page){await page.getByRole('link',{name:'Edit Session',exact:true}).click();await expect(page.getByRole('heading',{name:'Edit scheduled session',exact:true})).toBeVisible();}

for(const view of ['week','month'] as const) test(`scheduled reuse, explicit latest preview, independent editing and exact ${view} Calendar return`,async({page},info)=>{
  const m=await storage(page,{historical:true});await page.goto(m.root.replace('view=week',`view=${view}`));await loaded(page);
  await page.getByRole('button',{name:'Schedule Another Copy',exact:true}).click();
  const preview=page.getByRole('region',{name:'Saved session preview'});
  await expect(preview).toContainText('Historical session revision 1');
  await expect(preview.getByRole('button',{name:'Schedule independent copy',exact:true})).toBeDisabled();
  await page.screenshot({path:info.outputPath('historical-exact-preview.png')});
  await page.getByRole('link',{name:'Use Latest Available Version',exact:true}).click();
  await expect(preview).toContainText('Latest version explicitly reviewed');expect(m.writes()).toBe(0);
  await preview.getByRole('button',{name:'Schedule independent copy',exact:true}).click();
  const form=page.getByRole('dialog',{name:'Schedule independent copy'});
  await form.getByLabel('Start time').fill('17:00');await form.getByLabel('End time').fill('18:15');
  await page.screenshot({path:info.outputPath('copy-confirmation.png')});
  await form.locator('form').evaluate((f:HTMLFormElement)=>{f.requestSubmit();f.requestSubmit();});
  await expect(page).toHaveURL(/event=scheduled-event-/);expect(m.writes()).toBe(1);
  const newId=new URL(page.url()).searchParams.get('event')!,copyEvent=latestEvents(m.bundle()).find(e=>e.id===newId)!;
  expect(copyEvent.id).not.toBe(m.event.id);expect(copyEvent.session!.id).not.toBe(m.source.id);
  await openEditor(page);
  await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:info.outputPath('copy-editor-overview.png')});
  await page.getByRole('textbox',{name:'Session objective',exact:true}).fill('Only this scheduled copy changes');
  await page.screenshot({path:info.outputPath('copy-session-editor.png')});
  await page.getByRole('button',{name:'Save Session & Return',exact:true}).click();
  await expect(page).toHaveURL(/notice=session-saved/);
  await expect(page.locator('.calendar-saved-notice')).toContainText('booking revision 2');
  await expect(page.getByLabel('Selected date')).toHaveValue('2026-11-11');await expect(page.getByLabel('Team',{exact:true})).toHaveValue('first-team');
  await expect(page.getByRole('button',{name:view==='week'?'Week':'Month',exact:true})).toHaveAttribute('aria-pressed','true');
  expect(m.bundle().sessions.filter(s=>s.id===m.source.id)).toEqual(m.before.sessions.filter(s=>s.id===m.source.id));
  expect(m.bundle().events.filter(e=>e.id===m.event.id)).toEqual(m.before.events.filter(e=>e.id===m.event.id));
  expect(m.bundle().scenes).toEqual(m.before.scenes);
  await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:info.outputPath('copy-saved-calendar.png')});
  await page.getByRole('link',{name:'Open coaching guide',exact:true}).click();await expect(page).toHaveURL(/bookingRevision=2/);
  await expect(page.getByText('No illustrated exports have been saved for this session revision.',{exact:true})).toBeVisible();
  await page.getByRole('link',{name:'Return to Calendar',exact:true}).click();await expect(page).toHaveURL(new RegExp(`event=${newId}`));expect(m.writes()).toBe(2);
  await openEditor(page);await page.getByRole('link',{name:'Edit diagram 2 · scene v2 →',exact:true}).click();
  await page.getByRole('button',{name:'Layout',exact:true}).click();await page.getByRole('button',{name:'Properties',exact:true}).click();
  await page.getByRole('button',{name:'● Player',exact:true}).click();await page.getByRole('button',{name:'Insert at centre',exact:true}).click();
  await page.getByRole('button',{name:'Save Diagram & Return',exact:true}).click();await expect(page).toHaveURL(/bookingRevision=3/);
  expect(m.bundle().sessions.filter(s=>s.id===m.source.id)).toEqual(m.before.sessions.filter(s=>s.id===m.source.id));expect(m.bundle().events.filter(e=>e.id===m.event.id)).toEqual(m.before.events.filter(e=>e.id===m.event.id));
  expect(m.bundle().scenes.slice(0,m.before.scenes.length)).toEqual(m.before.scenes);expect(m.writes()).toBe(3);
});

test('copy team selection only offers teams eligible for every retained coach',async({page})=>{
  const m=await storage(page,{crossTeam:true});await page.goto(m.root);await loaded(page);
  await page.getByRole('button',{name:'Schedule Another Copy',exact:true}).click();await page.getByRole('button',{name:'Schedule independent copy',exact:true}).click();
  const form=page.getByRole('dialog');await form.getByLabel('Team',{exact:true}).selectOption('youth-team');
  await form.getByLabel('Start time').fill('17:00');await form.getByLabel('End time').fill('18:00');await form.getByRole('button',{name:'Save booking',exact:true}).click();
  await expect(page).toHaveURL(/event=scheduled-event-/);await expect(page.getByLabel('Team',{exact:true})).toHaveValue('youth-team');
  const copied=m.bundle().sessions.find(s=>s.id.startsWith('scheduled-session-'))!;expect(copied.teamId).toBe('youth-team');expect(copied.coaches).toEqual(m.source.coaches);expect(m.writes()).toBe(1);
});

test('diagram editing retains valid moments; shortened scenes require explicit time and exact save-and-return',async({page},info)=>{
  const m=await storage(page);await page.goto(m.root);await loaded(page);await openEditor(page);
  await page.getByRole('link',{name:'Edit diagram 2 · scene v2 →',exact:true}).click();
  const time=page.getByLabel('Representative preview time (seconds)',{exact:true});await expect(time).toHaveValue('4');
  await page.getByRole('button',{name:'Layout',exact:true}).click();await page.getByRole('button',{name:'Properties',exact:true}).click();
  await page.getByRole('button',{name:'● Player',exact:true}).click();await page.getByRole('button',{name:'Insert at centre',exact:true}).click();
  await page.getByRole('button',{name:'Save Diagram & Return',exact:true}).click();await expect(page).toHaveURL(/notice=diagram-saved/);
  const first=m.bundle().sessions.find(s=>s.id===m.source.id&&s.revision===2)!;
  expect(first.content.activities[1].content.diagrams[1].representativeSeconds).toBe(4);
  await page.getByRole('link',{name:'Open coaching guide',exact:true}).click();
  await expect(page.locator('.guide-saved-diagram .scene-diagram').nth(1)).toHaveAttribute('data-revision','3');await expect(page.locator('.guide-saved-diagram .scene-diagram').nth(1)).toHaveAttribute('data-time','4');
  await page.locator('.guide-saved-diagram').nth(1).scrollIntoViewIfNeeded();await page.screenshot({path:info.outputPath('exact-guide-retained-moment.png')});
  await page.getByRole('link',{name:'Return to Calendar',exact:true}).click();await expect(page).toHaveURL(/calendar\?/);
  await openEditor(page);await page.getByRole('link',{name:'Edit diagram 2 · scene v3 →',exact:true}).click();
  await page.getByLabel('Example setup',{exact:true}).selectOption('full');await page.getByRole('button',{name:'Apply setup',exact:true}).click();
  await page.getByRole('button',{name:'Save Diagram & Return',exact:true}).click();
  await expect(page.locator('.coaching-notice[role=alert]')).toContainText('Choose a representative time');
  await expect(time).toHaveValue('4');expect(m.writes()).toBe(1);
  await page.screenshot({path:info.outputPath('representative-time-required.png')});
  await time.fill('0');await page.getByRole('button',{name:'Save Diagram & Return',exact:true}).click();await expect(page).toHaveURL(/bookingRevision=3/);
  const saved=m.bundle().sessions.find(s=>s.id===m.source.id&&s.revision===3)!;
  expect(saved.content.activities[1].content.diagrams[1].representativeSeconds).toBe(0);
  expect(m.bundle().sessions.find(s=>s.id===m.source.id&&s.revision===1)).toEqual(m.before.sessions.find(s=>s.id===m.source.id&&s.revision===1));
  expect(m.bundle().templates).toEqual(m.before.templates);expect(m.writes()).toBe(2);
});

test('dirty content and diagram changes require deliberate cancellation, refresh and history navigation',async({page})=>{
  const m=await storage(page);await page.goto(m.root);await loaded(page);await openEditor(page);
  await page.getByRole('link',{name:'Cancel / Return to Calendar',exact:true}).click();await expect(page).toHaveURL(/\/calendar\?/);await page.goBack();await expect(page.getByRole('heading',{name:'Edit scheduled session',exact:true})).toBeVisible();
  const objective=page.getByRole('textbox',{name:'Session objective',exact:true});await objective.fill('Unsaved coaching draft');
  // A cancelled reload intentionally never completes navigation; observe the native prompt directly.
  await Promise.all([page.waitForEvent('dialog').then(async d=>{expect(d.type()).toBe('beforeunload');await d.dismiss();}),page.evaluate(()=>window.location.reload())]);await expect(objective).toHaveValue('Unsaved coaching draft');
  page.once('dialog',d=>d.dismiss());await page.evaluate(()=>history.forward());await expect(objective).toHaveValue('Unsaved coaching draft');await expect(page).toHaveURL(/\/sessions\?/);
  page.once('dialog',d=>d.dismiss());await page.evaluate(()=>history.back());await expect(objective).toHaveValue('Unsaved coaching draft');
  page.once('dialog',d=>d.dismiss());await page.getByRole('link',{name:'Cancel / Return to Calendar',exact:true}).click();await expect(objective).toHaveValue('Unsaved coaching draft');
  page.once('dialog',d=>d.accept());await page.getByRole('link',{name:'Cancel / Return to Calendar',exact:true}).click();await expect(page).toHaveURL(/calendar\?/);expect(m.writes()).toBe(0);
  await openEditor(page);await page.reload();await loaded(page);await expect(objective).toHaveValue(m.source.content.objective!);
  await page.getByRole('link',{name:'Edit diagram 2 · scene v2 →',exact:true}).click();await page.getByLabel('Representative preview time (seconds)',{exact:true}).fill('3');
  page.once('dialog',d=>d.dismiss());await page.evaluate(()=>history.back());await expect(page.getByLabel('Representative preview time (seconds)',{exact:true})).toHaveValue('3');
  page.once('dialog',d=>d.accept());await page.getByRole('link',{name:'Cancel / Return to Calendar',exact:true}).click();expect(m.writes()).toBe(0);expect(m.bundle()).toEqual(m.before);
});

for (const failure of [409,'lost-ack'] as const) test(`failed or uncertain session save (${failure}) never reports success or retries`,async({page})=>{
  const m=await storage(page,{failure});await page.goto(m.root);await loaded(page);await openEditor(page);
  await page.getByRole('textbox',{name:'Session objective',exact:true}).fill('A save whose acknowledgement is unavailable');
  await page.getByRole('button',{name:'Save Session & Return',exact:true}).click();
  await expect(page.getByRole('button',{name:'Reload before saving',exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'Save Session & Return',exact:true})).toBeDisabled();
  await expect(page).toHaveURL(/\/sessions\?/);await expect(page.locator('.calendar-saved-notice')).toHaveCount(0);expect(m.writes()).toBe(1);
  if(failure===409)expect(m.bundle()).toEqual(m.before);
  else {const saved=m.bundle().sessions.find(s=>s.id===m.source.id&&s.revision===2)!;expect(saved.content.objective).toBe('A save whose acknowledgement is unavailable');}
});

test('forged or stale editor handoffs cannot select another organisation, team or booking',async({page})=>{
  const m=await storage(page);await page.goto(m.root);await loaded(page);await openEditor(page);const link=page.url();
  const url=new URL(link),context=new URLSearchParams(url.searchParams.get('calendar')!);
  for(const [key,value] of [['organization','other-club'],['team','youth-team'],['event','other-booking']]){
    const forged=new URL(link),query=new URLSearchParams(context);query.set(key,value);forged.searchParams.set('calendar',query.toString());await page.goto(forged.href);await expect(page.getByRole('heading',{name:'Calendar editing context unavailable'})).toBeVisible();
  }
  const invalid=new URL(link);invalid.searchParams.set('calendar','https://outside.test');await page.goto(invalid.href);await expect(page.getByRole('heading',{name:'Invalid session reference'})).toBeVisible();expect(m.writes()).toBe(0);
});
