import type { DomainBundle } from "../domain/validation";
import { idSchema, revisionSchema, type RevisionRef } from "../domain/common";
import { sessionKindSchema } from "../domain/session";

export type ActivityViewSelection = { activityId: string; diagramIndex?: number };
type Query = Record<string, string | string[] | undefined>;

export type SessionViewReference = {
  sessionId: string;
  revision: number;
  organizationId: string;
  booking?: RevisionRef;
  selection?: ActivityViewSelection;
  search: string;
  kind: string;
};

export function parseActivityView(query: Query): ActivityViewSelection | undefined | null {
  if (query.activity === undefined && query.diagram === undefined) return undefined;
  const activity = idSchema.safeParse(query.activity);
  const diagram = typeof query.diagram === "string" && /^[1-9]\d*$/.test(query.diagram) ? revisionSchema.safeParse(Number(query.diagram)) : undefined;
  if (!activity.success || query.diagram !== undefined && !diagram?.success) return null;
  return { activityId: activity.data, diagramIndex: diagram?.success ? diagram.data - 1 : undefined };
}

export function withActivityView(href: string, selection?: ActivityViewSelection): string {
  if (!selection) return href;
  const [path, query] = href.split("?");
  const params = new URLSearchParams(query);
  params.set("activity", selection.activityId);
  if (selection.diagramIndex !== undefined) params.set("diagram", String(selection.diagramIndex + 1));
  return `${path}?${params}`;
}

export function parseSessionView(query: Query): SessionViewReference | null {
  const session = idSchema.safeParse(query.session);
  const organization = idSchema.safeParse(query.organization);
  const revision = typeof query.revision === "string" ? revisionSchema.safeParse(Number(query.revision)) : undefined;
  const selection = parseActivityView(query);
  const hasBooking = query.booking !== undefined || query.bookingRevision !== undefined;
  const booking = idSchema.safeParse(query.booking);
  const bookingRevision = typeof query.bookingRevision === "string" ? revisionSchema.safeParse(Number(query.bookingRevision)) : undefined;
  if (!session.success || !organization.success || !revision?.success || selection === null || hasBooking && (!booking.success || !bookingRevision?.success)) return null;
  return {
    sessionId: session.data, organizationId: organization.data, revision: revision.data,
    booking: booking.success && bookingRevision?.success ? { id: booking.data, revision: bookingRevision.data } : undefined,
    selection,
    search: typeof query.q === "string" ? query.q.slice(0, 200) : "",
    kind: sessionKindSchema.safeParse(query.type).data ?? "",
  };
}

export function resolveSessionView(bundle: DomainBundle, reference: SessionViewReference) {
  if (bundle.organizationId !== reference.organizationId) return null;
  const session = bundle.sessions.find(s => s.organizationId === reference.organizationId && s.id === reference.sessionId && s.revision === reference.revision);
  if (!session) return null;
  const pin = reference.booking;
  const booking = pin && bundle.events.find(e => e.organizationId === reference.organizationId && e.id === pin.id && e.revision === pin.revision && e.session?.id === session.id && e.session.revision === session.revision);
  return pin && !booking ? null : { session, booking };
}
