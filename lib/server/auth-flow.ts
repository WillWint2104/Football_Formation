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

type CallbackAuth = {
  exchangeCodeForSession(code: string): Promise<{ error: unknown }>;
  verifyOtp(input: {
    token_hash: string;
    type: "email" | "invite";
  }): Promise<{ error: unknown }>;
};

/** Accept PKCE or the documented email/invite token-hash flow, never arbitrary OTP types. */
export async function completeSignIn(
  auth: CallbackAuth,
  params: URLSearchParams,
): Promise<boolean> {
  const code = params.get("code");
  if (code && code.length <= 2048)
    return !(await auth.exchangeCodeForSession(code)).error;
  const tokenHash = params.get("token_hash");
  const type = params.get("type");
  if (
    tokenHash &&
    tokenHash.length <= 512 &&
    (type === "email" || type === "invite")
  )
    return !(await auth.verifyOtp({ token_hash: tokenHash, type })).error;
  return false;
}
