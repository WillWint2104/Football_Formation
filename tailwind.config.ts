import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Surfaces — the light, architectural background layers
        surface: {
          DEFAULT: "#f8f9fb",
          dim: "#d9dadc",
          bright: "#f8f9fb",
          variant: "#e1e2e4",
        },
        "surface-container": {
          DEFAULT: "#edeef0",
          lowest: "#ffffff",
          low: "#f3f4f6",
          high: "#e7e8ea",
          highest: "#e1e2e4",
        },
        "on-surface": {
          DEFAULT: "#191c1e",
          variant: "#4b454f",
        },
        "inverse-surface": "#2e3132",
        "inverse-on-surface": "#f0f1f3",
        outline: {
          DEFAULT: "#7c7480",
          variant: "#cdc3d0",
        },

        // Primary — the deep violet brand color
        primary: {
          DEFAULT: "#452763",
          container: "#5d3e7c",
        },
        "on-primary": {
          DEFAULT: "#ffffff",
          container: "#d3aef5",
        },
        "inverse-primary": "#ddb8ff",

        // Secondary — electric cyan for active states, highlights, tactical "go" signals
        secondary: {
          DEFAULT: "#006970",
          container: "#00eefc",
        },
        "on-secondary": {
          DEFAULT: "#ffffff",
          container: "#00686f",
        },

        // Tertiary — near-black for the tactical pitch and high-contrast surfaces
        tertiary: {
          DEFAULT: "#343638",
          container: "#4a4c4e",
        },
        "on-tertiary": {
          DEFAULT: "#ffffff",
          container: "#bcbcbf",
        },

        // Error / status colors
        error: {
          DEFAULT: "#ba1a1a",
          container: "#ffdad6",
        },
        "on-error": {
          DEFAULT: "#ffffff",
          container: "#93000a",
        },

        // Status indicators for player availability
        status: {
          available: "#16a34a",
          caution: "#eab308",
          injured: "#ba1a1a",
          suspended: "#f59e0b",
        },

        background: "#f8f9fb",
        "on-background": "#191c1e",
      },

      fontFamily: {
        display: ["var(--font-hanken)", "system-ui", "sans-serif"],
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },

      fontSize: {
        "display-lg": ["48px", { lineHeight: "56px", letterSpacing: "-0.02em", fontWeight: "800" }],
        "headline-md": ["24px", { lineHeight: "32px", fontWeight: "700" }],
        "headline-md-mobile": ["20px", { lineHeight: "28px", fontWeight: "700" }],
        "headline-sm": ["18px", { lineHeight: "24px", fontWeight: "600" }],
        "body-lg": ["16px", { lineHeight: "24px", fontWeight: "400" }],
        "body-md": ["14px", { lineHeight: "20px", fontWeight: "400" }],
        "label-caps": ["12px", { lineHeight: "16px", letterSpacing: "0.05em", fontWeight: "700" }],
        "data-numeral": ["14px", { lineHeight: "14px", fontWeight: "500" }],
      },

      borderRadius: {
        sm: "0.125rem",
        DEFAULT: "0.25rem",
        md: "0.375rem",
        lg: "0.5rem",
        xl: "0.75rem",
      },

      spacing: {
        sidebar: "280px",
        header: "72px",
      },

      boxShadow: {
        ambient: "0px 4px 12px rgba(15, 23, 42, 0.05)",
        overlay: "0px 8px 24px rgba(15, 23, 42, 0.12)",
        "token-glow": "0 0 0 2px rgba(0, 238, 252, 0.6), 0 4px 12px rgba(0, 105, 112, 0.3)",
      },
    },
  },
  plugins: [],
};

export default config;
