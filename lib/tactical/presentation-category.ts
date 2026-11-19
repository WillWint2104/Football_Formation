import type { TacticalScene } from "@/lib/domain/tactical-scene";

export type PresentationCategory = "pitch" | "grid";

/** Only the saved context or an explicit view-only choice can designate a scene. */
export function presentationCategory(
  context: TacticalScene["context"],
  viewerChoice?: PresentationCategory,
): PresentationCategory | undefined {
  if (context?.kind === "pitch") return "pitch";
  if (context?.kind === "neutral") return "grid";
  return viewerChoice;
}
