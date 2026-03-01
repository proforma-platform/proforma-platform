import type { MissionRequest, MissionResponse } from "../contracts/mission";
import { commitMissionToLedgerV7, createLedgerGenesis, type LedgerBlock } from "./ledger-v7";

export { LEDGER_V7_VERSION, createLedgerGenesis, appendLedgerBlock } from "./ledger-v7";
export type { LedgerBlock } from "./ledger-v7";

export function commitMissionToLedger(input: MissionRequest): MissionResponse {
  return commitMissionToLedgerV7(input);
}

export function ledgerGenesisHash(): string {
  const genesis: LedgerBlock = createLedgerGenesis();
  return genesis.block_hash;
}
