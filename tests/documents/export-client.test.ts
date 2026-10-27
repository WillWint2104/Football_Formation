import test from "node:test";
import assert from "node:assert/strict";
import { generateGuidePdf, GuideExportApiError } from "../../lib/documents/client";
import { CalendarApiError } from "../../lib/calendar/client";
import { exportFixture } from "./export-fixtures";

test("export client sends exact saved pins and optimistic version without content, paths or actor identity", async (context) => {
  const { bundle, reference } = exportFixture("possession"); let calls = 0;
  context.mock.method(globalThis, "fetch", async (input: string | URL | Request, init?: RequestInit) => {
    calls++; assert.match(String(input), new RegExp(`/sessions/${reference.session}/1/exports$`));
    assert.equal(init?.method, "POST"); assert.equal(init?.credentials, "same-origin"); assert.equal(init?.body, undefined);
    const headers = new Headers(init?.headers); assert.equal(headers.get("x-expected-version"), "7"); assert.equal(headers.get("x-booking-id"), reference.event); assert.equal(headers.get("x-booking-revision"), "1");
    assert.equal(headers.get("x-guide-template"), "extended-pack"); assert.equal(headers.get("x-guide-cover"), "true");
    assert.equal(headers.get("authorization"), null); assert.ok(init?.signal);
    return Response.json({ version: 8, document: { id: "new-export", revision: 1, filename: "session.pdf" } });
  });
  assert.equal((await generateGuidePdf({ bundle, version: 7 }, reference, { template: "extended-pack", cover: true })).document.id, "new-export"); assert.equal(calls, 1);
});

test("export errors retain revoked-access status for the shared provider and never retry uncertain writes", async (context) => {
  const { bundle, reference } = exportFixture("possession"); let calls = 0, status = 401;
  context.mock.method(globalThis, "fetch", async () => { calls++; return Response.json({ error: "private-provider-secret" }, { status }); });
  for (const code of [401, 404, 409, 503]) {
    status = code; await assert.rejects(generateGuidePdf({ bundle, version: 1 }, reference), (error) => error instanceof CalendarApiError && error instanceof GuideExportApiError && error.status === code && !error.message.includes("private-provider-secret"));
  }
  assert.equal(calls, 4);
});

test("nonincrementing export acknowledgement is an uncertain failure", async (context) => {
  const { bundle, reference } = exportFixture("possession"); let calls = 0;
  context.mock.method(globalThis, "fetch", async () => { calls++; return Response.json({ version: 7, document: { id: "new-export", revision: 1, filename: "session.pdf" } }); });
  await assert.rejects(generateGuidePdf({ bundle, version: 7 }, reference), /Unexpected export acknowledgement/); assert.equal(calls, 1);
});
