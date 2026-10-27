import "server-only";
import { PDFDocument, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { printTheme } from "../documents/print-theme";
import { PersistenceError } from "./errors";

export const A4 = { width: 595.28, height: 841.89, margin: 40, bottom: 56, top: 764 };
export const printColor = (hex: string) => rgb(...[1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255) as [number, number, number]);

/** Wrap with embedded-font metrics, including long unbroken words; never clip or substitute saved text. */
export function wrapText(value: string, font: PDFFont, size: number, width: number): string[] {
  const supported = new Set(font.getCharacterSet());
  const clean = value.replace(/\r\n?/g, "\n").replace(/\t/g, "    ");
  for (const char of clean) if (char !== "\n" && !supported.has(char.codePointAt(0)!)) throw new PersistenceError(400, "The saved text contains a character unsupported by the export font");
  const lines: string[] = [];
  for (const paragraph of clean.split("\n")) {
    let line = "";
    for (const word of paragraph.split(/ +/).filter(Boolean)) {
      if (font.widthOfTextAtSize(line ? `${line} ${word}` : word, size) <= width) { line = line ? `${line} ${word}` : word; continue; }
      if (line) { lines.push(line); line = ""; }
      for (const char of word) {
        if (font.widthOfTextAtSize(line + char, size) > width && line) { lines.push(line); line = ""; }
        line += char;
      }
    }
    lines.push(line);
  }
  return lines;
}

/** A4 flow with bounded page count, measured text and repeated brand/page furniture. */
export class PdfLayout {
  page!: PDFPage;
  y = A4.top;
  readonly width = A4.width - 2 * A4.margin;
  constructor(readonly pdf: PDFDocument, readonly regular: PDFFont, readonly bold: PDFFont) { this.next(); }
  /** Add a page only when content needs it; reserve consistent header/footer margins. */
  next() {
    if (this.pdf.getPageCount() >= 80) throw new PersistenceError(413, "Guide exceeds the 80-page export limit");
    this.page = this.pdf.addPage([A4.width, A4.height]); this.y = A4.top;
    this.page.drawText("FOOTBALL FORMATION", { x: A4.margin, y: 807, size: 11, font: this.bold, color: printColor(printTheme.navy) });
    this.page.drawText("COACHING SESSION GUIDE", { x: 376, y: 808, size: 7.5, font: this.regular, color: printColor(printTheme.muted) });
    this.page.drawLine({ start: { x: A4.margin, y: 791 }, end: { x: A4.width - A4.margin, y: 791 }, color: printColor(printTheme.gold), thickness: 1.5 });
  }
  /** Keep headings and their first lines together without clipping oversized paragraphs. */
  ensure(height: number) { if (this.y - height < A4.bottom) this.next(); }
  /** Draw saved text with measured wrapping and page continuation; all coordinates are PDF points. */
  text(value: string, options: { size?: number; bold?: boolean; color?: string; x?: number; width?: number; gap?: number } = {}) {
    const size = options.size ?? 10, font = options.bold ? this.bold : this.regular, leading = size * 1.45;
    for (const line of wrapText(value, font, size, options.width ?? this.width)) {
      this.ensure(leading);
      if (line) this.page.drawText(line, { x: options.x ?? A4.margin, y: this.y - size, size, font, color: printColor(options.color ?? printTheme.ink) });
      this.y -= leading;
    }
    this.y -= options.gap ?? 7;
  }
  /** Section labels have a clear print hierarchy and cannot become orphaned page endings. */
  heading(value: string) { this.ensure(52); this.text(value, { size: 11, bold: true, color: printTheme.navy, gap: 7 }); }
  /** Lists retain every source entry, including multiline and long-word instructions. */
  list(lines: string[], ordered = false) {
    if (!lines.length) { this.text("Not specified", { color: printTheme.muted }); return; }
    lines.forEach((line, i) => this.text(`${ordered ? `${i + 1}.` : "•"} ${line}`, { gap: 5 }));
  }
  /** Compact short coaching sections into paired columns; long sections retain normal page flow. */
  notes(sections: readonly (readonly [string, string[]])[]) {
    const width = (this.width - 24) / 2;
    for (let index = 0; index < sections.length; index += 2) {
      const pair = sections.slice(index, index + 2);
      const heights = pair.map(([heading, lines]) => wrapText(heading, this.bold, 10, width).length * 14.5 + 4
        + (lines.length ? lines.map((line) => `• ${line}`) : ["Not specified"]).reduce((height, line) => height + wrapText(line, this.regular, 9.5, width).length * 13.775 + 3, 0));
      const height = Math.max(...heights);
      if (height > 240) { for (const [heading, lines] of pair) { this.heading(heading); this.list(lines); } continue; }
      this.ensure(height + 10); const top = this.y;
      pair.forEach(([heading, lines], column) => {
        this.y = top; const x = A4.margin + column * (width + 24);
        this.text(heading, { x, width, bold: true, size: 10, gap: 4, color: printTheme.navy });
        for (const line of lines.length ? lines.map((line) => `• ${line}`) : ["Not specified"]) this.text(line, { x, width, size: 9.5, gap: 3, color: lines.length ? printTheme.ink : printTheme.muted });
      });
      this.y = top - height - 10;
    }
  }
  /** Number pages after pagination is complete. */
  finish(revision: number) {
    const pages = this.pdf.getPages();
    pages.forEach((page, i) => {
      page.drawLine({ start: { x: A4.margin, y: 43 }, end: { x: A4.width - A4.margin, y: 43 }, color: printColor(printTheme.edge), thickness: .6 });
      page.drawText(`Saved session revision ${revision}  |  Football Formation`, { x: A4.margin, y: 28, size: 7.5, font: this.regular, color: printColor(printTheme.muted) });
      const value = `${i + 1} / ${pages.length}`;
      page.drawText(value, { x: A4.width - A4.margin - this.regular.widthOfTextAtSize(value, 8), y: 28, size: 8, font: this.regular, color: printColor(printTheme.muted) });
    });
  }
}
