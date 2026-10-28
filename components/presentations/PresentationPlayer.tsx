"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { DomainBundle } from "@/lib/domain/validation";
import type { Presentation } from "@/lib/presentations/contracts";
import type { View } from "@/lib/presentations/camera";
import { PlayerSection } from "./PlayerSection";

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
    if (e.defaultPrevented) return;
    if (e.key === "Escape") {
      const select = (e.target as HTMLElement).closest("select");
      if (select && CSS.supports("selector(select:open)") && select.matches(":open")) return;
      e.preventDefault(); close(); return;
    }
    if ((e.target as HTMLElement).closest("input,select,textarea")) return;
    if (["ArrowRight", "PageDown"].includes(e.key)) { e.preventDefault(); navigate(1); }
    if (["ArrowLeft", "PageUp"].includes(e.key)) { e.preventDefault(); navigate(-1); }
    if (e.key === "Home") { e.preventDefault(); setIndex(0); }
    if (e.key === "End") { e.preventDefault(); setIndex(presentation.blocks.length - 1); }
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

