"use server";

import { redirect } from "next/navigation";
import { backendConfig } from "@/lib/server/config";
import { userClient } from "@/lib/server/supabase";
import { requestSignInLink } from "@/lib/server/auth-flow";

/** Supabase sends a sign-in link only when the visitor explicitly submits this form. */
export async function signIn(formData: FormData) {
  let notice: string;
  try {
    const config = backendConfig();
    notice = await requestSignInLink(
      (await userClient(config)).auth,
      formData.get("email"),
      config.origin,
    );
  } catch {
    notice = "unavailable";
  }
  redirect(`/login?notice=${notice}`);
}

/** End this browser's session without changing other devices or exposing provider errors. */
export async function signOut() {
  let notice = "signed-out";
  try {
    const { error } = await (
      await userClient(backendConfig())
    ).auth.signOut({ scope: "local" });
    if (error) notice = "unavailable";
  } catch {
    notice = "unavailable";
  }
  redirect(`/login?notice=${notice}`);
}
