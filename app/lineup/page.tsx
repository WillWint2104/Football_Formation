import { getPlayers } from "@/lib/data";
import { FORMATIONS } from "@/lib/formations";
import { LineupBoard } from "@/components/lineup/LineupBoard";

export default async function LineupPage() {
  // Pre-load the roster from data/players.json via the data seam. The result
  // is intentionally unused for now — the squad bar starts empty and is built
  // via the "+ Add Player" dialog. Roster-picker UI will consume this in a
  // later milestone; calling it here keeps the seam under the prerender path
  // so we'll notice if it breaks.
  const _roster = await getPlayers();
  void _roster;

  const formation = FORMATIONS.find((f) => f.id === "442") ?? FORMATIONS[0];

  return (
    <div className="mx-auto max-w-6xl flex flex-col gap-6">
      <div>
        <h1 className="font-display text-headline-md text-on-surface">
          Lineup Builder
        </h1>
        <p className="font-mono text-label-caps uppercase text-on-surface-variant mt-1">
          {formation.name}
        </p>
      </div>
      <LineupBoard formation={formation} />
    </div>
  );
}
