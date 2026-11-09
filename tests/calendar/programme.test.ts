import test from "node:test";
import assert from "node:assert/strict";
import { programmeExample } from "../fixtures/programme";
import { bookingOnDay, fixtureDayLabel, programmeIllustration, programmeRange, weekProgramme } from "../../lib/calendar/programme";
import { calendarDates, wallTimeCandidates } from "../../lib/calendar/schedule";

test("weekly programme reads exact pinned coaching content and current bookings without mutating history",()=>{
  const b=programmeExample(),source=b.sessions.find(s=>s.id==="sample-3")!;
  b.sessions.push({...structuredClone(source),revision:2,content:{...structuredClone(source.content),focus:["Unpinned future focus"],objective:"Unpinned future objective"}});
  const original=structuredClone(b),result=weekProgramme(b,"2026-11-03","first-team");
  assert.equal(result.trainingCount,5);assert.equal(result.fixtures.length,1);assert.equal(result.dates.length,7);
  assert.ok(result.focus.includes("First touch"));assert.ok(!result.focus.includes("Unpinned future focus"));assert.ok(!result.objectives.includes("Unpinned future objective"));
  assert.equal(result.bookings.find(e=>e.session?.id===source.id)?.session?.revision,1);assert.deepEqual(b,original);
  b.events.push({...structuredClone(b.events[0]),revision:2,title:"New booking title"});
  assert.equal(weekProgramme(b,"2026-11-03","first-team").bookings.filter(e=>e.id===b.events[0].id).length,1);
  assert.deepEqual(original.sessions,b.sessions);
  assert.equal(weekProgramme(b,"2026-11-03","youth-team").trainingCount,0);assert.deepEqual(b.sessions,original.sessions);
});

test("week context excludes cancelled sessions and fixtures, never infers missing focus or recovery",()=>{
  const b=programmeExample();
  for(const e of b.events)e.status="cancelled";
  const context=weekProgramme(b,"2026-11-03","first-team");
  assert.equal(context.trainingCount,0);assert.deepEqual(context.fixtures,[]);assert.deepEqual(context.focus,[]);assert.deepEqual(context.objectives,[]);assert.ok(context.bookings.length>0);
  const empty=weekProgramme(b,"2026-12-07","first-team");assert.deepEqual(empty.bookings,[]);assert.deepEqual(empty.focus,[]);
  const record=b.sessions[0];record.content.focus=[];record.content.objective=null;b.events[0].status="draft";
  const draft=weekProgramme(b,"2026-11-03","first-team");assert.equal(draft.trainingCount,1);assert.deepEqual(draft.focus,[]);assert.deepEqual(draft.objectives,[]);
});

test("overnight weekly carry uses the existing explicit zone and exclusive end boundary",()=>{
  const e=programmeExample().events[0];e.localDate="2026-10-04";
  e.startsAt=wallTimeCandidates("2026-10-04","23:30",e.timeZone)[0];e.endsAt=wallTimeCandidates("2026-10-05","00:30",e.timeZone)[0];
  assert.equal(bookingOnDay(e,"2026-10-05"),true);assert.equal(bookingOnDay(e,"2026-10-06"),false);
  e.endsAt=wallTimeCandidates("2026-10-05","00:00",e.timeZone)[0];assert.equal(bookingOnDay(e,"2026-10-05"),false);
  e.startsAt=null;e.endsAt=null;assert.equal(bookingOnDay(e,"2026-10-04"),true);assert.equal(bookingOnDay(e,"2026-10-05"),false);
});

test("programme date range and fixture-day offsets stay calendar based across year and DST boundaries",()=>{
  assert.equal(programmeRange(calendarDates("2026-11-03","week")),"2 – 8 November 2026");
  assert.match(programmeRange(calendarDates("2026-12-31","week")),/28 Dec 2026.*3 Jan 2027/);
  const fixture=programmeExample().events.find(e=>e.kind==="fixture")!;
  assert.equal(fixtureDayLabel("2026-11-02",fixture),"D−5");assert.equal(fixtureDayLabel("2026-11-07",fixture),"Match day");assert.equal(fixtureDayLabel("2026-11-08",fixture),"D+1");assert.equal(fixtureDayLabel("2026-11-03",undefined),undefined);
});

test("programme illustration uses the authored first attachment exactly; missing, cancelled or cross-organisation scenes have no substitute",()=>{
  const bundle=programmeExample(),event=bundle.events.find(e=>e.session?.id==="sample-3")!;
  const before=structuredClone(bundle),result=programmeIllustration(bundle,event)!;
  assert.equal(result.scene.revision,1);assert.equal(result.pin.representativeSeconds,2);assert.deepEqual(bundle,before);
  bundle.scenes=bundle.scenes.filter(s=>!(s.id===result.scene.id && s.revision===1));
  assert.equal(programmeIllustration(bundle,event),null);
  bundle.scenes=structuredClone(before.scenes);bundle.scenes.find(s=>s.id===result.scene.id && s.revision===1)!.organizationId="other-organisation";
  assert.equal(programmeIllustration(bundle,event),null);
  bundle.scenes=structuredClone(before.scenes);event.status="cancelled";assert.equal(programmeIllustration(bundle,event),null);
});
