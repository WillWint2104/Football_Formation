import "server-only";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import type { BackendConfig } from "./config";

/** Only call from writable Route Handlers/Server Actions, before committing response headers. */
export async function userClient(config: BackendConfig) {
  const store = await cookies();
  return createServerClient(config.url, config.publishableKey, {
    cookieOptions: {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
    },
    cookies: {
      getAll: () => store.getAll(),
      setAll: (values) =>
        values.forEach(({ name, value, options }) =>
          store.set(name, value, options),
        ),
    },
  });
}

/** Privileged client stays server-only and is used exclusively for the restricted write RPC. */
export function writerClient(config: BackendConfig) {
  return createClient(config.url, config.serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}
