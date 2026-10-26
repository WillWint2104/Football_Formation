import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { idSchema } from "../../domain/common";
import {
  domainBundleSchema,
  serializeDomain,
  type DomainBundle,
} from "../../domain/validation";
import { PersistenceError } from "../errors";

export const versionSchema = z
  .number()
  .int()
  .nonnegative()
  .max(Number.MAX_SAFE_INTEGER);
export const snapshotSchema = z.strictObject({
  version: versionSchema,
  bundle: domainBundleSchema,
});
export type SavedSnapshot = z.infer<typeof snapshotSchema>;

/** Treat corrupt stored data as a backend failure, never as valid coaching content. */
export function decodeSavedSnapshot(
  value: unknown,
  organizationId: string,
): SavedSnapshot {
  const parsed = snapshotSchema.safeParse(value);
  if (!parsed.success || parsed.data.bundle.organizationId !== organizationId)
    throw new PersistenceError(503, "Invalid saved organization");
  return parsed.data;
}
export interface CoachingStore {
  load(organizationId: string): Promise<SavedSnapshot>;
  save(
    organizationId: string,
    actor: string,
    expectedVersion: number,
    bundle: DomainBundle,
  ): Promise<number>;
}

/** Map database failures without disclosing SQL, keys, other organizations or record content. */
export function databaseError(error: { code?: string }): PersistenceError {
  if (error.code === "40001")
    return new PersistenceError(
      409,
      "Saved information changed; reload before saving",
    );
  if (error.code === "42501")
    return new PersistenceError(404, "Organization unavailable");
  if (["22023", "23514", "23505"].includes(error.code ?? ""))
    return new PersistenceError(400, "Invalid or rewritten saved history");
  return new PersistenceError(503, "Coaching storage is unavailable");
}

/** RLS-scoped reads plus an atomic, membership-checked server-only write transaction. */
export class SupabaseCoachingStore implements CoachingStore {
  constructor(
    private readonly reader: SupabaseClient,
    private readonly writer: () => SupabaseClient,
  ) {}

  /** Read a consistent immutable snapshot; version zero is an authorized empty organization. */
  async load(organizationId: string): Promise<SavedSnapshot> {
    idSchema.parse(organizationId);
    const org = await this.reader
      .from("organizations")
      .select("version")
      .eq("id", organizationId)
      .maybeSingle();
    if (org.error) throw databaseError(org.error);
    if (!org.data) throw new PersistenceError(404, "Organization unavailable");
    const parsedOrg = z.object({ version: versionSchema }).safeParse(org.data);
    if (!parsedOrg.success)
      throw new PersistenceError(503, "Invalid saved organization");
    const { version } = parsedOrg.data;
    if (version === 0)
      return snapshotSchema.parse({
        version,
        bundle: {
          format: "football-formation-domain",
          schemaVersion: "1.0",
          organizationId,
          teams: [],
          coaches: [],
          events: [],
          sessions: [],
          templates: [],
          exercises: [],
          scenes: [],
          documents: [],
        },
      });
    const saved = await this.reader
      .from("organization_snapshots")
      .select("version,bundle")
      .eq("organization_id", organizationId)
      .eq("version", version)
      .maybeSingle();
    if (saved.error) throw databaseError(saved.error);
    if (!saved.data)
      throw new PersistenceError(404, "Organization unavailable");
    return decodeSavedSnapshot(saved.data, organizationId);
  }

  /** Validate the complete PR 01 graph before acquiring privileged write capability. */
  async save(
    organizationId: string,
    actor: string,
    expectedVersion: number,
    bundle: DomainBundle,
  ): Promise<number> {
    idSchema.parse(organizationId);
    z.uuid().parse(actor);
    versionSchema.parse(expectedVersion);
    const validated = domainBundleSchema.parse(bundle);
    if (validated.organizationId !== organizationId)
      throw new PersistenceError(400, "Organization mismatch");
    serializeDomain(validated);
    const { data, error } = await this.writer().rpc("save_coaching_bundle", {
      p_organization_id: organizationId,
      p_actor: actor,
      p_expected_version: expectedVersion,
      p_bundle: validated,
    });
    if (error) throw databaseError(error);
    return versionSchema.parse(data);
  }
}
