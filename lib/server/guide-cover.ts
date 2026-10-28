import "server-only";
import { printTheme, printTokens as tokens } from "../documents/print-theme";
import { A4, PdfLayout, printColor } from "./pdf-layout";

type CoverContent = { title: string; kind: string; team: string; coaches: string; objective: string | null; focus: readonly string[]; facts: readonly (readonly [string, string])[]; venue: string };

/** Explicit cover composition. Every value comes from the exact saved guide; long text still flows without truncation. */
export function drawGuideCover(layout: PdfLayout, content: CoverContent) {
  const { brand } = layout;
  if (brand.crest) layout.image(brand.crest, A4.margin, 811, tokens.coverCrestWidth, tokens.coverCrestHeight);
  if (brand.mark) layout.image(brand.mark, A4.width - A4.margin - tokens.coverMarkWidth, 811, tokens.coverMarkWidth, tokens.coverMarkHeight);
  const left = A4.margin + (brand.crest ? tokens.coverCrestWidth + 20 : 0);
  const width = layout.width - (left - A4.margin) - (brand.mark ? tokens.coverMarkWidth + 18 : 0);
  layout.y = 800;
  layout.text(brand.name, { x: left, width, bold: true, size: 15, color: brand.primary, gap: 8 });
  if (brand.secondary) layout.text(brand.secondary, { x: left, width, size: 8.5, color: printTheme.muted });
  layout.y = Math.min(652, layout.y - 40);
  layout.text(brand.template.toUpperCase(), { size: tokens.label, bold: true, color: brand.primary, gap: 12 });
  layout.text(content.title, { size: tokens.coverTitle, bold: true, color: brand.primary, gap: 14 });
  layout.text(`${content.team} · ${content.kind}`, { size: 12, color: printTheme.muted, gap: 18 });
  layout.page.drawLine({ start: { x: A4.margin, y: layout.y }, end: { x: A4.margin + 64, y: layout.y }, color: printColor(brand.accent), thickness: 3 });
  layout.y = Math.min(410, layout.y - 32);
  if (content.objective) { layout.heading("Session brief"); layout.text(content.objective, { gap: 12 }); }
  if (content.focus.length) layout.text(`Focus · ${content.focus.join(" · ")}`, { color: printTheme.muted, gap: 12 });
  layout.y = Math.min(245, layout.y - 28);
  layout.facts(content.facts);
  if (content.venue) layout.text(content.venue, { gap: 12 });
  if (content.coaches) { layout.heading("Coaching staff"); layout.text(content.coaches); }
}
