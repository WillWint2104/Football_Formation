import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { inspectorExample } from "../fixtures/inspector";
import { inspectBooking } from "../../lib/calendar/inspector";
import { domainBundleSchema } from "../../lib/domain/validation";

function source() { const bundle=inspectorExample();return {bundle,event:bundle.events.find(e=>e.session?.id==="sample-3")!}; }
function markup(bundle:ReturnType<typeof inspectorExample>,event:ReturnType<typeof source>["event"]) {
  // The main unit suite uses RSC conditions. Render this client view in React's normal runtime.
  return execFileSync(process.execPath,["--import",pathToFileURL(resolve("node_modules/tsx/dist/loader.mjs")).href,"tests/fixtures/render-inspector.ts"],{input:JSON.stringify({bundle,event}),encoding:"utf8"});
}
test("inspector reads historical pins and ordered activity diagrams without modifying source snapshots",()=>{
  const {bundle,event}=source(),original=structuredClone(bundle),session=bundle.sessions.find(s=>s.id==="sample-3")!;
  bundle.sessions.push({...structuredClone(session),revision:2,content:{...structuredClone(session.content),title:"Unpinned future content"}});
  const before=structuredClone(bundle),result=inspectBooking(bundle,event);
  assert.equal(result.session?.revision,1);assert.notEqual(result.session?.content.title,"Unpinned future content");
  assert.deepEqual(result.diagrams.map(d=>[d.activityIndex,d.diagramIndex,d.pin.scene.revision,d.pin.representativeSeconds]),[[1,0,1,2],[1,1,2,4],[2,0,1,3]]);
  assert.deepEqual(bundle,before);assert.deepEqual(bundle.scenes,original.scenes);
});
test("missing exact diagram remains unavailable and the actual inspector does not silently choose the second revision",()=>{
  const {bundle,event}=source();const first=inspectBooking(bundle,event).diagrams[0];
  bundle.scenes=bundle.scenes.filter(s=>!(s.id===first.pin.scene.id && s.revision===first.pin.scene.revision));
  const result=inspectBooking(bundle,event);assert.equal(result.diagrams[0].scene,null);assert.ok(result.diagrams[1].scene);
  assert.equal(domainBundleSchema.safeParse(bundle).success,false); // Hosted graph validation remains strict.
  const html=markup(bundle,event);assert.match(html,/exact diagram revision is unavailable/);assert.doesNotMatch(html,/class="scene-diagram"/);
});
test("missing session, team mismatch and foreign organisation never expose another coaching session",()=>{
  const {bundle,event}=source();event.session!.revision=99;assert.equal(inspectBooking(bundle,event).session,null);
  const html=markup(bundle,event);assert.match(html,/exact booked session revision is unavailable/);assert.doesNotMatch(html,/No tactical diagrams attached|Open Session|Coaching Guide/);
  event.session!.revision=1;event.teamId="youth-team";assert.equal(inspectBooking(bundle,event).session,null);
  event.teamId="first-team";event.organizationId="another-club";assert.equal(inspectBooking(bundle,event).session,null);
  assert.deepEqual(inspectBooking(bundle,event).diagrams,[]);
});
test("fixture inspector presents the real match and venue without training activities, diagrams or coaching actions",()=>{
  const bundle=inspectorExample(),event=bundle.events.find(e=>e.kind==="fixture")!;
  const html=markup(bundle,event);assert.match(html,/Match details/);assert.match(html,/Riverside FC vs Western United/);assert.match(html,/Main Pitch/);
  assert.doesNotMatch(html,/Session plan|Coaching emphasis|Open Session|Coaching Guide|class="scene-diagram"/);
});
test("unknown durations, times and absent diagrams remain explicit in the actual inspector",()=>{
  const {bundle,event}=source();event.status="draft";event.startsAt=null;event.endsAt=null;
  const session=bundle.sessions.find(s=>s.id==="sample-3")!;session.content.objective=null;
  for(const a of session.content.activities){a.durationMinutes=null;a.content.diagrams=[];}
  const html=markup(bundle,event);assert.match(html,/Duration unknown/);assert.match(html,/Time unassigned/);assert.match(html,/Not attached/);assert.match(html,/TBC/);assert.match(html,/Coaching content has not been added/);
});
