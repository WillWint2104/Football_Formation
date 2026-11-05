import type { SessionPackage } from "./package";

/** Derive a coach-facing association from exact existing pins, never invent a scene title. */
export function diagramAssociation(pkg: SessionPackage, scene: { id: string; revision: number }): string {
  const names = pkg.document.session.activities.filter(a => a.diagrams.some(d => d.scene.id === scene.id && d.scene.revision === scene.revision)).map(a => a.name);
  return [...new Set(names)].join(" / ") || "Unattached scene";
}
