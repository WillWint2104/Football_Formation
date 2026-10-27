import assert from "node:assert/strict";
import test from "node:test";
import { createClient } from "@supabase/supabase-js";
import { SupabaseDocumentStore } from "../../lib/server/repositories/documents";

test("real Supabase SDK uses private server-only upload/download and immutable registration without public or signed URLs", async () => {
  const record = { organization_id: "club", id: "document", revision: 1, object_key: "club/00000000-0000-4000-8000-000000000001.pdf", filename: "plan.pdf", byte_length: 4, sha256: "0".repeat(64) };
  const calls: { path: string; method: string; key: string | null; body: unknown }[] = [];
  const client = createClient("http://127.0.0.1:54321", "server-test-key", { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: async (input, init) => {
    const url = new URL(String(input)); const headers = new Headers(init?.headers); const path = url.pathname + url.search;
    calls.push({ path, method: init?.method ?? "GET", key: headers.get("apikey"), body: String(init?.body ?? "") });
    if (url.pathname === "/storage/v1/bucket/coaching-documents") return Response.json({ id: "coaching-documents", name: "coaching-documents", public: false });
    if (url.pathname.endsWith("/register_coaching_document")) { calls.at(-1)!.body = JSON.parse(String(init?.body)); return Response.json(null); }
    if (url.pathname.endsWith("/private_document_objects")) return Response.json(record);
    if (init?.method === "POST") { assert.equal(headers.get("x-upsert"), "false"); return Response.json({ Key: "private" }); }
    return new Response(new Uint8Array([1, 2, 3, 4]), { headers: { "Content-Type": "application/pdf" } });
  } } });
  const store = new SupabaseDocumentStore(client);
  await store.register("00000000-0000-4000-8000-000000000001", record);
  await store.put(record, new Uint8Array([1, 2, 3, 4]));
  assert.deepEqual(await store.get("club", "document", 1), record);
  assert.deepEqual(await store.download(record), new Uint8Array([1, 2, 3, 4]));
  assert.ok(calls.every((c) => c.key === "server-test-key" && !c.path.includes("/public/") && !c.path.includes("/sign/")));
  const mapping = calls.find((c) => c.path.includes("/private_document_objects"))!;
  assert.match(mapping.path, /organization_id=eq.club/); assert.match(mapping.path, /revision=eq.1/);
  assert.deepEqual(calls[0].body, { p_actor: "00000000-0000-4000-8000-000000000001", p_record: record });
});

test("a public or unavailable bucket is rejected before uploading or downloading bytes", async () => {
  let calls = 0;
  const client = createClient("http://127.0.0.1:54321", "server-test-key", { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: async () => { calls++; return Response.json({ id: "coaching-documents", public: true }); } } });
  const store = new SupabaseDocumentStore(client), record = { organization_id: "club", id: "document", revision: 1, object_key: "club/00000000-0000-4000-8000-000000000001.pdf", filename: "plan.pdf", byte_length: 4, sha256: "0".repeat(64) };
  await assert.rejects(store.put(record, new Uint8Array([1, 2, 3, 4])), /Private document storage/);
  await assert.rejects(store.download(record), /Private document storage/); assert.equal(calls, 2);
});
