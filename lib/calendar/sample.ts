import { domainBundleSchema, type DomainBundle } from "../domain/validation";
import type { SessionKind } from "../domain/session";
import { scheduleChange, wallTimeCandidates } from "./schedule";

/** Synthetic, in-memory examples only. These are never automatically sent to a saved organisation. */
export function sampleCalendar(): DomainBundle {
  let bundle: DomainBundle = { format: "football-formation-domain", schemaVersion: "1.0", organizationId: "illustrative-club",
    teams: [{ schemaVersion: "1.0", organizationId: "illustrative-club", id: "first-team", name: "First Team", ageGroup: null },
      { schemaVersion: "1.0", organizationId: "illustrative-club", id: "youth-team", name: "U18 Squad", ageGroup: "U18" }],
    coaches: [{ schemaVersion: "1.0", organizationId: "illustrative-club", id: "coach-carter", displayName: "A. Carter", teamIds: ["first-team", "youth-team"], membershipId: null },
      { schemaVersion: "1.0", organizationId: "illustrative-club", id: "coach-lopez", displayName: "M. Lopez", teamIds: ["first-team"], membershipId: null }],
    events: [], sessions: [], templates: [], exercises: [], scenes: [], documents: [] };
  const entries: [number, string, SessionKind, string, string][] = [
    [2, "Intervals & acceleration", "conditioning", "10:00", "11:00"],
    [3, "Rondos & Positional Play", "possession", "10:00", "11:20"],
    [3, "GK handling & distribution", "goalkeeper", "11:30", "12:15"],
    [4, "Defensive organisation", "tactical", "10:00", "11:15"],
    [5, "Preseason baseline testing", "testing", "09:00", "10:30"],
    [6, "First touch & finishing", "technical", "10:00", "11:00"],
    [9, "Mobility & recovery", "recovery", "09:00", "09:45"],
    [10, "Build through the thirds", "possession", "10:00", "11:15"],
    [12, "Pressing triggers", "tactical", "10:00", "11:15"],
    [16, "Running mechanics", "conditioning", "10:00", "11:00"],
    [17, "Small-sided combinations", "combined", "10:00", "11:20"],
    [18, "Goalkeeper reactions", "goalkeeper", "10:00", "11:00"],
    [20, "Training review", "other", "10:00", "10:30"],
    [23, "Mobility & circulation", "recovery", "09:00", "09:45"],
    [24, "Possession under pressure", "possession", "10:00", "11:20"],
    [26, "Game scenarios", "tactical", "10:00", "11:15"],
    [30, "Testing follow-up", "testing", "09:00", "10:00"],
  ];
  let identity = 0;
  for (const [day, title, kind, start, end] of entries) {
    const date = `2026-11-${String(day).padStart(2, "0")}`;
    bundle = scheduleChange(bundle, { title, kind, teamId: "first-team", coachId: kind === "goalkeeper" ? "coach-lopez" : "coach-carter",
      date, start, endDate: date, end, timeZone: "Australia/Sydney", startInstant: wallTimeCandidates(date, start, "Australia/Sydney")[0],
      endInstant: wallTimeCandidates(date, end, "Australia/Sydney")[0], venue: "Training Ground A", areaLabel: kind === "goalkeeper" ? "GK area" : "Zone B" },
      undefined, () => `sample-${++identity}`).bundle;
  }
  const possession = bundle.sessions.find((s) => s.content.title === "Rondos & Positional Play")!;
  possession.content.objective = "Improve passing speed, support angles and decision making under pressure before progressing into positional play.";
  possession.content.focus = ["Possession", "Support play", "Press resistance"];
  possession.coaches.push({ coachId: "coach-lopez", role: "assistant" });
  for (const [index, [title, duration]] of ([ ["Dynamic passing", 15], ["5v2 Rondo", 20], ["Positional play", 30], ["Mobility & circulation", 15] ] as const).entries()) {
    possession.content.activities.push({ id: `activity-${index}`, role: index === 0 ? "warm-up" : index === 3 ? "cool-down" : "exercise", durationMinutes: duration,
      sourceExercise: null, content: { title, area: null, playerCount: null, equipment: [{ name: "Balls", quantity: 6 }, { name: "Cones", quantity: 4 }],
        instructions: ["Maintain support angles and rotate regularly."], coachingPoints: ["Scan before receiving; play with an open body shape."],
        progressions: [], regressions: [], variations: [], diagrams: [] } });
  }
  return domainBundleSchema.parse(bundle);
}
