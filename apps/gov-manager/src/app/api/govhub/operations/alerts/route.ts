import { NextResponse } from "next/server";
import { resolveGovhubSnapshotConfig, loadSnapshotPayload, saveSnapshotPayload } from "../../../../../core/govhub-snapshots";
import { createAlertId, defaultAlertState, sanitizeAlertState, summarizeAlerts, upsertAlerts, type AlertSeverity, type AlertStatus, type AlertRow } from "../../../../../core/alerts";
import { requireRole } from "../../../../../core/rbac";
import { recordAuditEvent } from "../../../../../core/audit-store";

const ALERTS_SNAPSHOT_TYPE = String(process.env.GOVHUB_ALERTS_SNAPSHOT_TYPE || "gov_manager_alerts_v1").trim();

function hasGovhubToken(request: Request, expectedToken: string): boolean {
  const provided = String(request.headers.get("x-govhub-token") || "").trim();
  return Boolean(provided && expectedToken && provided === expectedToken);
}

function clampText(value: unknown, max: number): string {
  return String(value || "").trim().slice(0, max);
}

function sanitizeSeverity(value: unknown): AlertSeverity {
  const normalized = clampText(value, 16).toLowerCase();
  if (normalized === "low" || normalized === "medium" || normalized === "high" || normalized === "critical") return normalized;
  return "medium";
}

function sanitizeStatus(value: unknown): AlertStatus {
  const normalized = clampText(value, 16).toLowerCase();
  if (normalized === "open" || normalized === "ack" || normalized === "resolved") return normalized;
  return "open";
}

export async function GET(request: Request) {
  const config = resolveGovhubSnapshotConfig();
  const auth = requireRole(request, "viewer");
  const tokenAuth = hasGovhubToken(request, config.token);
  if (!auth.ok && !tokenAuth) {
    return NextResponse.json({ status: "unauthorized", error_code: auth.error_code }, { status: auth.status });
  }
  if (!config.baseUrl || !config.token) {
    return NextResponse.json(
      { status: "misconfigured", error_code: "GOVHUB_ENV_REQUIRED", message: "GOVHUB_BASE_URL and GOVHUB_TOKEN are required" },
      { status: 500 }
    );
  }

  const loaded = await loadSnapshotPayload(config, ALERTS_SNAPSHOT_TYPE);
  const state = loaded.found && loaded.payload ? sanitizeAlertState(loaded.payload) : defaultAlertState();

  const url = new URL(request.url);
  const statusFilter = clampText(url.searchParams.get("status"), 20).toLowerCase();
  const severityFilter = clampText(url.searchParams.get("severity"), 20).toLowerCase();
  const rows = state.rows.filter((row) => {
    if (statusFilter && String(row.status || "").toLowerCase() !== statusFilter) return false;
    if (severityFilter && String(row.severity || "").toLowerCase() !== severityFilter) return false;
    return true;
  });

  return NextResponse.json(
    {
      status: "ok",
      snapshot_type: ALERTS_SNAPSHOT_TYPE,
      updated_at_utc: state.updated_at_utc,
      summary: summarizeAlerts(rows),
      rows,
      payload_sha256: loaded.payload_sha256 || null
    },
    { status: 200 }
  );
}

export async function POST(request: Request) {
  const config = resolveGovhubSnapshotConfig();
  const auth = requireRole(request, "engineer");
  const tokenAuth = hasGovhubToken(request, config.token);
  if (!auth.ok && !tokenAuth) {
    return NextResponse.json({ status: "forbidden", error_code: auth.error_code }, { status: auth.status });
  }
  if (!config.baseUrl || !config.token) {
    return NextResponse.json(
      { status: "misconfigured", error_code: "GOVHUB_ENV_REQUIRED", message: "GOVHUB_BASE_URL and GOVHUB_TOKEN are required" },
      { status: 500 }
    );
  }
  const actor = auth.ok ? auth.session.username : "xbo-watchdog";
  const actorRole = auth.ok ? auth.session.role : "admin";

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ status: "invalid_request", error_code: "JSON_INVALID" }, { status: 400 });
  }

  const data = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const action = clampText(data.action, 32).toLowerCase() || "create";

  const loaded = await loadSnapshotPayload(config, ALERTS_SNAPSHOT_TYPE);
  const state = loaded.found && loaded.payload ? sanitizeAlertState(loaded.payload) : defaultAlertState();
  const now = new Date().toISOString();

  let changes: AlertRow[] = [];
  let reusedAlertId = "";
  if (action === "create") {
    const message = clampText(data.message, 300);
    if (!message) {
      return NextResponse.json({ status: "invalid_request", error_code: "MESSAGE_REQUIRED" }, { status: 400 });
    }
    const type = clampText(data.type, 80) || "manual";
    const missionId = clampText(data.mission_id, 120);
    const queueId = clampText(data.queue_id, 120);
    const source = clampText(data.source, 120) || "operations-alerts";
    const existing = state.rows.find((row) => {
      if (!(row.status === "open" || row.status === "ack")) return false;
      return (
        String(row.type || "") === type &&
        String(row.mission_id || "") === missionId &&
        String(row.queue_id || "") === queueId &&
        String(row.source || "") === source &&
        String(row.message || "") === message
      );
    });
    if (existing) {
      reusedAlertId = existing.alert_id;
      changes = [];
    } else {
      changes = [
        {
          alert_id: createAlertId(),
          type,
          severity: sanitizeSeverity(data.severity),
          mission_id: missionId,
          queue_id: queueId,
          message,
          status: "open",
          source,
          created_at_utc: now,
          updated_at_utc: now
        }
      ];
    }
  } else if (action === "ack" || action === "resolve") {
    const alertId = clampText(data.alert_id, 120);
    if (!alertId) {
      return NextResponse.json({ status: "invalid_request", error_code: "ALERT_ID_REQUIRED" }, { status: 400 });
    }
    const existing = state.rows.find((row) => row.alert_id === alertId);
    if (!existing) {
      return NextResponse.json({ status: "not_found", error_code: "ALERT_NOT_FOUND" }, { status: 404 });
    }
    changes = [
      {
        ...existing,
        status: action === "ack" ? "ack" : "resolved",
        updated_at_utc: now
      }
    ];
  } else {
    return NextResponse.json(
      { status: "invalid_request", error_code: "ACTION_NOT_SUPPORTED", allowed_actions: ["create", "ack", "resolve"] },
      { status: 400 }
    );
  }

  const next = changes.length > 0 ? upsertAlerts(state, changes) : state;
  const saved =
    changes.length > 0
      ? await saveSnapshotPayload(config, {
          snapshotType: ALERTS_SNAPSHOT_TYPE,
          payload: next,
          createdBy: actor,
          sourceRepo: "gov-manager",
          sourceRef: "operations-alerts"
        })
      : { ok: true, status: 200, payload_sha256: null as string | null, response: { status: "already_exists", alert_id: reusedAlertId } };

  if (changes.length > 0) {
    await recordAuditEvent(config, {
      actor,
      role: actorRole,
      action: `alerts.${action}`,
      target: action === "create" ? String(changes[0]?.alert_id || "") : clampText(data.alert_id, 120),
      after_state: JSON.stringify(changes[0] || {}),
      correlation_id: `${action}-${Date.now()}`,
      source: "operations-alerts",
      createdBy: actor
    });
  }

  return NextResponse.json(
    {
      status: saved.ok ? "ok" : "upstream_error",
      govhub_http: saved.status,
      snapshot_type: ALERTS_SNAPSHOT_TYPE,
      changed: changes.length,
      already_exists: changes.length === 0 && Boolean(reusedAlertId),
      alert_id: changes[0]?.alert_id || reusedAlertId || null,
      summary: summarizeAlerts(next.rows),
      rows: next.rows.slice(0, 80),
      payload_sha256: saved.payload_sha256,
      govhub_response: saved.response
    },
    { status: saved.ok ? 200 : 502 }
  );
}
