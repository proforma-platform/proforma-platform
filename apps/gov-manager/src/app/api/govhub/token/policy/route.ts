import { NextResponse } from "next/server";
import { hasSessionCookie } from "../../../../../auth/session";
import { loadSnapshotPayload, resolveGovhubSnapshotConfig, saveSnapshotPayload } from "../../../../../core/govhub-snapshots";
import { defaultTokenPolicyState, sanitizeTokenPolicyState, type TokenPolicyState } from "../../../../../core/token-governance";

const POLICY_SNAPSHOT_TYPE = String(process.env.GOVHUB_TOKEN_POLICY_SNAPSHOT_TYPE || "gov_manager_token_policy_v1").trim();

export async function GET(request: Request) {
  if (!hasSessionCookie(request)) {
    return NextResponse.json({ status: "unauthorized", error_code: "AUTH_REQUIRED" }, { status: 401 });
  }

  const config = resolveGovhubSnapshotConfig();
  if (!config.baseUrl || !config.token) {
    return NextResponse.json(
      { status: "misconfigured", error_code: "GOVHUB_ENV_REQUIRED", message: "GOVHUB_BASE_URL and GOVHUB_TOKEN are required" },
      { status: 500 }
    );
  }

  const loaded = await loadSnapshotPayload(config, POLICY_SNAPSHOT_TYPE);
  const state = loaded.found && loaded.payload ? sanitizeTokenPolicyState(loaded.payload) : defaultTokenPolicyState();

  return NextResponse.json(
    {
      status: "ok",
      snapshot_type: POLICY_SNAPSHOT_TYPE,
      policy: state,
      payload_sha256: loaded.payload_sha256 || null
    },
    { status: 200 }
  );
}

export async function PUT(request: Request) {
  if (!hasSessionCookie(request)) {
    return NextResponse.json({ status: "unauthorized", error_code: "AUTH_REQUIRED" }, { status: 401 });
  }

  const config = resolveGovhubSnapshotConfig();
  if (!config.baseUrl || !config.token) {
    return NextResponse.json(
      { status: "misconfigured", error_code: "GOVHUB_ENV_REQUIRED", message: "GOVHUB_BASE_URL and GOVHUB_TOKEN are required" },
      { status: 500 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ status: "invalid_request", error_code: "JSON_INVALID" }, { status: 400 });
  }

  const data = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const actor = String(data.updated_by || "staff@gov-manager").trim() || "staff@gov-manager";

  const incoming = data.policy && typeof data.policy === "object" ? (data.policy as TokenPolicyState) : null;
  if (!incoming) {
    return NextResponse.json(
      { status: "invalid_request", error_code: "POLICY_REQUIRED", message: "policy object is required" },
      { status: 400 }
    );
  }

  const state = sanitizeTokenPolicyState({ ...incoming, updated_at_utc: new Date().toISOString() });
  const saved = await saveSnapshotPayload(config, {
    snapshotType: POLICY_SNAPSHOT_TYPE,
    payload: state,
    createdBy: actor,
    sourceRepo: "gov-manager",
    sourceRef: "token-policy"
  });

  return NextResponse.json(
    {
      status: saved.ok ? "ok" : "upstream_error",
      govhub_http: saved.status,
      snapshot_type: POLICY_SNAPSHOT_TYPE,
      policy: state,
      payload_sha256: saved.payload_sha256,
      govhub_response: saved.response
    },
    { status: saved.ok ? 200 : 502 }
  );
}
