import { sha256Hex, stableJsonStringify } from "../core/determinism";

export const TDV_SCHEMA_VERSION = "1.0" as const;

export const TDV_SCHEMA_V1 = {
  version: TDV_SCHEMA_VERSION,
  format: "udn_signal",
  required: ["header", "objective", "tasks", "state"],
  limits: {
    minSignalChars: 8,
    maxSignalChars: 8192,
    maxTasks: 64
  },
  tags: {
    objective: "#\u03bc:",
    risk: "#\u03c1:",
    tasks: "#\u03c4:",
    delta: "#\u03b4:",
    state: "#\u03c3:"
  }
} as const;

export interface TDVValidation {
  valid: boolean;
  reasons: string[];
}

export function tdvRootHash(schema: unknown = TDV_SCHEMA_V1): string {
  return sha256Hex(stableJsonStringify(schema));
}

export function validateSignalByTDV(signal: string): TDVValidation {
  const reasons: string[] = [];
  const trimmed = signal.trim();

  if (!trimmed) {
    reasons.push("signal is empty");
  }
  if (trimmed.length < TDV_SCHEMA_V1.limits.minSignalChars) {
    reasons.push("signal too short");
  }
  if (trimmed.length > TDV_SCHEMA_V1.limits.maxSignalChars) {
    reasons.push("signal too long");
  }
  if (!trimmed.includes(TDV_SCHEMA_V1.tags.objective)) {
    reasons.push("missing objective tag");
  }
  if (!trimmed.includes(TDV_SCHEMA_V1.tags.tasks)) {
    reasons.push("missing tasks tag");
  }
  if (!trimmed.includes(TDV_SCHEMA_V1.tags.state)) {
    reasons.push("missing state tag");
  }

  return {
    valid: reasons.length === 0,
    reasons
  };
}
