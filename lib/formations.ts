import type { Formation } from "./types";

/**
 * Pitch coordinate convention (horizontal orientation).
 *
 *   x = 0    defensive end / goalkeeper side (LEFT edge of pitch)
 *   x = 100  attacking end / opponent's goal (RIGHT edge of pitch)
 *   y = 0    top touchline    — team's LEFT flank (LB, LM, LW)
 *   y = 100  bottom touchline — team's RIGHT flank (RB, RM, RW)
 *
 * Reference x bands for each role-class:
 *   GK            ~  5
 *   Defenders     ~ 20-25
 *   Midfielders   ~ 45-55
 *   Attackers     ~ 80-90
 *
 * Coordinates are percentages so PitchCanvas can place tokens with
 * `left: x%` / `top: y%` regardless of the pitch's pixel size.
 */
export const FORMATIONS: Formation[] = [
  {
    id: "433-attack",
    name: "4-3-3 Attack",
    slots: [
      { id: "gk", label: "GK", x: 5, y: 50 },
      { id: "lb", label: "LB", x: 22, y: 12 },
      { id: "lcb", label: "CB", x: 22, y: 38 },
      { id: "rcb", label: "CB", x: 22, y: 62 },
      { id: "rb", label: "RB", x: 22, y: 88 },
      { id: "cdm", label: "CDM", x: 40, y: 50 },
      { id: "lcm", label: "CM", x: 55, y: 30 },
      { id: "rcm", label: "CM", x: 55, y: 70 },
      { id: "lw", label: "LW", x: 85, y: 18 },
      { id: "st", label: "ST", x: 90, y: 50 },
      { id: "rw", label: "RW", x: 85, y: 82 },
    ],
  },
  {
    id: "442",
    name: "4-4-2",
    slots: [
      { id: "gk", label: "GK", x: 5, y: 50 },
      { id: "lb", label: "LB", x: 22, y: 12 },
      { id: "lcb", label: "CB", x: 22, y: 38 },
      { id: "rcb", label: "CB", x: 22, y: 62 },
      { id: "rb", label: "RB", x: 22, y: 88 },
      { id: "lm", label: "LM", x: 52, y: 12 },
      { id: "lcm", label: "CM", x: 52, y: 38 },
      { id: "rcm", label: "CM", x: 52, y: 62 },
      { id: "rm", label: "RM", x: 52, y: 88 },
      { id: "ls", label: "ST", x: 82, y: 38 },
      { id: "rs", label: "ST", x: 82, y: 62 },
    ],
  },
  {
    id: "433-defensive",
    name: "4-3-3 Defensive",
    slots: [
      { id: "gk", label: "GK", x: 5, y: 50 },
      { id: "lb", label: "LB", x: 22, y: 12 },
      { id: "lcb", label: "CB", x: 22, y: 38 },
      { id: "rcb", label: "CB", x: 22, y: 62 },
      { id: "rb", label: "RB", x: 22, y: 88 },
      { id: "lcdm", label: "CDM", x: 42, y: 35 },
      { id: "rcdm", label: "CDM", x: 42, y: 65 },
      { id: "cam", label: "CAM", x: 62, y: 50 },
      { id: "lw", label: "LW", x: 85, y: 18 },
      { id: "st", label: "ST", x: 90, y: 50 },
      { id: "rw", label: "RW", x: 85, y: 82 },
    ],
  },
  {
    id: "352",
    name: "3-5-2",
    slots: [
      { id: "gk", label: "GK", x: 5, y: 50 },
      { id: "lcb", label: "CB", x: 24, y: 22 },
      { id: "cb", label: "CB", x: 20, y: 50 },
      { id: "rcb", label: "CB", x: 24, y: 78 },
      { id: "lwb", label: "LWB", x: 45, y: 8 },
      { id: "rwb", label: "RWB", x: 45, y: 92 },
      { id: "lcm", label: "CM", x: 50, y: 35 },
      { id: "rcm", label: "CM", x: 50, y: 65 },
      { id: "cam", label: "CAM", x: 65, y: 50 },
      { id: "ls", label: "ST", x: 85, y: 38 },
      { id: "rs", label: "ST", x: 85, y: 62 },
    ],
  },
];
