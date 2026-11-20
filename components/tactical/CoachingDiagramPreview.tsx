"use client";

import { useMemo, useState, type ReactNode } from "react";
import type { TacticalScene, TrainingArea } from "@/lib/domain/tactical-scene";
import { coachingScreenOptions, coachingAreaWarning, coachingOpeningFrame } from "@/lib/tactical/coaching-view";
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
type Props = {
  scene: TacticalScene; title: string; seconds: number; area?: TrainingArea | null;
  fit?: Frame; screenMode: DiagramSize; onFitChange?: (fit: Frame) => void;
  presentation?: { heading: ReactNode; action: ReactNode; attachments: ReactNode };
};

/** Accept only an already resolved owner snapshot; this adapter has no storage or save operation. */
export function CoachingDiagramPreview(props: Props) {
  let savedStage: string;
  try {
    coachingScreenOptions(props.scene, props.seconds, props.area);
    savedStage = evaluateScene(props.scene, props.seconds).stage?.id ?? "";
  }
  catch { return <p role="alert">The exact diagram or representative time is unavailable. No substitute was selected.</p>; }
  return <Preview key={JSON.stringify([props.scene.organizationId, props.scene.id, props.scene.revision, props.seconds, props.area])} {...props} savedStage={savedStage} />;
}

function Preview({ scene, title, seconds: savedSeconds, savedStage, area, fit = "exercise", screenMode, onFitChange, presentation }: Props & { savedStage: string }) {
  const isViewer = !!presentation;
  const opening = useMemo(() => isViewer ? coachingOpeningFrame(scene, savedSeconds, area) : undefined, [isViewer, scene, savedSeconds, area]);
  const [seconds, setSeconds] = useState(savedSeconds), [selected, setSelected] = useState(savedStage);
  const [manualFrame, setManualFrame] = useState<Frame>();
  const frame = onFitChange ? fit : manualFrame ?? opening?.fit ?? fit;
  const chooseFrame = onFitChange ?? setManualFrame;
  const ranges = stageRanges(scene), index = ranges.findIndex(r => r.stage.id === selected), range = ranges[index];
  const atSavedMoment = seconds === savedSeconds && selected === savedStage;
  const choose = (next: number) => { const r = ranges[next]; if (r) { setSelected(r.stage.id); setSeconds(r.start); } };
  const options = { ...coachingScreenOptions(scene, seconds, area, frame), poseStageId: selected || undefined };
  if (opening && frame === "all") {
    options.rotation = opening.allRotation ?? options.rotation;
    if (opening.omitArea) {
      options.exerciseArea = undefined;
      options.authoredArea = undefined;
    }
  }
  if (screenMode === "expanded") options.padding = 26;
  const stageNavigation = range ? <>
    <button type="button" aria-label="Previous scene stage" disabled={index <= 0} onClick={() => choose(index - 1)}>‹</button>
    <label>Scene stage <select aria-label="Scene stage" value={selected} onChange={e => choose(ranges.findIndex(r => r.stage.id === e.target.value))}>{ranges.map((r, i) => <option key={r.stage.id} value={r.stage.id}>{i + 1} / {ranges.length} · {r.stage.title}</option>)}</select></label>
    <button type="button" aria-label="Next scene stage" disabled={index === ranges.length - 1} onClick={() => choose(index + 1)}>›</button>
  </> : <strong>Static diagram</strong>;
  const fitControls = <div className="coaching-fit-controls" role="group" aria-label="Fit diagram">
    {frames.map(({ value, label }) => <button key={value} type="button" aria-pressed={frame === value}
      onClick={() => chooseFrame(value)}>{presentation && value === "all" ? "Fit all" : label}</button>)}
  </div>;
  const reset = !atSavedMoment && <button type="button" onClick={() => { setSeconds(savedSeconds); setSelected(savedStage); }}>{presentation ? "Saved view" : `Saved moment · ${savedSeconds} s`}</button>;
  return <div className="coaching-diagram-preview" data-saved-time={savedSeconds}>
    {presentation ? <><div className="viewer-diagram-toolbar">{presentation.heading}{fitControls}{presentation.action}</div>{presentation.attachments}</>
      : <div className="coaching-scene-controls">{stageNavigation}
        {range && <label className="coaching-stage-time">Pose <input aria-label="Scene stage pose seconds" type="range" min={0} max={range.stage.durationSeconds} step={0.01} value={Math.max(0, seconds - range.start)} onChange={e => setSeconds(range.start + Number(e.target.value))} /><span>{(seconds - range.start).toFixed(1)} s</span></label>}
        {fitControls}{reset}</div>}
    {coachingAreaWarning(scene, area) && <p className="coaching-area-warning" role="status">{coachingAreaWarning(scene, area)}</p>}
    <div className="coaching-preview-surface"><SceneDiagram scene={scene} title={title} screenMode={screenMode} sizingSeconds={savedSeconds} options={options}
      viewer={isViewer ? { onShowAll: frame !== "all" ? () => chooseFrame("all") : undefined,
        frameNote: frame === "all" && opening?.fit === "all"
          ? opening.omitArea ? "Fit all · This attachment sits outside the activity area." : "Fit all · Includes content beyond the exercise boundary."
          : undefined } : undefined} /></div>
    {presentation ? <div className="viewer-stage-toolbar" role="group" aria-label="Authored stage navigation">
      {range && ranges.length > 1 ? <>
        <button type="button" aria-label="Previous scene stage" disabled={index <= 0} onClick={() => choose(index - 1)}>‹</button>
        <div className="viewer-stage-current">
          <span aria-live="polite">Stage {index + 1} of {ranges.length}</span>
          {ranges.length <= 8 ? <strong title={range.stage.title}>{range.stage.title}</strong> :
            <select aria-label="Scene stage" value={selected} onChange={e => choose(ranges.findIndex(r => r.stage.id === e.target.value))}>
              {ranges.map(r => <option key={r.stage.id} value={r.stage.id}>{r.stage.title}</option>)}
            </select>}
        </div>
        {ranges.length <= 8 && <div className="viewer-stage-steps" role="group" aria-label="Go to stage">
          {ranges.map((r, i) => <button key={r.stage.id} type="button" title={r.stage.title} aria-label={`Stage ${i + 1}: ${r.stage.title}`}
            aria-current={i === index ? "step" : undefined} onClick={() => choose(i)}>{i + 1}</button>)}
        </div>}
        <button type="button" aria-label="Next scene stage" disabled={index === ranges.length - 1} onClick={() => choose(index + 1)}>›</button>
      </> : <strong>{range?.stage.title ?? "Static diagram"}</strong>}
      {reset}
    </div>
      : <span className="coaching-preview-provenance">r{scene.revision} · Saved moment {savedSeconds} s · Viewing {seconds.toFixed(1)} s{!atSavedMoment ? " · view only; saved pin unchanged" : ""}</span>}
  </div>;
}
