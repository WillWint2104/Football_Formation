import { ClipboardList, Cone, Flag, Goal, ListChecks, NotebookPen, TrendingUp, Users } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { SessionActivity } from "@/lib/domain/session";
import type { AnimationStage } from "@/lib/domain/tactical-scene";

function CoachingList({ title, items, emphasis = false }: { title: string; items: string[]; emphasis?: boolean }) {
  return items.length > 0 && <section className={emphasis ? "viewer-guide-section viewer-coaching-emphasis" : "viewer-guide-section"}>
    <h3><ListChecks aria-hidden="true" />{title}</h3>
    <ul>{items.map((item, index) => <li key={index}>{item}</li>)}</ul>
  </section>;
}

export function SessionViewerGuidance({ activity, objective, focus, notes }: {
  activity: SessionActivity; objective: string | null; focus: string[]; notes: AnimationStage[];
}) {
  const content = activity.content;
  const authoredNotes = notes.flatMap(stage => stage.tracks.flatMap(track => track.kind === "annotation" && track.annotation.kind === "note"
    ? [{ key: `${stage.id}:${track.id}`, stage: stage.title, text: track.annotation.text }] : []));
  return <aside className="viewer-guidance" aria-label="Coaching information">
    <Tabs defaultValue="coaching" className="viewer-guidance-tabs">
      <TabsList aria-label="Coaching information sections" className="viewer-guidance-navigation">
        <TabsTrigger value="coaching"><ClipboardList aria-hidden="true" />Coaching</TabsTrigger>
        <TabsTrigger value="equipment"><Cone aria-hidden="true" />Equipment</TabsTrigger>
        <TabsTrigger value="notes"><NotebookPen aria-hidden="true" />Notes</TabsTrigger>
        <TabsTrigger value="variations"><TrendingUp aria-hidden="true" />Progressions</TabsTrigger>
      </TabsList>
      <TabsContent value="coaching" className="viewer-guidance-content" tabIndex={0}>
        <h2>{content.title}</h2>
        {(objective || focus.length > 0) && <section className="viewer-objective">
          <h3><Goal aria-hidden="true" />Session focus</h3>
          {objective && <p>{objective}</p>}
          {focus.length > 0 && <ul>{focus.map((item, index) => <li key={index}>{item}</li>)}</ul>}
        </section>}
        <section className="viewer-guide-section">
          <h3><Flag aria-hidden="true" />Setup &amp; organisation</h3>
          <dl className="viewer-setup-facts">
            <div><dt>Playing area</dt><dd>{content.area ? `${content.area.length} × ${content.area.width} m` : "Not specified"}</dd></div>
            {content.playerCount !== null && <div><dt><Users aria-hidden="true" />Players</dt><dd>{content.playerCount}</dd></div>}
          </dl>
        </section>
        <section className="viewer-guide-section viewer-delivery">
          <h3>How to run</h3>
          {content.instructions.length > 0 ? content.instructions.map((line, index) => <p key={index}>{line}</p>) : <p>No instructions were recorded.</p>}
        </section>
        <CoachingList title="Coaching points" items={content.coachingPoints} emphasis />
      </TabsContent>
      <TabsContent value="equipment" className="viewer-guidance-content" tabIndex={0}>
        <h2>Equipment</h2>
        {content.equipment.length ? <dl className="viewer-equipment">{content.equipment.map((item, index) =>
          <div key={index}><dt>{item.name}</dt><dd>{item.quantity ?? "Quantity not specified"}</dd></div>)}</dl> : <p>No equipment was recorded.</p>}
      </TabsContent>
      <TabsContent value="notes" className="viewer-guidance-content" tabIndex={0}>
        <h2>Diagram notes</h2>
        {authoredNotes.length ? <ul className="viewer-note-list">{authoredNotes.map(note => <li key={note.key}><h3>{note.stage}</h3><p>{note.text}</p></li>)}</ul> : <p>No authored notes for the selected diagram.</p>}
      </TabsContent>
      <TabsContent value="variations" className="viewer-guidance-content" tabIndex={0}>
        <h2>Adapt the activity</h2>
        <CoachingList title="Progressions" items={content.progressions} />
        <CoachingList title="Variations" items={content.variations} />
        <CoachingList title="Regressions" items={content.regressions} />
        {!content.progressions.length && !content.variations.length && !content.regressions.length && <p>No variations or progressions were recorded.</p>}
      </TabsContent>
    </Tabs>
  </aside>;
}
