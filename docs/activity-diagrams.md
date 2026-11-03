# C3 B3a — Activity diagram attachment and preview

B3a-P is committed separately at `5440a224d51588092803998004050987d01c88ac`.
B3a adds local activity attachments using B1's exact resolver, B2's repository and the existing `SceneDiagram` SVG renderer. It adds no database, package schema, tactical renderer or hosted API.

## Coaching workflow

1. Import a complete package using **Import Session & Diagrams**.
2. **Browse local plans**, review a plan and explicitly open an independent copy. Opening replaces the text draft only after confirmation; the imported source remains unchanged.
3. In the selected activity, choose **Add / replace diagram**, a compatible package, an exact scene revision and representative seconds.
4. Preview the actual renderer, then attach another diagram or explicitly replace the selected one. Activities support the existing maximum of 20 references; package-wide B1 limits still apply.
5. Switch between attached diagrams with the diagram buttons. Remove only the explicitly selected attachment.
6. Save complete plans explicitly after subsequent text edits. **Download JSON** remains the legacy reference-only format. **Download complete package** includes current valid text and all retained native scene revisions.

Reference-only drafts without an associated namespace cannot silently resolve their existing pins against an arbitrary imported package. Open the matching complete plan, or explicitly remove the unresolved references before making a new association. Packages of another namespace are excluded from the source selector of an associated plan.

## Association and save boundaries

The existing 30-day localStorage draft remains separate and keeps its existing key/format. B2 continues to own coherent complete snapshots and its two-version history. The URL's `localPlan` and `localVersion` parameters identify a local owner/version; they carry no credentials and are only restoration hints. There is no additional localStorage pointer or scene store.

First attachment to a draft without references creates a new B2 owner. It copies only the selected exact scene into the candidate. An associated plan retains its existing scene library. Namespace, native scene ID, revision, geometry and representative time are preserved. Source packages are re-read before attachment; a changed owner/hash, missing source or invalid source blocks the operation. No latest-version lookup occurs.

All pin operations build a cloned candidate from the current draft and pass it through the existing portable validator and B1 whole-package validation. B2 then performs its existing transactional owner CAS. The UI changes activity pins only after acknowledged completion and checks again that the draft and workspace have not changed. A late acknowledgement retains the saved candidate for explicit recovery instead of replacing newer edits. Incomplete coaching fields remain editable in the legacy draft; they cannot enter a complete snapshot.

localStorage and IndexedDB are **not** one atomic transaction. The original legacy draft guard is a best-effort comparison, not an atomic cross-tab lock. B2 protects complete owner snapshots transactionally. A process interruption can leave a newer complete snapshot and an older text draft, or an unassociated new owner discoverable through Browse local plans. The interface does not claim that a text autosave saved a complete package.

## Recovery

On refresh, automatic association requires both the exact expected owner version and an identical text document. Missing/invalid packages, changed owner versions and different text require deliberate recovery. Timestamps do not determine ownership.

- Download the current reference-only JSON, a verified complete snapshot and/or an in-memory complete candidate.
- Explicitly open a verified complete snapshot as a new independent owner; the source/damaged record is left intact.
- For the explicitly linked owner only, choose **Keep current text & revalidate linked diagrams**. Every current pin must resolve against that verified namespace/library through B1. Confirmation creates an independent complete copy and retains this tab's text. This is a deliberate revalidation, never automatic merging or revision substitution.
- Keep the reference-only draft and detach its association. Stored complete plans are not deleted.

Quota, interrupted writes and complete-owner CAS conflicts pause further writes. Recheck storage and choose recovery; there are no automatic retries, repairs or eviction. Explicit draft adoption rechecks the reviewed localStorage bytes after confirmation. Corrupt snapshots are usable only when B2 exposes a verified recovery snapshot; they are never silently promoted.

## Preview and scope

The selected activity uses the existing `SceneDiagram`, responsive metre projection and fit controls. **Expand diagram** opens the same exact snapshot in a native modal dialog for a larger read-only view, including on laptops. Escape closes it and browser focus returns to the invoking button. The activity editor retains its bounded scrolling frame and stable navigation rail. A query-only document lets B1 resolve an exact pin even while unrelated coaching fields are incomplete; its placeholder title is never displayed or persisted as coaching content. Native world coordinates and shared renderer colours are unchanged.

Light working panels and contextual controls are scoped to B3a. The existing shell, branding, activity rail, legacy authoring controls and printed documents remain compatible. Saved-plan snapshots and text drafts have separate status messages, with a visible warning when text differs from the complete snapshot.

The subsequent C3 checkpoints add local Tactical Editor save-and-return, the light coaching workspace and A4 printing through the shared renderer. Printed diagrams come from a verified complete local plan at their exact saved revisions and representative times. Unavailable pins retain their reference details with an explicit notice; no alternate scene is substituted. Hosted infrastructure remains separate.

While a local diagram has unsaved changes, browser Back/Forward asks before discarding it. Declining keeps the live editor and restores its URL/router state as a new history entry; this can replace the previous forward-history branch. No diagram is saved or attached by cancelling navigation. Clean saved work keeps the normal traversal behaviour, and saved candidates remain available independently of the originating attachment.
