import { z } from "zod";
import { editableDocumentSchema, MAX_SESSION_JSON_BYTES, type DesignerDocument } from "./contract";

export const DESIGNER_DRAFT_KEY = "football-formation.session-designer.v1";
export const DRAFT_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
const draftSchema = z.strictObject({ version: z.literal(1), savedAt: z.iso.datetime(), document: editableDocumentSchema });

/** One bounded, explicitly local draft. Incomplete edits survive refresh without becoming valid exports. */
export function encodeDraft(document: DesignerDocument, now = Date.now()) {
  const text = JSON.stringify(draftSchema.parse({ version: 1, savedAt: new Date(now).toISOString(), document }));
  if (new TextEncoder().encode(text).length > MAX_SESSION_JSON_BYTES) throw new Error("Local draft is too large. Download JSON and reduce its content.");
  return text;
}

export function decodeDraft(text: string, now = Date.now()) {
  if (new TextEncoder().encode(text).length > MAX_SESSION_JSON_BYTES) throw new Error("The browser draft exceeds the 2 MB limit.");
  const draft = draftSchema.parse(JSON.parse(text));
  const age = now - Date.parse(draft.savedAt);
  if (age > DRAFT_RETENTION_MS || age < -300000) throw new Error("The browser draft is expired or has an invalid date. Import your downloaded JSON instead.");
  return draft;
}
