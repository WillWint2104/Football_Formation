import test from "node:test";
import assert from "node:assert/strict";
import { coachingDrawingOptions, coachingExerciseArea, coachingPrintDrawing, coachingAreaWarning } from "../../lib/tactical/coaching-view";
import { coachingPresentationScene } from "../fixtures/coaching-presentation";
import { editorExamples } from "../../lib/tactical/editor-examples";
import { drawScene } from "../../lib/tactical/drawing";
import { fitViewport, worldToScreen, screenToWorld } from "../../lib/tactical/viewport";
import { stageRanges } from "../../lib/tactical/animation";
import { coachingLightPalette, tacticalPalette } from "../../lib/tactical/palette";

test("12x12 and 12x20 practices keep uniform metres, exact boundaries and saved geometry at both preview sizes", () => {
  for (const span of [12, 20]) for (const [width,height] of [[640,300],[1000,600]]) {
    const scene=coachingPresentationScene(6,span), before=structuredClone(scene), options={width,height,...coachingDrawingOptions(scene,1)}, view=fitViewport(scene,{...options,fit:"exercise"});
    assert.equal(view.target.maxX-view.target.minX,12);assert.equal(view.target.maxY-view.target.minY,span);
    const a=worldToScreen({x:3,y:4},view),b=worldToScreen({x:4,y:4},view),c=worldToScreen({x:3,y:5},view);
    assert.ok(Math.abs(Math.hypot(a.x-b.x,a.y-b.y)-Math.hypot(a.x-c.x,a.y-c.y))<1e-8);
    const roundTrip=screenToWorld(a,view);assert.ok(Math.abs(roundTrip.x-3)<1e-8 && Math.abs(roundTrip.y-4)<1e-8);
    assert.deepEqual(scene,before);
  }
});

test("authored full/half/third/set-piece contexts win over conflicting activity metadata without rewriting it", () => {
  for(const id of ["full","third","corner-left","corner-right"]){const scene=structuredClone(editorExamples.find(e=>e.id===id)!.scene),before=structuredClone(scene), wrong={origin:{x:500,y:500},length:2,width:2};
    assert.ok(coachingAreaWarning(scene,wrong));assert.deepEqual(coachingExerciseArea(scene,wrong),coachingExerciseArea(scene));assert.deepEqual(scene,before);
  }
  const full=structuredClone(editorExamples[0].scene);full.entities=full.entities.slice(0,1);full.stages=[];
  assert.deepEqual(coachingExerciseArea(full),{origin:{x:0,y:0},length:105,width:68});
  full.context={kind:"pitch",region:"attacking-half",attack:"positive-x"};assert.equal(coachingExerciseArea(full).length,52.5);
});

test("saved time is validated before rendering; negative, missing and excessive times never clamp",()=>{
  const scene=coachingPresentationScene();for(const time of [-1,NaN,Infinity,13])assert.throws(()=>coachingDrawingOptions(scene,time),/representative time/);
  assert.equal(coachingDrawingOptions(scene,12).seconds,12);
});

test("six authored stages evaluate different poses, visibility and timed zones while preserving source and pin",()=>{
  const scene=coachingPresentationScene(),before=structuredClone(scene),pin={revision:3,seconds:1},poses=[];
  for(const {stage,start} of stageRanges(scene)){const d=drawScene(scene,{width:800,height:480,...coachingDrawingOptions(scene,start),poseStageId:stage.id});poses.push(d.anchors.find(a=>a.id==="p6")!.world.x);assert.equal(d.stage,stage.title);assert.ok(d.nodes.some(n=>n.attrs["data-annotation-id"]===`zone-${Number(stage.id.slice(-1))-1}`));}
  assert.deepEqual(poses,[3,4,5,6,7,8]);assert.deepEqual(pin,{revision:3,seconds:1});assert.deepEqual(scene,before);
  const staticScene=coachingPresentationScene(0);assert.equal(drawScene(staticScene,{width:500,height:400,...coachingDrawingOptions(staticScene,0)}).stage,null);
  assert.equal(drawScene(staticScene,{width:500,height:400,...coachingDrawingOptions(staticScene,0)}).nodes.filter(n=>n.tag==="polyline").length,0,"no invented movement arrows");
});

test("cropped authored details are reported and print includes them instead of silently omitting them",()=>{
  const scene=coachingPresentationScene(1), area={origin:{x:2,y:3},length:3,width:3},before=structuredClone(scene);
  assert.ok(drawScene(scene,{width:700,height:450,...coachingDrawingOptions(scene,1,area)}).croppedDetails);
  const print=coachingPrintDrawing(scene,1,700,450,area);assert.equal(print.expanded,true);assert.equal(print.drawing.clippedEntities,0);assert.equal(print.drawing.croppedDetails,0);assert.deepEqual(scene,before);
});

test("soft coaching grass has restrained bands and contrasting essential edges; dark technical tokens remain unchanged",()=>{
  const luminance=(hex:string)=>hex.match(/[a-f\d]{2}/gi)!.map(c=>parseInt(c,16)/255).map(c=>c<=.04045?c/12.92:((c+.055)/1.055)**2.4).reduce((sum,c,i)=>sum+c*[.2126,.7152,.0722][i],0);
  const contrast=(a:string,b:string)=>{const x=luminance(a),y=luminance(b);return(Math.max(x,y)+.05)/(Math.min(x,y)+.05);};
  for(const bg of [coachingLightPalette.field,coachingLightPalette.stripe]){assert.ok(contrast(coachingLightPalette.line,bg)>=3);assert.ok(contrast(coachingLightPalette.outline,bg)>=3);}
  assert.ok(contrast(coachingLightPalette.field,coachingLightPalette.stripe)<1.15);assert.equal(tacticalPalette.field,"#285a3b");assert.equal(tacticalPalette.pass,"#72dce8");
});
