import { stableLedgerRef } from "../core/determinism";
import type { MissionRequest, MissionResponse } from "../contracts/mission";

export function commitMissionToLedger(input: MissionRequest): MissionResponse {
  return {
    status: "accepted",
    mission_id: input.mission.id,
    ledger_ref: stableLedgerRef(input.mission.id, input.udn),
    contract_version: "v7-baseline",
    errors: []
  };
}
