import { z } from "zod";
import { idSchema } from "@/lib/domain/common";
import { verifiedUser } from "@/lib/server/auth";
import { backendConfig } from "@/lib/server/config";
import { errorResponse } from "@/lib/server/persistence-http";
import {
  databaseError,
  versionSchema,
} from "@/lib/server/repositories/coaching";
import { userClient } from "@/lib/server/supabase";

export const dynamic = "force-dynamic";

/** Discover only organizations visible through the authenticated user's database policies. */
export async function GET() {
  try {
    const client = await userClient(backendConfig());
    await verifiedUser(client.auth);
    const { data, error } = await client
      .from("organizations")
      .select("id,name,version")
      .order("name");
    if (error) throw databaseError(error);
    const organizations = z
      .array(
        z.strictObject({
          id: idSchema,
          name: z.string(),
          version: versionSchema,
        }),
      )
      .parse(data);
    return Response.json(
      { organizations },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
