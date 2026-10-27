import sharp from "sharp";
import type { DocumentBrand } from "../../lib/documents/design-contracts";

/** Explicitly synthetic, code-drawn raster marks; these are never configured for a real organisation. */
export async function syntheticDocumentBrand(organizationId: string): Promise<DocumentBrand> {
  const crest = await sharp(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="90" height="120"><path fill="#173d35" d="M5 5H85V75L45 115 5 75Z"/><path fill="none" stroke="#c7a65c" stroke-width="4" d="M12 12H78V72L45 105 12 72Z"/><text x="45" y="52" text-anchor="middle" font-family="sans-serif" font-size="18" fill="white">TEST</text><text x="45" y="72" text-anchor="middle" font-family="sans-serif" font-size="10" fill="white">ONLY</text></svg>')).png().toBuffer();
  const secondaryMark = await sharp(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="180" height="40"><rect width="180" height="40" fill="#173d35"/><text x="90" y="26" text-anchor="middle" font-family="sans-serif" font-size="16" fill="white">TEST PARTNER</text></svg>')).png().toBuffer();
  return { organizationId, clubName: "SYNTHETIC REVIEW FC", secondaryIdentity: "TEST BRAND ONLY · not a real club", footer: "Synthetic Review FC · Academy coaching · TEST FIXTURE", primaryColour: "#173d35", accentColour: "#c7a65c", crest: { bytes: crest, format: "png", description: "Synthetic test crest" }, secondaryMark: { bytes: secondaryMark, format: "png", description: "Synthetic test partner mark" } };
}
