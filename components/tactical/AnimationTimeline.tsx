"use client";

import type { TacticalScene } from "@/lib/domain/tactical-scene";
import { sceneDuration } from "@/lib/tactical/evaluate";
import { stageRanges } from "@/lib/tactical/animation";

type Props = { scene: TacticalScene; selected: string; seconds: number; playing: boolean; speed: number; disabled: boolean; onSeek: (seconds: number) => void; onStage: (id: string) => void; onPlay: () => void; onRestart: () => void; onSpeed: (speed: number) => void; onAdd: () => void };
/** Compact cumulative timeline controls the shared evaluator; playback never writes scene geometry. */
export function AnimationTimeline({ scene, selected, seconds, playing, speed, disabled, onSeek, onStage, onPlay, onRestart, onSpeed, onAdd }: Props) {
  const duration = sceneDuration(scene);
  return <section className="animation-timeline" aria-label="Animation timeline">
    <div className="animation-transport"><button onClick={onPlay} disabled={!duration} aria-label={playing ? "Pause animation" : "Play animation"}>{playing ? "Ⅱ Pause" : "▶ Play"}</button><button onClick={onRestart} disabled={!duration}>↤ Restart</button>
      <output aria-label="Playback time">{Math.min(seconds, duration).toFixed(2)} / {duration.toFixed(2)} s</output>
      <input aria-label="Animation playhead" type="range" min="0" max={duration || 1} step=".01" value={Math.min(seconds, duration)} disabled={!duration} onChange={(e) => onSeek(Number(e.target.value))} />
      <label>Speed<select aria-label="Playback speed" value={speed} onChange={(e) => onSpeed(Number(e.target.value))}>{[.5, 1, 1.5, 2].map((value) => <option key={value} value={value}>{value}×</option>)}</select></label><button disabled={disabled} onClick={onAdd}>+ Add stage</button>
    </div>
    <div className="animation-stages" aria-label="Ordered animation stages">{stageRanges(scene).map(({ stage, index, start, end }) => <button key={stage.id} data-stage-id={stage.id} aria-label={`Select stage ${index + 1}: ${stage.title}`} aria-pressed={selected === stage.id} style={{ flexGrow: stage.durationSeconds }} onClick={() => onStage(stage.id)}><strong>{String(index + 1).padStart(2, "0")} · {stage.title}</strong><span>{start.toFixed(1)}–{end.toFixed(1)} s · {stage.durationSeconds.toFixed(1)} s</span></button>)}</div>
    <p className="animation-hint">Select a stage, choose a pose time, then move a player or ball. Playback and scrubbing never save edits.</p>
  </section>;
}
