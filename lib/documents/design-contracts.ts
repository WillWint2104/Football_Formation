import { z } from "zod";
import { idSchema } from "../domain/common";

export const documentTemplateSchema = z.enum(["auto", "single-activity", "session-guide", "extended-pack"]);
export type DocumentTemplate = z.infer<typeof documentTemplateSchema>;
export const documentOptionsSchema = z.strictObject({ template: documentTemplateSchema.default("auto"), cover: z.boolean().default(false) });
export type DocumentOptions = z.input<typeof documentOptionsSchema>;
const label = z.string().trim().min(1).max(200);
const colour = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const raster = z.strictObject({ bytes: z.instanceof(Uint8Array).refine((bytes) => bytes.length > 0 && bytes.length <= 256 * 1024, "Brand image exceeds 256 KiB"), format: z.enum(["png", "jpeg"]), description: label });

/** Trusted server-side branding only. No URL, path, SVG, browser-supplied image or scene geometry belongs here. */
export const documentBrandSchema = z.strictObject({
  organizationId: idSchema, clubName: label, secondaryIdentity: label.optional(), footer: label.optional(),
  primaryColour: colour.optional(), accentColour: colour.optional(), crest: raster.optional(), secondaryMark: raster.optional(),
});
export type DocumentBrand = z.infer<typeof documentBrandSchema>;

/** Read original booking provenance from new filenames without guessing a legacy export's booking. */
export function exportBookingLabel(filename: string): string {
  const booked = /-booked-(\d{4}-\d{2}-\d{2})-r(\d+)\.pdf$/.exec(filename);
  if (booked) return `Original booking ${booked[1]} · booking revision ${booked[2]}. Saved schedule may differ from the current booking.`;
  return filename.endsWith("-unscheduled.pdf") ? "Unscheduled session export · no booking attached." : "Earlier export · booking provenance is inside the PDF; current booking match is unverified.";
}
