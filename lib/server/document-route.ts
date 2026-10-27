import "server-only";
import { backendConfig } from "./config";
import { verifiedUser } from "./auth";
import { userClient, writerClient } from "./supabase";
import { SupabaseCoachingStore } from "./repositories/coaching";
import { SupabaseDocumentStore } from "./repositories/documents";
import { handleDocument, type DocumentRoute } from "./document-http";
import { errorResponse } from "./persistence-http";

/** Build request-scoped clients; object capability is acquired only after RLS and exact session authorization. */
export async function documentRoute(request: Request, context: { params: Promise<DocumentRoute> }) {
  try {
    const params = await context.params, config = backendConfig();
    return await handleDocument(request, params, config.origin, async () => {
      const client = await userClient(config), actor = await verifiedUser(client.auth);
      return { actor, store: new SupabaseCoachingStore(client, () => writerClient(config)), documents: () => new SupabaseDocumentStore(writerClient(config)) };
    });
  } catch (error) { return errorResponse(error); }
}
