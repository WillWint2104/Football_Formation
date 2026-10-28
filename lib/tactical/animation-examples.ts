import type { TacticalScene } from "../domain/tactical-scene";
import { editorExamples } from "./editor-examples";
import { appendStage, setPose, updateStage } from "./animation";
import { prepareScene, type EntityTrack } from "./evaluate";

type Pose = [id: string, x: number, y: number, movement?: EntityTrack["movement"], at?: number];
/** Explicit illustrative setups exercise the actual authoring operations, not a separate animation renderer. */
function example(id: string, title: string, sourceId: string, steps: { title: string; duration: number; poses: Pose[] }[], keep?: string[]) {
  let source: TacticalScene = { ...structuredClone(editorExamples.find((e) => e.id === sourceId)!.scene), id: `animation-${id}`, stages: [] }, next = 0;
  const allocate = () => `${id}-${++next}`;
  if (keep) source.entities = source.entities.filter((e) => e.kind === "equipment" || keep.includes(e.id));
  for (const step of steps) {
    source = appendStage(source, allocate); const stage = source.stages.at(-1)!;
    source = updateStage(source, stage.id, step.title, step.duration);
    for (const [entity, x, y, movement, at] of step.poses) source = setPose(source, stage.id, entity, at ?? step.duration, { x, y }, movement, allocate);
  }
  return { id: `animation-${id}`, title, scene: prepareScene(source) };
}
/** Eight synthetic acceptance scenes. They are never uploaded or attached until an explicit owner save. */
export const animationExamples = [
  example("passing", "Animation · Simple passing", "rondo", [
    { title: "Receive and open", duration: 3, poses: [["ball", 1, 4, "pass", 2]] },
    { title: "Play the third player", duration: 3, poses: [["ball", 6, 1, "pass", 2], ["a1", 3, 10, "run"]] },
  ], ["a1", "a3", "a4", "ball"]),
  example("rotation", "Animation · Three-player rotation", "rondo", [
    { title: "Rotate into support", duration: 4, poses: [["a1", 1, 4, "rotation"], ["a3", 6, 1, "rotation"], ["a4", 1, 10, "rotation"], ["ball", 6, 1, "pass", 2]] },
    { title: "Connect and rotate again", duration: 4, poses: [["a1", 6, 1, "rotation"], ["a3", 1, 10, "rotation"], ["a4", 1, 4, "rotation"], ["ball", 1, 4, "pass", 2]] },
  ], ["a1", "a3", "a4", "ball"]),
  example("rondo", "Animation · Rondo and moving defenders", "rondo", [
    { title: "Invite the first press", duration: 4, poses: [["ball", 6, 1, "pass", 2], ["b1", 4, 3, "press"], ["b2", 6, 5, "press"]] },
    { title: "Release the spare player", duration: 4, poses: [["ball", 11, 5, "pass", 2], ["b1", 7, 3, "press"], ["b2", 9, 6, "press"], ["a1", 3, 11, "rotation"]] },
    { title: "Switch the angle", duration: 3, poses: [["ball", 3, 11, "pass", 2], ["b2", 7, 8, "press"]] },
  ]),
  example("third", "Animation · Attacking combination and finish", "third", [
    { title: "Release wide", duration: 4, poses: [["ball", 80, 8, "pass", 2], ["a8", 89, 12, "rotation"]] },
    { title: "Combine inside", duration: 3, poses: [["ball", 96, 30, "pass", 2], ["a9", 99, 31, "run"], ["b4", 94, 26, "press"]] },
    { title: "Finish", duration: 2, poses: [["ball", 104, 34, "pass"], ["a9", 102, 32, "run"]] },
  ]),
  example("corner", "Animation · Corner delivery and coordinated runs", "corner-left", [
    { title: "Create separation", duration: 3, poses: [["a9", 97, 30, "run"], ["a8", 92, 39, "rotation"], ["b4", 96, 33, "press"]] },
    { title: "Deliver and attack", duration: 3, poses: [["delivery-ball", 100, 30, "pass", 2], ["a9", 101, 31, "run"], ["a8", 98, 37, "run"]] },
  ]),
  example("goalkeeper", "Animation · Goalkeeper distribution", "goalkeeper", [
    { title: "Open the passing lane", duration: 4, poses: [["ball", 23, 23, "pass", 3], ["a4", 23, 23, "run"], ["b9", 16, 30, "press"]] },
    { title: "Switch beyond pressure", duration: 4, poses: [["ball", 22, 44, "pass", 3], ["a5", 22, 44, "run"], ["gk", 6, 36, "run"]] },
  ]),
  example("conditioning", "Animation · Timed conditioning lanes", "conditioning", [
    { title: "Accelerate", duration: 5, poses: [["a1", 32, 5, "run", 4], ["a2", 32, 13, "run", 4], ["a3", 32, 21, "run", 4]] },
    { title: "Controlled return", duration: 6, poses: [["a1", 4, 5, "run"], ["a2", 4, 13, "run"], ["a3", 4, 21, "run"]] },
  ]),
  example("full", "Animation · Multi-stage full-pitch movement", "full", [
    { title: "Build from the back", duration: 4, poses: [["ball", 35, 28, "pass", 3], ["a6", 45, 16, "run"], ["b10", 47, 36, "press"]] },
    { title: "Progress through midfield", duration: 4, poses: [["ball", 49, 23, "pass", 3], ["a7", 48, 28, "run"], ["b9", 49, 32, "press"]] },
    { title: "Release the forward run", duration: 4, poses: [["ball", 70, 19, "pass", 3], ["a10", 70, 19, "run"], ["a11", 66, 42, "run"]] },
  ]),
];
