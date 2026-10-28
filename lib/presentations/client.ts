import { z } from "zod";
import { idSchema } from "../domain/common";
import type { DomainBundle } from "../domain/validation";
import { validatePresentation, type Presentation } from "./contracts";
export class PresentationApiError extends Error {
  constructor(public status: number) { super(status === 409 ? "Presentation changed elsewhere. Reload before saving." : status === 401 || status === 404 ? "Saved organisation unavailable. Reload and sign in again." : "Presentation storage unavailable. Reload to verify whether the save completed. No automatic retry was made."); }
}
async function request(org: string, query = "", init?: RequestInit): Promise<unknown> {
  idSchema.parse(org);
  const response = await fetch(`/api/organizations/${org}/presentations${query}`, { ...init, credentials: "same-origin", cache: "no-store", signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new PresentationApiError(response.status);
  return response.json();
}
export async function loadPresentations(bundle: DomainBundle, id?: string, revision?: number) {
  const query = new URLSearchParams(); if (id) query.set("id", idSchema.parse(id)); if (revision) query.set("revision", String(revision));
  const result = z.strictObject({ presentations: z.array(z.unknown()).max(200) }).parse(await request(bundle.organizationId, query.size ? `?${query}` : ""));
  return result.presentations.map(p => validatePresentation(p, bundle));
}
export async function savePresentation(bundle: DomainBundle, expectedRevision: number, draft: Presentation) {
  const p = validatePresentation({ ...draft, revision: expectedRevision + 1 }, bundle);
  const result = z.strictObject({ revision: z.number().int().positive() }).parse(await request(bundle.organizationId, "", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ expectedRevision, presentation: p }) }));
  if (result.revision !== p.revision) throw new Error("Unexpected saved revision. Reload before saving again.");
  return p;
}
