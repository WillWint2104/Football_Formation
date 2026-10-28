"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { SceneDiagram } from "@/components/tactical/SceneDiagram";
import type { DomainBundle } from "@/lib/domain/validation";
import { resolveSource, type CameraView, type Presentation, type PresentationBlock } from "@/lib/presentations/contracts";
import { overviewView, areaView, focusView, interpolateView, type View } from "@/lib/presentations/camera";
import { evaluateScene, sceneDuration } from "@/lib/tactical/evaluate";
import { stageRanges } from "@/lib/tactical/animation";
import { actionFrame } from "@/lib/tactical/framing";
import { screenToWorld, type Projection } from "@/lib/tactical/viewport";
import { BlockContent } from "./BlockContent";

export function PresentationPlayer({ presentation, bundle, initial = 0, onClose, onCapture }: {
  presentation: Presentation; bundle: DomainBundle; initial?: number; onClose: () => void;
  onCapture?: (blockId: string, view: View, stageId: string | null) => void;
}) {
  const [index, setIndex] = useState(initial), [showNotes, setShowNotes] = useState(false), [message, setMessage] = useState("");
  const root = useRef<HTMLDivElement>(null), wasFullscreen = useRef(false), closeRef = useRef(onClose);
  useEffect(() => { closeRef.current = onClose; }, [onClose]);
  const close = useCallback(() => { if (document.fullscreenElement === root.current) void document.exitFullscreen().catch(() => {}); closeRef.current(); }, []);
  const navigate = useCallback((delta: number) => setIndex(i => Math.max(0, Math.min(presentation.blocks.length - 1, i + delta))), [presentation.blocks.length]);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null, overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden"; root.current?.focus();
    const fullscreen = () => { const active = document.fullscreenElement === root.current; if (wasFullscreen.current && !active) closeRef.current(); wasFullscreen.current = active; };
    document.addEventListener("fullscreenchange", fullscreen);
    return () => { document.body.style.overflow = overflow; document.removeEventListener("fullscreenchange", fullscreen); if (previous?.isConnected) previous.focus(); };
  }, []);
  const block = presentation.blocks[index];
  if (!block) return null;
  return <div ref={root} role="dialog" aria-modal="true" aria-label="Coaching presentation" tabIndex={-1} className="presentation-player calendar-workspace" onKeyDown={e => {
    if (e.key === "Tab") {
      const targets = Array.from(root.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),[tabindex="0"]') ?? []).filter(el => el.getClientRects().length);
      if (e.shiftKey && (document.activeElement === targets[0] || document.activeElement === root.current)) { e.preventDefault(); targets.at(-1)?.focus(); }
      else if (!e.shiftKey && (document.activeElement === targets.at(-1) || document.activeElement === root.current)) { e.preventDefault(); targets[0]?.focus(); }
    }
    if ((e.target as HTMLElement).closest("input,select,textarea")) return;
    if (["ArrowRight", "PageDown"].includes(e.key)) { e.preventDefault(); navigate(1); }
    if (["ArrowLeft", "PageUp"].includes(e.key)) { e.preventDefault(); navigate(-1); }
    if (e.key === "Home") { e.preventDefault(); setIndex(0); }
    if (e.key === "End") { e.preventDefault(); setIndex(presentation.blocks.length - 1); }
    if (e.key === "Escape") { e.preventDefault(); close(); }
  }}>
    <header className="presentation-player-heading"><div><p className="calendar-eyebrow">Football Formation · {index + 1} / {presentation.blocks.length}</p><h1>{block.title}</h1></div><div className="presentation-controls">
      <button onClick={() => setShowNotes(!showNotes)} aria-pressed={showNotes}>Coaching notes</button>
      <button onClick={async () => { try { if (document.fullscreenElement) await document.exitFullscreen(); else await root.current?.requestFullscreen(); } catch { setMessage("Native fullscreen unavailable. The window presentation remains active."); } }}>Fullscreen</button>
      <button onClick={close}>Return to overview</button></div></header>
    {message && <p role="status">{message}</p>}
    <PlayerSection key={block.id} block={block} bundle={bundle} showNotes={showNotes} onCapture={onCapture} />
    <footer className="presentation-player-footer"><button disabled={!index} onClick={() => navigate(-1)}>← Previous section</button>
      <label>Section<select aria-label="Presentation section" value={index} onChange={e => setIndex(Number(e.target.value))}>{presentation.blocks.map((b, i) => <option key={b.id} value={i}>{i + 1}. {b.title}</option>)}</select></label>
      <span className="calendar-muted">← → sections · Space playback · Esc overview</span><button disabled={index === presentation.blocks.length - 1} onClick={() => navigate(1)}>Next section →</button></footer>
  </div>;
}

function PlayerSection({ block, bundle, showNotes, onCapture }: { block: PresentationBlock; bundle: DomainBundle; showNotes: boolean; onCapture?: (id: string, view: View, stage: string | null) => void }) {
  const { scene } = resolveSource(bundle, block.source);
  const [seconds, setSeconds] = useState(block.source?.kind === "scene" ? block.source.seconds : 0), [playing, setPlaying] = useState(false), [speed, setSpeed] = useState(1);
  const [view, setView] = useState<View | null>(() => block.views.find(v => !v.stageId) ?? (scene ? overviewView(scene) : null));
  const [follow, setFollow] = useState(false), [selected, setSelected] = useState<string[]>([]), [notice, setNotice] = useState("");
  const viewRef = useRef(view), timeRef = useRef(seconds), transition = useRef<number | null>(null), lastShot = useRef(""), drag = useRef<{ id: number; start: { x: number; y: number }; original: View; projection: Projection } | null>(null);
  useEffect(() => { viewRef.current = view; }, [view]);
  useEffect(() => { timeRef.current = seconds; }, [seconds]);
  const duration = scene ? sceneDuration(scene) : 0, animated = block.kind === "animation", state = scene ? evaluateScene(scene, seconds) : null;
  const cancelTransition = useCallback(() => { if (transition.current !== null) cancelAnimationFrame(transition.current); transition.current = null; }, []);
  useEffect(() => () => cancelTransition(), [cancelTransition]);
  const applyShot = useCallback((shot: CameraView) => {
    cancelTransition(); const from = viewRef.current;
    if (!from || !shot.transitionSeconds || window.matchMedia("(prefers-reduced-motion: reduce)").matches || from.rotation !== shot.rotation) { setView(shot); return; }
    const start = performance.now();
    const frame = (now: number) => { const t = Math.min(1, (now - start) / (shot.transitionSeconds * 1000)); setView(interpolateView(from, shot, t)); if (t < 1) transition.current = requestAnimationFrame(frame); else transition.current = null; };
    transition.current = requestAnimationFrame(frame);
  }, [cancelTransition]);
  const manual = () => { cancelTransition(); setFollow(false); setNotice("Manual view · authored camera changes paused"); };
  useEffect(() => {
    if (!follow) { lastShot.current = ""; return; }
    const shot = block.views.find(v => v.stageId === state?.stage?.id) ?? block.views.find(v => !v.stageId);
    if (shot && shot.id !== lastShot.current) { lastShot.current = shot.id; applyShot(shot); }
  }, [follow, state?.stage?.id, block.views, applyShot]);
  useEffect(() => {
    if (!playing) return;
    let frame = 0, last = performance.now();
    const tick = (now: number) => { const elapsed = (now - last) / 1000; last = now; timeRef.current = Math.min(duration, timeRef.current + elapsed * speed); setSeconds(timeRef.current); if (timeRef.current >= duration) { setPlaying(false); return; } frame = requestAnimationFrame(tick); };
    frame = requestAnimationFrame(tick); return () => cancelAnimationFrame(frame);
  }, [playing, duration, speed]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => { if (e.code === "Space" && !(e.target as HTMLElement).closest("input,select,textarea,button") && animated) { e.preventDefault(); setPlaying(p => !p && seconds < duration); } };
    document.addEventListener("keydown", key); return () => document.removeEventListener("keydown", key);
  }, [animated, duration, seconds]);
  const ranges = scene ? stageRanges(scene) : [];
  const seek = (value: number) => { setPlaying(false); setSeconds(value); };
  return <><div className={`presentation-stage ${scene ? "has-scene" : ""} ${showNotes ? "with-notes" : ""}`}>
    {scene && view ? <div className="presentation-tactical">
      <div className="presentation-controls presentation-view-tools"><button onClick={() => { manual(); setView(overviewView(scene)); }}>Overview</button>
        <button disabled={!state?.stage} onClick={() => { if (state?.stage) { const f = actionFrame(scene, state.stage.id); if (f) { manual(); setView(areaView(f.area, "action", view.rotation)); } } }}>Action</button>
        <button disabled={!selected.length} onClick={() => { const f = focusView(scene, seconds, selected, view.rotation); if (f) { manual(); setView(f); } }}>Detail</button>
        <button aria-label="Zoom out" onClick={() => { manual(); setView({ ...view, zoom: Math.max(.1, view.zoom / 1.25) }); }}>−</button><button aria-label="Zoom in" onClick={() => { manual(); setView({ ...view, zoom: Math.min(8, view.zoom * 1.25) }); }}>+</button>
        <label>Rotate<select aria-label="Presentation rotation" value={view.rotation} onChange={e => { manual(); setView({ ...view, rotation: Number(e.target.value) as View["rotation"] }); }}>{[0, 90, 180, 270].map(n => <option key={n} value={n}>{n}°</option>)}</select></label>
        <label>Focus<select aria-label="Focus object" value={selected[0] ?? ""} onChange={e => setSelected(e.target.value ? [e.target.value] : [])}><option value="">Choose object / area</option>{state?.entities.filter(e => !state.hiddenEntityIds.includes(e.id)).map(e => <option key={e.id} value={`entity:${e.id}`}>{e.kind} {e.id}</option>)}{state?.annotations.filter(t => t.annotation.kind === "area").map(t => <option key={t.id} value={`annotation:${t.id}`}>Area {t.id}</option>)}</select></label>
        {!!block.views.length && <><select aria-label="Saved camera view" defaultValue="" onChange={e => { const shot = block.views.find(v => v.id === e.target.value); if (shot) { manual(); applyShot(shot); } }}><option value="">Saved camera views</option>{block.views.map(v => <option value={v.id} key={v.id}>{v.title}</option>)}</select><label><input type="checkbox" checked={follow} onChange={e => { if (!e.target.checked) cancelTransition(); setFollow(e.target.checked); setNotice(e.target.checked ? "Authored views enabled · drag or zoom to override" : "Authored views paused"); }} />Authored stage views</label></>}
        {onCapture && <button onClick={() => { onCapture(block.id, view, state?.stage?.id ?? null); setNotice("View captured in presentation draft. Save the presentation to retain it."); }}>Capture camera view</button>}</div>
      <div className="presentation-canvas" onWheel={e => { e.preventDefault(); manual(); setView(v => v && ({ ...v, zoom: Math.max(.1, Math.min(8, v.zoom * (e.deltaY < 0 ? 1.1 : 1 / 1.1))) })); }}>
        <SceneDiagram scene={scene} title={block.title} options={{ fit: "custom", customArea: view.area, camera: { center: view.center, zoom: view.zoom }, rotation: view.rotation, seconds, paths: "active", labels: true, selectedIds: selected }} interaction={{
          down: (e, p) => { if (e.button !== 0) return; const hit = (e.target as Element).closest("[data-entity-id],[data-annotation-id]"); if (hit) { const id = hit.getAttribute("data-entity-id"); const key = id ? `entity:${id}` : `annotation:${hit.getAttribute("data-annotation-id")}`; setSelected(e.shiftKey ? [...new Set([...selected, key])] : [key]); return; } manual(); e.currentTarget.setPointerCapture(e.pointerId); const r = e.currentTarget.getBoundingClientRect(); drag.current = { id: e.pointerId, start: screenToWorld({ x: e.clientX - r.left, y: e.clientY - r.top }, p), original: view, projection: p }; },
          move: e => { const d = drag.current; if (!d || d.id !== e.pointerId) return; const r = e.currentTarget.getBoundingClientRect(), point = screenToWorld({ x: e.clientX - r.left, y: e.clientY - r.top }, d.projection); setView({ ...d.original, center: { x: Math.max(-10000, Math.min(10000, d.original.center.x + d.start.x - point.x)), y: Math.max(-10000, Math.min(10000, d.original.center.y + d.start.y - point.y)) } }); },
          up: () => { drag.current = null; }, cancel: () => { drag.current = null; },
        }} />
      </div><div className="presentation-view-status"><span>{view.framing} · {Math.round(view.zoom * 100)}% · drag background to pan · Shift-click to select together</span><span role="status">{notice}</span></div>
    </div> : <article className="presentation-text-block"><BlockContent block={block} bundle={bundle} /></article>}
    {scene && showNotes && <aside className="presentation-side-notes"><h2>Coaching notes</h2><BlockContent block={block} bundle={bundle} /></aside>}
  </div>
  {animated && <div className="presentation-playback" role="region" aria-label="Presentation playback"><div className="presentation-controls">
    <button onClick={() => { if (seconds >= duration) setSeconds(0); setPlaying(!playing); }} aria-label={playing ? "Pause presentation animation" : "Play presentation animation"}>{playing ? "Pause" : "▶ Play"}</button><button onClick={() => seek(0)}>Restart</button>
    <output>{seconds.toFixed(1)} / {duration.toFixed(1)} s</output><input aria-label="Presentation playhead" type="range" min={0} max={duration} step="0.01" value={seconds} onChange={e => seek(Number(e.target.value))} />
    <select aria-label="Presentation playback speed" value={speed} onChange={e => setSpeed(Number(e.target.value))}>{[.5, 1, 1.5, 2].map(n => <option key={n} value={n}>{n}×</option>)}</select></div>
    <div className="presentation-stage-buttons">{ranges.map(r => <button key={r.stage.id} aria-pressed={state?.stage?.id === r.stage.id} onClick={() => seek(r.start)}>{r.index + 1} · {r.stage.title}<small>{r.start}–{r.end} s</small></button>)}</div></div>}
  </>;
}

