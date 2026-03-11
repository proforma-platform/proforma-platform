import { NextResponse } from "next/server";
import { resolveGovhubSnapshotConfig, loadSnapshotPayload } from "../../../../../core/govhub-snapshots";
import { sanitizeAuditLogState } from "../../../../../core/audit-log";
import { AUDIT_SNAPSHOT_TYPE } from "../../../../../core/audit-store";
import { requireRole } from "../../../../../core/rbac";

function clampText(value: unknown, max: number): string {
  return String(value || "").trim().slice(0, max);
}

export async function GET(request: Request) {
  const auth = requireRole(request, "engineer");
  if (!auth.ok) {
    return NextResponse.json({ status: "forbidden", error_code: auth.error_code }, { status: auth.status });
  }

  const config = resolveGovhubSnapshotConfig();
  if (!config.baseUrl || !config.token) {
    return NextResponse.json(
      { status: "misconfigured", error_code: "GOVHUB_ENV_REQUIRED", message: "GOVHUB_BASE_URL and GOVHUB_TOKEN are required" },
      { status: 500 }
    );
  }

  const loaded = await loadSnapshotPayload(config, AUDIT_SNAPSHOT_TYPE);
  const state = loaded.found && loaded.payload ? sanitizeAuditLogState(loaded.payload) : sanitizeAuditLogState(null);

  const url = new URL(request.url);
  const actorFilter = clampText(url.searchParams.get("actor"), 120).toLowerCase();
  const actionFilter = clampText(url.searchParams.get("action"), 120).toLowerCase();
  const limitRaw = Number(url.searchParams.get("limit") || 200);
  const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(1000, Math.trunc(limitRaw))) : 200;

  const rows = state.rows
    .filter((row) => {
      if (actorFilter && !String(row.actor || "").toLowerCase().includes(actorFilter)) return false;
      if (actionFilter && !String(row.action || "").toLowerCase().includes(actionFilter)) return false;
      return true;
    })
    .slice(0, limit);

  return NextResponse.json(
    {
      status: "ok",
      snapshot_type: AUDIT_SNAPSHOT_TYPE,
      updated_at_utc: state.updated_at_utc,
      total_rows: state.rows.length,
      rows,
      payload_sha256: loaded.payload_sha256 || null
    },
    { status: 200 }
  );
}
