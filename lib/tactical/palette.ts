/** Portable tactical tokens: one resolved palette for browser SVG and standalone/export consumers. */
export const tacticalPalette = {
  surround: "#123526", field: "#285a3b", stripe: "#2d6342", line: "#e9f3df", grid: "#8bb99a", guide: "#e5c875",
  a: "#2465ef", b: "#e44754", neutral: "#f4d54d", ink: "#10263c", label: "#f5f8f2", number: "#ffffff", outline: "#112e23",
  cone: "#ff9d37", equipment: "#f0ce56", pass: "#72dce8", run: "#f4f5e6", rotation: "#c6a4fb", press: "#ff8a96", dribble: "#f3d366", area: "#70d2d1",
} as const;

export type TacticalPaint = { [K in keyof typeof tacticalPalette]: string };
/** Opt-in coaching-board paint; default drawing/export paint and scene data stay unchanged. */
export const coachingLightPalette: TacticalPaint = {
  ...tacticalPalette, surround: "#80ad79", field: "#80ad79", stripe: "#88b580", line: "#f5fff1", grid: "#426c48",
  a: "#1761e8", b: "#d93349", neutral: "#f6d74b", ink: "#18334b", outline: "#244e35", label: "#ffffff",
  cone: "#ec7915", equipment: "#f0cf35", pass: "#075e89", run: "#f8fff2", press: "#b72c42", rotation: "#713d9d", dribble: "#e4bc23", area: "#176d77",
};
