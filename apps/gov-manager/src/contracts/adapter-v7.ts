import type { MissionRequest, MissionResponse } from "./mission";
import { stableJsonStringify, sha256Hex } from "../core/determinism";

export interface LegacyMissionEnvelope {
  udn?: unknown;
  mission?: {
    id?: unknown;
    target?: unknown;
    notes?: unknown;
    level?: unknown;
    branch?: unknown;
    agent_id?: unknown;
  };
  created_by?: unknown;
  autofix_control?: unknown;
  token_control?: unknown;
  parts?: unknown;
  prompt_ref?: unknown;
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
      ...(typeof body.mission.notes === "string" ? { notes: body.mission.notes } : {}),
      ...(typeof body.mission.level === "string" ? { level: body.mission.level } : {}),
      ...(typeof body.mission.branch === "string" ? { branch: body.mission.branch } : {}),
      ...(typeof body.mission.agent_id === "string" ? { agent_id: body.mission.agent_id } : {})
    },
    ...(typeof body.created_by === "string" ? { created_by: body.created_by } : {}),
    ...(body.autofix_control && typeof body.autofix_control === "object"
      ? { autofix_control: body.autofix_control as NonNullable<MissionRequest["autofix_control"]> }
      : {}),
    ...(body.token_control && typeof body.token_control === "object"
      ? { token_control: body.token_control as NonNullable<MissionRequest["token_control"]> }
      : {}),
    ...(Array.isArray(body.parts) ? { parts: body.parts as NonNullable<MissionRequest["parts"]> } : {}),
    ...(body.prompt_ref && typeof body.prompt_ref === "object"
      ? { prompt_ref: body.prompt_ref as NonNullable<MissionRequest["prompt_ref"]> }
      : {})
  };

  return request;
}

export function contractAdapterHash(): string {
  const fingerprint = {
    adapter: "legacy_to_v7",
    expected_keys: [
      "udn",
      "mission.id",
      "mission.target",
      "mission.notes",
      "mission.level",
      "mission.branch",
      "mission.agent_id",
      "created_by",
      "autofix_control.enabled",
      "autofix_control.max_rounds",
      "autofix_control.on_exhaust",
      "token_control.enabled",
      "token_control.budget_usd",
      "token_control.budget_brl",
      "token_control.max_input_tokens",
      "token_control.max_output_tokens",
      "token_control.hard_stop",
      "prompt_ref.prompt_id",
      "prompt_ref.prompt_hash",
      "prompt_ref.inject_mode",
      "prompt_ref.variables",
      "parts[].part_id",
      "parts[].goal",
      "parts[].executor",
      "parts[].priority"
    ]
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
