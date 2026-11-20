import { coachingLightPalette, type TacticalPaint } from "./palette";
import type { Point } from "./evaluate";

export const SCREEN_PRESENTATION_VERSION = "1.1.0";
export const COMPACT_VIEWPORT_MIN = 64;
export type DiagramSize = "compact" | "standard" | "expanded";

export const screenCoachingPalette: TacticalPaint = {
  ...coachingLightPalette,
  field: "#6c8f57",
  stripe: "#75975e",
  surround: "#e6ece3",
  line: "#fcfff4",
  outline: "#23442c",
  a: "#1b55a9",
  b: "#af3047",
  area: "#163f36",
};

export const viewerCoachingPalette: TacticalPaint = {
  ...screenCoachingPalette,
  field: "#567b42", stripe: "#62894c", surround: "#304538",
  outline: "#213b2b", ink: "#132f27", line: "#f6f8e9", area: "#163c32",
  cone: "#f7a238", equipment: "#f6d463", a: "#1558b6", b: "#b92f45",
};

/** Screen-space sizes depend on the surface, independent of projection scale and pixel density. */
export function screenGlyphs(mode: DiagramSize, width: number, height: number) {
  const span = Math.min(width, height);
  const interpolate = (min: number, max: number, start: number, end: number) =>
    min + (max - min) * Math.max(0, Math.min(1, (span - start) / (end - start)));
  const radius = mode === "compact" ? interpolate(5.5, 9, 64, 210)
    : mode === "standard" ? interpolate(13, 15, 180, 480)
    : interpolate(15.5, 19, 300, 800);
  const numberSize = mode === "compact" ? interpolate(10, 11, 64, 150)
    : mode === "standard" ? interpolate(13, 14, 180, 480)
    : interpolate(15, 16, 300, 800);
  return { radius, numberSize, minRadius: mode === "compact" ? 4.25 : mode === "standard" ? 11.5 : 13.5 };
}

export type ScreenBox = { x: number; y: number; w: number; h: number };
export const boxesOverlap = (a: ScreenBox, b: ScreenBox) =>
  a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

export function sizePlayerDiscs(mode: DiagramSize, glyphs: ReturnType<typeof screenGlyphs>, players: Point[], equipment: ScreenBox[], width: number, height: number) {
  let clearance = Infinity;
  for (const [i, player] of players.entries()) {
    clearance = Math.min(clearance, player.x - 2, player.y - 2, width - player.x - 2, height - player.y - 2);
    for (let j = 0; j < i; j++) {
      clearance = Math.min(clearance, (Math.hypot(player.x - players[j].x, player.y - players[j].y) - 1.5) / 2);
    }
    for (const box of equipment) {
      const dx = Math.max(box.x - player.x, 0, player.x - box.x - box.w);
      const dy = Math.max(box.y - player.y, 0, player.y - box.y - box.h);
      clearance = Math.min(clearance, Math.hypot(dx, dy) - 1);
    }
  }
  const radius = Math.max(glyphs.minRadius, Math.min(glyphs.radius, clearance));
  return { radius, extent: radius + (mode === "compact" ? 2 : 5) };
}

/** Reserve a collision-free box near the projected anchor, including the outer edges of a zone. */
export function screenLabelBox(anchor: ScreenBox, w: number, h: number, occupied: ScreenBox[], width: number, height: number) {
  const middleX = anchor.x + (anchor.w - w) / 2, middleY = anchor.y + (anchor.h - h) / 2;
  const xs = [middleX, anchor.x, anchor.x + anchor.w - w];
  const ys = [middleY, anchor.y, anchor.y + anchor.h - h];
  const candidates = [
    ...[anchor.y - h - 4, anchor.y + anchor.h + 4, anchor.y + 4, anchor.y + anchor.h - h - 4].flatMap(y => xs.map(x => ({ x, y }))),
    ...[anchor.x - w - 4, anchor.x + anchor.w + 4].flatMap(x => ys.map(y => ({ x, y }))),
  ];
  return candidates.map(({ x, y }) => ({
    x: Math.max(3, Math.min(width - w - 3, x)), y: Math.max(3, Math.min(height - h - 3, y)), w, h,
  })).find(box => box.x + w <= width - 3 && box.y + h <= height - 3 &&
    !occupied.some(other => boxesOverlap(box, other)));
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
