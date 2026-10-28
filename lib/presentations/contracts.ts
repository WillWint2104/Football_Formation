import { z } from "zod";
import { idSchema, recordShape, revisionRefSchema, textSchema } from "../domain/common";
import { areaSchema, pointSchema } from "../domain/tactical-scene";
import type { DomainBundle } from "../domain/validation";
import { prepareScene, sceneDuration } from "../tactical/evaluate";
import { areaBounds } from "../tactical/viewport";

export const MAX_PRESENTATION_BYTES = 2 * 1024 * 1024;
export const sourceSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("session"), ref: revisionRefSchema, activityIds: z.array(idSchema).max(512).optional() }),
  z.strictObject({ kind: z.literal("activity"), ref: revisionRefSchema, activityId: idSchema }),
  z.strictObject({ kind: z.literal("exercise"), ref: revisionRefSchema }),
  z.strictObject({ kind: z.literal("scene"), ref: revisionRefSchema, seconds: z.number().finite().nonnegative().max(21600) }),
]);
export const cameraViewSchema = z.strictObject({
  id: idSchema, title: textSchema, stageId: idSchema.nullable(),
  framing: z.enum(["overview", "action", "detail"]), area: areaSchema,
  center: pointSchema, zoom: z.number().finite().min(.1).max(8),
  rotation: z.union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)]),
  transitionSeconds: z.number().finite().min(0).max(5),
});
export const blockSchema = z.strictObject({
  id: idSchema, kind: z.enum(["overview", "guidance", "diagram", "animation", "notes", "summary"]),
  title: textSchema, notes: z.string().max(10000), source: sourceSchema.nullable(),
  views: z.array(cameraViewSchema).max(32),
});
export const presentationSchema = z.strictObject({
  ...recordShape, revision: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  title: textSchema, originSession: revisionRefSchema.nullable(), blocks: z.array(blockSchema).max(128),
}).superRefine((p, ctx) => {
  if (new Set(p.blocks.map(b => b.id)).size !== p.blocks.length) ctx.addIssue({ code: "custom", message: "Duplicate section identity" });
  p.blocks.forEach((b, i) => {
    const scene = b.source?.kind === "scene";
    if ((b.kind === "diagram" || b.kind === "animation") !== scene || (!scene && b.views.length)) ctx.addIssue({ code: "custom", path: ["blocks", i], message: "Section and source disagree" });
    if (["overview", "summary"].includes(b.kind) && b.source && b.source.kind !== "session") ctx.addIssue({ code: "custom", path: ["blocks", i], message: "Overview/summary requires a session source" });
    if (b.kind === "guidance" && !["activity", "exercise"].includes(b.source?.kind ?? "")) ctx.addIssue({ code: "custom", path: ["blocks", i], message: "Guidance requires an activity or exercise" });
    if (new Set(b.views.map(v => v.id)).size !== b.views.length) ctx.addIssue({ code: "custom", path: ["blocks", i], message: "Duplicate camera identity" });
    for (const v of b.views) { try { areaBounds(v.area); if (Math.abs(v.center.x) > 10000 || Math.abs(v.center.y) > 10000) throw new Error(); } catch { ctx.addIssue({ code: "custom", path: ["blocks", i, "views"], message: "Camera exceeds metric limits" }); } }
  });
});
export type Presentation = z.infer<typeof presentationSchema>;
export type PresentationBlock = z.infer<typeof blockSchema>;
export type PresentationSource = z.infer<typeof sourceSchema>;
export type CameraView = z.infer<typeof cameraViewSchema>;

/** Exact revision lookup only. Nothing silently resolves to the newest source. */
export function resolveSource(bundle: DomainBundle, source: PresentationSource | null) {
  if (!source) return {};
  const same = (r: { id: string; revision: number }) => r.id === source.ref.id && r.revision === source.ref.revision;
  if (source.kind === "scene") {
    const found = bundle.scenes.find(same);
    if (!found) throw new Error("Pinned scene revision unavailable");
    const scene = prepareScene(found);
    if (source.seconds > sceneDuration(scene)) throw new Error("Snapshot exceeds scene duration");
    return { scene };
  }
  if (source.kind === "exercise") {
    const exercise = bundle.exercises.find(same);
    if (!exercise) throw new Error("Pinned exercise revision unavailable");
    return { content: exercise.content };
  }
  const session = bundle.sessions.find(same);
  if (!session) throw new Error("Pinned session revision unavailable");
  if (source.kind === "session") {
    if (!source.activityIds) return { session };
    if (new Set(source.activityIds).size !== source.activityIds.length || source.activityIds.some(id => !session.content.activities.some(a => a.id === id))) throw new Error("Pinned activity selection unavailable");
    return { session: { ...session, content: { ...session.content, activities: session.content.activities.filter(a => source.activityIds!.includes(a.id)) } } };
  }
  const activity = session.content.activities.find(a => a.id === source.activityId);
  if (!activity) throw new Error("Pinned activity unavailable");
  return { content: activity.content };
}

/** Validate both the envelope and the complete pinned graph before display or write. */
export function validatePresentation(value: unknown, bundle: DomainBundle): Presentation {
  const p = presentationSchema.parse(value);
  if (p.organizationId !== bundle.organizationId) throw new Error("Presentation organisation mismatch");
  if (p.originSession) resolveSource(bundle, { kind: "session", ref: p.originSession });
  for (const block of p.blocks) {
    const { scene } = resolveSource(bundle, block.source);
    if (block.kind === "animation" && scene && !scene.stages.length) throw new Error("Animation requires saved stages");
    for (const view of block.views) if (view.stageId && !scene?.stages.some(s => s.id === view.stageId)) throw new Error("Camera references an unavailable stage");
  }
  if (new TextEncoder().encode(JSON.stringify(p)).byteLength > MAX_PRESENTATION_BYTES) throw new Error("Presentation exceeds 2 MiB");
  return p;
}

export function blankPresentation(organizationId: string, allocate = () => crypto.randomUUID()): Presentation {
  return { schemaVersion: "1.0", organizationId, id: allocate(), revision: 1, title: "New coaching presentation", originSession: null, blocks: [] };
}
export function createBlock(kind: PresentationBlock["kind"], title: string, source: PresentationSource | null, allocate = () => crypto.randomUUID()): PresentationBlock {
  return { id: allocate(), kind, title, source, notes: "", views: [] };
}
/** Scenes have no mutable display title; use the exact saved owner's activity name where available. */
export function sceneLabel(bundle: DomainBundle, ref: { id: string; revision: number }): string {
  const has = (content: { diagrams: { scene: { id: string; revision: number } }[] }) => content.diagrams.some(d => d.scene.id === ref.id && d.scene.revision === ref.revision);
  return bundle.exercises.find(e => has(e.content))?.content.title
    ?? bundle.sessions.flatMap(s => s.content.activities).find(a => has(a.content))?.content.title
    ?? ref.id;
}
/** Selection is explicit; missing diagrams/instructions produce no fabricated sections. */
export function fromSession(bundle: DomainBundle, ref: { id: string; revision: number }, activityIds: string[], overview: boolean, summary: boolean): Presentation {
  const { session } = resolveSource(bundle, { kind: "session", ref });
  if (!session || new Set(activityIds).size !== activityIds.length || activityIds.some(id => !session.content.activities.some(a => a.id === id))) throw new Error("Invalid activity selection");
  const p = blankPresentation(bundle.organizationId); p.title = session.content.title; p.originSession = { ...ref };
  if (overview) p.blocks.push(createBlock("overview", session.content.title, { kind: "session", ref, activityIds: [...activityIds] }));
  for (const activity of session.content.activities.filter(a => activityIds.includes(a.id))) {
    const source: PresentationSource = { kind: "activity", ref: { ...ref }, activityId: activity.id };
    p.blocks.push(createBlock("guidance", activity.content.title, source));
    for (const diagram of activity.content.diagrams) {
      const scene = bundle.scenes.find(s => s.id === diagram.scene.id && s.revision === diagram.scene.revision);
      if (!scene) throw new Error("Pinned diagram unavailable");
      p.blocks.push(createBlock(scene.stages.length ? "animation" : "diagram", `${activity.content.title} · tactical scene`, { kind: "scene", ref: { ...diagram.scene }, seconds: diagram.representativeSeconds }));
    }
    if (activity.content.coachingPoints.length || activity.content.progressions.length) p.blocks.push(createBlock("notes", `${activity.content.title} · coaching points`, source));
  }
  if (summary) p.blocks.push(createBlock("summary", "Session summary", { kind: "session", ref, activityIds: [...activityIds] }));
  return validatePresentation(p, bundle);
}
