import "server-only";
import { PDFArray, PDFDict, PDFDocument, PDFName, PDFRawStream } from "pdf-lib";
import { MAX_PDF_BYTES, pdfFilenameSchema } from "../documents/contracts";
import { PersistenceError } from "./errors";

/** Bound actual streamed bytes, regardless of a missing or dishonest Content-Length. */
export async function readPdf(request: Request): Promise<Uint8Array> {
  if (request.headers.get("content-type")?.split(";")[0].trim() !== "application/pdf")
    throw new PersistenceError(415, "Choose an application/pdf file");
  if (Number(request.headers.get("content-length")) > MAX_PDF_BYTES) throw new PersistenceError(413, "PDF exceeds 3 MiB");
  const reader = request.body?.getReader();
  if (!reader) throw new PersistenceError(400, "Choose a PDF file");
  const chunks: Uint8Array[] = []; let length = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read(); if (done) break;
      length += value.byteLength;
      if (length > MAX_PDF_BYTES) { await reader.cancel(); throw new PersistenceError(413, "PDF exceeds 3 MiB"); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(length); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return bytes;
}

/** Validate signatures and structure; reject encryption and active/embedded content, without claiming antivirus scanning. */
export async function validatePdf(filename: string, bytes: Uint8Array): Promise<void> {
  if (!pdfFilenameSchema.safeParse(filename).success) throw new PersistenceError(400, "Use a PDF filename without paths");
  if (!bytes.length || bytes.length > MAX_PDF_BYTES) throw new PersistenceError(413, "Choose a PDF up to 3 MiB");
  const head = Buffer.from(bytes.subarray(0, 12)).toString("latin1");
  const tail = Buffer.from(bytes.subarray(Math.max(0, bytes.length - 1024))).toString("latin1");
  if (!/^%PDF-(1\.[0-7]|2\.0)[\r\n]/.test(head) || !/%%EOF\s*$/.test(tail)) throw new PersistenceError(400, "Invalid PDF signature or incomplete file");
  try {
    const pdf = await PDFDocument.load(bytes, { throwOnInvalidObject: true, updateMetadata: false });
    if (pdf.isEncrypted || pdf.getPageCount() < 1 || pdf.getPageCount() > 500) throw new Error("Unsupported PDF");
    const objects = pdf.context.enumerateIndirectObjects();
    if (objects.length > 20_000) throw new Error("Too many objects");
    const visited = new Set<unknown>();
    const prohibited = new Set(["JavaScript", "JS", "AA", "OpenAction", "Launch", "EmbeddedFiles", "EmbeddedFile", "Filespec", "RichMedia", "XFA", "AcroForm", "SubmitForm", "ImportData", "GoToR", "GoToE", "URI"]);
    const inspect = (object: unknown, depth = 0) => {
      if (visited.has(object)) return; visited.add(object);
      if (depth > 100) throw new Error("Nested PDF");
      if (object instanceof PDFName && prohibited.has(object.decodeText())) throw new Error("Active PDF");
      if (object instanceof PDFRawStream) inspect(object.dict, depth + 1);
      else if (object instanceof PDFDict) for (const [key, value] of object.entries()) { inspect(key, depth + 1); inspect(value, depth + 1); }
      else if (object instanceof PDFArray) for (const value of object.asArray()) inspect(value, depth + 1);
    };
    for (const [, object] of objects) inspect(object);
  } catch { throw new PersistenceError(400, "PDF is unreadable, encrypted, too complex or contains unsupported active content"); }
}
