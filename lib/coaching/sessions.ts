import type { CalendarEvent } from "../domain/calendar";
import { coachSchema, type Coach } from "../domain/people";
import { activitySchema, exerciseSchema, instantiateTemplate, sessionSchema, templateSchema,
  type Exercise, type ExerciseContent, type Session, type SessionActivity, type SessionTemplate } from "../domain/session";
import { domainBundleSchema, type DomainBundle } from "../domain/validation";
import { latestEvents } from "../calendar/schedule";

/** Return one current immutable version per logical record, retaining history in the bundle. */
export function latest<T extends { id: string; revision: number }>(records: T[]): T[] {
  const index = new Map<string, T>();
  for (const record of records) if (!index.has(record.id) || index.get(record.id)!.revision < record.revision) index.set(record.id, record);
  return [...index.values()];
}

/** Create a complete but empty exercise without treating unknown quantities or duration as zero. */
export function blankExercise(title = "New activity"): ExerciseContent {
  return { title, area: null, playerCount: null, equipment: [], instructions: [], coachingPoints: [],
    progressions: [], regressions: [], variations: [], diagrams: [] };
}

/** Empty editor lines are not coaching instructions; retain meaningful lines and all pinned metadata. */
export function cleanExercise(content: ExerciseContent): ExerciseContent {
  const next = structuredClone(content);
  for (const key of ["instructions", "coachingPoints", "progressions", "regressions", "variations"] as const)
    next[key] = next[key].map((line) => line.trim()).filter(Boolean);
  return next;
}

/** Normalize editable text lists only at save time so typing a trailing newline stays natural. */
function cleanSessionContent(content: Session["content"]): Session["content"] {
  return { ...content, objective: content.objective?.trim() || null, focus: content.focus.map((s) => s.trim()).filter(Boolean),
    activities: content.activities.map((a) => ({ ...a, content: cleanExercise(a.content) })) };
}

/** Add an independent activity from a pinned exercise snapshot, or start with empty coaching content. */
export function newActivity(exercise?: Exercise, allocate = () => crypto.randomUUID()): SessionActivity {
  return activitySchema.parse({ id: allocate(), role: "exercise", durationMinutes: null,
    sourceExercise: exercise ? { id: exercise.id, revision: exercise.revision } : null,
    content: exercise ? structuredClone(exercise.content) : blankExercise() });
}

/** Construct a new independent session; template activities are deep-copied with provenance preserved. */
export function newSession(bundle: DomainBundle, teamId: string, template?: SessionTemplate,
  allocate = () => crypto.randomUUID()): Session {
  if (template) {
    if (template.organizationId !== bundle.organizationId || !bundle.templates.some((t) => t.id === template.id && t.revision === template.revision)) throw new Error("Template is not available in this organisation");
    return instantiateTemplate(template, { id: allocate(), teamId, coaches: [] });
  }
  return sessionSchema.parse({ schemaVersion: "1.0", organizationId: bundle.organizationId, id: allocate(), revision: 1,
    teamId, coaches: [], sourceTemplate: null, documents: [],
    content: { title: "New coaching session", kind: "possession", objective: null, focus: [], activities: [] } });
}

/** Save one session revision and, when selected, advance only that booking's exact pin. */
export function reviseSession(bundle: DomainBundle, draft: Session, eventId?: string): { bundle: DomainBundle; session: Session; event?: CalendarEvent } {
  const parsed = sessionSchema.parse({ ...draft, content: cleanSessionContent(draft.content) });
  if (parsed.organizationId !== bundle.organizationId) throw new Error("Organisation mismatch");
  const versions = bundle.sessions.filter((s) => s.id === parsed.id);
  const source = versions.find((s) => s.revision === parsed.revision);
  if (versions.length && !source) throw new Error("Source revision is no longer available");
  const event = eventId ? latestEvents(bundle).find((e) => e.id === eventId) : undefined;
  if (eventId && (!event?.session || event.session.id !== parsed.id || event.session.revision !== parsed.revision)) throw new Error("Booking changed; reopen its current session before editing");
  if (event && (event.teamId !== parsed.teamId)) throw new Error("A scheduled session must retain its booking team");
  if (!event && versions.length && latestEvents(bundle).some((e) => e.session?.id === parsed.id)) throw new Error("Open a specific booking to edit its scheduled session");
  if (!event && source && latest(versions)[0].revision !== parsed.revision) throw new Error("A newer session revision exists");
  // Generated guides remain pinned to their original session snapshot; uploaded metadata can be retained.
  const documents = source ? parsed.documents.filter((ref) => bundle.documents.some((d) => d.id === ref.id && d.revision === ref.revision && d.source.kind === "upload")) : parsed.documents;
  const session = sessionSchema.parse({ ...parsed, documents, revision: versions.length ? Math.max(...versions.map((s) => s.revision)) + 1 : 1 });
  const next = structuredClone(bundle);
  next.sessions.push(session);
  const revised = event ? { ...event, revision: event.revision + 1, title: session.content.title,
    kind: session.content.kind === "testing" ? "testing" as const : "training" as const,
    session: { id: session.id, revision: session.revision } } as CalendarEvent : undefined;
  if (revised) next.events.push(revised);
  return { bundle: domainBundleSchema.parse(next), session, event: revised };
}

/** Append a reusable session template version without modifying sessions already created from it. */
export function reviseTemplate(bundle: DomainBundle, draft: SessionTemplate): DomainBundle {
  const parsed = templateSchema.parse({ ...draft, content: cleanSessionContent(draft.content) });
  const current = latest(bundle.templates).find((t) => t.id === parsed.id);
  if (current && current.revision !== parsed.revision) throw new Error("A newer template revision exists");
  const next = structuredClone(bundle);
  next.templates.push({ ...parsed, revision: (current?.revision ?? 0) + 1 });
  return domainBundleSchema.parse(next);
}

/** Append an exercise template version; embedded activity snapshots remain independent. */
export function reviseExercise(bundle: DomainBundle, draft: Exercise): DomainBundle {
  const parsed = exerciseSchema.parse({ ...draft, content: cleanExercise(draft.content) });
  const current = latest(bundle.exercises).find((e) => e.id === parsed.id);
  if (current && current.revision !== parsed.revision) throw new Error("A newer exercise revision exists");
  const next = structuredClone(bundle);
  next.exercises.push({ ...parsed, revision: (current?.revision ?? 0) + 1 });
  return domainBundleSchema.parse(next);
}

/** Update directory records while preserving all historical assignment and account links. */
export function reviseCoach(bundle: DomainBundle, draft: Coach): DomainBundle {
  const coach = coachSchema.parse(draft);
  const previous = bundle.coaches.find((c) => c.id === coach.id);
  if (coach.membershipId !== (previous?.membershipId ?? null)) throw new Error("Account membership links are managed by an administrator");
  const next = structuredClone(bundle);
  const index = next.coaches.findIndex((c) => c.id === coach.id);
  if (index < 0) next.coaches.push(coach); else next.coaches[index] = coach;
  const result = domainBundleSchema.safeParse(next);
  if (!result.success) throw new Error("Keep teams used by historical coach assignments; check the directory fields");
  return result.data;
}

/** Display known planned minutes separately from activities whose duration is still unknown. */
export function activityTotals(activities: SessionActivity[]): { minutes: number; unknown: number } {
  return { minutes: activities.reduce((sum, a) => sum + (a.durationMinutes ?? 0), 0), unknown: activities.filter((a) => a.durationMinutes === null).length };
}
