import test from "node:test";
import assert from "node:assert/strict";
import { domainBundleSchema } from "../../lib/domain/validation";
import { evaluateScene } from "../../lib/tactical/evaluate";
import { authoredGridAreas, gridPlan, planInventory, sourceGridExtent } from "../../lib/tactical/grid-plan";
import baseline from "../fixtures/ground-layout/synthetic-session.json";
import authored from "../fixtures/ground-layout/authored-stations-test-fixture.json";
import { drawScene } from "../../lib/tactical/drawing";
import { presentationCategory } from "../../lib/tactical/presentation-category";

const bundle=domainBundleSchema.parse({...baseline,sessions:[...baseline.sessions,authored.session],scenes:[...baseline.scenes,authored.scene]});
const session=bundle.sessions.find(s=>s.id==="sample-3")!;
const activity=session.content.activities[0];
const scene=bundle.scenes.find(s=>s.id==="example-rondo"&&s.revision===1)!;
const pose=evaluateScene(scene,2);

test("parallel copies use the complete stage and equipment envelope and never change the saved model", ()=>{
  const before=JSON.stringify(scene);
  const exact=sourceGridExtent(scene,activity.content.area!);
  assert.equal(exact.maxY,28);
  assert.equal(exact.minX,19.75);
  const plan=gridPlan(scene,pose,activity.content.area!,4,"grid",3.5);
  assert.equal(plan.stations[1].extent.minX-plan.stations[0].extent.maxX,3.5);
  assert.equal(plan.stations[2].extent.minY-plan.stations[0].extent.maxY,3.5);
  assert.equal(plan.stations[3].extent.maxY,plan.extent.maxY);
  assert.deepEqual(plan.stations.map(s=>s.kind),["source","repeat","repeat","repeat"]);
  assert.equal(JSON.stringify(scene),before);
});

test("station count and gap are bounded, with zero spacing remaining exact", ()=>{
  const area=activity.content.area!;
  assert.throws(()=>gridPlan(scene,pose,area,0,"row",3));
  assert.throws(()=>gridPlan(scene,pose,area,4,"row",Infinity));
  assert.throws(()=>gridPlan(scene,pose,area,4,"row",21));
  const plan=gridPlan(scene,pose,area,2,"row",0);
  assert.equal(plan.stations[0].extent.maxX,plan.stations[1].extent.minX);
});

test("authored areas are unshifted and a single nested zone does not become a station", ()=>{
  const fixture=bundle.scenes.find(s=>s.id===authored.scene.id)!;
  const plan=gridPlan(fixture,evaluateScene(fixture,1.5),undefined,4,"grid",8);
  assert.ok(plan.authored);
  assert.equal(plan.stations.length,2);
  assert.equal(plan.stations[1].extent.minX-plan.stations[0].extent.maxX,6);
  assert.ok(plan.stations.every(s=>s.kind==="authored"&&s.offset.x===0&&s.offset.y===0));
  assert.equal(plan.clearance,null);
  const positional=bundle.scenes.find(s=>s.id==="presentation-practice")!;
  assert.deepEqual(authoredGridAreas(evaluateScene(positional,1)),[]);
});

test("equipment quantity estimates retain zero and unknown", ()=>{
  const totals=planInventory([{name:"Cones",quantity:4},{name:"Bibs",quantity:null},{name:"Other",quantity:0}],4);
  assert.deepEqual(totals.map(x=>x.total),[16,null,0]);
});

test("transparent ground uses the shared drawing geometry without changing ordinary SVG output", ()=>{
  const original=JSON.stringify(scene);
  const options={width:960,height:600,seconds:2,fit:"all" as const,markings:"none" as const};
  const normal=drawScene(scene,options);
  const defaults=drawScene(scene,{...options,surface:undefined,areaLabels:undefined});
  const ground=drawScene(scene,{...options,surface:"transparent",areaLabels:false});
  assert.deepEqual(normal,defaults);
  assert.deepEqual(normal.anchors,ground.anchors);
  assert.equal(normal.revision,ground.revision);
  assert.equal(normal.seconds,ground.seconds);
  assert.ok(ground.nodes.length<normal.nodes.length);
  assert.equal(JSON.stringify(scene),original);
});

test("saved presentation context wins and legacy scenes require a deliberate temporary choice", ()=>{
  assert.equal(presentationCategory(undefined),undefined);
  assert.equal(presentationCategory(undefined,"grid"),"grid");
  assert.equal(presentationCategory({kind:"neutral",boundary:true},"pitch"),"grid");
  assert.equal(presentationCategory({kind:"pitch",region:"full",attack:"positive-x"},"grid"),"pitch");
});
