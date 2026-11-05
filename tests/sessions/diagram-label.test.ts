import { test } from "node:test";
import assert from "node:assert/strict";
import { attachmentExample } from "../fixtures/attachments";
import { diagramAssociation } from "../../lib/designer/diagram-label";

test("diagram labels derive only from exact associated revisions and retain no invented scene names", () => {
  const pkg = attachmentExample(), scene = pkg.scenes[0];
  assert.equal(diagramAssociation(pkg, scene), "5v2 Rondo");
  assert.equal(diagramAssociation(pkg, { ...scene, revision: 2 }), "Unattached scene");
  pkg.document.session.activities[1].diagrams.push(structuredClone(pkg.document.session.activities[0].diagrams[0]));
  assert.equal(diagramAssociation(pkg, scene), "5v2 Rondo / 11v11 Team Shape");
});
