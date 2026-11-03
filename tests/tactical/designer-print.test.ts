import test from "node:test";
import assert from "node:assert/strict";
import { attachmentExample } from "../fixtures/attachments";
import { composePrintActivities } from "../../lib/designer/print-composition";
import { exportDocument } from "../../lib/designer/contract";
import { evaluateScene } from "../../lib/tactical/evaluate";
import { serializeDrawing } from "../../lib/tactical/drawing";

test("print composition resolves exact namespace, revision, representative time and current activity order without modifying its sources", () => {
  const p=attachmentExample(), doc=structuredClone(p.document);
  doc.session.activities[0].name="Current coaching text";
  doc.session.activities[0].diagrams=[{scene:{id:"example-rondo",revision:2},representativeSeconds:4},{scene:{id:"example-rondo",revision:1},representativeSeconds:2}];
  doc.session.activities.reverse();const before=structuredClone({p,doc}), output=composePrintActivities(doc,p);
  assert.deepEqual(output.map(a=>a.activityId),doc.session.activities.map(a=>a.id));
  assert.deepEqual(output[1].diagrams.map(d=>[d.pin.scene.revision,d.pin.representativeSeconds]),[[2,4],[1,2]]);
  for(const a of output)for(const d of a.diagrams){assert.equal(d.status,"ready");if(d.status!=="ready")continue;
    assert.equal(d.resolved.namespace,p.sceneNamespace);assert.equal(d.drawing.revision,d.pin.scene.revision);assert.equal(d.drawing.seconds,d.pin.representativeSeconds);
    const evaluated=evaluateScene(d.resolved.scene,d.pin.representativeSeconds);
    assert.deepEqual(d.drawing.anchors.map(a=>a.world),evaluated.entities.map(e=>e.position));
    assert.equal(d.drawing.clippedEntities,0);assert.equal(d.drawing.nodes[0].attrs.fill,"#80ad79");
  }
  assert.deepEqual({p,doc},before);assert.equal(exportDocument(doc).session.activities[1].name,"Current coaching text");
});

test("missing pins remain explicit and ordered alongside available diagrams; no latest revision or time clamping",()=>{
  const p=attachmentExample(),doc=structuredClone(p.document),a=doc.session.activities[0];
  a.diagrams.push({scene:{id:"example-rondo",revision:99},representativeSeconds:2},{scene:{id:"example-rondo",revision:2},representativeSeconds:999});
  const output=composePrintActivities(doc,p)[0].diagrams;
  assert.deepEqual(output.map(d=>d.status),["ready","unavailable","unavailable"]);assert.equal(output[1].pin.scene.revision,99);assert.equal(output[2].pin.representativeSeconds,999);
  assert.ok(output.slice(1).every(d=>d.status==="unavailable"&&d.reason.length>0));
});

test("legacy references, corrupt packages, wrong namespaces and deliberately unavailable sources never print replacement scenes",()=>{
  const p=attachmentExample();
  for(const library of [null,{...p,sceneNamespace:"another-club"},{...p,scenes:[...p.scenes,{...p.scenes[0],entities:[]}]}]) {
    const output=composePrintActivities(p.document,library);
    assert.ok(output.flatMap(a=>a.diagrams).every(d=>d.status==="unavailable"));
  }
  const blocked=composePrintActivities(p.document,p,"A newer owner must be reviewed.");assert.ok(blocked.every(a=>a.diagrams.every(d=>d.status==="unavailable"&&d.reason.includes("newer owner"))));
});

test("print validation keeps incomplete drafts out of the approved workflow and preserves unknown facts",()=>{
  const p=attachmentExample();p.document.session.activities[0].name="";assert.throws(()=>composePrintActivities(p.document,p));
  const empty=attachmentExample().document;empty.session.activities.forEach(a=>a.diagrams=[]);assert.ok(composePrintActivities(empty,null).every(a=>!a.diagrams.length));
});

test("print drawing escapes authored labels and retains football proportions in passive vector output",()=>{
  const p=attachmentExample();const d=composePrintActivities(p.document,p)[1].diagrams[0];assert.equal(d.status,"ready");if(d.status!=="ready")return;
  const field=d.drawing.nodes.find(n=>n.attrs["data-field-marking"]==="touchlines")!;
  assert.ok(Math.abs(Number(field.attrs.width)/Number(field.attrs.height)-105/68)<1e-8);
  const svg=serializeDrawing(d.drawing,'<script>alert("no")</script>');assert.ok(!svg.includes("<script>"));assert.ok(svg.includes("&lt;script&gt;"));
});
