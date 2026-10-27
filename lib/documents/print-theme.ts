import { tacticalPalette } from "../tactical/palette";

/** Resolved print tokens: shell navy/gold, Inter, white paper and accessible body contrast. */
export const printTheme = { navy: tacticalPalette.ink, gold: "#d7b46a", ink: "#1e3042", muted: "#53657a", edge: "#d8e0e7", soft: "#f3f6f9", paper: "#ffffff" } as const;
