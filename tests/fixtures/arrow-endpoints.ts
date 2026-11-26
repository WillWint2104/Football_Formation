import type { Page } from "@playwright/test";
import { coachingSample } from "../../lib/coaching/sample";
import type { AnimationStage } from "../../lib/domain/tactical-scene";
import { domainBundleSchema } from "../../lib/domain/validation";
import { editorExamples } from "../../lib/tactical/editor-examples";
import { diagramHref, type DiagramTarget } from "../../lib/tactical/persistence";

export const initialFrom = { x: 4, y: 12 };
export const initialTo = { x: 16, y: 8 };
export const pitchFrom = { x: 30, y: 28 };
export const pitchTo = { x: 56, y: 40 };
const target: DiagramTarget = { kind: "session", id: "sample-3", revision: 1, activity: "activity-1", event: "sample-4", booking: 1, diagram: 0 };

export async function arrowEndpointFixture(page: Page, context: "neutral" | "full" = "neutral") {
  let bundle = coachingSample(), version = 1, writes = 0;
  const full = context === "full";
  const scene = structuredClone(editorExamples.find(item => item.id === (full ? "full" : "rondo"))!.scene);
  const from = full ? pitchFrom : initialFrom, to = full ? pitchTo : initialTo;
  scene.id = full ? "c7b-approval-full-pitch" : "c6b-approval-practice";
  scene.organizationId = bundle.organizationId;
  if (!full) {
    scene.field = { length: 24, width: 16 };
    for (const entity of scene.entities) {
      entity.position.x *= 2;
      entity.position.y *= 4 / 3;
    }
  }
  const first: AnimationStage = { id: "first", title: "Find the free player", durationSeconds: 4, tracks: [
    { id: "route", kind: "annotation", visibleFrom: 0, visibleUntil: 3.75,
      annotation: { kind: "arrow", movement: "pass", from, to } },
    { id: "support", kind: "annotation", visibleFrom: 0, visibleUntil: 4,
      annotation: { kind: "arrow", movement: "run", from: { x: 14, y: 13 }, to: { x: 20, y: 12 } } },
    { id: "ball-path", kind: "ball", entityId: "ball", movement: "pass", keyframes: [
      { seconds: 0, position: scene.entities.find(entity => entity.id === "ball")!.position },
      { seconds: 3, position: to },
    ] },
  ] };
  const second: AnimationStage = { id: "second", title: "Play through pressure", durationSeconds: 4, tracks: [
    { id: "route", kind: "annotation", visibleFrom: 0, visibleUntil: 4,
      annotation: { kind: "arrow", movement: "run", from: { x: 5, y: 4 }, to: { x: 12, y: 4 } } },
  ] };
  scene.stages = [first, second];
  const session = bundle.sessions.find(item => item.id === target.id)!;
  const activity = session.content.activities.find(item => item.id === target.activity)!;
  activity.content.title = "Find the free player";
  activity.content.area = { origin: { x: 0, y: 0 }, ...scene.field };
  activity.content.diagrams = [{ scene: { id: scene.id, revision: 1 }, representativeSeconds: 1.5 }];
  bundle.scenes.push(scene);
  bundle = domainBundleSchema.parse(bundle);
  const before = structuredClone(bundle);
  await page.route("**/*", route => {
    const request = route.request();
    const url = new URL(request.url());
    if (!["127.0.0.1", "localhost"].includes(url.hostname)) return route.abort();
    if (url.pathname === "/api/organizations") {
      return route.fulfill({ json: { organizations: [{ id: bundle.organizationId, name: "Synthetic endpoint review club", version }] } });
    }
    if (url.pathname !== `/api/organizations/${bundle.organizationId}/snapshot`) {
      return url.pathname.startsWith("/api/") ? route.abort() : route.continue();
    }
    if (request.method() === "POST") {
      const body = request.postDataJSON();
      const parsed = domainBundleSchema.safeParse(body.bundle);
      if (body.expectedVersion !== version) return route.fulfill({ status: 409, json: {} });
      if (!parsed.success) return route.fulfill({ status: 422, json: {} });
      bundle = parsed.data;
      writes++;
      return route.fulfill({ json: { version: ++version } });
    }
    return route.fulfill({ json: { version, bundle } });
  });
  return { url: diagramHref(target), scene, before, target, bundle: () => bundle, writes: () => writes };
}
