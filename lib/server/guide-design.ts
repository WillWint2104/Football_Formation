import "server-only";
import { createHash } from "node:crypto";
import sharp from "sharp";
import type { PDFDocument } from "pdf-lib";
import { documentBrandSchema, documentOptionsSchema, type DocumentBrand, type DocumentOptions } from "../documents/design-contracts";
import { printTheme } from "../documents/print-theme";
import { PersistenceError } from "./errors";
import type { PageBrand } from "./pdf-layout";

export const templateLabels = { "single-activity": "Single Activity Sheet", "session-guide": "Complete Session Guide", "extended-pack": "Extended Coaching Pack" } as const;

/** Decode bounded raster bytes only; never fetch URLs, read client paths or embed SVG/active image payloads. */
async function brandImage(pdf: PDFDocument, asset: NonNullable<DocumentBrand["crest"]>) {
  try {
    const input = sharp(asset.bytes, { limitInputPixels: 1_048_576, animated: false }), metadata = await input.metadata();
    if (metadata.format !== asset.format || !metadata.width || !metadata.height || metadata.width > 1024 || metadata.height > 1024 || (metadata.pages ?? 1) !== 1) throw new Error("Unsupported raster");
    const clean = await input.rotate().png().toBuffer();
    return await pdf.embedPng(clean);
  } catch { throw new PersistenceError(400, "Club marks must be single-frame PNG/JPEG images up to 1024 pixels and 256 KiB"); }
}

/** Keep configured heading ink readable on white paper, independently of tactical team colours. */
function readableInk(hex: string) {
  const channels = [1, 3, 5].map((index) => parseInt(hex.slice(index, index + 2), 16) / 255).map((value) => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4);
  return 1.05 / (.2126 * channels[0] + .7152 * channels[1] + .0722 * channels[2] + .05) >= 4.5;
}

/** Resolve one reusable template/brand contract without mutating domain data or enabling a logo-upload service. */
export async function resolveDocumentDesign(pdf: PDFDocument, organizationId: string, activityCount: number, options: DocumentOptions, input?: DocumentBrand) {
  const selection = documentOptionsSchema.parse(options), brand = input ? documentBrandSchema.parse(input) : undefined;
  if (brand && brand.organizationId !== organizationId) throw new PersistenceError(404, "Organisation branding unavailable");
  const template = selection.template === "auto" ? activityCount <= 1 ? "single-activity" : activityCount >= 6 ? "extended-pack" : "session-guide" : selection.template;
  if (template === "single-activity" && activityCount > 1) throw new PersistenceError(400, "Single Activity Sheet requires at most one activity");
  if (selection.cover && template !== "extended-pack") throw new PersistenceError(400, "A dedicated cover is available only for Extended Coaching Pack");
  const primary = brand?.primaryColour ?? printTheme.navy;
  if (!readableInk(primary)) throw new PersistenceError(400, "Club primary colour must provide readable contrast on white paper");
  const pageBrand: PageBrand = { name: brand?.clubName ?? "FOOTBALL FORMATION", secondary: brand?.secondaryIdentity, footer: brand?.footer ?? `${brand?.clubName ?? "Football Formation"} · Coaching department`, primary, accent: brand?.accentColour ?? printTheme.gold, template: templateLabels[template],
    crest: brand?.crest ? await brandImage(pdf, brand.crest) : undefined, mark: brand?.secondaryMark ? await brandImage(pdf, brand.secondaryMark) : undefined };
  return { template, cover: selection.cover, pageBrand, provenance: { template, cover: selection.cover, brand: brand ? { organizationId, clubName: brand.clubName, secondaryIdentity: brand.secondaryIdentity, footer: brand.footer, primaryColour: primary, accentColour: pageBrand.accent,
    crestSHA256: brand.crest ? createHash("sha256").update(brand.crest.bytes).digest("hex") : null, secondaryMarkSHA256: brand.secondaryMark ? createHash("sha256").update(brand.secondaryMark.bytes).digest("hex") : null } : { default: "Football Formation" } } };
}
