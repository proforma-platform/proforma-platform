export const brandColors = {
  navy: "#0f172a",
  brand500: "#2563eb",
  proformaAccent: "#2563eb",
  farmAccent: "#1d4ed8",
  medCoreAccent: "#0ea5a4",
  bg: "#f7fafc",
  surface: "#ffffff",
  text: "#0b1220",
  muted: "#64748b",
} as const;

export type BrandColorKey = keyof typeof brandColors;
