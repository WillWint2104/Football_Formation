"use client";

import type { ExerciseContent } from "@/lib/domain/session";

/** Edit structured exercise content without authoring diagrams or altering their pinned references. */
export function ExerciseFields({ content, onChange, editDiagramReferences = false }: { content: ExerciseContent; onChange: (value: ExerciseContent) => void; editDiagramReferences?: boolean }) {
  const update = <K extends keyof ExerciseContent>(key: K, value: ExerciseContent[K]) => onChange({ ...content, [key]: value });
  return <div className="coaching-fields">
    <label>Activity name<input required maxLength={200} value={content.title} onChange={(e) => update("title", e.target.value)} /></label>
    <div className="coaching-form-row"><label>Participants<input type="number" min="1" step="1" placeholder="Unknown" value={content.playerCount ?? ""}
      onChange={(e) => update("playerCount", e.target.value === "" ? null : Number(e.target.value))} /></label>
      <label className="coaching-checkbox"><input type="checkbox" checked={content.area !== null} onChange={(e) => update("area", e.target.checked ? { origin: { x: 0, y: 0 }, length: 20, width: 15 } : null)} />Specify field dimensions</label></div>
    {content.area && <div className="coaching-form-row coaching-four-fields">{(["length", "width", "x", "y"] as const).map((key) => <label key={key}>{({ length: "Length (m)", width: "Width (m)", x: "Origin X (m)", y: "Origin Y (m)" })[key]}
      <input required type="number" step="any" min={key === "length" || key === "width" ? "0.01" : undefined}
        value={key === "x" || key === "y" ? content.area!.origin[key] : content.area![key]}
        onChange={(e) => { const area = content.area!; update("area", key === "x" || key === "y" ? { ...area, origin: { ...area.origin, [key]: Number(e.target.value) } } : { ...area, [key]: Number(e.target.value) }); }} /></label>)}</div>}
    <section className="coaching-field-section"><div className="coaching-section-heading"><h3>Equipment</h3><button type="button" onClick={() => update("equipment", [...content.equipment, { name: "Cones", quantity: null }])}>Add equipment</button></div>
      {!content.equipment.length && <p className="calendar-muted">No equipment specified.</p>}
      {content.equipment.map((item, index) => <div className="coaching-equipment-row" key={index}>
        <label>Equipment {index + 1}<input required maxLength={200} value={item.name} onChange={(e) => update("equipment", content.equipment.map((v, i) => i === index ? { ...v, name: e.target.value } : v))} /></label>
        <label>Quantity {index + 1}<input type="number" min="0" step="1" placeholder="Unknown" value={item.quantity ?? ""} onChange={(e) => update("equipment", content.equipment.map((v, i) => i === index ? { ...v, quantity: e.target.value === "" ? null : Number(e.target.value) } : v))} /></label>
        <button type="button" aria-label={`Remove equipment ${index + 1}`} onClick={() => update("equipment", content.equipment.filter((_, i) => i !== index))}>Remove</button>
      </div>)}</section>
    {([ ["instructions", "Setup & delivery instructions"], ["coachingPoints", "Coaching points"], ["progressions", "Progressions"], ["regressions", "Regressions"], ["variations", "Variations"] ] as const).map(([key, title]) =>
      <label key={key}>{title}<span className="calendar-muted">One instruction or point per line</span><textarea aria-label={title} rows={key === "instructions" ? 4 : 3} value={content[key].join("\n")}
        onChange={(e) => update(key, e.target.value.split("\n"))} /></label>)}
    {editDiagramReferences ? <section className="coaching-field-section"><div className="coaching-section-heading"><h3>Diagram references</h3><button type="button" onClick={() => update("diagrams", [...content.diagrams, { scene: { id: "", revision: 1 }, representativeSeconds: 0 }])}>Add diagram reference</button></div>
      <p className="calendar-muted">Optional saved scene references. Scene geometry is not embedded or fetched by this local designer.</p>
      {content.diagrams.map((diagram, index) => <div className="designer-diagram-reference" key={index}>
        <label>Scene ID {index + 1}<input maxLength={128} value={diagram.scene.id} onChange={(e) => update("diagrams", content.diagrams.map((v, i) => i === index ? { ...v, scene: { ...v.scene, id: e.target.value } } : v))} /></label>
        <label>Revision {index + 1}<input type="number" min="1" step="1" value={diagram.scene.revision} onChange={(e) => update("diagrams", content.diagrams.map((v, i) => i === index ? { ...v, scene: { ...v.scene, revision: Number(e.target.value) } } : v))} /></label>
        <label>Preview seconds {index + 1}<input type="number" min="0" step="any" value={diagram.representativeSeconds} onChange={(e) => update("diagrams", content.diagrams.map((v, i) => i === index ? { ...v, representativeSeconds: Number(e.target.value) } : v))} /></label>
        <button type="button" aria-label={`Remove diagram reference ${index + 1}`} onClick={() => update("diagrams", content.diagrams.filter((_, i) => i !== index))}>Remove</button>
      </div>)}</section> : !!content.diagrams.length && <p className="coaching-notice">{content.diagrams.length} diagram references are retained at their saved revisions. Diagram authoring is a later milestone.</p>}
  </div>;
}
