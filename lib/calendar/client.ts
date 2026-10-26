import { z } from "zod";
import { idSchema } from "../domain/common";
import { domainBundleSchema, MAX_DOMAIN_JSON_BYTES, type DomainBundle } from "../domain/validation";

const version = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
export const calendarSnapshotSchema = z.strictObject({ version, bundle: domainBundleSchema });
export type CalendarSnapshot = z.infer<typeof calendarSnapshotSchema>;
export const organizationsSchema = z.strictObject({ organizations: z.array(z.strictObject({ id: idSchema, name: z.string(), version })) });
export type Organization = z.infer<typeof organizationsSchema>["organizations"][number];

/** Carry only a safe, actionable client message; never render raw provider/server errors. */
export class CalendarApiError extends Error {
  constructor(public readonly status: number) {
    super(status === 401 ? "Sign in to access your saved calendar." : status === 409
      ? "Another save changed this calendar. Reload before trying again. Your change was not applied here."
      : status === 413 ? "This organisation exceeds the snapshot size limit. Contact your administrator."
      : status === 404 ? "This organisation is no longer available to your account."
      : "Saved calendar unavailable. Check your connection or staging setup and retry.");
  }
}

/** All calendar persistence uses the existing same-origin authenticated HTTP boundary. */
async function request(path: string, init?: RequestInit): Promise<unknown> {
  const response = await fetch(path, { ...init, credentials: "same-origin", cache: "no-store" });
  if (!response.ok) throw new CalendarApiError(response.status);
  return response.json() as Promise<unknown>;
}

/** Discover only memberships returned by the authenticated, RLS-protected API. */
export async function loadOrganizations(): Promise<Organization[]> {
  return organizationsSchema.parse(await request("/api/organizations")).organizations;
}

/** Validate the complete saved graph and its organisation before displaying any records. */
export async function loadCalendar(organizationId: string): Promise<CalendarSnapshot> {
  idSchema.parse(organizationId);
  const saved = calendarSnapshotSchema.parse(await request(`/api/organizations/${organizationId}/snapshot`));
  if (saved.bundle.organizationId !== organizationId) throw new Error("Invalid saved organisation");
  return saved;
}

/** Publish a validated full snapshot with optimistic concurrency; no automatic save retries. */
export async function saveCalendar(saved: CalendarSnapshot, bundle: DomainBundle): Promise<CalendarSnapshot> {
  const parsed = domainBundleSchema.parse(bundle);
  if (parsed.organizationId !== saved.bundle.organizationId) throw new Error("Organisation mismatch");
  const body = JSON.stringify({ expectedVersion: saved.version, bundle: parsed });
  if (new TextEncoder().encode(body).byteLength > MAX_DOMAIN_JSON_BYTES) throw new CalendarApiError(413);
  const result = z.strictObject({ version }).parse(await request(`/api/organizations/${parsed.organizationId}/snapshot`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body,
  }));
  if (result.version !== saved.version + 1) throw new Error("Unexpected saved revision; reload the calendar");
  return { version: result.version, bundle: parsed };
}
