import { sha256Hex, stableJsonStringify, stableLedgerRef } from "../core/determinism";
import type { MissionRequest, MissionResponse } from "../contracts/mission";

export interface LedgerBlock {
  index: number;
  previous_hash: string;
  payload_hash: string;
  block_hash: string;
}

export const LEDGER_V7_VERSION = "v7" as const;

export function createLedgerGenesis(): LedgerBlock {
  const payload_hash = sha256Hex("ledger-genesis");
  const block_hash = sha256Hex(`0:0:${payload_hash}`);
  return {
    index: 0,
    previous_hash: "0",
    payload_hash,
    block_hash
  };
}

export function appendLedgerBlock(previous: LedgerBlock, payload: unknown): LedgerBlock {
  const payload_hash = sha256Hex(stableJsonStringify(payload));
  const index = previous.index + 1;
  const block_hash = sha256Hex(`${index}:${previous.block_hash}:${payload_hash}`);
  return {
    index,
    previous_hash: previous.block_hash,
    payload_hash,
    block_hash
  };
}

export function commitMissionToLedgerV7(input: MissionRequest): MissionResponse {
  const genesis = createLedgerGenesis();
  const block = appendLedgerBlock(genesis, input);

  return {
    status: "accepted",
    mission_id: input.mission.id,
    ledger_ref: stableLedgerRef(input.mission.id, block.block_hash),
    contract_version: "v7-baseline",
    errors: []
  };
}
