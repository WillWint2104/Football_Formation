import Link from "next/link";
import { z } from "zod";
import { idSchema, revisionSchema } from "@/lib/domain/common";
import { EditorWorkspace } from "@/components/tactical/EditorWorkspace";
import "../calendar/calendar.css";
import "../sessions/sessions.css";
import "./editor.css";

export const metadata = { title: "2D Tactical Editor | Football Formation" };
const targetQuery = z.strictObject({ kind: z.enum(["session", "exercise", "template"]), id: idSchema, revision: z.coerce.number().pipe(revisionSchema), activity: idSchema.optional(), event: idSchema.optional(), booking: z.coerce.number().pipe(revisionSchema).optional(), diagram: z.union([z.literal("new"), z.coerce.number().int().nonnegative()]) })
  .refine((t) => t.kind === "exercise" || !!t.activity, "Activity required")
  .refine((t) => (!t.event && !t.booking) || t.kind === "session" && !!t.event && !!t.booking, "Exact booking required");
/** Resolve explicit immutable owner pins; unbound entry opens a clearly labelled practice canvas. */
export default async function TacticalEditorPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const query = await searchParams;
  if (!Object.keys(query).length) return <EditorWorkspace />;
  const parsed = targetQuery.safeParse(query);
  if (!parsed.success) return <div className="calendar-workspace"><h1>Invalid diagram reference</h1><p>No missing revision was substituted.</p><Link href="/sessions">Open sessions</Link></div>;
  const target = { ...parsed.data, diagram: parsed.data.diagram === "new" ? null : parsed.data.diagram };
  return <EditorWorkspace key={JSON.stringify(target)} target={target} />;
}
