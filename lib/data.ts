import fs from "node:fs/promises";
import path from "node:path";
import type { Player } from "./types";

/**
 * Load the squad roster from the local mock data file.
 *
 * This is the single data seam for the app — components must never read
 * `data/players.json` directly. The Supabase migration (Phase 4) will swap
 * the implementation here while keeping the signature stable.
 *
 * @throws Error with `cause` set to the underlying ENOENT / SyntaxError when
 *         the file cannot be read or parsed. Throws without `cause` when the
 *         JSON is structurally wrong (missing `players` key or not an array).
 */
export async function getPlayers(): Promise<Player[]> {
  const filePath = path.join(process.cwd(), "data", "players.json");

  let raw: string;
  try {
    raw = await fs.readFile(filePath, "utf8");
  } catch (cause) {
    throw new Error(`getPlayers: failed to read ${filePath}`, { cause });
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (cause) {
    throw new Error(`getPlayers: failed to parse ${filePath} as JSON`, {
      cause,
    });
  }

  if (
    !parsed ||
    typeof parsed !== "object" ||
    !("players" in parsed) ||
    !Array.isArray((parsed as { players: unknown }).players)
  ) {
    throw new Error(
      `getPlayers: ${filePath} did not contain the expected { players: [...] } shape`,
    );
  }

  return (parsed as { players: Player[] }).players;
}
