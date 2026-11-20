import { ClipboardList, Cone, Lightbulb, NotebookPen, Shuffle, Users } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { SessionActivity } from "@/lib/domain/session";
import type { AnimationStage } from "@/lib/domain/tactical-scene";

function CoachingList({ title, items, ordered = false }: { title: string; items: string[]; ordered?: boolean }) {
  const List = ordered ? "ol" : "ul";
  return items.length > 0 && <section><h3>{title}</h3><List>{items.map((item, index) => <li key={index}>{item}</li>)}</List></section>;
}

export function SessionViewerGuidance({ activity, objective, focus, notes }: {
  activity: SessionActivity; objective: string | null; focus: string[]; notes: AnimationStage[];
}) {
  const content = activity.content;
  const authoredNotes = notes.flatMap(stage => stage.tracks.flatMap(track => track.kind === "annotation" && track.annotation.kind === "note"
    ? [{ key: `${stage.id}:${track.id}`, stage: stage.title, text: track.annotation.text }] : []));
  return <aside className="viewer-guidance" aria-label="Coaching information">
    <Tabs defaultValue="instructions" className="viewer-guidance-tabs">
      <TabsList aria-label="Coaching information sections" className="viewer-guidance-navigation">
        <TabsTrigger value="instructions"><ClipboardList aria-hidden="true" />Instructions</TabsTrigger>
        <TabsTrigger value="equipment"><Cone aria-hidden="true" />Equipment</TabsTrigger>
        <TabsTrigger value="variations"><Shuffle aria-hidden="true" />Variations</TabsTrigger>
        <TabsTrigger value="notes"><NotebookPen aria-hidden="true" />Notes</TabsTrigger>
      </TabsList>
      <TabsContent value="instructions" className="viewer-guidance-content" tabIndex={0}>
        <section><h3>Setup & organisation</h3>
          <p>{content.area ? `${content.area.length} × ${content.area.width} m` : "Dimensions not specified"}</p>
          {content.playerCount !== null && <p className="viewer-participants"><Users size={17} aria-hidden="true" />{content.playerCount} participants</p>}
        </section>
        {content.instructions.length > 0 ? <CoachingList title="How to run the activity" items={content.instructions} ordered /> : <p>No instructions were recorded.</p>}
        <CoachingList title="Coaching points" items={content.coachingPoints} />
        {(objective || focus.length > 0) && <section className="viewer-objective"><h3><Lightbulb size={19} aria-hidden="true" /> Session focus</h3>
          {objective && <p>{objective}</p>}{focus.length > 0 && <p>{focus.join(" · ")}</p>}
        </section>}
      </TabsContent>
      <TabsContent value="equipment" className="viewer-guidance-content" tabIndex={0}>
        <h3>Equipment</h3>
        {content.equipment.length ? <dl className="viewer-equipment">{content.equipment.map((item, index) =>
          <div key={index}><dt>{item.name}</dt><dd>{item.quantity ?? "Quantity not specified"}</dd></div>)}</dl> : <p>No equipment was recorded.</p>}
      </TabsContent>
      <TabsContent value="variations" className="viewer-guidance-content" tabIndex={0}>
        <CoachingList title="Progressions" items={content.progressions} />
        <CoachingList title="Variations" items={content.variations} />
        <CoachingList title="Regressions" items={content.regressions} />
        {!content.progressions.length && !content.variations.length && !content.regressions.length && <p>No variations or progressions were recorded.</p>}
      </TabsContent>
      <TabsContent value="notes" className="viewer-guidance-content" tabIndex={0}>
        <h3>Diagram notes</h3>
        {authoredNotes.length ? <ul>{authoredNotes.map(note => <li key={note.key}><strong>{note.stage}</strong><p>{note.text}</p></li>)}</ul> : <p>No authored notes for the selected diagram.</p>}
      </TabsContent>
    </Tabs>
  </aside>;
}
