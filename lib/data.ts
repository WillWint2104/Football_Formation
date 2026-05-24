import fs from "node:fs/promises";
import path from "node:path";
import type { Player } from "./types";

export async function getPlayers(): Promise<Player[]> {
  const filePath = path.join(process.cwd(), "data", "players.json");
  const file = await fs.readFile(filePath, "utf8");
  const parsed = JSON.parse(file) as { players: Player[] };
  return parsed.players;
}
