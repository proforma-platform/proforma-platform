import { brandColors } from "@proforma/brand/colors";

export const designSystemTheme = {
  colors: {
    ...brandColors,
    border: "#d7dfea",
    surfaceMuted: "#f8fbff",
    focusRing: brandColors.proformaAccent,
  },
  typography: {
    sans: '"Inter", "Manrope", "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
    mono: '"SFMono-Regular", Menlo, Monaco, Consolas, monospace',
  },
  radius: {
    sm: "0.375rem",
    md: "0.5rem",
    lg: "0.75rem",
    pill: "999px",
  },
  spacing: {
    0: "0",
    1: "0.25rem",
    2: "0.5rem",
    3: "0.75rem",
    4: "1rem",
    5: "1.25rem",
    6: "1.5rem",
    8: "2rem",
    10: "2.5rem",
  },
} as const;

export type DesignSystemTheme = typeof designSystemTheme;
