import { backendConfig } from "@/lib/server/config";
import { verifiedUser } from "@/lib/server/auth";
import { userClient, writerClient } from "@/lib/server/supabase";
import { SupabaseCoachingStore } from "@/lib/server/repositories/coaching";
import { SupabasePresentationStore, handlePresentations } from "@/lib/server/presentation-http";
import { errorResponse } from "@/lib/server/persistence-http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
async function handle(request: Request, context: { params: Promise<{ organizationId: string }> }) {
  try {
    const { organizationId } = await context.params, config = backendConfig();
    return await handlePresentations(request, organizationId, config.origin, async () => {
      const reader = await userClient(config), actor = await verifiedUser(reader.auth);
      return { actor, coaching: new SupabaseCoachingStore(reader, () => writerClient(config)), presentations: new SupabasePresentationStore(reader, () => writerClient(config)) };
    });
  } catch (error) { return errorResponse(error); }
}
export { handle as GET, handle as POST };
