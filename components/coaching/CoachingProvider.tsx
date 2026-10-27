"use client";

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { CalendarApiError, loadCalendar, loadOrganizations, saveCalendar, type CalendarSnapshot, type Organization } from "@/lib/calendar/client";
import { domainBundleSchema, type DomainBundle } from "@/lib/domain/validation";
import { coachingSample } from "@/lib/coaching/sample";

type Workspace = {
  snapshot: CalendarSnapshot; mode: "sample" | "saved"; scope: number; loading: boolean; busy: boolean; blocked: boolean;
  message: string; organizations: Organization[]; organization: string;
  dirty: boolean; markDirty: (dirty: boolean) => void;
  reload: (organization?: string) => Promise<void>;
  commit: (base: CalendarSnapshot, bundle: DomainBundle) => Promise<void>;
  externalSave: (base: CalendarSnapshot, operation: () => Promise<void>) => Promise<void>;
};
const Context = createContext<Workspace | null>(null);

/** Keep one validated graph across coaching routes; sample memory is never a persistence substitute. */
export function CoachingProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const active = ["/calendar", "/sessions", "/templates", "/exercises", "/coaches", "/guides", "/tactical-editor"].some((p) => pathname === p);
  const [snapshot, setSnapshot] = useState<CalendarSnapshot>(() => ({ version: 0, bundle: coachingSample() }));
  const [mode, setMode] = useState<"sample" | "saved">("sample");
  const [scope, setScope] = useState(0);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [organization, setOrganization] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [dirty, markDirty] = useState(false);
  const [message, setMessage] = useState("Checking saved calendar availability…");
  const current = useRef(snapshot);
  const lock = useRef(false);
  const initialized = useRef(false);
  const generation = useRef(0);

  /** Replace the visible graph and the synchronous stale-editor guard together. */
  function replace(value: CalendarSnapshot) { current.current = value; setSnapshot(value); }

  useEffect(() => {
    if (!active || initialized.current) return;
    initialized.current = true;
    const token = ++generation.current;
    void (async () => {
      try {
        const choices = await loadOrganizations();
        if (token !== generation.current) return;
        setOrganizations(choices);
        if (!choices.length) { setMessage("No organisation membership is available. Showing illustrative sample data."); return; }
        setOrganization(choices[0].id);
        const loaded = await loadCalendar(choices[0].id);
        if (token !== generation.current) return;
        current.current = loaded; setSnapshot(loaded); setMode("saved"); setScope((s) => s + 1);
        setMessage(`Loaded saved organisation snapshot v${loaded.version}.`);
      } catch (error) {
        if (token === generation.current) setMessage(error instanceof CalendarApiError ? error.message : "Saved records could not be validated. Showing sample data.");
      } finally { if (token === generation.current) setLoading(false); }
    })();
  }, [active]);

  /** Reload explicitly, clearing private records and invalidating open drafts before fetching another graph. */
  async function reload(id?: string) {
    if (lock.current) return;
    const token = ++generation.current;
    setLoading(true); setBlocked(false); setMode("sample"); setScope((s) => s + 1);
    replace({ version: 0, bundle: coachingSample() });
    try {
      let chosen = id;
      if (!chosen) {
        const choices = await loadOrganizations();
        if (token !== generation.current) return;
        setOrganizations(choices); chosen = choices[0]?.id;
      }
      setOrganization(chosen ?? "");
      if (!chosen) { setMessage("No organisation membership is available. Showing illustrative sample data."); return; }
      const loaded = await loadCalendar(chosen);
      if (token !== generation.current) return;
      replace(loaded); setMode("saved"); setScope((s) => s + 1);
      setMessage(`Loaded saved organisation snapshot v${loaded.version}.`);
    } catch (error) {
      if (token === generation.current) setMessage(error instanceof CalendarApiError ? error.message : "Saved records could not be validated.");
    } finally { if (token === generation.current) setLoading(false); }
  }

  /** Commit exactly the graph the editor opened; failed/uncertain writes require reload and never retry. */
  async function commit(base: CalendarSnapshot, bundle: DomainBundle) {
    if (loading || blocked || lock.current) throw new Error("Reload or finish the current operation before saving");
    if (base !== current.current) throw new Error("Records changed since this editor opened. Reopen before saving.");
    const next = domainBundleSchema.parse(bundle);
    if (next.organizationId !== base.bundle.organizationId) throw new Error("Organisation mismatch");
    lock.current = true; setBusy(true);
    try {
      if (mode === "saved") {
        const result = await saveCalendar(base, next);
        replace(result); setMessage(`Saved organisation snapshot v${result.version}.`);
      } else {
        replace({ version: base.version + 1, bundle: next });
        setMessage("Sample change applied in memory only. Reloading discards it.");
      }
    } catch (error) {
      setBlocked(true);
      setMessage(error instanceof CalendarApiError ? error.message : "Save could not be confirmed. Reload before making further changes.");
      if (error instanceof CalendarApiError && [401, 404].includes(error.status)) {
        replace({ version: 0, bundle: coachingSample() }); setMode("sample"); setScope((s) => s + 1);
      }
      throw error;
    } finally { lock.current = false; setBusy(false); }
  }
  /** Serialize server-side attachment saves with ordinary edits, then read back the validated graph. */
  async function externalSave(base: CalendarSnapshot, operation: () => Promise<void>) {
    if (mode !== "saved" || loading || blocked || lock.current || base !== current.current) throw new Error("Reload saved records before uploading");
    lock.current = true; setBusy(true);
    try {
      await operation();
      const loaded = await loadCalendar(base.bundle.organizationId);
      if (loaded.version <= base.version) throw new Error("Attachment readback did not advance; reload saved records");
      replace(loaded); setMessage(`Loaded saved organisation snapshot v${loaded.version}.`);
    } catch (error) {
      setBlocked(true); setMessage("Attachment save could not be confirmed. Reload saved records before retrying.");
      if (error instanceof CalendarApiError && [401, 404].includes(error.status)) {
        replace({ version: 0, bundle: coachingSample() }); setMode("sample"); setScope((s) => s + 1);
      }
      throw error;
    } finally { lock.current = false; setBusy(false); }
  }
  return <Context.Provider value={{ snapshot, mode, scope, loading, busy, blocked, message, organizations, organization, dirty, markDirty, reload, commit, externalSave }}>{children}</Context.Provider>;
}

/** Consume the shared authenticated/sample workspace without exposing server credentials. */
export function useCoaching() {
  const workspace = useContext(Context);
  if (!workspace) throw new Error("CoachingProvider is required");
  return workspace;
}
