import type { MissionRequest, MissionResponse } from "./mission";
import { stableJsonStringify, sha256Hex } from "../core/determinism";

export interface LegacyMissionEnvelope {
  udn?: unknown;
  mission?: {
    id?: unknown;
    target?: unknown;
    level?: unknown;
  };
}

export function adaptLegacyMissionEnvelope(input: unknown): MissionRequest | null {
  const body = input as LegacyMissionEnvelope;
  if (!body || typeof body !== "object") {
    return null;
  }
  if (typeof body.udn !== "string") {
    return null;
  }
  if (!body.mission || typeof body.mission !== "object") {
    return null;
  }
  if (typeof body.mission.id !== "string") {
    return null;
  }

  const request: MissionRequest = {
    udn: body.udn,
    mission: {
      id: body.mission.id,
      ...(typeof body.mission.target === "string" ? { target: body.mission.target } : {}),
      ...(typeof body.mission.level === "string" ? { level: body.mission.level } : {})
    }
  };

  return request;
}

export function contractAdapterHash(): string {
  const fingerprint = {
    adapter: "legacy_to_v7",
    expected_keys: ["udn", "mission.id", "mission.target", "mission.level"]
  };
  return sha256Hex(stableJsonStringify(fingerprint));
}

export function normalizeMissionResponse(response: MissionResponse): MissionResponse {
  return {
    status: response.status,
    mission_id: response.mission_id,
    ledger_ref: response.ledger_ref,
    contract_version: "v7-baseline",
    errors: [...response.errors]
  };
}
