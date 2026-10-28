"use client";
import { useEffect, useRef, useState } from "react";
import { useCoaching } from "@/components/coaching/CoachingProvider";
import { WorkspaceStatus } from "@/components/coaching/WorkspaceStatus";
import { useUnsavedChanges } from "@/components/coaching/useUnsavedChanges";
import { latest } from "@/lib/coaching/sessions";
import { blankPresentation, createBlock, fromSession, resolveSource, sceneLabel, validatePresentation, type Presentation, type PresentationBlock, type CameraView } from "@/lib/presentations/contracts";
import { loadPresentations, savePresentation, PresentationApiError } from "@/lib/presentations/client";
import type { View } from "@/lib/presentations/camera";
import type { RevisionRef } from "@/lib/domain/common";
import { SceneDiagram } from "@/components/tactical/SceneDiagram";
import { BlockContent } from "./BlockContent";
import { PresentationPlayer } from "./PresentationPlayer";

export function PresentationsWorkspace({ source }: { source?: RevisionRef }) {
  const { scope, loading, blocked, mode } = useCoaching();
  return <div className="calendar-workspace presentation-workspace"><div className="calendar-page-heading"><div><p className="calendar-eyebrow">Plan. Prepare. Coach.</p><h1>Coaching presentations</h1><p className="calendar-muted">Curate saved coaching content. Present the live tactical scene.</p></div></div>
    <details className="presentation-storage"><summary>{mode === "saved" ? "Saved organisation" : "Sample workspace"} · connection and reload</summary><WorkspaceStatus /></details>{loading ? <p>Loading source records…</p> : blocked ? <p role="alert">Reload coaching records before opening presentations.</p> : <PresentationLibrary key={`${scope}:${mode}`} source={source} />}</div>;
}
function PresentationLibrary({ source }: { source?: RevisionRef }) {
  const { snapshot, mode } = useCoaching(), bundle = snapshot.bundle;
  const [records, setRecords] = useState<Presentation[]>([]), [history, setHistory] = useState<Presentation[]>([]);
  const [draft, setDraft] = useState<Presentation | null>(null), [saved, setSaved] = useState<Presentation | null>(null), [selected, setSelected] = useState(0);
  const [loading, setLoading] = useState(mode === "saved"), [busy, setBusy] = useState(false), [blocked, setBlocked] = useState(false), [privateLost, setPrivateLost] = useState(false), [message, setMessage] = useState("");
  const [sessionKey, setSessionKey] = useState(source ? `${source.id}#${source.revision}` : ""), [activities, setActivities] = useState<string[]>(() => bundle.sessions.find(s => source && s.id === source.id && s.revision === source.revision)?.content.activities.map(a => a.id) ?? []), [includeOverview, setIncludeOverview] = useState(true), [includeSummary, setIncludeSummary] = useState(true);
  const [catalogKey, setCatalogKey] = useState(""), [presenting, setPresenting] = useState<number | null>(null);
  const alive = useRef(true), lock = useRef(false);
  const dirty = !!draft && JSON.stringify(draft) !== JSON.stringify(saved);
  useUnsavedChanges(dirty);
  const historical = !!saved && records.some(p => p.id === saved.id && p.revision > saved.revision);
  const disabled = busy || loading || blocked || privateLost;
  const session = bundle.sessions.find(s => `${s.id}#${s.revision}` === sessionKey);

  const fail = (error: unknown, uncertain = false) => {
    if (!alive.current) return;
    setMessage(error instanceof Error ? error.message : "Presentation unavailable"); setBlocked(true);
    if (error instanceof PresentationApiError && [401, 404].includes(error.status)) { setRecords([]); setHistory([]); setDraft(null); setSaved(null); setPresenting(null); setPrivateLost(true); }
    if (uncertain) setMessage("Save outcome uncertain. Your draft is retained. Reload presentations before any further save; no retry was made.");
  };
  useEffect(() => {
    alive.current = true;
    if (mode === "saved") void loadPresentations(bundle).then(p => { if (alive.current) { setRecords(p); setLoading(false); } }).catch(error => { if (alive.current) { setLoading(false); setMessage(error instanceof Error ? error.message : "Presentation storage unavailable"); setBlocked(true); } });
    return () => { alive.current = false; };
  }, [bundle, mode]);
  const discard = () => !dirty || window.confirm("Discard the unsaved presentation draft?");
  const open = (p: Presentation) => { if (!discard()) return; setDraft(structuredClone(p)); setSaved(structuredClone(p)); setSelected(0); setHistory([]); setMessage(`Opened presentation v${p.revision} with exact source references.`); };
  const update = (p: Presentation) => { if (!disabled && !historical) setDraft(p); };
  const block = draft?.blocks[selected];
  const updateBlock = (b: PresentationBlock) => { if (draft) update({ ...draft, blocks: draft.blocks.map(item => item.id === b.id ? b : item) }); };
  const add = (blocks: PresentationBlock[]) => {
    if (!draft || draft.blocks.length + blocks.length > 128) { setMessage("A presentation supports up to 128 sections."); return; }
    update({ ...draft, blocks: [...draft.blocks, ...blocks] }); setSelected(draft.blocks.length);
  };
  const capture = (id: string, view: View, stageId: string | null) => {
    if (!draft || historical || disabled) return;
    const b = draft.blocks.find(b => b.id === id); if (!b || b.views.length >= 32) { setMessage("A section supports up to 32 camera views."); return; }
    const shot: CameraView = { ...structuredClone(view), id: crypto.randomUUID(), stageId, title: `${view.framing} ${b.views.length + 1}`, transitionSeconds: 0 };
    update({ ...draft, blocks: draft.blocks.map(item => item.id === id ? { ...item, views: [...item.views, shot] } : item) });
  };
  const start = (index: number) => { try { if (draft) { validatePresentation(draft, bundle); setPresenting(index); } } catch { setMessage("Check section titles, camera limits and pinned source revisions before presenting."); } };
  return <><div className="presentation-library-toolbar"><div className="presentation-controls"><button className="calendar-primary" disabled={disabled} onClick={() => { if (discard()) { setDraft(blankPresentation(bundle.organizationId)); setSaved(null); setHistory([]); setSelected(0); } }}>New presentation</button>
    <button disabled={busy || loading || mode !== "saved"} onClick={async () => {
      if (!discard() || lock.current) return; lock.current = true; setLoading(true);
      try { const p = await loadPresentations(bundle); if (alive.current) { setRecords(p); setDraft(null); setSaved(null); setHistory([]); setBlocked(false); setPrivateLost(false); setMessage("Presentation journal reloaded."); } }
      catch (e) { fail(e); } finally { lock.current = false; if (alive.current) setLoading(false); }
    }}>Reload presentations</button></div><p className="calendar-muted">{mode === "sample" ? "Sample workspace · page memory only · reload discards presentations" : "Saved separately · original sessions and exercises stay unchanged"}</p></div>
    {message && <p role="status" className="coaching-notice">{message}</p>}
    {!privateLost && <div className="presentation-layout"><aside className="presentation-catalog"><h2>Saved presentations</h2>{!records.length && <p className="calendar-muted">Create from a session or assemble selected demonstrations.</p>}
      {records.map(p => <button disabled={disabled} key={p.id} className="presentation-record" onClick={() => open(p)}><strong>{p.title}</strong><small>{p.blocks.length} sections · v{p.revision}</small></button>)}
      <section className="presentation-conversion"><h3>Create from session</h3><label>Saved session<select aria-label="Presentation source session" value={sessionKey} disabled={disabled} onChange={e => { setSessionKey(e.target.value); setActivities(bundle.sessions.find(s => `${s.id}#${s.revision}` === e.target.value)?.content.activities.map(a => a.id) ?? []); }}><option value="">Choose a saved revision</option>{bundle.sessions.map(s => <option key={`${s.id}:${s.revision}`} value={`${s.id}#${s.revision}`}>{s.content.title} · v{s.revision}</option>)}</select></label>
        {session && <><p className="calendar-muted">Select content to include</p>{session.content.activities.map(a => <label className="presentation-check" key={a.id}><input type="checkbox" checked={activities.includes(a.id)} onChange={e => setActivities(e.target.checked ? [...activities, a.id] : activities.filter(id => id !== a.id))} />{a.content.title}</label>)}
          <label className="presentation-check"><input type="checkbox" checked={includeOverview} onChange={e => setIncludeOverview(e.target.checked)} />Session overview</label><label className="presentation-check"><input type="checkbox" checked={includeSummary} onChange={e => setIncludeSummary(e.target.checked)} />Session summary</label></>}
        <button disabled={disabled || !session || (!activities.length && !includeOverview && !includeSummary)} onClick={() => { if (!session || !discard()) return; try { const p = fromSession(bundle, { id: session.id, revision: session.revision }, activities, includeOverview, includeSummary); setDraft(p); setSaved(null); setSelected(0); setHistory([]); setMessage("Selected content converted. Source session unchanged."); } catch { setMessage("A pinned source could not be resolved."); } }}>Create selected content</button></section>
    </aside><section className="presentation-builder" aria-label="Presentation builder">
      {!draft ? <div className="coaching-empty"><h2>Build a focused coaching story</h2><p>Convert selected session activities, or start with saved exercises and tactical scenes. Each section keeps its exact source revision.</p></div> : <>
        <div className="presentation-builder-heading"><label>Presentation title<input aria-label="Presentation title" maxLength={10000} disabled={disabled || historical} value={draft.title} onChange={e => update({ ...draft, title: e.target.value })} /></label><div className="presentation-controls">
          <button disabled={disabled || historical || !dirty} className="calendar-primary" onClick={async () => {
            if (lock.current) return; let valid: Presentation;
            try { valid = validatePresentation(draft, bundle); } catch { setMessage("Check titles, camera settings and pinned sources before saving."); return; }
            lock.current = true; setBusy(true);
            try { const p = mode === "saved" ? await savePresentation(bundle, saved?.revision ?? 0, valid) : validatePresentation({ ...valid, revision: (saved?.revision ?? 0) + 1 }, bundle);
              if (alive.current) { setRecords(items => [...items.filter(r => r.id !== p.id), p]); setDraft(p); setSaved(structuredClone(p)); setHistory([]); setMessage(`Saved presentation v${p.revision}${mode === "sample" ? " in page memory only" : ""}. Sources unchanged.`); }
            } catch (e) { fail(e, !(e instanceof PresentationApiError && [400, 401, 404, 409].includes(e.status))); }
            finally { lock.current = false; if (alive.current) setBusy(false); }
          }}>{busy ? "Saving…" : "Save presentation"}</button>
          <button disabled={disabled || !draft.blocks.length} onClick={() => start(0)}>▶ Present</button></div></div>
        <p className="calendar-muted">{historical ? "Historical presentation · read only" : dirty ? "Unsaved presentation changes" : `Saved presentation v${saved?.revision}`} · {draft.blocks.length} sections{draft.originSession ? ` · session ${draft.originSession.id} v${draft.originSession.revision}` : " · independent assembly"}</p>
        {saved && mode === "saved" && <div className="presentation-controls"><button disabled={disabled || dirty} onClick={async () => { if (lock.current) return; lock.current = true; setBusy(true); try { const h = await loadPresentations(bundle, saved.id); if (alive.current) setHistory(h); } catch (e) { fail(e); } finally { lock.current = false; if (alive.current) setBusy(false); } }}>Load revision history</button>
          {history.map(p => <button key={p.revision} disabled={disabled} onClick={() => { if (discard()) { setDraft(structuredClone(p)); setSaved(p); setSelected(0); } }}>Open v{p.revision}</button>)}</div>}
        <div className="presentation-assembly"><nav aria-label="Presentation sections" className="presentation-sections">{draft.blocks.map((b, i) => <div className="presentation-section-row" key={b.id}><button aria-current={i === selected ? "step" : undefined} onClick={() => setSelected(i)}><small>{String(i + 1).padStart(2, "0")} · {b.kind}</small><strong>{b.title}</strong></button><div className="presentation-controls">
          <button aria-label={`Move section ${i + 1} earlier`} disabled={disabled || historical || !i} onClick={() => { const blocks = [...draft.blocks]; [blocks[i - 1], blocks[i]] = [blocks[i], blocks[i - 1]]; update({ ...draft, blocks }); setSelected(i - 1); }}>↑</button>
          <button aria-label={`Move section ${i + 1} later`} disabled={disabled || historical || i === draft.blocks.length - 1} onClick={() => { const blocks = [...draft.blocks]; [blocks[i + 1], blocks[i]] = [blocks[i], blocks[i + 1]]; update({ ...draft, blocks }); setSelected(i + 1); }}>↓</button>
          <button aria-label={`Duplicate section ${i + 1}`} disabled={disabled || historical || draft.blocks.length >= 128} onClick={() => { const blocks = [...draft.blocks]; blocks.splice(i + 1, 0, { ...structuredClone(b), id: crypto.randomUUID(), title: `${b.title} (copy)` }); update({ ...draft, blocks }); setSelected(i + 1); }}>Copy</button>
          <button aria-label={`Remove section ${i + 1}`} disabled={disabled || historical} onClick={() => { update({ ...draft, blocks: draft.blocks.filter(item => item.id !== b.id) }); setSelected(Math.max(0, Math.min(selected, draft.blocks.length - 2))); }}>×</button></div></div>)}</nav>
          <section className="presentation-section-editor" aria-label="Selected section">{block ? <><div className="presentation-controls"><label>Section title<input aria-label="Section title" disabled={disabled || historical} maxLength={10000} value={block.title} onChange={e => updateBlock({ ...block, title: e.target.value })} /></label><button disabled={disabled} onClick={() => start(selected)}>Present this section</button></div>
            <p className="calendar-muted">{block.source ? `${block.source.kind} ${block.source.ref.id} · exact v${block.source.ref.revision}` : "Presentation-only content"}</p>
            {(() => { const { scene } = resolveSource(bundle, block.source); return scene ? <><div className="presentation-preview"><SceneDiagram scene={scene} title={block.title} options={{ seconds: block.source?.kind === "scene" ? block.source.seconds : 0, fit: "exercise", paths: "stage" }} /></div><p className="calendar-muted">Open this section to frame the live scene and capture camera views.</p>
              {block.views.map(v => <fieldset className="presentation-shot" disabled={disabled || historical} key={v.id}><legend>Camera view · {v.framing}</legend><label>Camera name<input aria-label={`Camera name ${v.id}`} maxLength={10000} value={v.title} onChange={e => updateBlock({ ...block, views: block.views.map(s => s.id === v.id ? { ...s, title: e.target.value } : s) })} /></label><label>Apply to<select aria-label={`Camera stage ${v.id}`} value={v.stageId ?? ""} onChange={e => updateBlock({ ...block, views: block.views.map(s => s.id === v.id ? { ...s, stageId: e.target.value || null } : s) })}><option value="">Section establishing view</option>{scene.stages.map(s => <option key={s.id} value={s.id}>{s.title}</option>)}</select></label><label>Transition seconds<input type="number" aria-label={`Camera transition ${v.id}`} min={0} max={5} step="0.1" value={v.transitionSeconds} onChange={e => updateBlock({ ...block, views: block.views.map(s => s.id === v.id ? { ...s, transitionSeconds: Number(e.target.value) } : s) })} /></label><small>{v.area.length.toFixed(1)} × {v.area.width.toFixed(1)} m · {Math.round(v.zoom * 100)}% · {v.rotation}°</small><button onClick={() => updateBlock({ ...block, views: block.views.filter(s => s.id !== v.id) })}>Remove camera view</button></fieldset>)}
            </> : <BlockContent block={block} bundle={bundle} />; })()}
            <label>Presentation notes<textarea aria-label="Presentation notes" rows={4} maxLength={10000} disabled={disabled || historical} value={block.notes} onChange={e => updateBlock({ ...block, notes: e.target.value })} /></label></> : <p>Add saved content to begin.</p>}</section>
        </div>
        {!historical && <section className="presentation-add"><h3>Add existing content</h3><div className="presentation-controls"><select aria-label="Saved presentation content" disabled={disabled} value={catalogKey} onChange={e => setCatalogKey(e.target.value)}><option value="">Choose saved exercise or scene</option>
          {latest(bundle.exercises).map(e => <option key={e.id} value={`exercise#${e.id}#${e.revision}`}>Exercise · {e.content.title} · v{e.revision}</option>)}{bundle.scenes.map(s => <option key={`${s.id}:${s.revision}`} value={`scene#${s.id}#${s.revision}`}>{s.stages.length ? "Animation" : "Diagram"} · {sceneLabel(bundle, s)} · v{s.revision}</option>)}</select>
          <button disabled={disabled || !catalogKey} onClick={() => { const [kind, id, rev] = catalogKey.split("#"), ref = { id, revision: Number(rev) }; if (kind === "scene") { const scene = bundle.scenes.find(s => s.id === id && s.revision === ref.revision); if (scene) add([createBlock(scene.stages.length ? "animation" : "diagram", sceneLabel(bundle, scene), { kind: "scene", ref, seconds: 0 })]); } else { const e = bundle.exercises.find(s => s.id === id && s.revision === ref.revision); if (e) { const blocks = [createBlock("guidance", e.content.title, { kind: "exercise", ref })]; for (const d of e.content.diagrams) { const scene = bundle.scenes.find(s => s.id === d.scene.id && s.revision === d.scene.revision); if (scene) blocks.push(createBlock(scene.stages.length ? "animation" : "diagram", sceneLabel(bundle, scene), { kind: "scene", ref: d.scene, seconds: d.representativeSeconds })); } add(blocks); } } }}>Add selected content</button>
          <button disabled={disabled} onClick={() => add([createBlock("notes", "Coaching notes", null)])}>Add notes</button><button disabled={disabled} onClick={() => add([createBlock("summary", "Summary", null)])}>Add summary</button></div></section>}
      </>}
    </section></div>}
    {presenting !== null && draft && !privateLost && <PresentationPlayer presentation={draft} bundle={bundle} initial={presenting} onClose={() => setPresenting(null)} onCapture={historical || disabled ? undefined : capture} />}
  </>;
}




