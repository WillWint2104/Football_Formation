import { tacticalPalette } from "../tactical/palette";

/** Resolved print tokens: shell navy/gold, Inter, white paper and accessible body contrast. */
export const printTheme = { navy: tacticalPalette.ink, gold: "#d7b46a", ink: "#1e3042", muted: "#53657a", edge: "#d8e0e7", soft: "#f3f6f9", paper: "#ffffff" } as const;

/** One measured A4 type/spacing system shared by all coaching document templates. */
export const printTokens = { body: 9.5, leading: 1.38, title: 22, activity: 16, label: 8, gap: 5, sectionGap: 12, columnGap: 20, crestWidth: 36, crestHeight: 32, markWidth: 48, markHeight: 26 } as const;
