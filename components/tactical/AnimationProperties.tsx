"use client";

import type { TacticalScene } from "@/lib/domain/tactical-scene";
import { annotationWindow, changeStageOrder, duplicateStage, removeKeyframe, retimeKeyframe, setPose, setStageVisible, stageRanges, updateStage } from "@/lib/tactical/animation";
import { evaluateScene } from "@/lib/tactical/evaluate";

type Props = { scene: TacticalScene; stageId: string; selected: string[]; seconds: number; onSeekPose: (seconds: number) => void; operate: (fn: () => TacticalScene) => void };
/** Stage-local property edits are explicit undoable operations on the existing saved scene. */
export function AnimationProperties({ scene, stageId, selected, seconds, onSeekPose, operate }: Props) {
  const range = stageRanges(scene).find((r) => r.stage.id === stageId); if (!range) return <p>Add a stage to begin animation authoring.</p>;
  const { stage, start, index } = range, local = Math.max(0, Math.min(stage.durationSeconds, Math.round((seconds - start) * 1_000_000) / 1_000_000));
  const entity = selected.length === 1 ? evaluateScene(scene, seconds).entities.find((e) => `entity:${e.id}` === selected[0]) : undefined;
  const track = stage.tracks.find((t) => t.kind !== "annotation" && t.entityId === entity?.id);
  const annotation = stage.tracks.find((t) => t.kind === "annotation" && selected.includes(`annotation:${t.id}`));
  return <>
    <section><p className="calendar-eyebrow">Selected stage {index + 1}</p><h2>{stage.title}</h2>
      <form key={`${stage.id}:${stage.title}:${stage.durationSeconds}`} onSubmit={(e) => { e.preventDefault(); const data = new FormData(e.currentTarget); operate(() => updateStage(scene, stage.id, String(data.get("title")), Number(data.get("duration")))); }}>
        <label>Stage title<input aria-label="Stage title" name="title" defaultValue={stage.title} maxLength={200} required /></label><label>Duration (s)<input aria-label="Stage duration (seconds)" name="duration" type="number" min=".1" max="3600" step="any" defaultValue={stage.durationSeconds} required /></label><button>Apply stage timing</button>
      </form>
      <div className="editor-button-grid"><button onClick={() => operate(() => duplicateStage(scene, stage.id))}>Duplicate stage</button><button onClick={() => operate(() => changeStageOrder(scene, stage.id, "delete"))}>Delete stage</button><button disabled={!index} onClick={() => operate(() => changeStageOrder(scene, stage.id, "earlier"))}>Move stage earlier</button><button disabled={index === scene.stages.length - 1} onClick={() => operate(() => changeStageOrder(scene, stage.id, "later"))}>Move stage later</button></div>
      <p className="calendar-muted">Duration changes retime paths and annotations together. Reordering and copies keep absolute destinations and reconnect their starts.</p>
    </section>
    <section><h2>Pose editing</h2><div className="editor-row"><button onClick={() => onSeekPose(start)}>Start pose</button><button onClick={() => onSeekPose(range.end)}>End pose</button></div>
      <label>Local pose time (s)<input aria-label="Stage pose time" type="number" min="0" max={stage.durationSeconds} step=".01" value={Number(local.toFixed(6))} onChange={(e) => { const value = Number(e.target.value); if (Number.isFinite(value) && value >= 0 && value <= stage.durationSeconds) onSeekPose(start + value); }} /></label>
      <p className="calendar-muted">{local === 0 ? index ? "Shared start: a pose edit also changes the preceding stage endpoint." : "At 0 s, a pose edit changes the initial setup." : `Move selected players or balls to record a keyframe at ${local.toFixed(2)} s.`}</p>
      {entity && entity.kind !== "equipment" && <form key={`${stage.id}:${entity.id}:${local}:${entity.position.x}:${entity.position.y}`} onSubmit={(e) => { e.preventDefault(); const data = new FormData(e.currentTarget); operate(() => setPose(scene, stage.id, entity.id, local, { x: Number(data.get("x")), y: Number(data.get("y")) }, data.get("movement") as "run" | "press" | "rotation" | "pass" | "dribble")); }}>
        <p>{entity.kind === "player" ? `#${entity.number} · Team ${entity.team.toUpperCase()}` : "Ball"} · selected pose</p>
        <div className="editor-row"><label>X (m)<input aria-label="Pose X" name="x" type="number" step="any" defaultValue={entity.position.x} required /></label><label>Y (m)<input aria-label="Pose Y" name="y" type="number" step="any" defaultValue={entity.position.y} required /></label></div>
        <label>Movement<select aria-label="Movement type" name="movement" defaultValue={track && track.kind !== "annotation" ? track.movement : entity.kind === "player" ? "run" : "pass"}>{(entity.kind === "player" ? ["run", "press", "rotation"] : ["pass", "dribble"]).map((v) => <option key={v}>{v}</option>)}</select></label><button>Record pose keyframe</button>
      </form>}
      {track && track.kind !== "annotation" && <div className="animation-keyframes" aria-label="Selected object keyframes">{track.keyframes.map((frame) => <div key={frame.seconds}><button onClick={() => onSeekPose(start + frame.seconds)}>{frame.seconds.toFixed(2)} s · {frame.position.x.toFixed(1)}, {frame.position.y.toFixed(1)} m</button><button disabled={!frame.seconds} aria-label={`Delete keyframe at ${frame.seconds} seconds`} onClick={() => operate(() => removeKeyframe(scene, stage.id, track.entityId, frame.seconds))}>×</button></div>)}</div>}
      {track && track.kind !== "annotation" && track.keyframes.some((f) => f.seconds === local && local > 0) && <form key={`retime:${track.id}:${local}`} onSubmit={(e) => { e.preventDefault(); const next = Number(new FormData(e.currentTarget).get("time")); operate(() => retimeKeyframe(scene, stage.id, track.entityId, local, next)); }}><label>Selected keyframe time (s)<input aria-label="Selected keyframe time" name="time" type="number" min=".000001" max={stage.durationSeconds} step="any" defaultValue={local} required /></label><button>Move keyframe time</button></form>}
      {entity?.kind === "equipment" && <p>Equipment stays fixed. Position equipment in Layout mode.</p>}
    </section>
    <section><h2>Stage visibility</h2><div className="editor-row"><button disabled={!selected.some((id) => id.startsWith("entity:"))} onClick={() => operate(() => setStageVisible(scene, stage.id, selected.filter((id) => id.startsWith("entity:")).map((id) => id.slice(7)), false))}>Hide selected in stage</button><button disabled={!stage.hiddenEntityIds?.length} onClick={() => operate(() => setStageVisible(scene, stage.id, stage.hiddenEntityIds ?? [], true))}>Show all in stage</button></div>
      <p className="calendar-muted">{stage.hiddenEntityIds?.length ?? 0} hidden · movement still carries into later stages.</p>
    </section>
    {annotation?.kind === "annotation" && <section><h2>Annotation timing</h2><form key={`${annotation.id}:${annotation.visibleFrom}:${annotation.visibleUntil}`} onSubmit={(e) => { e.preventDefault(); const data = new FormData(e.currentTarget); operate(() => annotationWindow(scene, stage.id, annotation.id, Number(data.get("from")), Number(data.get("until")))); }}><div className="editor-row"><label>Visible from (s)<input aria-label="Annotation visible from" name="from" type="number" min="0" max={stage.durationSeconds} step="any" defaultValue={annotation.visibleFrom} required /></label><label>Visible until (s)<input aria-label="Annotation visible until" name="until" type="number" min=".001" max={stage.durationSeconds} step="any" defaultValue={annotation.visibleUntil} required /></label></div><button>Apply annotation timing</button></form></section>}
  </>;
}
