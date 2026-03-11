import { createHash } from "crypto";

export function sha256Hex(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

export function stableJsonStringify(value: unknown): string {
  return JSON.stringify(sortDeep(value));
}

function sortDeep(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortDeep);
  }
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => [k, sortDeep(v)]);
    return Object.fromEntries(entries);
  }
  return value;
}

export function stableLedgerRef(missionId: string, udn: string): string {
  const digest = sha256Hex(`${missionId}:${udn}`).slice(0, 16);
  return `LEDGER-${digest}`;
}
