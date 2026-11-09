import { z } from "zod";
import { idSchema, revisionSchema } from "../domain/common";
import type { DomainBundle } from "../domain/validation";
import { isCalendarDate, latestEvents, sessionLabels } from "./schedule";

/** Transient navigation only. Membership and mutation authority always come from the loaded graph. */
export const calendarNavigationSchema = z.strictObject({
  date: z.string().refine(isCalendarDate).optional(),
  view: z.enum(["month", "week", "day"]).optional(),
  organization: idSchema.optional(), team: idSchema.optional(), event: idSchema.optional(),
  bookingRevision: revisionSchema.optional(),
  focus: z.literal("date").optional(),
  notice: z.enum(["session-saved", "diagram-saved"]).optional(),
  type: z.enum(["fixture", ...Object.keys(sessionLabels)]).optional(),
  plan: idSchema.optional(), library: z.literal("1").optional(),
  session: idSchema.optional(), revision: revisionSchema.optional(), copy: z.uuid().optional(),
}).refine((n) => (!n.session && !n.revision && !n.copy) || !!(n.library && n.organization && n.session && n.revision), "Incomplete library reference")
  .refine((n) => !n.bookingRevision || !!n.event, "Booking revision needs an identity")
  .refine((n) => !(n.library && n.plan), "Choose one scheduling workflow");
export type CalendarNavigation = z.infer<typeof calendarNavigationSchema>;

export function parseCalendarNavigation(query: Record<string, string | string[] | undefined>) {
  const values: Record<string, unknown> = Object.fromEntries(Object.keys(calendarNavigationSchema.shape).filter((k) => query[k] !== undefined).map((k) => [k, query[k]]));
  // Refinement schemas expose shape in Zod 4. Reject duplicate values rather than choosing one.
  for (const key of ["revision", "bookingRevision"]) if (typeof values[key] === "string" && /^\d+$/.test(values[key])) values[key] = Number(values[key]);
  return calendarNavigationSchema.safeParse(values);
}

/** Fixed internal destination; arbitrary return URLs are neither accepted nor emitted. */
export function calendarHref(value: CalendarNavigation) {
  const parsed = calendarNavigationSchema.parse(value), query = new URLSearchParams();
  for (const [key, entry] of Object.entries(parsed)) if (entry !== undefined) query.set(key, String(entry));
  return `/calendar${query.size ? `?${query}` : ""}`;
}

export function calendarContextProblem(bundle: DomainBundle, value: CalendarNavigation): string | undefined {
  if (value.organization && value.organization !== bundle.organizationId) return "This Calendar link belongs to a different organisation. Choose the organisation explicitly, or reset this link.";
  if (value.team && !bundle.teams.some((t) => t.id === value.team)) return "The selected team is unavailable in this organisation.";
  if (value.plan && (!bundle.sessions.some((s) => s.id === value.plan && (!value.team || s.teamId === value.team)) || latestEvents(bundle).some((e) => e.session?.id === value.plan))) return "The selected saved plan is unavailable or already scheduled. No blank session was substituted.";
  if (value.event && !latestEvents(bundle).some((e) => e.id === value.event && (!value.team || e.teamId === value.team))) return "The selected booking is unavailable for this Calendar context.";
  if (value.bookingRevision && latestEvents(bundle).find((e) => e.id === value.event)?.revision !== value.bookingRevision) return "This booking has changed since the link was created. Reset the selection and inspect its current schedule.";
}

export function closeCalendarLibrary(value: CalendarNavigation): CalendarNavigation {
  const context = { ...value };
  delete context.library; delete context.session; delete context.revision; delete context.copy;
  return context;
}
