import "server-only";
import { z } from "zod";
import { idSchema } from "../domain/common";
import {
  domainBundleSchema,
  MAX_DOMAIN_JSON_BYTES,
} from "../domain/validation";
import { PersistenceError } from "./errors";
import {
  decodeSavedSnapshot,
  versionSchema,
  type CoachingStore,
} from "./repositories/coaching";

export type PersistenceContext = { actor: string; store: CoachingStore };
const saveSchema = z.strictObject({
  expectedVersion: versionSchema,
  bundle: domainBundleSchema,
});

/** Send only deliberately public errors; never serialize raw Auth/Postgres/Zod failures. */
export function errorResponse(error: unknown): Response {
  const known = error instanceof PersistenceError;
  const invalid = error instanceof z.ZodError || error instanceof SyntaxError;
  return Response.json(
    {
      error: known
        ? error.message
        : invalid
          ? "Invalid coaching data"
          : "Coaching storage is unavailable",
    },
    {
      status: known ? error.status : invalid ? 400 : 503,
      headers: { "Cache-Control": "private, no-store" },
    },
  );
}

/** Bound bytes while streaming, including requests with missing or forged Content-Length. */
export async function readBoundedJson(request: Request): Promise<unknown> {
  if (
    request.headers.get("content-type")?.split(";")[0].trim() !==
    "application/json"
  )
    throw new PersistenceError(415, "Expected application/json");
  if (Number(request.headers.get("content-length")) > MAX_DOMAIN_JSON_BYTES)
    throw new PersistenceError(413, "Coaching data exceeds 10 MiB");
  const reader = request.body?.getReader();
  if (!reader) throw new PersistenceError(400, "Missing coaching data");
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let bytes = 0;
  let text = "";
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_DOMAIN_JSON_BYTES) {
        await reader.cancel();
        throw new PersistenceError(413, "Coaching data exceeds 10 MiB");
      }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
  } finally {
    reader.releaseLock();
  }
  return JSON.parse(text) as unknown;
}

/** Authenticate each request and take actor identity only from the verified server context. */
export async function handlePersistence(
  request: Request,
  organizationId: string,
  origin: string,
  authenticate: () => Promise<PersistenceContext>,
): Promise<Response> {
  try {
    idSchema.parse(organizationId);
    if (request.method === "POST" && request.headers.get("origin") !== origin)
      throw new PersistenceError(403, "Request origin rejected");
    const { actor, store } = await authenticate();
    if (request.method === "GET") {
      const saved = decodeSavedSnapshot(
        await store.load(organizationId),
        organizationId,
      );
      return Response.json(saved, {
        headers: { "Cache-Control": "private, no-store" },
      });
    }
    if (request.method !== "POST")
      throw new PersistenceError(405, "Method not allowed");
    const input = saveSchema.parse(await readBoundedJson(request));
    if (input.bundle.organizationId !== organizationId)
      throw new PersistenceError(400, "Organization mismatch");
    const version = await store.save(
      organizationId,
      actor,
      input.expectedVersion,
      input.bundle,
    );
    return Response.json(
      { version },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
