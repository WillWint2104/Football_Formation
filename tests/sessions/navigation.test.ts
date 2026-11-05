import { test } from "node:test";
import assert from "node:assert/strict";
import { attachmentExample } from "../fixtures/attachments";
import { readDesignerNavigation, writeDesignerNavigation } from "../../lib/designer/navigation";

test("navigation preferences select existing activity and exact pin only, independently of portable data", () => {
  const document = attachmentExample().document, digest = "a".repeat(64), owner = { id: "local-owner", version: 2 };
  const before = structuredClone(document), id = document.session.activities[0].id;
  const text = writeDesignerNavigation(document, digest, "overview", id, owner, new Map([[`${owner.id}:${id}`, 0]]));
  const remembered = readDesignerNavigation(text, document, digest, owner);
  assert.equal(remembered?.view, "overview"); assert.equal(remembered.activityId, id); assert.equal(remembered.diagrams.get(`${owner.id}:${id}`), 0);
  assert.deepEqual(document, before);
  assert.equal(readDesignerNavigation(text, document, "b".repeat(64), owner), null);
  assert.equal(readDesignerNavigation(text, document, digest, { ...owner, version: 3 }), null);
  assert.equal(readDesignerNavigation(text, document, digest, null), null);
});

test("corrupt, oversized and stale navigation is ignored without recovering any scene or text", () => {
  const document = attachmentExample().document, digest = "a".repeat(64), text = writeDesignerNavigation(document, digest, "edit", "activity-1", null, new Map());
  for (const raw of [null, "{", "x".repeat(128001), JSON.stringify({ ...JSON.parse(text), activityId: "deleted" }), JSON.stringify({ ...JSON.parse(text), view: "print" })])
    assert.equal(readDesignerNavigation(raw, document, digest, null), null);
});
