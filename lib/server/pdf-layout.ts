import "server-only";
import { PDFDocument, rgb, type PDFFont, type PDFPage, type PDFImage } from "pdf-lib";
import { printTheme, printTokens as tokens } from "../documents/print-theme";
import { PersistenceError } from "./errors";

export const A4 = { width: 595.28, height: 841.89, margin: 40, bottom: 57, top: 765 };
export const printColor = (hex: string) => rgb(...[1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255) as [number, number, number]);
type TextStyle = { size?: number; bold?: boolean; color?: string; x?: number; width?: number; gap?: number };
export type PageBrand = { name: string; secondary?: string; footer: string; primary: string; accent: string; crest?: PDFImage; mark?: PDFImage; template: string };

/** Wrap by embedded-font metrics, retaining long words and rejecting unsupported saved glyphs explicitly. */
export function wrapText(value: string, font: PDFFont, size: number, width: number): string[] {
  const supported = new Set(font.getCharacterSet()), lines: string[] = [];
  const clean = value.replace(/\r\n?/g, "\n").replace(/\t/g, "    ");
  for (const char of clean) if (char !== "\n" && !supported.has(char.codePointAt(0)!)) throw new PersistenceError(400, "The saved text contains a character unsupported by the export font");
  for (const paragraph of clean.split("\n")) {
    let line = "";
    for (const word of paragraph.split(/ +/).filter(Boolean)) {
      if (font.widthOfTextAtSize(line ? `${line} ${word}` : word, size) <= width) { line = line ? `${line} ${word}` : word; continue; }
      if (line) { lines.push(line); line = ""; }
      for (const char of word) { if (font.widthOfTextAtSize(line + char, size) > width && line) { lines.push(line); line = ""; } line += char; }
    }
    lines.push(line);
  }
  return lines;
}

/** Shared measured flow, identity furniture and primitives for all three templates. */
export class PdfLayout {
  page!: PDFPage;
  y = A4.top;
  readonly width = A4.width - 2 * A4.margin;
  /** Longer configured footer identities reserve additional space instead of crossing the print margin. */
  get bottom() { return A4.bottom + (wrapText(this.brand.footer, this.regular, 7, this.width - 90).length - 1) * 9; }
  constructor(readonly pdf: PDFDocument, readonly regular: PDFFont, readonly bold: PDFFont, readonly brand: PageBrand, cover = false) { this.next(cover); }
  /** Contain raster marks inside reserved boxes without changing their aspect ratios. */
  image(image: PDFImage, x: number, top: number, width: number, height: number) {
    const scale = Math.min(width / image.width, height / image.height);
    this.page.drawImage(image, { x: x + (width - image.width * scale) / 2, y: top - (height + image.height * scale) / 2, width: image.width * scale, height: image.height * scale });
  }
  /** Repeat compact identity furniture; absent assets reclaim their slots for the text identity. */
  next(cover = false) {
    if (this.pdf.getPageCount() >= 80) throw new PersistenceError(413, "Guide exceeds the 80-page export limit");
    this.page = this.pdf.addPage([A4.width, A4.height]); this.y = A4.top;
    if (cover) return;
    if (this.brand.crest) this.image(this.brand.crest, A4.margin, 815, tokens.crestWidth, tokens.crestHeight);
    if (this.brand.mark) this.image(this.brand.mark, A4.width - A4.margin - tokens.markWidth, 814, tokens.markWidth, tokens.markHeight);
    const left = A4.margin + (this.brand.crest ? tokens.crestWidth + 10 : 0), available = this.width - (left - A4.margin) - (this.brand.mark ? tokens.markWidth + 12 : 0);
    const lines = wrapText(this.brand.name, this.bold, 11, available);
    lines.forEach((line, i) => this.page.drawText(line, { x: left, y: 806 - i * 13, size: 11, font: this.bold, color: printColor(this.brand.primary) }));
    const subLines = wrapText(this.brand.secondary ?? this.brand.template, this.regular, 7.5, available);
    subLines.forEach((line, i) => this.page.drawText(line, { x: left, y: 806 - lines.length * 13 - i * 10, size: 7.5, font: this.regular, color: printColor(printTheme.muted) }));
    const rule = Math.min(779, 800 - lines.length * 13 - subLines.length * 10, this.brand.crest ? 815 - tokens.crestHeight - 8 : 779, this.brand.mark ? 814 - tokens.markHeight - 8 : 779);
    this.page.drawLine({ start: { x: A4.margin, y: rule }, end: { x: A4.width - A4.margin, y: rule }, color: printColor(this.brand.accent), thickness: 2 }); this.y = rule - 14;
  }
  /** Keep related content together where possible; oversized content continues with the same furniture. */
  ensure(height: number) { if (this.y - Math.min(height, A4.top - this.bottom) < this.bottom) this.next(); }
  /** Exact height used by flow primitives and template preflight. */
  measure(value: string, options: TextStyle = {}) {
    return wrapText(value, options.bold ? this.bold : this.regular, options.size ?? tokens.body, options.width ?? this.width).length * (options.size ?? tokens.body) * tokens.leading + (options.gap ?? tokens.gap);
  }
  /** Draw every saved line without truncation or implicit text substitution. */
  text(value: string, options: TextStyle = {}) {
    const size = options.size ?? tokens.body, font = options.bold ? this.bold : this.regular, leading = size * tokens.leading;
    for (const line of wrapText(value, font, size, options.width ?? this.width)) { this.ensure(leading); if (line) this.page.drawText(line, { x: options.x ?? A4.margin, y: this.y - size, size, font, color: printColor(options.color ?? printTheme.ink) }); this.y -= leading; }
    this.y -= options.gap ?? tokens.gap;
  }
  /** Labels stay with the first two lines; empty optional sections never create placeholders. */
  heading(value: string) { this.ensure(45); this.text(value, { size: 10, bold: true, color: this.brand.primary, gap: 5 }); }
  /** Retain all structured instructions, including long or multiline entries. */
  list(lines: readonly string[], ordered = false, options: TextStyle = {}) { lines.forEach((line, i) => this.text(`${ordered ? `${i + 1}.` : "•"} ${line}`, { gap: 4, ...options })); }
  /** Measure a headed list before choosing diagram-adjacent or full-width composition. */
  sectionHeight(title: string, lines: readonly string[], width = this.width, ordered = false) {
    return this.measure(title, { bold: true, size: 10, width, gap: 5 }) + lines.reduce((height, line, i) => height + this.measure(`${ordered ? `${i + 1}.` : "•"} ${line}`, { width, gap: 4 }), 0);
  }
  /** Draw a side column only after its complete measured content is known to fit. */
  column(title: string, lines: readonly string[], x: number, width: number, ordered = false) { this.text(title, { x, width, bold: true, size: 10, color: this.brand.primary }); this.list(lines, ordered, { x, width }); }
  /** Practical logistics use equal-width measured cells, never fixed-height clipping. */
  facts(items: readonly (readonly [string, string])[]) {
    const columns = 3, gap = 14, width = (this.width - gap * (columns - 1)) / columns;
    for (let i = 0; i < items.length; i += columns) {
      const row = items.slice(i, i + columns), height = Math.max(...row.map(([key, value]) => this.measure(key.toUpperCase(), { size: tokens.label, bold: true, width: width - 10, gap: 3 }) + this.measure(value, { width: width - 10, gap: 8 })));
      this.ensure(height + 12); const start = this.y;
      this.page.drawRectangle({ x: A4.margin, y: start - height - 5, width: this.width, height: height + 10, color: printColor(printTheme.soft) });
      row.forEach(([key, value], j) => { this.y = start; const x = A4.margin + j * (width + gap) + 6; this.text(key.toUpperCase(), { x, width: width - 10, bold: true, size: tokens.label, gap: 3, color: printTheme.muted }); this.text(value, { x, width: width - 10, gap: 8 }); }); this.y = start - height - 12;
    }
  }
  /** Pair short nonempty notes; detailed notes use full-width continuation. */
  notes(input: readonly (readonly [string, readonly string[]])[]) {
    const sections = input.filter(([, lines]) => lines.length), width = (this.width - tokens.columnGap) / 2;
    for (let index = 0; index < sections.length; index += 2) {
      const pair = sections.slice(index, index + 2), height = Math.max(...pair.map(([title, lines]) => this.sectionHeight(title, lines, width)));
      if (height > 220) { for (const [title, lines] of pair) { this.heading(title); this.list(lines); } continue; }
      this.ensure(height + 8); const top = this.y;
      pair.forEach(([title, lines], column) => { this.y = top; this.column(title, lines, A4.margin + column * (width + tokens.columnGap), width); }); this.y = top - height - 10;
    }
  }
  /** Restrained identity footer and final page count; technical provenance stays in metadata. */
  finish(title: string) {
    const pages = this.pdf.getPages(), leftWidth = this.width - 90;
    const identity = wrapText(title, this.regular, 7, leftWidth - 12);
    const shortIdentity = `${identity[0]}${identity.length > 1 ? "..." : ""}`;
    pages.forEach((page, i) => {
      const footer = wrapText(this.brand.footer, this.regular, 7, leftWidth), extra = (footer.length - 1) * 9;
      page.drawLine({ start: { x: A4.margin, y: 44 + extra }, end: { x: A4.width - A4.margin, y: 44 + extra }, color: printColor(printTheme.edge), thickness: .6 });
      footer.forEach((line, n) => page.drawText(line, { x: A4.margin, y: 32 + extra - n * 9, size: 7, font: this.regular, color: printColor(printTheme.muted) }));
      page.drawText(shortIdentity, { x: A4.margin, y: 22, size: 7, font: this.regular, color: printColor(printTheme.muted) });
      const counter = `Page ${i + 1} of ${pages.length}`; page.drawText(counter, { x: A4.width - A4.margin - this.regular.widthOfTextAtSize(counter, 8), y: 31, size: 8, font: this.regular, color: printColor(printTheme.muted) });
    }); this.pdf.setKeywords(["Football Formation", title, this.brand.template]);
  }
}
