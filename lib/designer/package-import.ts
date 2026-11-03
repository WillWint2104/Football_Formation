import { parseSessionPackageJson, resolvePackageDiagram, type PackageResult, type SessionPackage } from "./package";

export type PackageAttachmentSummary = { activityId: string; activityName: string; diagramIndex: number; sceneId: string; revision: number; seconds: number };
export function packageImportSummary(pkg: SessionPackage) {
  const attachments: PackageAttachmentSummary[] = pkg.document.session.activities.flatMap((activity) => activity.diagrams.map((pin, diagramIndex) => ({ activityId: activity.id, activityName: activity.name, diagramIndex, sceneId: pin.scene.id, revision: pin.scene.revision, seconds: pin.representativeSeconds })));
  return { name: pkg.document.session.name, activities: pkg.document.session.activities.length, scenes: pkg.scenes.length, namespace: pkg.sceneNamespace, attachments };
}
/** B1 owns all parsing and graph validation. No format guessing, remapping or hosted lookup. */
export function previewPackageImport(text: string): PackageResult<SessionPackage> {
  const parsed = parseSessionPackageJson(text);
  if (!parsed.ok) return parsed;
  // The parser already checks every reference. Resolve the first displayed attachment through
  // the public exact resolver too, without revalidating an 8 MiB library for all 128 summary rows.
  const first = packageImportSummary(parsed.value).attachments[0];
  if (first) {
    const resolved = resolvePackageDiagram(parsed.value, first.activityId, first.diagramIndex);
    if (!resolved.ok) return resolved;
  }
  return parsed;
}
