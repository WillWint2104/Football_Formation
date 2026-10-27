import { z } from "zod";
import { idSchema, revisionSchema } from "../domain/common";
import { documentEndpoint, pdfFilenameSchema, type GuideReference } from "./contracts";

export const GUIDE_EXPORT_VERSION = "guide-pdf/1.0.0";
export const exportAcknowledgement = z.strictObject({ version: z.number().int().positive(),
  document: z.strictObject({ id: idSchema, revision: revisionSchema, filename: pdfFilenameSchema }) });

/** Generated documents live alongside exact sessions; exporting never edits a session or booking. */
export function exportEndpoint(organization: string, reference: GuideReference) {
  return `${documentEndpoint(organization, reference.session, reference.revision).replace(/\/documents$/, "")}/exports`;
}
