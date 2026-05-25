export type Position = "GK" | "DEF" | "MID" | "FWD";

export type AvailabilityStatus =
  | "available"
  | "caution"
  | "injured"
  | "suspended";

export interface PlayerStats {
  goals: number;
  assists: number;
  passAccuracy: number;
  avgDistance: number;
}

export interface Player {
  id: string;
  name: string;
  jersey: number;
  position: Position;
  nationality?: string;
  contractStatus: string;
  contractYear: number;
  squadTier: string;
  availability: AvailabilityStatus;
  fitness: number;
  injury?: string;
  suspension?: string;
  stats: PlayerStats;
}

export interface FormationSlot {
  id: string;
  label: string;
  x: number;
  y: number;
}

export interface Formation {
  id: string;
  name: string;
  slots: FormationSlot[];
}
