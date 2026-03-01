import { sha256Hex } from "../core/determinism";

export interface UDNCandidate {
  raw: string;
}

export interface UDNNormalized {
  canonical: string;
  lines: string[];
}

export function canonicalizeUDN(input: UDNCandidate | string): UDNNormalized {
  const raw = typeof input === "string" ? input : input.raw;
  const normalized = raw
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  const canonical = normalized.join("\n");

  return {
    canonical,
    lines: normalized
  };
}

export function udnEngineHash(input: UDNCandidate | string): string {
  const { canonical } = canonicalizeUDN(input);
  return sha256Hex(canonical);
}
