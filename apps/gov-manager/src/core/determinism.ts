import { createHash } from "crypto";

export function stableLedgerRef(missionId: string, udn: string): string {
  const digest = createHash("sha256").update(`${missionId}:${udn}`).digest("hex").slice(0, 16);
  return `LEDGER-${digest}`;
}
