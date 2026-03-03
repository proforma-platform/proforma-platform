import { NextResponse } from "next/server";
import { hasSessionCookie } from "../../../../../auth/session";
import {
  buildCostPreview,
  computeRealtimeProjection,
  decodeMissionRunsSnapshot,
  type TokenControlInput
} from "../../../../../core/token-estimator";
import { loadSnapshotPayload, resolveGovhubSnapshotConfig } from "../../../../../core/govhub-snapshots";
import {
  computeUsageSummary,
  defaultTokenPolicyState,
  defaultTokenUsageState,
  resolvePolicyForOwner,
  sanitizeTokenPolicyState,
  sanitizeTokenUsageState
} from "../../../../../core/token-governance";

function resolveGovhubConfig() {
  const baseUrl = String(process.env.GOVHUB_BASE_URL || "").trim();
  const token = String(process.env.GOVHUB_TOKEN || "").trim();
  const latestPath = String(
    process.env.GOVHUB_SNAPSHOTS_LATEST_PATH || "/webhook/govhub/snapshots/latest?snapshot_type=mission_runs_v1"
  ).trim();
  return { baseUrl, token, latestPath };
}

const POLICY_SNAPSHOT_TYPE = String(process.env.GOVHUB_TOKEN_POLICY_SNAPSHOT_TYPE || "gov_manager_token_policy_v1").trim();
const USAGE_SNAPSHOT_TYPE = String(process.env.GOVHUB_TOKEN_USAGE_SNAPSHOT_TYPE || "gov_manager_token_usage_v1").trim();

export async function GET(request: Request) {
  if (!hasSessionCookie(request)) {
    return NextResponse.json({ status: "unauthorized", error_code: "AUTH_REQUIRED" }, { status: 401 });
  }

  const url = new URL(request.url);
  const missionId = String(url.searchParams.get("mission_id") || "").trim();
  const agentId = String(url.searchParams.get("agent_id") || "CPP").trim();
  const udn = String(url.searchParams.get("udn") || "").trim();
  const objective = String(url.searchParams.get("objective") || "").trim();
  const ownerId = String(url.searchParams.get("owner_id") || "staff@gov-manager").trim();

  if (!missionId) {
    return NextResponse.json({ status: "invalid_request", error_code: "MISSION_ID_REQUIRED" }, { status: 400 });
  }

  const tokenControl = parseTokenControl(url.searchParams.get("token_control"));
  const preview = buildCostPreview({
    mission_id: missionId,
    agent_id: agentId,
    udn,
    objective,
    token_control: tokenControl
  });

  const { baseUrl, token, latestPath } = resolveGovhubConfig();
  if (!baseUrl || !token) {
    return NextResponse.json(
      {
        status: "misconfigured",
        error_code: "GOVHUB_ENV_REQUIRED",
        preview
      },
      { status: 500 }
    );
  }

  const endpoint = `${baseUrl.replace(/\/+$/, "")}${latestPath.startsWith("/") ? latestPath : `/${latestPath}`}`;

  let upstreamResponse: Response;
  try {
    upstreamResponse = await fetch(endpoint, {
      method: "GET",
      headers: { "x-govhub-token": token },
      cache: "no-store"
    });
  } catch {
    return NextResponse.json(
      {
        status: "upstream_unreachable",
        error_code: "GOVHUB_FETCH_FAILED",
        preview
      },
      { status: 502 }
    );
  }

  let payload: unknown = null;
  try {
    payload = await upstreamResponse.json();
  } catch {
    payload = null;
  }

  if (!upstreamResponse.ok || !payload || typeof payload !== "object") {
    return NextResponse.json(
      {
        status: "upstream_error",
        error_code: "SNAPSHOT_LATEST_ERROR",
        govhub_http: upstreamResponse.status,
        preview
      },
      { status: 502 }
    );
  }

  const payloadB64 = String((payload as Record<string, unknown>).payload_b64 || "").trim();
  if (!payloadB64) {
    return NextResponse.json(
      {
        status: "snapshot_missing",
        error_code: "MISSION_RUNS_PAYLOAD_MISSING",
        preview
      },
      { status: 404 }
    );
  }

  let runs;
  try {
    runs = decodeMissionRunsSnapshot(payloadB64);
  } catch {
    return NextResponse.json(
      {
        status: "snapshot_invalid",
        error_code: "MISSION_RUNS_PAYLOAD_INVALID",
        preview
      },
      { status: 422 }
    );
  }

  const realtime = computeRealtimeProjection(missionId, preview, runs);
  const snapshotConfig = resolveGovhubSnapshotConfig();

  let policy = defaultTokenPolicyState().default_policy;
  let usage = computeUsageSummary(defaultTokenUsageState(), ownerId);
  if (snapshotConfig.baseUrl && snapshotConfig.token) {
    const [policyLoaded, usageLoaded] = await Promise.all([
      loadSnapshotPayload(snapshotConfig, POLICY_SNAPSHOT_TYPE),
      loadSnapshotPayload(snapshotConfig, USAGE_SNAPSHOT_TYPE)
    ]);
    const policyState = policyLoaded.found && policyLoaded.payload
      ? sanitizeTokenPolicyState(policyLoaded.payload)
      : defaultTokenPolicyState();
    const usageState = usageLoaded.found && usageLoaded.payload
      ? sanitizeTokenUsageState(usageLoaded.payload)
      : defaultTokenUsageState();

    policy = resolvePolicyForOwner(policyState, ownerId);
    usage = computeUsageSummary(usageState, ownerId);
  }

  return NextResponse.json(
    {
      status: "ok",
      preview,
      realtime,
      governance: {
        owner_id: ownerId,
        policy,
        usage
      },
      next_action: realtime.found ? "monitor_progress" : "wait_for_first_run"
    },
    { status: 200 }
  );
}

function parseTokenControl(raw: string | null): TokenControlInput | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as TokenControlInput;
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}
