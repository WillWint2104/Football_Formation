import "server-only";
import { z } from "zod";
import { PersistenceError } from "./errors";

const originSchema = z.url().refine((value) => {
  const url = new URL(value);
  return (
    url.origin === value &&
    (url.protocol === "https:" ||
      (url.protocol === "http:" &&
        ["localhost", "127.0.0.1"].includes(url.hostname)))
  );
}, "Use an HTTPS origin, or HTTP loopback for local development");

/** Prevent a privileged legacy/secret key from accidentally turning user reads into RLS bypasses. */
function keyRole(value: string, role: "anon" | "service_role"): boolean {
  const prefix = role === "anon" ? "sb_publishable_" : "sb_secret_";
  if (value.startsWith(prefix) && value.length > prefix.length) return true;
  try {
    const parts = value.split(".");
    if (parts.length !== 3) return false;
    const payload: unknown = JSON.parse(
      Buffer.from(parts[1], "base64url").toString("utf8"),
    );
    return z.object({ role: z.literal(role) }).safeParse(payload).success;
  } catch {
    return false;
  }
}

export const backendConfigSchema = z.strictObject({
  url: z.url().refine((value) => {
    const url = new URL(value);
    return (
      url.protocol === "https:" ||
      (url.protocol === "http:" &&
        ["localhost", "127.0.0.1"].includes(url.hostname))
    );
  }),
  publishableKey: z
    .string()
    .refine((value) => keyRole(value, "anon"), "Expected publishable/anon key"),
  serviceRoleKey: z
    .string()
    .refine(
      (value) => keyRole(value, "service_role"),
      "Expected server secret/service-role key",
    ),
  origin: originSchema,
});
export type BackendConfig = z.infer<typeof backendConfigSchema>;

/** Read secrets lazily: builds and the existing lineup work without a provisioned backend. */
export function backendConfig(): BackendConfig {
  const result = backendConfigSchema.safeParse({
    url: process.env.SUPABASE_URL,
    publishableKey: process.env.SUPABASE_PUBLISHABLE_KEY,
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    origin: process.env.APP_ORIGIN,
  });
  if (!result.success)
    throw new PersistenceError(503, "Coaching storage is not configured");
  return result.data;
}
