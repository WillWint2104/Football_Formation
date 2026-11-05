import { z } from "zod";
import type { DesignerDocument } from "./contract";

export const DESIGNER_NAVIGATION_KEY = "football-formation.session-designer.navigation.v1";
const owner = z.strictObject({ id: z.string().min(1).max(200), version: z.number().int().positive() }).nullable();
const schema = z.strictObject({ version: z.literal(1), digest: z.string().regex(/^[a-f0-9]{64}$/), owner,
  view: z.enum(["edit", "overview"]), activityId: z.string().max(200).nullable(),
  diagrams: z.array(z.strictObject({ activityId: z.string().max(200), sceneId: z.string().max(200), revision: z.number().int().positive(), seconds: z.number().finite().nonnegative() })).max(1000) });
export type NavigationOwner = z.infer<typeof owner>;

/** Preferences contain identities only. They can select UI within the current verified document, never restore content. */
export function readDesignerNavigation(raw: string | null, document: DesignerDocument, digest: string, currentOwner: NavigationOwner) {
  if (!raw || raw.length > 128_000) return null;
  let input: unknown;
  try { input = JSON.parse(raw); } catch { return null; }
  const parsed = schema.safeParse(input);
  if (!parsed.success) return null;
  const value = parsed.data;
  if (value.digest !== digest || value.owner?.id !== currentOwner?.id || value.owner?.version !== currentOwner?.version) return null;
  if (value.activityId && !document.session.activities.some(a => a.id === value.activityId)) return null;
  const diagrams = new Map<string, number>();
  for (const pin of value.diagrams) {
    const activity = document.session.activities.find(a => a.id === pin.activityId);
    const index = activity?.diagrams.findIndex(d => d.scene.id === pin.sceneId && d.scene.revision === pin.revision && d.representativeSeconds === pin.seconds) ?? -1;
    if (index >= 0) diagrams.set(`${currentOwner?.id ?? "draft"}:${pin.activityId}`, index);
  }
  return { view: value.view, activityId: value.activityId ?? "", diagrams };
}

export function writeDesignerNavigation(document: DesignerDocument, digest: string, view: "edit" | "overview", activityId: string, currentOwner: NavigationOwner, selection: Map<string, number>) {
  const diagrams = document.session.activities.flatMap(a => {
    const index = selection.get(`${currentOwner?.id ?? "draft"}:${a.id}`), pin = index === undefined ? undefined : a.diagrams[index];
    return pin ? [{ activityId: a.id, sceneId: pin.scene.id, revision: pin.scene.revision, seconds: pin.representativeSeconds }] : [];
  });
  return JSON.stringify(schema.parse({ version: 1, digest, owner: currentOwner, view, activityId: document.session.activities.some(a => a.id === activityId) ? activityId : document.session.activities[0]?.id ?? null, diagrams }));
}
