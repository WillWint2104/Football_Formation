import { documentRoute } from "@/lib/server/document-route";
import type { DocumentRoute } from "@/lib/server/document-http";

export const runtime = "nodejs";
/** Generate only from an authenticated exact saved revision, never browser-supplied guide content. */
export async function POST(request: Request, context: { params: Promise<DocumentRoute> }) { return documentRoute(request, context, true); }
