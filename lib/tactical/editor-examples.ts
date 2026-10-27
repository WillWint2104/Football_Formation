import { tacticalSceneSchema, type TacticalScene, type MovementTrack, type FieldContext } from "../domain/tactical-scene";
import { tacticalExamples } from "./examples";
import { translateScene } from "./translate";
export { translateScene } from "./translate";
import { deliveryLocation } from "./context";

/** Static authoring fixtures reuse the existing scene schema without adding an animation editor. */
function staticScene(source: TacticalScene, id: string, context: FieldContext): TacticalScene {
  const tracks: MovementTrack[] = (source.stages[0]?.tracks ?? []).map((t) => t.kind === "annotation"
    ? { ...structuredClone(t), visibleFrom: 0, visibleUntil: 1 }
    : { id: t.id, kind: "annotation", visibleFrom: 0, visibleUntil: 1, annotation: { kind: "arrow", from: { ...t.keyframes[0].position }, to: { ...t.keyframes.at(-1)!.position }, movement: t.movement === "dribble" ? "run" : t.movement } });
  return tacticalSceneSchema.parse({ ...structuredClone(source), id, context, stages: [{ id: "diagram", title: "Static diagram", durationSeconds: 1, tracks }] });
}
const pitch = (region: "full" | "attacking-third" | "midfield" | "custom"): FieldContext => ({ kind: "pitch", region, attack: "positive-x", ...(region === "custom" ? { area: { origin: { x: 0, y: 18 }, length: 28, width: 32 } } : {}) });
const full = staticScene(tacticalExamples[4].scene, "editor-full", pitch("full"));
const third = staticScene(tacticalExamples[3].scene, "editor-third", pitch("attacking-third"));
third.entities.forEach((e) => { if (e.position.x < 70) e.position.x += 15; });
third.stages[0].tracks = third.stages[0].tracks.filter((t) => t.kind !== "annotation" || t.annotation.kind !== "note");
third.stages[0].tracks.forEach((t) => { if (t.kind === "annotation" && t.annotation.kind === "arrow" && t.annotation.from.x < 70) t.annotation.from.x += 15; });
const midfield = staticScene(full, "editor-midfield", pitch("midfield"));
midfield.entities = midfield.entities.filter((e) => e.kind === "player" && e.position.x >= 35 && e.position.x <= 70);
midfield.entities.push({ id: "midfield-ball", kind: "ball", position: { x: 52, y: 34 }, headingDegrees: 0 });
midfield.stages[0].tracks = [];
const rondo = translateScene(staticScene(tacticalExamples[0].scene, "editor-rondo", { kind: "neutral", boundary: true }), -20, -15);
rondo.field = { length: 12, width: 12 };
const conditioning = translateScene(staticScene(tacticalExamples[2].scene, "editor-conditioning", { kind: "neutral", boundary: true }), -5, -5);
conditioning.field = { length: 40, width: 24 };
/** Construct true mirrored corner deliveries and a physical edge-of-box free kick. */
function setPiece(side: "left" | "right", type: "corner" | "edge-free-kick"): TacticalScene {
  const scene = staticScene(tacticalExamples[3].scene, `editor-${type}-${side}`, { kind: "pitch", region: "set-piece", attack: "positive-x", setPiece: { type, phase: "attacking", side } });
  const mirror = (y: number) => side === "left" ? y : 68 - y;
  scene.entities = scene.entities.filter((e) => e.kind === "player");
  scene.entities.forEach((e, i) => { e.position = { x: 88 + (i % 4) * 4, y: mirror(23 + Math.floor(i / 4) * 8) }; });
  const at = deliveryLocation(scene);
  scene.entities.push({ id: "delivery-ball", kind: "ball", position: type === "corner" ? { x: at.x - 0.5, y: side === "left" ? 0.5 : 67.5 } : at, headingDegrees: 0 });
  scene.stages[0].tracks = [{ id: "delivery", kind: "annotation", visibleFrom: 0, visibleUntil: 1, annotation: { kind: "arrow", from: { ...scene.entities.at(-1)!.position }, to: { x: 99, y: mirror(31) }, movement: "pass" } }];
  return tacticalSceneSchema.parse(scene);
}
/** Nine production-schema examples for editor acceptance; never automatically uploaded to a club. */
export const editorExamples = [
  { id: "full", title: "Full-pitch 11v11", scene: full },
  { id: "third", title: "Final-third combination", scene: third },
  { id: "midfield", title: "Midfield possession", scene: midfield },
  { id: "rondo", title: "Neutral 5v2 rondo", scene: rondo },
  { id: "corner-left", title: "Left attacking corner", scene: setPiece("left", "corner") },
  { id: "corner-right", title: "Right attacking corner", scene: setPiece("right", "corner") },
  { id: "free-kick", title: "Edge-of-box free kick", scene: setPiece("left", "edge-free-kick") },
  { id: "goalkeeper", title: "Goalkeeper distribution", scene: staticScene(tacticalExamples[1].scene, "editor-goalkeeper", pitch("custom")) },
  { id: "conditioning", title: "Independent conditioning", scene: conditioning },
].map((e) => ({ ...e, scene: tacticalSceneSchema.parse(e.scene) }));
