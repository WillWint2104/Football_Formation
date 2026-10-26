import { backendConfig } from "@/lib/server/config";
import { signIn, signOut } from "./actions";

const notices = new Map([
  [
    "check-email",
    "If your account has access, a sign-in link will arrive by email. Open it in this browser.",
  ],
  ["invalid-email", "Enter a valid email address."],
  ["unavailable", "Sign-in is currently unavailable. Please try again later."],
  ["signed-out", "You have signed out of this browser."],
]);

/** Minimal authentication entry point; the established coaching shell remains unchanged. */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string }>;
}) {
  const { notice } = await searchParams;
  const message = typeof notice === "string" ? notices.get(notice) : undefined;
  let configured = true;
  try {
    backendConfig();
  } catch {
    configured = false;
  }
  return (
    <section className="mx-auto max-w-lg rounded-lg border border-outline-variant bg-surface-container-lowest p-8">
      <h1 className="font-display text-2xl font-bold">
        Sign in to Football Formation
      </h1>
      <p className="mt-3 text-on-surface-variant">
        Use the email address invited by your club.
      </p>
      {!configured && (
        <p className="mt-4" role="status">
          Sign-in is currently unavailable.
        </p>
      )}
      {message && (
        <p className="mt-4" role="status">
          {message}
        </p>
      )}
      <form action={signIn} className="mt-6 space-y-4">
        <label htmlFor="email" className="block font-semibold">
          Email address
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          maxLength={254}
          className="w-full rounded border border-outline bg-surface p-3"
          disabled={!configured}
        />
        <button
          type="submit"
          disabled={!configured}
          className="rounded bg-shell-accent px-5 py-3 font-semibold text-shell disabled:opacity-50"
        >
          Send sign-in link
        </button>
      </form>
      <form action={signOut} className="mt-6">
        <button
          disabled={!configured}
          className="rounded border border-outline px-4 py-2 disabled:opacity-50"
        >
          Sign out of this browser
        </button>
      </form>
    </section>
  );
}
