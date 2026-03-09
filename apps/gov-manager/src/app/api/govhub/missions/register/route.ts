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
import {
  defaultAgentRegistryState,
  sanitizeAgentRegistryState,
} from "../../../../../core/agent-registry";
import {
  createQueueId,
  defaultQueueState,
  sanitizeQueueState,
  upsertQueueItems,
  type QueueAssignee,
  type QueueItem,
  type QueuePriority,
  type QueueStatus
} from "../../../../../core/execution-queue";

function resolveGovhubConfig() {
  const baseUrl = String(process.env.GOVHUB_BASE_URL || "").trim();
  const token = String(process.env.GOVHUB_TOKEN || "").trim();
  const endpointPath = String(process.env.GOVHUB_MISSIONS_REGISTER_PATH || "/webhook/govhub/missions/register").trim();
  return { baseUrl, token, endpointPath };
}

const POLICY_SNAPSHOT_TYPE = String(process.env.GOVHUB_TOKEN_POLICY_SNAPSHOT_TYPE || "gov_manager_token_policy_v1").trim();
const USAGE_SNAPSHOT_TYPE = String(process.env.GOVHUB_TOKEN_USAGE_SNAPSHOT_TYPE || "gov_manager_token_usage_v1").trim();
const PROMPT_SNAPSHOT_TYPE = String(process.env.GOVHUB_PROMPTS_SNAPSHOT_TYPE || "gov_manager_prompt_library_v1").trim();
const QUEUE_SNAPSHOT_TYPE = String(process.env.GOVHUB_EXECUTION_QUEUE_SNAPSHOT_TYPE || "gov_manager_execution_queue_v1").trim();
const AGENTS_SNAPSHOT_TYPE = String(process.env.GOVHUB_AGENT_REGISTRY_SNAPSHOT_TYPE || "gov_manager_agent_registry_v1").trim();
const MISSION_INTAKE_AGENT = "PRINCIPAL_ARCHITECT";
const MISSION_ID_PREFIX = String(process.env.GOV_MANAGER_MISSION_ID_PREFIX || "GOV-MANAGER-V1-").trim().toUpperCase();
const MISSION_ID_DIGITS = Number.parseInt(String(process.env.GOV_MANAGER_MISSION_ID_DIGITS || "5"), 10) || 5;
const PREFERRED_CPP_AGENT_ID = "gov-codex-01";

interface UdnDefaults {
  taskDefault: string;
  stateDefault: string;
  outputDefault: string;
  autofixLine: string;
}

function canonicalizeMissionUdn(raw: string): { udn: string; strippedPrefix: boolean } | null {
  const lines = String(raw || "").replace(/\r\n/g, "\n").split("\n");
  const markerIndex = lines.findIndex((line) => line.trimStart().startsWith("!MIS|"));
  if (markerIndex < 0) return null;
  const udn = lines.slice(markerIndex).join("\n").trim();
  return { udn, strippedPrefix: markerIndex > 0 };
}

function missionIdFromUdn(udn: string): string | null {
  const firstLine = String(udn || "")
    .split("\n")
    .map((line) => line.trim())
    .find(Boolean);
  if (!firstLine || !firstLine.startsWith("!MIS|")) return null;
  const parts = firstLine.split("|");
  if (parts.length < 2) return null;
  const missionId = String(parts[1] || "").trim().toUpperCase();
  return missionId || null;
}

function resolveFullMissionIdFromUdnToken(token: string, payloadMissionId: string): string {
  const cleanToken = String(token || "").trim().toUpperCase();
  const cleanPayload = String(payloadMissionId || "").trim().toUpperCase();
  if (!cleanToken) return "";
  if (cleanToken === cleanPayload) return cleanPayload;

  if (/^\d{1,10}$/.test(cleanToken)) {
    const payloadMatch = cleanPayload.match(/^(.*-)(\d{1,10})$/);
    if (payloadMatch && payloadMatch[1] && payloadMatch[2]) {
      const prefix = payloadMatch[1];
      const width = payloadMatch[2].length;
      return `${prefix}${cleanToken.padStart(width, "0")}`;
    }
    return `${MISSION_ID_PREFIX}${cleanToken.padStart(Math.max(1, MISSION_ID_DIGITS), "0")}`;
  }

  return cleanToken;
}

function shortMissionToken(fullMissionId: string): string {
  const clean = String(fullMissionId || "").trim().toUpperCase();
  const match = clean.match(/-(\d{1,10})$/);
  if (!match || !match[1]) return clean;
  return match[1].padStart(Math.max(1, MISSION_ID_DIGITS), "0");
}

function syncMissionTokenInUdn(udn: string, missionToken: string): string {
  const lines = String(udn || "").split(/\r?\n/);
  let replaced = false;
  const out = lines.map((line) => {
    if (!replaced && line.trimStart().startsWith("!MIS|")) {
      replaced = true;
      return `!MIS|${missionToken}`;
    }
    return line;
  });
  return out.join("\n");
}

function buildUdnDefaults(autofixControl?: {
  enabled?: boolean;
  max_rounds?: 1 | 2;
  on_exhaust?: "pause_owner";
}): UdnDefaults {
  const enabled = autofixControl?.enabled ?? true;
  const maxRounds = autofixControl?.max_rounds ?? 2;
  const onExhaust = autofixControl?.on_exhaust || "pause_owner";
  return {
    taskDefault: "#τ:registrar_missao;monitorar_execucao",
    stateDefault: "#σ:READY",
    outputDefault: "!OUT:JSON_ONLY.NO_MD.NO_TXT.",
    autofixLine: `#af:enabled=${String(enabled)};max_rounds=${String(maxRounds)};on_exhaust=${onExhaust}`
  };
}

function enrichMissionUdnWithDefaults(input: string, missionToken: string, defaults: UdnDefaults): { udn: string; applied: string[] } {
  const applied: string[] = [];
  const lines = String(input || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const out: string[] = [];
  let misSeen = false;
  let muSeen = false;
  let tauSeen = false;
  let sigmaSeen = false;
  let outSeen = false;
  let afSeen = false;

  for (const line of lines) {
    if (line.startsWith("!MIS|")) {
      if (!misSeen) {
        out.push(`!MIS|${missionToken}`);
        misSeen = true;
        continue;
      }
      continue;
    }
    if (line.startsWith("#μ:")) muSeen = true;
    if (line.startsWith("#τ:")) tauSeen = true;
    if (line.startsWith("#σ:")) sigmaSeen = true;
    if (line.startsWith("!OUT:")) outSeen = true;
    if (line.startsWith("#af:")) {
      if (!afSeen) {
        out.push(defaults.autofixLine);
        afSeen = true;
      }
      continue;
    }
    out.push(line);
  }

  if (!misSeen) {
    out.unshift(`!MIS|${missionToken}`);
    applied.push("!MIS");
  }
  if (!muSeen) {
    out.push("#μ:Missão registrada no GOV-HUB.");
    applied.push("#μ");
  }
  if (!tauSeen) {
    out.push(defaults.taskDefault);
    applied.push("#τ");
  }
  if (!sigmaSeen) {
    out.push(defaults.stateDefault);
    applied.push("#σ");
  }
  if (!outSeen) {
    out.push(defaults.outputDefault);
    applied.push("!OUT");
  }
  if (!afSeen) {
    out.push(defaults.autofixLine);
    applied.push("#af");
  }

  return { udn: out.join("\n"), applied };
}

function normalizeQueuePriority(value: unknown): QueuePriority {
  const clean = String(value || "").trim().toUpperCase();
  if (clean === "P0" || clean === "P1" || clean === "P2" || clean === "P3") return clean;
  return "P2";
}

function toQueueStatus(priority: QueuePriority): QueueStatus {
  return priority === "P3" ? "paused_waiting_owner" : "open";
}

function resolvePreferredQueueAgent(
  assignee: QueueAssignee,
  agentsState: ReturnType<typeof sanitizeAgentRegistryState>
): string {
  if (assignee === "STAFF") return "";
  if (assignee === "CPP") {
    const preferred = agentsState.rows.find((row) => String(row.agent_id || "").trim().toLowerCase() === PREFERRED_CPP_AGENT_ID);
    if (preferred) return preferred.agent_id;
  }
  const fallback = agentsState.rows.find((row) => String(row.role || "").trim().toUpperCase() === assignee);
  return String(fallback?.agent_id || "").trim();
}

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
  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        {
          status: "invalid_request",
          error_code: "JSON_INVALID",
          message: "invalid json body"
        },
        { status: 400 }
      );
    }

    const adapted = adaptLegacyMissionEnvelope(body);
    const validated = validateMissionRequest(adapted ?? body);
    if (!validated.valid || !validated.data) {
      return NextResponse.json(
        {
          status: "invalid_request",
          error_code: "MISSION_CONTRACT_INVALID",
          errors: validated.errors
        },
        { status: 400 }
      );
    }

    const snapshotConfig = resolveGovhubSnapshotConfig();
    let effectiveUdn = validated.data.udn;
    let promptResolution: Record<string, unknown> | null = null;
    let udnCanonicalized = false;
    const udnDefaults = buildUdnDefaults(validated.data.autofix_control);
    const udnDefaultsApplied: string[] = [];

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

  const canonical = canonicalizeMissionUdn(effectiveUdn);
  if (!canonical) {
    return NextResponse.json(
      {
        status: "invalid_request",
        error_code: "UDN_CANONICAL_MIS_REQUIRED",
        message: "UDN must contain !MIS|<MISSION_ID>|... as first semantic line"
      },
      { status: 422 }
    );
  }
  effectiveUdn = canonical.udn;
  udnCanonicalized = canonical.strippedPrefix;

  const missionTokenFromBlock = missionIdFromUdn(effectiveUdn);
  const missionIdFromPayload = String(validated.data.mission.id || "").trim().toUpperCase();
  if (!missionTokenFromBlock) {
    return NextResponse.json(
      {
        status: "invalid_request",
        error_code: "UDN_MIS_INVALID",
        message: "Unable to parse mission id from !MIS line"
      },
      { status: 422 }
    );
  }
  const missionIdFromBlock = resolveFullMissionIdFromUdnToken(missionTokenFromBlock, missionIdFromPayload);
  if (missionIdFromBlock !== missionIdFromPayload) {
    effectiveUdn = syncMissionTokenInUdn(effectiveUdn, shortMissionToken(missionIdFromPayload));
    udnCanonicalized = true;
    udnDefaultsApplied.push("!MIS_SYNC");
  }

  const compactToken = shortMissionToken(missionIdFromPayload);
  const enrichedUdn = enrichMissionUdnWithDefaults(effectiveUdn, compactToken, udnDefaults);
  effectiveUdn = enrichedUdn.udn;
  if (enrichedUdn.applied.length > 0) {
    udnCanonicalized = true;
    udnDefaultsApplied.push(...enrichedUdn.applied);
  }

  const tdv = validateTDVSignal(effectiveUdn);
  if (!tdv.valid) {
    return NextResponse.json(
      { status: "invalid_request", error_code: "UDN_TDV_INVALID", errors: tdv.reasons },
      { status: 422 }
    );
  }

  const ownerId = validated.data.created_by || "staff@gov-manager";
  const requestedAgentId = validated.data.mission.agent_id || "CPP";
  const effectiveAgentId = MISSION_INTAKE_AGENT;
  const preview = buildCostPreview({
    mission_id: validated.data.mission.id,
    agent_id: effectiveAgentId,
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
    mission_notes: String(validated.data.mission.notes || "").trim() || undefined,
    tdv_version: "1.0",
    created_by: ownerId,
    branch: validated.data.mission.branch || "main",
    agent_id: effectiveAgentId,
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
  let queueSync: Record<string, unknown> = { status: "skipped" };
  if (upstreamResponse.ok && snapshotConfig.baseUrl && snapshotConfig.token) {
    const nextUsage = appendUsageReservation(usageState, {
      mission_id: validated.data.mission.id,
      owner_id: ownerId,
      agent_id: effectiveAgentId,
      projected_input_tokens: preview.projected_input_tokens,
      projected_output_tokens: preview.projected_output_tokens,
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

    const queueLoaded = await loadSnapshotPayload(snapshotConfig, QUEUE_SNAPSHOT_TYPE);
    const queueState = queueLoaded.found && queueLoaded.payload ? sanitizeQueueState(queueLoaded.payload) : defaultQueueState();
    const agentsLoaded = await loadSnapshotPayload(snapshotConfig, AGENTS_SNAPSHOT_TYPE);
    const agentsState = agentsLoaded.found && agentsLoaded.payload
      ? sanitizeAgentRegistryState(agentsLoaded.payload)
      : defaultAgentRegistryState();
    const missionId = validated.data.mission.id;
    const nowUtc = new Date().toISOString();
    const hasPending = queueState.rows.some((row) => {
      if (row.mission_id !== missionId) return false;
      return row.status === "open" || row.status === "in_progress";
    });

    if (hasPending) {
      queueSync = {
        status: "already_exists",
        inserted: 0,
        snapshot_type: QUEUE_SNAPSHOT_TYPE
      };
    } else {
      const fallbackPriority = normalizeQueuePriority(validated.data.mission.level);
      const parts = Array.isArray(validated.data.parts) && validated.data.parts.length > 0
        ? validated.data.parts
        : [
            {
              part_id: "P1",
              goal: validated.data.mission.target || "Classificar escopo e preparar distribuição inicial",
              executor: "STAFF" as const,
              priority: fallbackPriority
            }
          ];
      const queueMissionUdn = String(effectiveUdn || "").trim();
      const missionNotes = String(validated.data.mission.notes || "").trim();
      const queueMissionDescription = missionNotes
        ? `Solicitação:\n${queueMissionUdn}\n\nNotas:\n${missionNotes}`.slice(0, 800)
        : queueMissionUdn.slice(0, 800);

      const items: QueueItem[] = parts.map((part, index) => {
        const partPriority = normalizeQueuePriority(part.priority || fallbackPriority);
        const assignee = (String(part.executor || "STAFF").toUpperCase() as QueueAssignee);
        const safeAssignee: QueueAssignee = assignee === "CPP" || assignee === "CPP-IA" ? assignee : "STAFF";
        const preferredAgentId = resolvePreferredQueueAgent(safeAssignee, agentsState);
        const title = String(part.goal || `Parte ${index + 1}`).trim() || `Parte ${index + 1}`;
        return {
          queue_id: createQueueId(missionId, title, index + 1),
          mission_id: missionId,
          title,
          description: queueMissionDescription || queueMissionUdn.slice(0, 800) || title,
          kind: safeAssignee,
          priority: partPriority,
          assignee: safeAssignee,
          ...(preferredAgentId ? { assignee_agent_id: preferredAgentId } : {}),
          last_transition_reason_code: "MISSION_REGISTERED",
          last_transition_reason_message: `Item criado automaticamente no registro da missão por ${ownerId}.`,
          last_transition_source: "missions-register",
          last_transition_actor: ownerId,
          last_transition_at_utc: nowUtc,
          status: toQueueStatus(partPriority),
          created_at_utc: nowUtc,
          updated_at_utc: nowUtc
        };
      });

      const queueNext = upsertQueueItems(queueState, items);
      const queueSaved = await saveSnapshotPayload(snapshotConfig, {
        snapshotType: QUEUE_SNAPSHOT_TYPE,
        payload: queueNext,
        createdBy: ownerId,
        sourceRepo: "gov-manager",
        sourceRef: "missions-register-auto-queue"
      });

      queueSync = {
        status: queueSaved.ok ? "saved" : "upstream_error",
        inserted: items.length,
        snapshot_type: QUEUE_SNAPSHOT_TYPE,
        govhub_http: queueSaved.status,
        payload_sha256: queueSaved.payload_sha256
      };
    }
  }

    return NextResponse.json(
      {
        status: upstreamResponse.ok ? "registered" : "upstream_error",
        govhub_http: upstreamResponse.status,
        mission_id: validated.data.mission.id,
        requested_agent_id: requestedAgentId,
        effective_agent_id: effectiveAgentId,
        token_control: validated.data.token_control || null,
        token_preview: preview,
        token_governance: {
          source: governanceSource,
          ...governanceDecision
        },
        token_usage_sync: tokenUsageSync,
        queue_sync: queueSync,
        prompt_ref: promptResolution,
        udn_version: "2.0_compact",
        udn_canonicalized: udnCanonicalized,
        udn_defaults_applied: udnDefaultsApplied,
        govhub_response: upstreamJson
      },
      { status: upstreamResponse.ok ? 200 : 502 }
    );
  } catch (error) {
    const detail = error instanceof Error ? error.message : "unexpected_error";
    return NextResponse.json(
      {
        status: "internal_error",
        error_code: "MISSION_REGISTER_INTERNAL_ERROR",
        message: "unexpected internal error while registering mission",
        detail
      },
      { status: 500 }
    );
  }
}
