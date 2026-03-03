import { NextResponse } from "next/server";
import { hasSessionCookie } from "../../../../../auth/session";
import { loadSnapshotPayload, resolveGovhubSnapshotConfig } from "../../../../../core/govhub-snapshots";
import {
  computeUsageSummary,
  defaultTokenPolicyState,
  defaultTokenUsageState,
  resolvePolicyForOwner,
  sanitizeTokenPolicyState,
  sanitizeTokenUsageState
} from "../../../../../core/token-governance";

const USAGE_SNAPSHOT_TYPE = String(process.env.GOVHUB_TOKEN_USAGE_SNAPSHOT_TYPE || "gov_manager_token_usage_v1").trim();
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

  const url = new URL(request.url);
  const ownerId = String(url.searchParams.get("owner_id") || "staff@gov-manager").trim();

  const [usageLoaded, policyLoaded] = await Promise.all([
    loadSnapshotPayload(config, USAGE_SNAPSHOT_TYPE),
    loadSnapshotPayload(config, POLICY_SNAPSHOT_TYPE)
  ]);

  const usageState = usageLoaded.found && usageLoaded.payload
    ? sanitizeTokenUsageState(usageLoaded.payload)
    : defaultTokenUsageState();

  const policyState = policyLoaded.found && policyLoaded.payload
    ? sanitizeTokenPolicyState(policyLoaded.payload)
    : defaultTokenPolicyState();

  const summary = computeUsageSummary(usageState, ownerId);
  const policy = resolvePolicyForOwner(policyState, ownerId);
  const rows = usageState.rows
    .filter((row) => row.owner_id === ownerId)
    .sort((a, b) => b.created_at_utc.localeCompare(a.created_at_utc))
    .slice(0, 100);

  return NextResponse.json(
    {
      status: "ok",
      owner_id: ownerId,
      summary,
      policy,
      rows,
      source: {
        usage_snapshot_type: USAGE_SNAPSHOT_TYPE,
        policy_snapshot_type: POLICY_SNAPSHOT_TYPE,
        usage_payload_sha256: usageLoaded.payload_sha256 || null,
        policy_payload_sha256: policyLoaded.payload_sha256 || null
      }
    },
    { status: 200 }
  );
}
