import { backendConfig } from "@/lib/server/config";
import { verifiedUser } from "@/lib/server/auth";
import { userClient, writerClient } from "@/lib/server/supabase";
import { SupabaseCoachingStore } from "@/lib/server/repositories/coaching";
import {
  errorResponse,
  handlePersistence,
} from "@/lib/server/persistence-http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The BFF's only write path: verified cookie identity, complete validation, atomic persistence. */
async function handle(
  request: Request,
  context: { params: Promise<{ organizationId: string }> },
) {
  try {
    const { organizationId } = await context.params;
    const config = backendConfig();
    return await handlePersistence(
      request,
      organizationId,
      config.origin,
      async () => {
        const client = await userClient(config);
        const actor = await verifiedUser(client.auth);
        return {
          actor,
          store: new SupabaseCoachingStore(client, () => writerClient(config)),
        };
      },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
export { handle as GET, handle as POST };
