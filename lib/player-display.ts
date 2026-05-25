import type { Position } from "./types";

/**
 * Extract up to two-letter initials from a player's name (first letter of the
 * first two whitespace-separated tokens). "Karl Svensson" -> "KS".
 */
export function getInitials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
}

/**
 * Tailwind class string for the circular avatar background + text color, keyed
 * by the player's position. Drives both the squad-bar avatar and the on-pitch
 * player token so coloring is consistent across the lineup UI.
 *
 *   GK  - outline (mid gray)
 *   DEF - primary (deep violet)
 *   MID - secondary-container (electric cyan)
 *   FWD - on-secondary-container (dark cyan)
 */
export function positionAvatarClasses(position: Position): string {
  switch (position) {
    case "GK":
      return "bg-outline text-on-tertiary";
    case "DEF":
      return "bg-primary text-on-primary";
    case "MID":
      return "bg-secondary-container text-on-secondary-container";
    case "FWD":
      return "bg-on-secondary-container text-on-secondary";
  }
}
