import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { DOCUMENT_BUCKET, MAX_PDF_BYTES, pdfFilenameSchema } from "../../documents/contracts";
import { idSchema, revisionSchema } from "../../domain/common";
import { PersistenceError } from "../errors";
import { databaseError } from "./coaching";

export const objectRecordSchema = z.strictObject({ organization_id: idSchema, id: idSchema, revision: revisionSchema,
  object_key: z.string().regex(/^[A-Za-z0-9_-]+\/[0-9a-f-]{36}\.pdf$/), filename: pdfFilenameSchema,
  byte_length: z.number().int().positive().max(MAX_PDF_BYTES), sha256: z.string().regex(/^[0-9a-f]{64}$/) });
export type ObjectRecord = z.infer<typeof objectRecordSchema>;
export interface DocumentStore {
  register(actor: string, record: ObjectRecord): Promise<void>;
  put(record: ObjectRecord, bytes: Uint8Array): Promise<void>;
  get(organization: string, id: string, revision: number): Promise<ObjectRecord>;
  download(record: ObjectRecord): Promise<Uint8Array>;
}

/** Server-only journal and private bucket; callers must first verify Auth and load the organisation through RLS. */
export class SupabaseDocumentStore implements DocumentStore {
  constructor(private readonly client: SupabaseClient) {}
  /** Fail closed if operator configuration would publish private attachments. */
  private async requirePrivateBucket() {
    const { data, error } = await this.client.storage.getBucket(DOCUMENT_BUCKET);
    if (error || !data || data.public !== false) throw new PersistenceError(503, "Private document storage is unavailable");
  }
  /** Journal the immutable server-generated object identity before attempting an external upload. */
  async register(actor: string, record: ObjectRecord) {
    const value = objectRecordSchema.parse(record);
    const { error } = await this.client.rpc("register_coaching_document", { p_actor: z.uuid().parse(actor), p_record: value });
    if (error) throw databaseError(error);
  }
  /** Never overwrite an object, expose a public URL, or automatically retry a paid/storage operation. */
  async put(record: ObjectRecord, bytes: Uint8Array) {
    await this.requirePrivateBucket();
    const { error } = await this.client.storage.from(DOCUMENT_BUCKET).upload(record.object_key, bytes, { contentType: "application/pdf", upsert: false, cacheControl: "0" });
    if (error) throw new PersistenceError(503, "PDF upload could not be confirmed; reload before retrying");
  }
  /** Read a physical mapping only on the trusted server after session/document authorization. */
  async get(organization: string, id: string, revision: number): Promise<ObjectRecord> {
    const { data, error } = await this.client.from("private_document_objects").select("organization_id,id,revision,object_key,filename,byte_length,sha256")
      .eq("organization_id", organization).eq("id", id).eq("revision", revision).maybeSingle();
    if (error) throw databaseError(error);
    if (!data) throw new PersistenceError(404, "Document unavailable");
    return objectRecordSchema.parse(data);
  }
  /** Fetch bytes from a private bucket and bound the response before returning it to the handler. */
  async download(record: ObjectRecord) {
    await this.requirePrivateBucket();
    const { data, error } = await this.client.storage.from(DOCUMENT_BUCKET).download(record.object_key);
    if (error || !data) throw new PersistenceError(404, "Document unavailable");
    if (data.size !== record.byte_length || data.size > MAX_PDF_BYTES) throw new PersistenceError(503, "Document integrity check failed");
    return new Uint8Array(await data.arrayBuffer());
  }
}
