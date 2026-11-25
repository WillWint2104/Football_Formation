import { ClipboardList, Goal, Lightbulb, Map, Target } from "lucide-react";
import type { ExerciseContent } from "@/lib/domain/session";

/** A read-through of the saved activity. Edits still go through the existing authoring fields. */
export function ActivityCoachingBrief({ content, objectives, written = false }: { content: ExerciseContent; objectives: string[]; written?: boolean }) {
  const setup = [content.playerCount === null ? "" : `${content.playerCount} players`, content.area ? `${content.area.length} × ${content.area.width} m` : ""].filter(Boolean);
  const equipment = content.equipment.map(item => item.quantity === null ? item.name : `${item.quantity} × ${item.name}`);
  const progressions = [...content.progressions, ...content.regressions, ...content.variations];
  const blocks = [
    { title: "Organisation", Icon: Map, lines: [...setup, ...equipment] },
    { title: "Coaching points", Icon: Target, lines: content.coachingPoints },
    { title: "How to run", Icon: ClipboardList, lines: content.instructions },
    { title: "Progressions & variations", Icon: Lightbulb, lines: progressions },
  ];
  return <div className={`recovery-coaching-brief${written ? " recovery-written-brief" : ""}`}>
    {objectives.some(text => text.trim()) && <section className="recovery-focus"><h4><Goal size={17} aria-hidden="true" />Session objective</h4>
      {objectives.filter(text => text.trim()).map((text, i) => <p key={i}>{text}</p>)}</section>}
    {blocks.map(({title, Icon, lines}) => {
      const visible = lines.filter(text => text.trim());
      if (!visible.length) return null;
      return <section key={title}><h4><Icon size={16} aria-hidden="true" />{title}</h4>{title === "Organisation" ? <p>{visible.join(" · ")}</p>
        : <ul>{visible.map((text, i) => <li key={i}>{text}</li>)}</ul>}</section>;
    })}
  </div>;
}
