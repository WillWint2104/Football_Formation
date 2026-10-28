import "server-only";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { idSchema, revisionSchema } from "../domain/common";
import { validatePresentation, type Presentation } from "../presentations/contracts";
import { databaseError, decodeSavedSnapshot, type CoachingStore } from "./repositories/coaching";
import { errorResponse, readBoundedJson } from "./persistence-http";
import { PersistenceError } from "./errors";

export interface PresentationStore {
  list(org: string, id?: string, revision?: number): Promise<unknown[]>;
  save(org: string, actor: string, expected: number, p: Presentation): Promise<number>;
}
export class SupabasePresentationStore implements PresentationStore {
  constructor(private reader: SupabaseClient, private writer: () => SupabaseClient) {}
  async list(org: string, id?: string, revision?: number) {
    let query = this.reader.from(id ? "presentation_revisions" : "presentations_current").select("payload").eq("organization_id", org);
    if (id) query = query.eq("id", id);
    if (revision) query = query.eq("revision", revision);
    const result = await query.order("revision", { ascending: false }).limit(201);
    if (result.error) throw databaseError(result.error);
    if (!result.data || result.data.length > 200) throw new PersistenceError(503, "Presentation list limit reached; request an exact revision");
    return result.data.map(r => r.payload as unknown);
  }
  async save(org: string, actor: string, expected: number, p: Presentation) {
    const result = await this.writer().rpc("save_presentation", { p_organization_id: org, p_actor: actor, p_expected_revision: expected, p_payload: p });
    if (result.error) throw databaseError(result.error);
    return revisionSchema.parse(result.data);
  }
}
type Context = { actor: string; coaching: CoachingStore; presentations: PresentationStore };
const saveSchema = z.strictObject({ expectedRevision: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER - 1), presentation: z.unknown() });
/** Membership/source reads precede privileged acquisition; actor comes only from verified cookie auth. */
export async function handlePresentations(request: Request, org: string, origin: string, authenticate: () => Promise<Context>) {
  try {
    idSchema.parse(org);
    if (!["GET", "POST"].includes(request.method)) throw new PersistenceError(405, "Method not allowed");
    if (request.method === "POST" && request.headers.get("origin") !== origin) throw new PersistenceError(403, "Request origin rejected");
    const context = await authenticate(); z.uuid().parse(context.actor);
    const { bundle } = decodeSavedSnapshot(await context.coaching.load(org), org);
    if (request.method === "GET") {
      const params = new URL(request.url).searchParams;
      const query = z.strictObject({ id: idSchema.optional(), revision: z.coerce.number().pipe(revisionSchema).optional() }).parse(Object.fromEntries(params));
      if (query.revision && !query.id) throw new PersistenceError(400, "Revision requires presentation identity");
      const records = await context.presentations.list(org, query.id, query.revision);
      let presentations: Presentation[];
      try { presentations = records.map(r => validatePresentation(r, bundle)); }
      catch { throw new PersistenceError(503, "Saved presentation or pinned source unavailable"); }
      if (presentations.some(p => query.id && p.id !== query.id || query.revision && p.revision !== query.revision)) throw new PersistenceError(503, "Invalid presentation response");
      return Response.json({ presentations }, { headers: { "Cache-Control": "private, no-store" } });
    }
    const input = saveSchema.parse(await readBoundedJson(request));
    let presentation: Presentation;
    try { presentation = validatePresentation(input.presentation, bundle); }
    catch { throw new PersistenceError(400, "Invalid presentation or pinned source"); }
    if (presentation.revision !== input.expectedRevision + 1) throw new PersistenceError(400, "Unexpected presentation revision");
    const revision = await context.presentations.save(org, context.actor, input.expectedRevision, presentation);
    if (revision !== presentation.revision) throw new PersistenceError(503, "Unexpected saved presentation revision; reload");
    return Response.json({ revision }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return errorResponse(error); }
}
