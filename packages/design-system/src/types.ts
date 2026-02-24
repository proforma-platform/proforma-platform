export type ProductKey = "platform" | "proformafarm" | "medcore";

export type SemanticColorToken =
  | "--pf-color-surface"
  | "--pf-color-bg"
  | "--pf-color-text"
  | "--pf-color-muted"
  | "--pf-color-border"
  | "--pf-color-brand-500"
  | "--pf-color-proforma-accent"
  | "--pf-color-farm-accent"
  | "--pf-color-medcore-accent";

export type RadiusToken = "--pf-radius-sm" | "--pf-radius-md" | "--pf-radius-lg" | "--pf-radius-pill";

export type SpacingToken =
  | "--pf-space-0"
  | "--pf-space-1"
  | "--pf-space-2"
  | "--pf-space-3"
  | "--pf-space-4"
  | "--pf-space-5"
  | "--pf-space-6"
  | "--pf-space-8"
  | "--pf-space-10";

export interface ComponentContract {
  id: string;
  accessibility: {
    keyboard: boolean;
    focusVisible: boolean;
    ariaRequired: string[];
  };
  tokens: {
    color: SemanticColorToken[];
    radius: RadiusToken[];
    spacing: SpacingToken[];
  };
}
