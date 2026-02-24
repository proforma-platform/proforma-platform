export const brandColors = {
  brand900: "#0f1f3a",
  brand700: "#1e3a6d",
  brand500: "#2f5da8",
  accent: "#0ea5a4",
  proformaFarm: "#16a34a",
  medCore: "#2563eb",
  bg: "#f7fafc",
  surface: "#ffffff",
  text: "#0b1220",
  muted: "#64748b",
} as const;

export type BrandColorKey = keyof typeof brandColors;
