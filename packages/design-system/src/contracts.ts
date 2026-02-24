import type { ComponentContract } from "./types";

export const componentContracts: ComponentContract[] = [
  {
    id: "brand-header",
    accessibility: {
      keyboard: true,
      focusVisible: true,
      ariaRequired: ["aria-label"],
    },
    tokens: {
      color: ["--pf-color-surface", "--pf-color-text", "--pf-color-border"],
      radius: ["--pf-radius-sm"],
      spacing: ["--pf-space-3", "--pf-space-4"],
    },
  },
  {
    id: "hero-institutional",
    accessibility: {
      keyboard: true,
      focusVisible: true,
      ariaRequired: [],
    },
    tokens: {
      color: ["--pf-color-bg", "--pf-color-text", "--pf-color-muted"],
      radius: ["--pf-radius-lg"],
      spacing: ["--pf-space-4", "--pf-space-6", "--pf-space-8"],
    },
  },
  {
    id: "help-launcher",
    accessibility: {
      keyboard: true,
      focusVisible: true,
      ariaRequired: ["aria-expanded", "aria-controls"],
    },
    tokens: {
      color: ["--pf-color-brand-500", "--pf-color-surface", "--pf-color-text"],
      radius: ["--pf-radius-md", "--pf-radius-pill"],
      spacing: ["--pf-space-2", "--pf-space-3", "--pf-space-4"],
    },
  },
];
