import { Activity, CircleDot, Dumbbell, FlaskConical, Layers, Shield, Target, Workflow } from "lucide-react";
import type { SessionKind } from "@/lib/domain/session";

/** Compact, consistent type symbols supplement the written labels and colour cues. */
export function SessionTypeIcon({ kind }: { kind: SessionKind }) {
  const Icon = { conditioning: Dumbbell, possession: CircleDot, goalkeeper: Shield,
    technical: Target, tactical: Workflow, recovery: Activity, testing: FlaskConical,
    combined: Layers, other: Target }[kind];
  return <Icon size={16} aria-hidden="true" />;
}
