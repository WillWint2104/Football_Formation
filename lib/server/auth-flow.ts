import "server-only";
import { z } from "zod";

type MagicLinkAuth = {
  signInWithOtp(input: {
    email: string;
    options: { shouldCreateUser: boolean; emailRedirectTo: string };
  }): Promise<{ error: unknown }>;
};

/** Invite-only sign-in; identical notices avoid revealing whether an account exists. */
export async function requestSignInLink(
  auth: MagicLinkAuth,
  email: unknown,
  origin: string,
): Promise<"check-email" | "invalid-email"> {
  const parsed = z.email().max(254).safeParse(email);
  if (!parsed.success) return "invalid-email";
  try {
    await auth.signInWithOtp({
      email: parsed.data,
      options: {
        shouldCreateUser: false,
        emailRedirectTo: `${origin}/auth/callback`,
      },
    });
  } catch {
    /* Provider failures and absent accounts receive the same public notice. */
  }
  return "check-email";
}
