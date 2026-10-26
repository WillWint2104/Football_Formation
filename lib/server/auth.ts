import "server-only";
import { z } from "zod";
import { PersistenceError } from "./errors";

type AuthVerifier = {
  getUser(): Promise<{ data: { user: { id: string } | null }; error: unknown }>;
};

/** Ask the Auth server to verify the session; never trust getSession() or a caller-supplied actor. */
export async function verifiedUser(auth: AuthVerifier): Promise<string> {
  const { data, error } = await auth.getUser();
  if (error || !data.user || !z.uuid().safeParse(data.user.id).success)
    throw new PersistenceError(401, "Sign in required");
  return data.user.id;
}
