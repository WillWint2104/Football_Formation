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
 *         the file cannot be read or parsed, so server-component error
 *         boundaries surface a useful message instead of a raw Node error.
 */
export async function getPlayers(): Promise<Player[]> {
  const filePath = path.join(process.cwd(), "data", "players.json");

  let raw: string;
  try {
    raw = await fs.readFile(filePath, "utf8");
  } catch (cause) {
    throw new Error(`getPlayers: failed to read ${filePath}`, { cause });
  }

  try {
    const parsed = JSON.parse(raw) as { players: Player[] };
    return parsed.players;
  } catch (cause) {
    throw new Error(`getPlayers: failed to parse ${filePath} as JSON`, {
      cause,
    });
  }
}
