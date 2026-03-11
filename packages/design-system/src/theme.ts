import { brandColors } from "@proforma/brand/colors";

export const designSystemTheme = {
  colors: {
    ...brandColors,
    border: "var(--pf-color-border)",
    surfaceMuted: "var(--pf-color-surface-muted)",
    focusRing: "var(--pf-color-focus-ring)",
  },
  typography: {
    sans: "var(--pf-font-family-sans)",
    mono: "var(--pf-font-family-mono)",
  },
  radius: {
    sm: "var(--pf-radius-sm)",
    md: "var(--pf-radius-md)",
    lg: "var(--pf-radius-lg)",
    pill: "var(--pf-radius-pill)",
  },
  spacing: {
    0: "var(--pf-space-0)",
    1: "var(--pf-space-1)",
    2: "var(--pf-space-2)",
    3: "var(--pf-space-3)",
    4: "var(--pf-space-4)",
    5: "var(--pf-space-5)",
    6: "var(--pf-space-6)",
    8: "var(--pf-space-8)",
    10: "var(--pf-space-10)",
  },
} as const;

export type DesignSystemTheme = typeof designSystemTheme;
