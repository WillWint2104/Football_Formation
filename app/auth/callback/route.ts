import { NextResponse } from "next/server";
import { backendConfig } from "@/lib/server/config";
import { userClient } from "@/lib/server/supabase";
import { completeSignIn } from "@/lib/server/auth-flow";

/** Complete PKCE sign-in or an invited account's email token; redirects are fixed, never caller-supplied. */
export async function GET(request: Request) {
  try {
    const config = backendConfig();
    const url = new URL(request.url);
    if (url.origin !== config.origin)
      return new Response("Invalid sign-in origin", { status: 400 });
    const client = await userClient(config);
    const failed = !(await completeSignIn(client.auth, url.searchParams));
    const response = NextResponse.redirect(
      new URL(failed ? "/login?notice=unavailable" : "/lineup", config.origin),
    );
    response.headers.set("Cache-Control", "private, no-store");
    response.headers.set("Referrer-Policy", "no-referrer");
    return response;
  } catch {
    return new Response("Sign-in is unavailable", {
      status: 503,
      headers: {
        "Cache-Control": "private, no-store",
        "Referrer-Policy": "no-referrer",
      },
    });
  }
}
