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
import { printTheme, printTokens as tokens } from "../documents/print-theme";
import type { DocumentOptions, DocumentBrand } from "../documents/design-contracts";
import { contextArea } from "../tactical/context";
import { drawScene, serializeDrawing, TACTICAL_RENDERER_VERSION, type DrawingOptions } from "../tactical/drawing";
import type { SessionActivity } from "../domain/session";
import type { TacticalScene } from "../domain/tactical-scene";
import { A4, PdfLayout, printColor } from "./pdf-layout";
import { resolveDocumentDesign } from "./guide-design";
import { drawGuideCover } from "./guide-cover";
import { PersistenceError } from "./errors";

export const PDF_RENDERER_VERSION = `${GUIDE_EXPORT_VERSION};${TACTICAL_RENDERER_VERSION}`;
type DiagramSnapshot = { activity: string; scene: { id: string; revision: number }; seconds: number };
export type ExportManifest = { session: { id: string; revision: number }; booking: { id: string; revision: number } | null; rendererVersion: string; diagrams: DiagramSnapshot[]; design: Awaited<ReturnType<typeof resolveDocumentDesign>>["provenance"] };
let fonts: Promise<Buffer[]> | undefined;

/** Load licensed bundled Inter once; no runtime font or image URL is fetched. */
function fontBytes() { return fonts ??= Promise.all(["Inter-Regular.ttf", "Inter-Bold.ttf"].map((name) => readFile(path.join(process.cwd(), "assets/pdf-fonts", name)))); }

/** Frame each explicit scene context independently; legacy scenes can still use their saved activity area. */
export function guideDiagramDrawing(scene: TacticalScene, activity: SessionActivity, seconds: number, width: number, height: number) {
  const area = contextArea(scene), rotation = scene.context?.kind === "pitch" && area.width > area.length ? 270 : 0;
  const options: DrawingOptions = { width: Math.round(width * 1.25), height: Math.round(height * 1.25), padding: 24, fit: "exercise", exerciseArea: scene.context ? area : activity.content.area ?? undefined, rotation, seconds, paths: "stage", labels: true };
  let drawing = drawScene(scene, options); if (drawing.clippedEntities) drawing = drawScene(scene, { ...options, fit: "all" });
  if (drawing.clippedEntities) throw new PersistenceError(400, "Diagram framing could not include every saved object");
  return drawing;
}

/** Rasterise only the shared exact drawing; no independent tactical geometry is introduced by print layout. */
async function diagramImage(pdf: PDFDocument, scene: TacticalScene, activity: SessionActivity, seconds: number, width: number, height: number) {
  return pdf.embedPng(await sharp(Buffer.from(serializeDrawing(guideDiagramDrawing(scene, activity, seconds, width, height))), { density: 216, limitInputPixels: 16_000_000 }).png().toBuffer());
}

/** Practical activity facts omit absent optional values while retaining explicitly unknown quantities. */
function activityFacts(activity: SessionActivity) {
  const content = activity.content;
  return [activity.durationMinutes === null ? "Untimed activity" : `${activity.durationMinutes} minutes`, ...(content.playerCount === null ? [] : [`${content.playerCount} players`]), ...(content.area ? [`${content.area.length} × ${content.area.width} m`] : [])].join(" · ");
}

/** One composition for all activity types: measured diagram/text pairs or a wide pitch above its instructions. */
async function activitySection(layout: PdfLayout, bundle: DomainBundle, activity: SessionActivity, index: number, count: number, titleAlreadyShown: boolean) {
  const content = activity.content, notes = [["Coaching points", content.coachingPoints], ["Progressions", content.progressions], ["Regressions", content.regressions], ["Variations", content.variations]] as const;
  const sideSize = count > 1 && count < 6 ? 200 : 242, sideWidth = layout.width - sideSize - tokens.columnGap;
  const instructionsSideHeight = content.instructions.length ? layout.sectionHeight("How to run", content.instructions, sideWidth, true) : 0;
  const instructionHeight = content.instructions.length ? layout.sectionHeight("How to run", content.instructions, layout.width, true) : 0;
  const nonemptyNotes = notes.filter(([, values]) => values.length), notesHeight = nonemptyNotes.reduce((height, [title, values]) => height + layout.sectionHeight(title, values, sideWidth) + 6, 0);
  const equipment = content.equipment.map((item) => `${item.name}: ${item.quantity === null ? "quantity unknown" : item.quantity}`).join(" · ");
  const facts = `${activityFacts(activity)}${!content.diagrams.length && equipment ? ` · Equipment · ${equipment}` : ""}`;
  const label = `${String(index + 1).padStart(2, "0")} / ${count} · ${activity.role.replaceAll("-", " ").toUpperCase()}`;
  const equipmentHeight = equipment && content.diagrams.length ? layout.measure(`Equipment · ${equipment}`) : 0;
  const headingHeight = titleAlreadyShown ? layout.measure(`${label} · ${facts}`) + equipmentHeight + 14
    : layout.measure(`${String(index + 1).padStart(2, "0")} · ${content.title}`, { bold: true, size: tokens.activity }) + layout.measure(`${activity.role.replaceAll("-", " ")} · ${facts}`) + equipmentHeight + 14;
  // Preflight related content; do not impose a fresh page simply because a diagram is present.
  const firstScene = content.diagrams[0] ? bundle.scenes.find((scene) => scene.id === content.diagrams[0].scene.id && scene.revision === content.diagrams[0].scene.revision) : undefined;
  const firstArea = firstScene ? contextArea(firstScene) : null;
  const firstSquare = firstScene?.context?.kind === "neutral" && firstArea && firstArea.length / firstArea.width >= .8 && firstArea.length / firstArea.width <= 1.3;
  const firstSide = firstSquare && ((instructionsSideHeight > 0 && instructionsSideHeight <= sideSize) || (notesHeight > 0 && notesHeight <= sideSize));
  const firstHeight = firstSide ? sideSize : 250;
  const minimum = headingHeight + (content.diagrams.length ? firstHeight + (content.diagrams.length > 1 || content.diagrams[0].representativeSeconds ? 30 : 10) : Math.min(80, instructionHeight));
  layout.ensure(minimum);
  layout.page.drawLine({ start: { x: A4.margin, y: layout.y }, end: { x: A4.width - A4.margin, y: layout.y }, color: printColor(printTheme.edge), thickness: .7 }); layout.y -= 10;
  if (titleAlreadyShown) layout.text(`${label} · ${facts}`, { bold: true, color: layout.brand.primary, gap: 5 });
  else {
    layout.text(`${String(index + 1).padStart(2, "0")} · ${content.title}`, { size: tokens.activity, bold: true, color: layout.brand.primary, gap: 5 });
    layout.text(`${activity.role.replaceAll("-", " ")} · ${facts}`, { bold: true, color: printTheme.muted, gap: 5 });
  }
  if (equipment && content.diagrams.length) layout.text(`Equipment · ${equipment}`, { gap: 10 });
  let instructionsDrawn = false, notesDrawn = false;
  for (const [n, pin] of content.diagrams.entries()) {
    const scene = bundle.scenes.find((candidate) => candidate.id === pin.scene.id && candidate.revision === pin.scene.revision)!, area = contextArea(scene);
    const square = scene.context?.kind === "neutral" && area.length / area.width >= .8 && area.length / area.width <= 1.3;
    const sideInstructions = square && n === 0 && instructionsSideHeight > 0 && instructionsSideHeight <= sideSize;
    const sideNotes = square && n === 0 && !sideInstructions && notesHeight > 0 && notesHeight <= sideSize;
    const side = sideInstructions || sideNotes, width = side ? sideSize : layout.width;
    const ratio = scene.context?.kind === "pitch" && area.width > area.length ? area.width / area.length : area.length / area.width;
    const caption = content.diagrams.length > 1 || pin.representativeSeconds > 0;
    const height = side ? sideSize : Math.min(caption ? 226 : 250, Math.max(175, width / ratio));
    const previous = layout.page; layout.ensure(height + (caption ? 30 : 10));
    if (layout.page !== previous) {
      layout.text(`${content.title} · continued`, { bold: true, size: 12, gap: 5 }); layout.text(activityFacts(activity), { color: printTheme.muted, gap: 10 });
      if (instructionsDrawn || notesDrawn) layout.text(`${instructionsDrawn ? "Delivery instructions" : ""}${instructionsDrawn && notesDrawn ? " and coaching notes" : notesDrawn ? "Coaching notes" : ""}: see Figure 1.`, { color: printTheme.muted, gap: 10 });
    }
    const top = layout.y;
    const image = await diagramImage(layout.pdf, scene, activity, pin.representativeSeconds, width, height);
    layout.page.drawImage(image, { x: A4.margin, y: top - height, width, height });
    if (sideInstructions) {
      layout.column("How to run", content.instructions, A4.margin + width + tokens.columnGap, sideWidth, true); instructionsDrawn = true;
      if (instructionsSideHeight + notesHeight + 8 <= height) {
        layout.y -= 8;
        for (const [title, values] of nonemptyNotes) { layout.column(title, values, A4.margin + width + tokens.columnGap, sideWidth); layout.y -= 6; }
        notesDrawn = nonemptyNotes.length > 0;
      }
    }
    if (sideNotes) { for (const [title, values] of nonemptyNotes) { layout.column(title, values, A4.margin + width + tokens.columnGap, sideWidth); layout.y -= 6; } notesDrawn = true; }
    layout.y = top - height - 10;
    if (caption) layout.text(`Figure ${n + 1}${content.diagrams.length > 1 && scene.context ? ` · ${area.length} × ${area.width} m` : ""}${pin.representativeSeconds ? ` · ${pin.representativeSeconds}s snapshot` : ""}`, { size: 7.5, color: printTheme.muted, gap: 10 });
  }
  if (content.instructions.length && !instructionsDrawn) { layout.heading("How to run"); layout.list(content.instructions, true); }
  if (!notesDrawn) layout.notes(notes);
  if (count <= 1 || count >= 6) layout.y -= 10;
}

/** Exact guide export with one shared template engine, natural pagination and machine-readable provenance. */
export async function createGuidePdf(input: DomainBundle, reference: GuideReference, options: DocumentOptions = {}, brand?: DocumentBrand) {
  const bundle = domainBundleSchema.parse(input), ref = guideReferenceSchema.parse(reference), resolved = resolveGuide(bundle, ref);
  if (!resolved) throw new PersistenceError(404, "Exact guide revision unavailable");
  const { session, event } = resolved, activities = session.content.activities;
  const diagramCount = activities.reduce((count, activity) => count + activity.content.diagrams.length, 0);
  if (activities.length > 100 || diagramCount > 32 || JSON.stringify(session).length > 200_000) throw new PersistenceError(413, "Guide exceeds export complexity limits");
  const pdf = await PDFDocument.create(); pdf.registerFontkit(fontkit);
  const design = await resolveDocumentDesign(pdf, bundle.organizationId, activities.length, options, brand);
  const [regular, bold] = await fontBytes(), layout = new PdfLayout(pdf, await pdf.embedFont(regular, { subset: true }), await pdf.embedFont(bold, { subset: true }), design.pageBrand, design.cover);
  const manifest: ExportManifest = { session: { id: session.id, revision: session.revision }, booking: event ? { id: event.id, revision: event.revision } : null, rendererVersion: PDF_RENDERER_VERSION,
    diagrams: activities.flatMap((a) => a.content.diagrams.map((d) => ({ activity: a.id, scene: { ...d.scene }, seconds: d.representativeSeconds }))), design: design.provenance };
  pdf.setTitle(session.content.title); pdf.setAuthor(design.pageBrand.name); pdf.setCreator(PDF_RENDERER_VERSION); pdf.setProducer(PDF_RENDERER_VERSION); pdf.setLanguage("en-AU"); pdf.setSubject(JSON.stringify(manifest));
  const team = bundle.teams.find((candidate) => candidate.id === session.teamId)!;
  const teamLabel = [team.name, team.ageGroup].filter(Boolean).join(" · ");
  const coaches = session.coaches.map((assignment) => `${bundle.coaches.find((coach) => coach.id === assignment.coachId)!.displayName} (${assignment.role})`).join(" · ");
  const start = event?.startsAt ? localParts(event.startsAt, event.timeZone) : null, end = event?.endsAt ? localParts(event.endsAt, event.timeZone) : null;
  const total = activityTotals(activities), facts: [string, string][] = [];
  if (event) facts.push(["Date", new Intl.DateTimeFormat("en-AU", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${event.localDate}T12:00:00Z`))]);
  if (event && start) facts.push(["Booked window", `${start.time}${end ? ` - ${end.date !== start.date ? `${end.date} ` : ""}${end.time}` : ""}${event.endsAt ? ` (${(Date.parse(event.endsAt) - Date.parse(event.startsAt!)) / 60_000} min)` : ""}\n${event.timeZone}`]);
  else if (event) facts.push(["Booked window", "Time to be confirmed"]);
  facts.push(["Planned activities", `${total.minutes} known min${total.unknown ? ` + ${total.unknown} untimed` : ""}`]);
  const venue = [event?.venue ? `Venue: ${event.venue}` : "", event?.areaLabel ? `Field area: ${event.areaLabel}` : ""].filter(Boolean).join(" · ");
  if (design.cover) {
    drawGuideCover(layout, { title: session.content.title, kind: sessionLabels[session.content.kind], team: teamLabel, coaches, objective: session.content.objective, focus: session.content.focus, facts, venue });
  } else {
    layout.text(sessionLabels[session.content.kind].toUpperCase(), { size: tokens.label, bold: true, color: layout.brand.primary, gap: 5 });
    layout.text(session.content.title, { size: tokens.title, bold: true, color: layout.brand.primary, gap: 8 });
    layout.text(teamLabel, { bold: true, gap: 5 });
    if (coaches) layout.text(coaches, { gap: 12 });
    layout.facts(facts);
    if (venue) layout.text(venue, { gap: 10 });
    if (session.content.objective) { layout.heading("Session objective"); layout.text(session.content.objective, { gap: 8 }); }
    if (session.content.focus.length) layout.text(`Focus · ${session.content.focus.join(" · ")}`, { gap: 10, color: printTheme.muted });
    if (activities.length > 1) {
      layout.heading("Session sequence");
      for (const [index, activity] of activities.entries()) layout.text(`${String(index + 1).padStart(2, "0")}  ${activity.content.title} · ${activity.durationMinutes === null ? "Untimed" : `${activity.durationMinutes} min`}`, { gap: 3 });
      layout.y -= 8;
    }
  }
  if (!activities.length) layout.text("No activities in this saved revision.");
  if (design.cover && activities.length) layout.next();
  for (const [index, activity] of activities.entries()) await activitySection(layout, bundle, activity, index, activities.length, activities.length === 1 && activity.content.title === session.content.title && !design.cover);
  layout.finish(session.content.title);
  const bytes = new Uint8Array(await pdf.save());
  if (bytes.length > MAX_PDF_BYTES) throw new PersistenceError(413, "Generated PDF exceeds the private 3 MiB document limit");
  const booking = event ? `booked-${event.localDate}-r${event.revision}` : "unscheduled";
  return { bytes, manifest, pageCount: pdf.getPageCount(), filename: `football-session-${session.id.slice(0, 80)}-r${session.revision}-${booking}.pdf` };
}
