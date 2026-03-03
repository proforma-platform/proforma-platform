import { NextResponse } from "next/server";
import { adaptLegacyMissionEnvelope } from "../../../../../contracts/adapter-v7";
import { validateMissionRequest } from "../../../../../contracts/mission-validator";
import { validateTDVSignal } from "../../../../../tdv";
import { hasSessionCookie } from "../../../../../auth/session";
import { buildCostPreview } from "../../../../../core/token-estimator";
import { loadSnapshotPayload, resolveGovhubSnapshotConfig, saveSnapshotPayload } from "../../../../../core/govhub-snapshots";
import {
  appendUsageReservation,
  defaultTokenPolicyState,
  defaultTokenUsageState,
  evaluateTokenGovernance,
  sanitizeTokenPolicyState,
  sanitizeTokenUsageState
} from "../../../../../core/token-governance";
import {
  defaultPromptLibraryState,
  renderPromptTemplate,
  sanitizePromptLibraryState
} from "../../../../../core/prompt-library";

function resolveGovhubConfig() {
  const baseUrl = String(process.env.GOVHUB_BASE_URL || "").trim();
  const token = String(process.env.GOVHUB_TOKEN || "").trim();
  const endpointPath = String(process.env.GOVHUB_MISSIONS_REGISTER_PATH || "/webhook/govhub/missions/register").trim();
  return { baseUrl, token, endpointPath };
}

const POLICY_SNAPSHOT_TYPE = String(process.env.GOVHUB_TOKEN_POLICY_SNAPSHOT_TYPE || "gov_manager_token_policy_v1").trim();
const USAGE_SNAPSHOT_TYPE = String(process.env.GOVHUB_TOKEN_USAGE_SNAPSHOT_TYPE || "gov_manager_token_usage_v1").trim();
const PROMPT_SNAPSHOT_TYPE = String(process.env.GOVHUB_PROMPTS_SNAPSHOT_TYPE || "gov_manager_prompt_library_v1").trim();

export async function POST(request: Request) {
  if (!hasSessionCookie(request)) {
    return NextResponse.json({ status: "unauthorized", error_code: "AUTH_REQUIRED" }, { status: 401 });
  }

  const { baseUrl, token, endpointPath } = resolveGovhubConfig();
  if (!baseUrl || !token) {
    return NextResponse.json(
      {
        status: "misconfigured",
        error_code: "GOVHUB_ENV_REQUIRED",
        message: "GOVHUB_BASE_URL and GOVHUB_TOKEN are required"
      },
      { status: 500 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { status: "invalid_request", error_code: "JSON_INVALID", message: "invalid json body" },
      { status: 400 }
    );
  }

  const adapted = adaptLegacyMissionEnvelope(body);
  const validated = validateMissionRequest(adapted ?? body);
  if (!validated.valid || !validated.data) {
    return NextResponse.json(
      { status: "invalid_request", error_code: "MISSION_CONTRACT_INVALID", errors: validated.errors },
      { status: 400 }
    );
  }

  const snapshotConfig = resolveGovhubSnapshotConfig();
  let effectiveUdn = validated.data.udn;
  let promptResolution: Record<string, unknown> | null = null;

  if (validated.data.prompt_ref) {
    if (!snapshotConfig.baseUrl || !snapshotConfig.token) {
      return NextResponse.json(
        {
          status: "misconfigured",
          error_code: "GOVHUB_ENV_REQUIRED",
          message: "GOVHUB_BASE_URL and GOVHUB_TOKEN are required for prompt_ref"
        },
        { status: 500 }
      );
    }

    const promptLoaded = await loadSnapshotPayload(snapshotConfig, PROMPT_SNAPSHOT_TYPE);
    const promptState = promptLoaded.found && promptLoaded.payload
      ? sanitizePromptLibraryState(promptLoaded.payload)
      : defaultPromptLibraryState();
    const prompt = promptState.prompts.find((item) => item.prompt_id === validated.data!.prompt_ref!.prompt_id);
    if (!prompt) {
      return NextResponse.json(
        {
          status: "invalid_request",
          error_code: "PROMPT_REF_NOT_FOUND",
          message: "prompt_ref.prompt_id not found in library"
        },
        { status: 404 }
      );
    }

    if (validated.data.prompt_ref.prompt_hash && validated.data.prompt_ref.prompt_hash !== prompt.prompt_hash) {
      return NextResponse.json(
        {
          status: "invalid_request",
          error_code: "PROMPT_REF_HASH_MISMATCH",
          message: "prompt_ref hash mismatch"
        },
        { status: 409 }
      );
    }

    const vars = validated.data.prompt_ref.variables || {};
    if (validated.data.prompt_ref.inject_mode === "replace_udn") {
      const rendered = renderPromptTemplate(prompt.template, vars).trim();
      if (!rendered) {
        return NextResponse.json(
          {
            status: "invalid_request",
            error_code: "PROMPT_REF_RENDER_EMPTY",
            message: "prompt template resolved to empty content"
          },
          { status: 422 }
        );
      }
      effectiveUdn = rendered;
    } else {
      const varKeys = Object.keys(vars).slice(0, 24).join(",") || "none";
      effectiveUdn = `${validated.data.udn}\n#ctx_prompt_ref:id=${prompt.prompt_id};hash=${prompt.prompt_hash};vars=${varKeys}`;
    }

    promptResolution = {
      prompt_id: prompt.prompt_id,
      prompt_hash: prompt.prompt_hash,
      inject_mode: validated.data.prompt_ref.inject_mode || "append_ref",
      variables: vars
    };
  }

  const tdv = validateTDVSignal(effectiveUdn);
  if (!tdv.valid) {
    return NextResponse.json(
      { status: "invalid_request", error_code: "UDN_TDV_INVALID", errors: tdv.reasons },
      { status: 422 }
    );
  }

  const ownerId = validated.data.created_by || "staff@gov-manager";
  const preview = buildCostPreview({
    mission_id: validated.data.mission.id,
    agent_id: validated.data.mission.agent_id || "CPP",
    udn: effectiveUdn,
    objective: validated.data.mission.target || "",
    token_control: validated.data.token_control || null
  });

  let policyState = defaultTokenPolicyState();
  let usageState = defaultTokenUsageState();
  let governanceSource = "default_policy";

  if (snapshotConfig.baseUrl && snapshotConfig.token) {
    const [policyLoaded, usageLoaded] = await Promise.all([
      loadSnapshotPayload(snapshotConfig, POLICY_SNAPSHOT_TYPE),
      loadSnapshotPayload(snapshotConfig, USAGE_SNAPSHOT_TYPE)
    ]);

    if (policyLoaded.found && policyLoaded.payload) {
      policyState = sanitizeTokenPolicyState(policyLoaded.payload);
      governanceSource = "snapshot_policy";
    }
    if (usageLoaded.found && usageLoaded.payload) {
      usageState = sanitizeTokenUsageState(usageLoaded.payload);
    }
  }

  const governanceDecision = evaluateTokenGovernance({
    preview,
    owner_id: ownerId,
    policyState,
    usageState,
    hardStopOverride: validated.data.token_control?.hard_stop === true
  });

  if (!governanceDecision.allowed) {
    return NextResponse.json(
      {
        status: "paused_waiting_owner",
        error_code: "TOKEN_GOVERNANCE_LIMIT",
        mission_id: validated.data.mission.id,
        token_preview: preview,
        token_governance: {
          source: governanceSource,
          ...governanceDecision
        },
        next_action: "owner_review_token_policy"
      },
      { status: 409 }
    );
  }

  const upstreamPayload = {
    mission_id: validated.data.mission.id,
    udn_mission: effectiveUdn,
    tdv_version: "1.0",
    created_by: ownerId,
    branch: validated.data.mission.branch || "main",
    agent_id: validated.data.mission.agent_id || "CPP",
    ...(validated.data.autofix_control ? { autofix_control: validated.data.autofix_control } : {}),
    ...(validated.data.token_control ? { token_control: validated.data.token_control } : {}),
    ...(validated.data.parts ? { parts: validated.data.parts } : {}),
    ...(promptResolution ? { prompt_ref: promptResolution } : {})
  };

  const endpoint = `${baseUrl.replace(/\/+$/, "")}${endpointPath.startsWith("/") ? endpointPath : `/${endpointPath}`}`;

  let upstreamResponse: Response;
  try {
    upstreamResponse = await fetch(endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-govhub-token": token
      },
      body: JSON.stringify(upstreamPayload),
      cache: "no-store"
    });
  } catch {
    return NextResponse.json(
      { status: "upstream_unreachable", error_code: "GOVHUB_FETCH_FAILED" },
      { status: 502 }
    );
  }

  let upstreamJson: unknown = null;
  try {
    upstreamJson = await upstreamResponse.json();
  } catch {
    upstreamJson = { raw_status: upstreamResponse.status };
  }

  let tokenUsageSync: Record<string, unknown> = { status: "skipped" };
  if (upstreamResponse.ok && snapshotConfig.baseUrl && snapshotConfig.token) {
    const nextUsage = appendUsageReservation(usageState, {
      mission_id: validated.data.mission.id,
      owner_id: ownerId,
      agent_id: validated.data.mission.agent_id || "CPP",
      projected_total_tokens: preview.projected_total_tokens,
      projected_cost_usd: preview.projected_cost_usd,
      projected_cost_brl: preview.projected_cost_brl
    });

    const savedUsage = await saveSnapshotPayload(snapshotConfig, {
      snapshotType: USAGE_SNAPSHOT_TYPE,
      payload: nextUsage,
      createdBy: ownerId,
      sourceRepo: "gov-manager",
      sourceRef: "token-usage"
    });

    tokenUsageSync = {
      status: savedUsage.ok ? "saved" : "upstream_error",
      govhub_http: savedUsage.status,
      payload_sha256: savedUsage.payload_sha256
    };
  }

  return NextResponse.json(
    {
      status: upstreamResponse.ok ? "registered" : "upstream_error",
      govhub_http: upstreamResponse.status,
      mission_id: validated.data.mission.id,
      token_control: validated.data.token_control || null,
      token_preview: preview,
      token_governance: {
        source: governanceSource,
        ...governanceDecision
      },
      token_usage_sync: tokenUsageSync,
      prompt_ref: promptResolution,
      govhub_response: upstreamJson
    },
    { status: upstreamResponse.ok ? 200 : 502 }
  );
}
