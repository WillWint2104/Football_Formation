import assert from "node:assert/strict";
import test from "node:test";
import { CalendarApiError, loadCalendar, loadOrganizations, saveCalendar } from "../../lib/calendar/client";
import { sampleCalendar } from "../../lib/calendar/sample";

test("calendar HTTP adapter validates organisation discovery and exact saved graph identity", async (t) => {
  const bundle = sampleCalendar();
  t.mock.method(globalThis, "fetch", async (path: string, init: RequestInit) => {
    assert.equal(init.credentials, "same-origin"); assert.equal(init.cache, "no-store");
    return Response.json(path === "/api/organizations" ? { organizations: [{ id: bundle.organizationId, name: "Example", version: 2 }] } : { version: 2, bundle });
  });
  assert.equal((await loadOrganizations())[0].id, bundle.organizationId);
  assert.equal((await loadCalendar(bundle.organizationId)).version, 2);
  await assert.rejects(loadCalendar("another-org"));
});

test("save uses expected organisation version without client actor identity and never retries failures", async (t) => {
  const bundle = sampleCalendar(); let count = 0;
  const mock = t.mock.method(globalThis, "fetch", async (_path: string, init: RequestInit) => {
    count++; const input = JSON.parse(String(init.body));
    assert.deepEqual(Object.keys(input).sort(), ["bundle", "expectedVersion"]);
    assert.equal(input.expectedVersion, 3); assert.equal(init.method, "POST");
    return Response.json({ version: 4 });
  });
  assert.equal((await saveCalendar({ version: 3, bundle }, bundle)).version, 4);
  for (const status of [401, 404, 409, 413, 503]) {
    mock.mock.mockImplementation(async () => { count++; return Response.json({ error: "PRIVATE SERVER DETAIL" }, { status }); });
    await assert.rejects(saveCalendar({ version: 3, bundle }, bundle), (error: unknown) => error instanceof CalendarApiError && error.status === status && !error.message.includes("PRIVATE"));
  }
  assert.equal(count, 6);
});

test("invalid or nonincrementing acknowledgements and cross-organisation saves fail closed", async (t) => {
  const bundle = sampleCalendar();
  const mock = t.mock.method(globalThis, "fetch", async () => Response.json({ version: 1 }));
  await assert.rejects(saveCalendar({ version: 3, bundle }, bundle));
  await assert.rejects(saveCalendar({ version: 3, bundle }, { ...bundle, organizationId: "another-org" }));
  mock.mock.mockImplementation(async () => Response.json({ version: 1, bundle: { ...bundle, events: [{ bogus: true }] } }));
  await assert.rejects(loadCalendar(bundle.organizationId));
});
