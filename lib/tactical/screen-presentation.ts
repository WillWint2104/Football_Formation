import { coachingLightPalette, type TacticalPaint } from "./palette";

export const SCREEN_PRESENTATION_VERSION = "1.0.0";
export const COMPACT_VIEWPORT_MIN = 64;
export type DiagramSize = "compact" | "standard" | "expanded";

export const screenCoachingPalette: TacticalPaint = {
  ...coachingLightPalette,
  field: "#7d9968",
  stripe: "#829e6d",
  surround: "#e5ebe2",
  line: "#fcfff2",
  outline: "#263e2c",
  a: "#1457c2",
  b: "#b92b41",
  area: "#234f46",
};

/** Screen-space sizes depend on the surface, independent of projection scale and pixel density. */
export function screenGlyphs(mode: DiagramSize, width: number, height: number) {
  const span = Math.min(width, height);
  const interpolate = (min: number, max: number, start: number, end: number) =>
    min + (max - min) * Math.max(0, Math.min(1, (span - start) / (end - start)));
  const radius = mode === "compact" ? interpolate(8, 10, 64, 150)
    : mode === "standard" ? interpolate(13, 15, 180, 480)
    : interpolate(15, 18, 300, 800);
  const numberSize = mode === "compact" ? interpolate(10, 11, 64, 150)
    : mode === "standard" ? interpolate(13, 14, 180, 480)
    : interpolate(15, 16, 300, 800);
  return { radius, numberSize, extent: radius + (mode === "compact" ? 3.5 : 5) };
}

/** Black or white maintains readable numerals on arbitrary authored hex colours. */
export function numberInk(colour: string) {
  const [r, g, b] = [1, 3, 5].map(offset => {
    const component = parseInt(colour.slice(offset, offset + 2), 16) / 255;
    return component <= 0.04045 ? component / 12.92 : ((component + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.179 ? "#000000" : "#ffffff";
}

// A fixed, low-opacity tile avoids image requests and turbulence filters on every frame.
export const grassGrain = Array.from({ length: 112 }, (_, i) => {
  const x = ((i * 79 + i * i * 13) % 193) / 2;
  const y = ((i * 53 + i * i * 19) % 191) / 2;
  return `M${x},${y}l${i % 3 / 2 - 0.5},${0.6 + i % 4 * 0.25}`;
}).join("");
