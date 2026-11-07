import test from "node:test";
import assert from "node:assert/strict";
import { libraryPreviewExample } from "../fixtures/library-preview";
import { saveDiagram } from "../../lib/tactical/persistence";
import { sceneDuration } from "../../lib/tactical/evaluate";
import { copyTeams, scheduleSessionCopy, sessionCopyOccurrence } from "../../lib/coaching/session-copy";
import { calendarReturnProblem, parseCalendarReturn, savedCalendarHref, withCalendar } from "../../lib/coaching/calendar-return";
import { wallTimeCandidates } from "../../lib/calendar/schedule";

test("edited organisation diagrams preserve a valid representative moment and exact historical pins", () => {
  const b = libraryPreviewExample(), before = structuredClone(b), session = b.sessions.find(s => s.content.title === "Rondos & Positional Play")!;
  const event = b.events.find(e => e.session?.id === session.id)!;
  const target = { kind:"session" as const,id:session.id,revision:1,activity:session.content.activities[1].id,event:event.id,booking:1,diagram:1 };
  const draft = structuredClone(b.scenes.find(s => s.id === session.content.activities[1].content.diagrams[1].scene.id && s.revision===2)!);
  draft.entities[0].position.x += 1;
  assert.ok(sceneDuration(draft)>=4);
  const saved=saveDiagram(b,target,draft), owner=saved.bundle.sessions.find(s=>s.id===session.id&&s.revision===2)!;
  assert.equal(owner.content.activities[1].content.diagrams[1].representativeSeconds,4);
  assert.deepEqual(owner.content.activities[1].content.diagrams[0],session.content.activities[1].content.diagrams[0]);
  assert.equal(saved.target.booking,2); assert.equal(saved.scene.revision,3);
  assert.deepEqual(b,before); assert.deepEqual(saved.bundle.scenes.find(s=>s.id===draft.id&&s.revision===2),before.scenes.find(s=>s.id===draft.id&&s.revision===2));
});

test("shortened timelines reject an invalid old moment without writes until the coach selects a valid time", () => {
  const b=libraryPreviewExample(), original=structuredClone(b), session=b.sessions.find(s=>s.content.title==='Rondos & Positional Play')!, event=b.events.find(e=>e.session?.id===session.id)!;
  const target={kind:'session' as const,id:session.id,revision:1,activity:session.content.activities[1].id,event:event.id,booking:1,diagram:1};
  const draft=structuredClone(b.scenes.find(s=>s.id===session.content.activities[1].content.diagrams[1].scene.id&&s.revision===2)!);
  draft.stages=[{id:'short',title:'Shortened scene',durationSeconds:2,tracks:[]}];
  assert.throws(()=>saveDiagram(b,target,draft),/Choose a representative time between 0 and 2/);
  for(const t of [-1,3,NaN,Infinity]) assert.throws(()=>saveDiagram(b,target,draft,t),/Choose a representative time/);
  assert.deepEqual(b,original);
  const saved=saveDiagram(b,target,draft,1.5), owner=saved.bundle.sessions.find(s=>s.id===session.id&&s.revision===2)!;
  assert.equal(owner.content.activities[1].content.diagrams[1].representativeSeconds,1.5);
  draft.stages=[];
  assert.equal(saveDiagram(b,{...target,diagram:null},{...draft,id:'new-static',revision:1}).target.diagram,2);
  assert.throws(()=>saveDiagram(b,target,draft),/between 0 and 0/);
});

test("copying to another organisation team retains every coach, original record and exact scene pin", () => {
  const b=libraryPreviewExample(), source=b.sessions.find(s=>s.content.title==='Rondos & Positional Play')!;
  assert.equal(copyTeams(b,source).length,1);
  source.coaches=source.coaches.filter(c=>c.coachId==='coach-carter');
  assert.ok(copyTeams(b,source).some(t=>t.id==='youth-team'));
  const before=structuredClone(b), request={organizationId:b.organizationId,source:{id:source.id,revision:1},requestId:'77777777-7777-4777-8777-777777777777'};
  const input={title:source.content.title,kind:source.content.kind,teamId:'youth-team',coachId:'',date:'2026-11-11',endDate:'2026-11-11',start:'17:00',end:'18:00',timeZone:'Australia/Sydney',startInstant:wallTimeCandidates('2026-11-11','17:00','Australia/Sydney')[0],endInstant:wallTimeCandidates('2026-11-11','18:00','Australia/Sydney')[0],venue:'',areaLabel:''};
  const saved=scheduleSessionCopy(b,input,request);
  assert.equal(saved.session.teamId,'youth-team'); assert.deepEqual(saved.session.coaches,source.coaches); assert.deepEqual(saved.session.content,source.content);
  assert.deepEqual(b,before); assert.equal(sessionCopyOccurrence(saved.bundle,request)?.id,saved.event.id);
  assert.throws(()=>scheduleSessionCopy(saved.bundle,input,request),/already been used/);
  assert.throws(()=>scheduleSessionCopy(b,{...input,teamId:'other-club-team'},request),/eligible/);
});

test("Calendar handoffs are bounded exact navigation, never external URLs or organisation authority", () => {
  const b=libraryPreviewExample(), event=b.events[0], context={date:'2026-11-11',view:'week' as const,organization:b.organizationId,team:event.teamId,event:event.id,bookingRevision:1};
  const href=withCalendar(`/sessions?event=${event.id}&revision=1`,context), encoded=new URL(href,'http://internal').searchParams.get('calendar');
  assert.deepEqual(parseCalendarReturn(encoded),context);
  for(const raw of ['https://outside.test','date=x','date=2026-11-11&date=2026-11-12',encoded+'&copy=77777777-7777-4777-8777-777777777777']) assert.equal(parseCalendarReturn(raw),null);
  assert.equal(calendarReturnProblem(b,context,event.id,1),undefined);
  assert.ok(calendarReturnProblem(b,{...context,organization:'wrong'},event.id,1));
  assert.ok(calendarReturnProblem(b,context,'other-event',1));
  assert.ok(calendarReturnProblem(b,{...context,team:'youth-team'},event.id,1));
  assert.throws(()=>withCalendar('https://outside.test',context),/Invalid coaching destination/);
  const returned=new URL(savedCalendarHref(context,{...event,revision:2},'session-saved'),'http://internal');
  assert.equal(returned.searchParams.get('date'),context.date); assert.equal(returned.searchParams.get('bookingRevision'),'2'); assert.equal(returned.searchParams.get('notice'),'session-saved');
});
