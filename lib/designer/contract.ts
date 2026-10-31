import { z } from "zod";
import { sessionContentSchema, sessionKindSchema, type Session } from "../domain/session";
import { cleanExercise } from "../coaching/sessions";
import { MAX_LOGO_BYTES, MAX_LOGO_EDGE, logoBytes, rasterInfo } from "./images";

export const MAX_SESSION_JSON_BYTES = 2 * 1024 * 1024;
export const MAX_ACTIVITIES = 100;
export const hexColorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Use a six-digit HEX colour, for example #245A42.");
export const logoSchema = z.strictObject({
  name: z.string().min(1).max(200), mimeType: z.enum(["image/png", "image/jpeg"]),
  width: z.number().int().positive().max(MAX_LOGO_EDGE), height: z.number().int().positive().max(MAX_LOGO_EDGE),
  dataUrl: z.string().max(Math.ceil(MAX_LOGO_BYTES / 3) * 4 + 32),
}).superRefine((logo, ctx) => {
  const bytes = logoBytes(logo.dataUrl), info = bytes && rasterInfo(bytes);
  if (!info || info.mimeType !== logo.mimeType || info.width !== logo.width || info.height !== logo.height)
    ctx.addIssue({ code: "custom", path: ["dataUrl"], message: "Logo must be an embedded PNG/JPEG matching its declared dimensions and type (512 KB maximum)." });
});
export type PortableLogo = z.infer<typeof logoSchema>;

const unknownBranding = () => ({ clubName: null, primaryColor: null, secondaryColor: null, accentColor: null, logo: null });

/** The editable shape permits incomplete fields; the export/import shape validates actual coaching facts. */
function documentShape(editing: boolean) {
  const text = (max = 10000) => editing ? z.string().max(max) : z.string().trim().min(1).max(max);
  const positive = () => (editing ? z.number().finite() : z.number().positive().finite()).nullable().default(null);
  const count = () => (editing ? z.number().finite() : z.number().int().positive()).nullable().default(null);
  const lines = () => z.array(text()).max(200).default([]);
  const color = () => (editing ? z.string().max(7) : hexColorSchema).nullable().default(null);
  return {
    format: z.literal("football-formation-session"), schemaVersion: z.literal("1.0"),
    branding: z.strictObject({ clubName: text(200).nullable().default(null), primaryColor: color(), secondaryColor: color(), accentColor: color(), logo: logoSchema.nullable().default(null) }).default(unknownBranding),
    session: z.strictObject({
      name: text(200), type: sessionKindSchema.nullable().default(null), team: text(200).nullable().default(null),
      objectives: lines(), focus: z.array(text(200)).max(100).default([]), durationMinutes: positive(), playerCount: count(),
      activities: z.array(z.strictObject({
        id: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/).default(() => crypto.randomUUID()),
        name: text(200), role: z.enum(["exercise", "warm-up", "cool-down", "briefing"]).default("exercise"),
        durationMinutes: positive(), playerCount: count(),
        area: z.strictObject({ length: editing ? z.number().finite() : z.number().positive().finite(), width: editing ? z.number().finite() : z.number().positive().finite(), origin: z.strictObject({ x: z.number().finite(), y: z.number().finite() }).default({ x: 0, y: 0 }) }).nullable().default(null),
        equipment: z.array(z.strictObject({ name: text(200), quantity: (editing ? z.number().finite() : z.number().int().nonnegative()).nullable().default(null) })).max(100).default([]),
        instructions: lines(), coachingPoints: lines(), progressions: lines(), regressions: lines(), variations: lines(),
        diagrams: z.array(z.strictObject({ scene: z.strictObject({ id: editing ? z.string().max(128) : z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/), revision: editing ? z.number().finite() : z.number().int().positive().max(Number.MAX_SAFE_INTEGER) }), representativeSeconds: editing ? z.number().finite() : z.number().nonnegative().finite() })).max(20).default([]),
      })).max(MAX_ACTIVITIES).default([]),
    }),
  };
}

export const editableDocumentSchema = z.strictObject(documentShape(true));
export const portableSessionSchema = z.strictObject(documentShape(false)).superRefine((document, ctx) => {
  const parsed = sessionContentSchema.safeParse(toSessionContent(document));
  if (!parsed.success) for (const issue of parsed.error.issues) ctx.addIssue({ code: "custom", path: ["session", ...issue.path], message: issue.message });
});
export type DesignerDocument = z.infer<typeof editableDocumentSchema>;

/** Generic adapter: reuse strict domain content without manufacturing teams, clubs or saved revisions. */
export function toSessionContent(document: DesignerDocument): Session["content"] {
  const s = document.session;
  return { title: s.name, kind: s.type ?? "other", objective: s.objectives.join("\n") || null, focus: [...s.focus],
    activities: s.activities.map(({ name, id, role, durationMinutes, ...content }) => ({ id, role, durationMinutes, sourceExercise: null, content: { ...structuredClone(content), title: name } })) };
}

export function applySessionContent(document: DesignerDocument, content: Session["content"]): DesignerDocument {
  return { ...document, session: { ...document.session, name: content.title, objectives: content.objective?.split("\n") ?? [], focus: content.focus,
    activities: content.activities.map(({ id, role, durationMinutes, content: { title, ...exercise } }) => ({ id, role, durationMinutes, name: title, ...structuredClone(exercise) })) } };
}

/** Clean editor-only blank lines at the boundary; never replace unknown quantities with zero. */
export function exportDocument(document: DesignerDocument): DesignerDocument {
  const clean = applySessionContent(document, { ...toSessionContent(document), activities: toSessionContent(document).activities.map((a) => ({ ...a, content: cleanExercise(a.content) })) });
  clean.session.objectives = clean.session.objectives.map((s) => s.trim()).filter(Boolean);
  clean.session.focus = clean.session.focus.map((s) => s.trim()).filter(Boolean);
  const parsed = portableSessionSchema.parse(clean);
  if (new TextEncoder().encode(JSON.stringify(parsed)).length > MAX_SESSION_JSON_BYTES) throw new Error("Session exceeds the 2 MB portable JSON limit. Shorten the content or remove the logo.");
  return parsed;
}

export function parseSessionJson(text: string): DesignerDocument {
  if (new TextEncoder().encode(text).length > MAX_SESSION_JSON_BYTES) throw new Error("JSON exceeds 2 MB. Choose a smaller session file.");
  let value: unknown;
  try { value = JSON.parse(text.replace(/^\uFEFF/, "")); } catch { throw new Error("This is not valid JSON. Check commas, quotation marks and closing brackets."); }
  return portableSessionSchema.parse(value);
}

/** Keep downloaded files within the same import bound, including formatting overhead. */
export function serializeSessionJson(document: DesignerDocument): string {
  const parsed = exportDocument(document), pretty = JSON.stringify(parsed, null, 2) + "\n";
  return new TextEncoder().encode(pretty).length <= MAX_SESSION_JSON_BYTES ? pretty : JSON.stringify(parsed);
}

export function designerErrors(error: unknown): string[] {
  if (error instanceof z.ZodError) return error.issues.slice(0, 12).map((issue) => `${issue.path.join(".") || "Document"}: ${issue.message}`);
  return [error instanceof Error ? error.message : "The session could not be read."];
}

export function blankDesignerDocument(): DesignerDocument {
  return { format: "football-formation-session", schemaVersion: "1.0", branding: unknownBranding(), session: { name: "Untitled coaching session", type: null, team: null, objectives: [], focus: [], durationMinutes: null, playerCount: null, activities: [] } };
}
