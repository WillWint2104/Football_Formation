"use client";

import { useState } from "react";
import type { TacticalScene, TrainingArea } from "@/lib/domain/tactical-scene";
import { coachingScreenOptions, coachingAreaWarning } from "@/lib/tactical/coaching-view";
import { evaluateScene } from "@/lib/tactical/evaluate";
import { stageRanges } from "@/lib/tactical/animation";
import type { DiagramSize } from "@/lib/tactical/screen-presentation";
import { SceneDiagram } from "./SceneDiagram";
import "./coaching-preview.css";

type Frame = "exercise" | "all" | "pitch";
const frames: { value: Frame; label: string }[] = [
  { value: "exercise", label: "Fit exercise" },
  { value: "pitch", label: "Fit pitch" },
  { value: "all", label: "Fit all content" },
];
type Props = { scene: TacticalScene; title: string; seconds: number; area?: TrainingArea | null; fit?: Frame; screenMode: DiagramSize; onFitChange?: (fit: Frame) => void };

/** Accept only an already resolved owner snapshot; this adapter has no storage or save operation. */
export function CoachingDiagramPreview(props: Props) {
  try { coachingScreenOptions(props.scene, props.seconds, props.area); }
  catch { return <p role="alert">The exact diagram or representative time is unavailable. No substitute was selected.</p>; }
  return <Preview key={JSON.stringify([props.scene.organizationId, props.scene.id, props.scene.revision, props.seconds, props.area])} {...props} />;
}

function Preview({ scene, title, seconds: savedSeconds, area, fit = "exercise", screenMode, onFitChange }: Props) {
  const [seconds, setSeconds] = useState(savedSeconds), [selected, setSelected] = useState(() => evaluateScene(scene, savedSeconds).stage?.id ?? ""), [localFrame, setFrame] = useState<Frame>(fit);
  const frame = onFitChange ? fit : localFrame;
  const ranges = stageRanges(scene), index = ranges.findIndex(r => r.stage.id === selected), range = ranges[index];
  const atSavedMoment = seconds === savedSeconds && selected === (evaluateScene(scene, savedSeconds).stage?.id ?? "");
  const choose = (next: number) => { const r = ranges[next]; if (r) { setSelected(r.stage.id); setSeconds(r.start); } };
  const options = { ...coachingScreenOptions(scene, seconds, area, frame), poseStageId: selected || undefined };
  if (screenMode === "expanded") options.padding = 26;
  return <div className="coaching-diagram-preview" data-saved-time={savedSeconds}>
    <div className="coaching-scene-controls">
      {range ? <><button type="button" aria-label="Previous scene stage" disabled={index <= 0} onClick={() => choose(index - 1)}>‹</button>
        <label>Scene stage <select aria-label="Scene stage" value={selected} onChange={e => choose(ranges.findIndex(r => r.stage.id === e.target.value))}>{ranges.map((r, i) => <option key={r.stage.id} value={r.stage.id}>{i + 1} / {ranges.length} · {r.stage.title}</option>)}</select></label>
        <button type="button" aria-label="Next scene stage" disabled={index === ranges.length - 1} onClick={() => choose(index + 1)}>›</button>
        <label className="coaching-stage-time">Pose <input aria-label="Scene stage pose seconds" type="range" min={0} max={range.stage.durationSeconds} step={0.01} value={Math.max(0, seconds - range.start)} onChange={e => setSeconds(range.start + Number(e.target.value))} /><span>{(seconds - range.start).toFixed(1)} s</span></label></> : <strong>Static diagram</strong>}
      <div className="coaching-fit-controls" role="group" aria-label="Fit diagram">
        {frames.map(({ value, label }) => <button key={value} type="button" aria-pressed={frame === value}
          onClick={() => { if (onFitChange) onFitChange(value); else setFrame(value); }}>{label}</button>)}
      </div>
      {!atSavedMoment && <button type="button" onClick={() => { setSeconds(savedSeconds); setSelected(evaluateScene(scene, savedSeconds).stage?.id ?? ""); }}>Saved moment · {savedSeconds} s</button>}
    </div>
    {coachingAreaWarning(scene, area) && <p className="coaching-area-warning" role="status">{coachingAreaWarning(scene, area)}</p>}
    <div className="coaching-preview-surface"><SceneDiagram scene={scene} title={title} screenMode={screenMode} sizingSeconds={savedSeconds} options={options} /></div>
    <span className="coaching-preview-provenance">r{scene.revision} · Saved moment {savedSeconds} s · Viewing {seconds.toFixed(1)} s{!atSavedMoment ? " · view only; saved pin unchanged" : ""}</span>
  </div>;
}
