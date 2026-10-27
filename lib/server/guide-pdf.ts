import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import fontkit from "@pdf-lib/fontkit";
import sharp from "sharp";
import { PDFDocument } from "pdf-lib";
import { domainBundleSchema, type DomainBundle } from "../domain/validation";
import { resolveGuide } from "../coaching/guide";
import { activityTotals } from "../coaching/sessions";
import { localParts, sessionLabels } from "../calendar/schedule";
import { guideReferenceSchema, MAX_PDF_BYTES, type GuideReference } from "../documents/contracts";
import { GUIDE_EXPORT_VERSION } from "../documents/export-contracts";
import { printTheme } from "../documents/print-theme";
import { contextArea } from "../tactical/context";
import { drawScene, serializeDrawing, TACTICAL_RENDERER_VERSION, type DrawingOptions } from "../tactical/drawing";
import type { SessionActivity } from "../domain/session";
import type { TacticalScene } from "../domain/tactical-scene";
import { A4, PdfLayout, wrapText } from "./pdf-layout";
import { PersistenceError } from "./errors";

export const PDF_RENDERER_VERSION = `${GUIDE_EXPORT_VERSION};${TACTICAL_RENDERER_VERSION}`;
type DiagramSnapshot = { activity: string; scene: { id: string; revision: number }; seconds: number };
export type ExportManifest = { session: { id: string; revision: number }; booking: { id: string; revision: number } | null; rendererVersion: string; diagrams: DiagramSnapshot[] };
let fonts: Promise<Buffer[]> | undefined;

/** Load licensed, bundled Inter once; no runtime font or image URL is fetched. */
function fontBytes() {
  return fonts ??= Promise.all(["Inter-Regular.ttf", "Inter-Bold.ttf"].map((name) => readFile(path.join(process.cwd(), "assets/pdf-fonts", name))));
}

/** Render the exact saved scene/time using the web guide's shared SVG engine, then rasterise at print resolution. */
async function diagramImage(pdf: PDFDocument, scene: TacticalScene, activity: SessionActivity, seconds: number, width: number, height: number) {
  const area = contextArea(scene), rotation = scene.context?.kind === "pitch" && area.width > area.length ? 270 : 0;
  const options: DrawingOptions = { width: Math.round(width * 1.25), height: Math.round(height * 1.25), padding: 24, fit: "exercise", exerciseArea: activity.content.area ?? undefined, rotation, seconds, paths: "stage", labels: true };
  let drawing = drawScene(scene, options);
  if (drawing.clippedEntities) drawing = drawScene(scene, { ...options, fit: "all" });
  if (drawing.clippedEntities) throw new PersistenceError(400, "Diagram framing could not include every saved object");
  const svg = serializeDrawing(drawing);
  const png = await sharp(Buffer.from(svg), { density: 216, limitInputPixels: 16_000_000 }).png().toBuffer();
  return pdf.embedPng(png);
}

/** Complete, exact guide export with adaptive diagrams and measured, multipage text; no coaching content is invented. */
export async function createGuidePdf(input: DomainBundle, reference: GuideReference) {
  const bundle = domainBundleSchema.parse(input), ref = guideReferenceSchema.parse(reference), resolved = resolveGuide(bundle, ref);
  if (!resolved) throw new PersistenceError(404, "Exact guide revision unavailable");
  const { session, event } = resolved, activities = session.content.activities;
  const diagramCount = activities.reduce((count, activity) => count + activity.content.diagrams.length, 0);
  if (activities.length > 100 || diagramCount > 32 || JSON.stringify(session).length > 200_000) throw new PersistenceError(413, "Guide exceeds export complexity limits");
  const pdf = await PDFDocument.create(); pdf.registerFontkit(fontkit);
  const [regular, bold] = await fontBytes();
  const layout = new PdfLayout(pdf, await pdf.embedFont(regular, { subset: true }), await pdf.embedFont(bold, { subset: true }));
  const manifest: ExportManifest = { session: { id: session.id, revision: session.revision }, booking: event ? { id: event.id, revision: event.revision } : null,
    rendererVersion: PDF_RENDERER_VERSION, diagrams: activities.flatMap((a) => a.content.diagrams.map((d) => ({ activity: a.id, scene: { ...d.scene }, seconds: d.representativeSeconds }))) };
  pdf.setTitle(session.content.title); pdf.setAuthor("Football Formation"); pdf.setCreator(PDF_RENDERER_VERSION); pdf.setProducer(PDF_RENDERER_VERSION); pdf.setLanguage("en-AU");
  pdf.setSubject(JSON.stringify(manifest)); pdf.setKeywords(["Football Formation", "coaching guide", PDF_RENDERER_VERSION]);
  layout.text(sessionLabels[session.content.kind].toUpperCase(), { size: 9, bold: true, color: printTheme.muted });
  layout.text(session.content.title, { size: 25, bold: true, color: printTheme.navy, gap: 16 });
  const start = event?.startsAt ? localParts(event.startsAt, event.timeZone) : null, end = event?.endsAt ? localParts(event.endsAt, event.timeZone) : null;
  layout.text(`Team: ${bundle.teams.find((team) => team.id === session.teamId)!.name}`, { bold: true });
  layout.text(event ? `Schedule: ${event.localDate} | ${start?.time ?? "Time TBC"}${end ? ` - ${end.date !== start?.date ? `${end.date} ` : ""}${end.time}` : ""} | ${event.timeZone} | ${event.status}` : "Schedule: Unscheduled plan");
  layout.text(`Venue: ${event?.venue ?? "Not specified"} | Field area: ${event?.areaLabel ?? "Not specified"}`);
  layout.text(`Coaches: ${session.coaches.map((assignment) => `${bundle.coaches.find((coach) => coach.id === assignment.coachId)!.displayName} (${assignment.role})`).join("; ") || "Unassigned"}`);
  const total = activityTotals(activities);
  layout.text(`Planned activities: ${total.minutes} known minutes; ${total.unknown} untimed activities`, { color: printTheme.muted, gap: 16 });
  layout.heading("Session objective"); layout.text(session.content.objective ?? "Not specified");
  layout.heading("Session focus"); layout.list(session.content.focus);
  layout.heading("Session sequence");
  if (!activities.length) layout.text("No activities in this saved revision.");
  for (const [i, activity] of activities.entries()) layout.text(`${String(i + 1).padStart(2, "0")}  ${activity.content.title} | ${activity.durationMinutes === null ? "Untimed" : `${activity.durationMinutes} min`}`);
  layout.heading("Export provenance");
  layout.text(`Session: ${session.id} @ ${session.revision}`, { size: 8, color: printTheme.muted });
  layout.text(event ? `Booking: ${event.id} @ ${event.revision}` : "Booking: none (unscheduled plan)", { size: 8, color: printTheme.muted });
  layout.text(`Renderer / exporter: ${PDF_RENDERER_VERSION}`, { size: 8, color: printTheme.muted });

  for (const [i, activity] of activities.entries()) {
    const content = activity.content;
    // Illustrated activities get a clean start; short unillustrated activities flow together.
    if (content.diagrams.length || layout.y < 320 || i === 0) layout.next(); else { layout.y -= 14; layout.ensure(180); }
    layout.text(`${String(i + 1).padStart(2, "0")} / ${activities.length}  |  ${activity.role.replaceAll("-", " ").toUpperCase()}`, { size: 8, color: printTheme.muted });
    layout.text(content.title, { size: 19, bold: true, color: printTheme.navy });
    layout.text(activity.durationMinutes === null ? "Duration: Untimed" : `Duration: ${activity.durationMinutes} minutes`, { bold: true, color: printTheme.muted, gap: 12 });
    const facts = [`Participants: ${content.playerCount ?? "Not specified"}`, `Area: ${content.area ? `${content.area.length} × ${content.area.width} m` : "Not specified"}`,
      ...(content.area ? [`Origin: ${content.area.origin.x}, ${content.area.origin.y} m`] : []), "Equipment:", ...(content.equipment.length ? content.equipment.map((item) => `${item.name}: ${item.quantity ?? "Not specified"}`) : ["Not specified"])];
    let factsDrawn = false;
    for (const [n, pin] of content.diagrams.entries()) {
      const scene = bundle.scenes.find((candidate) => candidate.id === pin.scene.id && candidate.revision === pin.scene.revision)!;
      const area = contextArea(scene), square = scene.context?.kind === "neutral" && area.length / area.width >= .8 && area.length / area.width <= 1.3;
      const instructionLines = content.instructions.reduce((count, value) => count + wrapText(value, layout.regular, 10, layout.width).length, 0);
      const figureSize = instructionLines > 10 ? 190 : 300, sideWidth = layout.width - figureSize - 20;
      const factHeight = facts.reduce((h, value) => h + wrapText(value, layout.regular, 10, sideWidth).length * 14.5 + 7, 0);
      const side = square && n === 0 && factHeight <= figureSize - 18, width = side ? figureSize : layout.width;
      const ratio = scene.context?.kind === "pitch" && area.width > area.length ? area.width / area.length : area.length / area.width;
      const height = side ? figureSize : Math.min(figureSize, Math.max(210, width / ratio));
      layout.ensure(height + 65);
      const image = await diagramImage(pdf, scene, activity, pin.representativeSeconds, width, height), top = layout.y;
      layout.page.drawImage(image, { x: A4.margin, y: top - height, width, height });
      if (side) {
        const x = A4.margin + figureSize + 20;
        layout.text("SETUP INFORMATION", { x, width: sideWidth, bold: true, size: 9, color: printTheme.navy, gap: 12 });
        for (const value of facts) layout.text(value, { x, width: sideWidth });
        factsDrawn = true;
      }
      layout.y = top - height - 8;
      layout.text(`Diagram ${n + 1} | Scene ${pin.scene.id} @ ${pin.scene.revision} | Snapshot ${pin.representativeSeconds}s`, { size: 7.5, color: printTheme.muted, gap: 12 });
    }
    if (!factsDrawn) {
      layout.heading("Setup information & equipment");
      layout.text(facts.slice(0, content.area ? 3 : 2).join(" | "));
      layout.text(`Equipment: ${content.equipment.length ? content.equipment.map((item) => `${item.name}: ${item.quantity ?? "Not specified"}`).join("; ") : "Not specified"}`);
    }
    if (!content.diagrams.length) layout.text("No diagram attached to this activity.", { color: printTheme.muted });
    layout.heading("Setup & delivery instructions"); layout.list(content.instructions, true);
    layout.notes([["Coaching points", content.coachingPoints], ["Progressions", content.progressions], ["Regressions", content.regressions], ["Variations", content.variations]]);
  }
  layout.finish(session.revision);
  const bytes = new Uint8Array(await pdf.save());
  if (bytes.length > MAX_PDF_BYTES) throw new PersistenceError(413, "Generated PDF exceeds the private 3 MiB document limit");
  return { bytes, manifest, pageCount: pdf.getPageCount(), filename: `football-session-${session.id}-r${session.revision}.pdf` };
}
