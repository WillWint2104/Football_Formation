import Link from "next/link";
import type { ExerciseContent } from "@/lib/domain/session";
import { diagramHref, type DiagramTarget } from "@/lib/tactical/persistence";
import { withCalendar, type CalendarReturn } from "@/lib/coaching/calendar-return";

/** Open diagrams only against a saved owner, never a transient form draft. */
export function DiagramLinks({ content, target, disabled, calendar }: { content: ExerciseContent; target: Omit<DiagramTarget, "diagram">; disabled: boolean; calendar?: CalendarReturn }) {
  return <section className="coaching-field-section"><h3>{content.title} · tactical diagrams</h3>
    {disabled ? <p className="calendar-muted">Save the current activity changes before opening its diagram editor.</p> : <div className="coaching-inline-controls">
      {content.diagrams.map((pin, index) => <Link key={index} href={withCalendar(diagramHref({ ...target, diagram: index }), calendar)}>Edit diagram {index + 1} · scene v{pin.scene.revision} →</Link>)}
      <Link href={withCalendar(diagramHref({ ...target, diagram: null }), calendar)}>Create diagram →</Link>
    </div>}
  </section>;
}
