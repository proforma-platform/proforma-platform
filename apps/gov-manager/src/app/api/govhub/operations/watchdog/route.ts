import { NextResponse } from "next/server";
import { resolveGovhubSnapshotConfig, loadSnapshotPayload, saveSnapshotPayload } from "../../../../../core/govhub-snapshots";
import { defaultQueueState, sanitizeQueueState, upsertQueueItems, type QueueItem } from "../../../../../core/execution-queue";
import { defaultAgentRegistryState, hasHealthyAssigneeAgent, sanitizeAgentRegistryState } from "../../../../../core/agent-registry";
import { createAlertId, defaultAlertState, sanitizeAlertState, upsertAlerts, type AlertRow } from "../../../../../core/alerts";
import { defaultWatchdogState, sanitizeWatchdogState, upsertWatchdogAttempts, type WatchdogAttempt } from "../../../../../core/watchdog-state";
import { requireRole } from "../../../../../core/rbac";
import { recordAuditEvent } from "../../../../../core/audit-store";

const QUEUE_SNAPSHOT_TYPE = String(process.env.GOVHUB_EXECUTION_QUEUE_SNAPSHOT_TYPE || "gov_manager_execution_queue_v1").trim();
const AGENTS_SNAPSHOT_TYPE = String(process.env.GOVHUB_AGENT_REGISTRY_SNAPSHOT_TYPE || "gov_manager_agent_registry_v1").trim();
const ALERTS_SNAPSHOT_TYPE = String(process.env.GOVHUB_ALERTS_SNAPSHOT_TYPE || "gov_manager_alerts_v1").trim();
const WATCHDOG_SNAPSHOT_TYPE = String(process.env.GOVHUB_WATCHDOG_SNAPSHOT_TYPE || "gov_manager_watchdog_v1").trim();

function hasGovhubToken(request: Request, expectedToken: string): boolean {
  const provided = String(request.headers.get("x-govhub-token") || "").trim();
  return Boolean(provided && expectedToken && provided === expectedToken);
}

function clampText(value: unknown, max: number): string {
  return String(value || "").trim().slice(0, max);
}

function toEpoch(value: unknown): number | null {
  const parsed = Date.parse(String(value || "").trim());
  return Number.isFinite(parsed) ? parsed : null;
}

function isRowStuck(row: QueueItem, nowEpoch: number, thresholdMin: number): boolean {
  const updatedEpoch = toEpoch(row.updated_at_utc) ?? toEpoch(row.created_at_utc);
  if (!updatedEpoch) return true;
  const ageMin = Math.max(0, Math.round((nowEpoch - updatedEpoch) / 60000));
  return ageMin >= thresholdMin;
}

export async function GET(request: Request) {
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

  const [queueLoaded, agentsLoaded, alertsLoaded, watchdogLoaded] = await Promise.all([
    loadSnapshotPayload(config, QUEUE_SNAPSHOT_TYPE),
    loadSnapshotPayload(config, AGENTS_SNAPSHOT_TYPE),
    loadSnapshotPayload(config, ALERTS_SNAPSHOT_TYPE),
    loadSnapshotPayload(config, WATCHDOG_SNAPSHOT_TYPE)
  ]);

  const queueState = queueLoaded.found && queueLoaded.payload ? sanitizeQueueState(queueLoaded.payload) : defaultQueueState();
  const agentState = agentsLoaded.found && agentsLoaded.payload ? sanitizeAgentRegistryState(agentsLoaded.payload) : defaultAgentRegistryState();
  const alertsState = alertsLoaded.found && alertsLoaded.payload ? sanitizeAlertState(alertsLoaded.payload) : defaultAlertState();
  const watchdogState = watchdogLoaded.found && watchdogLoaded.payload ? sanitizeWatchdogState(watchdogLoaded.payload) : defaultWatchdogState();

  return NextResponse.json(
    {
      status: "ok",
      queue_snapshot_type: QUEUE_SNAPSHOT_TYPE,
      agents_snapshot_type: AGENTS_SNAPSHOT_TYPE,
      alerts_snapshot_type: ALERTS_SNAPSHOT_TYPE,
      watchdog_snapshot_type: WATCHDOG_SNAPSHOT_TYPE,
      queue_rows: queueState.rows.length,
      in_progress_rows: queueState.rows.filter((row) => row.status === "in_progress").length,
      watchdog_attempts: watchdogState.attempts.length,
      open_alerts: alertsState.rows.filter((row) => row.status === "open").length
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

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const data = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const action = clampText(data.action, 24).toLowerCase() || "run";
  if (action !== "run") {
    return NextResponse.json({ status: "invalid_request", error_code: "ACTION_NOT_SUPPORTED", allowed_actions: ["run"] }, { status: 400 });
  }
  const actor = auth.ok ? auth.session.username : "xbo-watchdog";
  const actorRole = auth.ok ? auth.session.role : "admin";

  const staleThresholdMin = Number.isFinite(Number(data.stale_threshold_min))
    ? Math.max(1, Math.min(240, Math.trunc(Number(data.stale_threshold_min))))
    : Math.max(1, Math.min(240, Number.parseInt(String(process.env.GOVHUB_WATCHDOG_STALE_MIN || "30"), 10) || 30));

  const [queueLoaded, agentsLoaded, alertsLoaded, watchdogLoaded] = await Promise.all([
    loadSnapshotPayload(config, QUEUE_SNAPSHOT_TYPE),
    loadSnapshotPayload(config, AGENTS_SNAPSHOT_TYPE),
    loadSnapshotPayload(config, ALERTS_SNAPSHOT_TYPE),
    loadSnapshotPayload(config, WATCHDOG_SNAPSHOT_TYPE)
  ]);

  const queueState = queueLoaded.found && queueLoaded.payload ? sanitizeQueueState(queueLoaded.payload) : defaultQueueState();
  const agentState = agentsLoaded.found && agentsLoaded.payload ? sanitizeAgentRegistryState(agentsLoaded.payload) : defaultAgentRegistryState();
  const alertsState = alertsLoaded.found && alertsLoaded.payload ? sanitizeAlertState(alertsLoaded.payload) : defaultAlertState();
  const watchdogState = watchdogLoaded.found && watchdogLoaded.payload ? sanitizeWatchdogState(watchdogLoaded.payload) : defaultWatchdogState();

  const now = new Date().toISOString();
  const nowEpoch = Date.now();
  const attemptMap = new Map(watchdogState.attempts.map((row) => [row.queue_id, row] as const));

  const changedRows: QueueItem[] = [];
  const alertRows: AlertRow[] = [];
  const attemptRows: WatchdogAttempt[] = [];
  const openAlertKeys = new Set(
    alertsState.rows
      .filter((row) => row.status === "open" || row.status === "ack")
      .map((row) => `${row.type}|${row.queue_id}|${row.source}`)
  );

  for (const row of queueState.rows) {
    if (row.status !== "in_progress") continue;

    const stuck = isRowStuck(row, nowEpoch, staleThresholdMin);
    const healthy = hasHealthyAssigneeAgent(agentState, row.assignee);
    if (!stuck && healthy) continue;

    const reason = !healthy ? "worker_unavailable" : "stale_progress";
    const prevAttempt = attemptMap.get(row.queue_id);
    const currentAttempt = prevAttempt ? Math.max(0, prevAttempt.count) : 0;

    let nextStatus: QueueItem["status"] = "open";
    let nextAttempt = currentAttempt + 1;
    if (nextAttempt > 2) {
      nextStatus = "paused_waiting_owner";
      nextAttempt = 2;
    }

    changedRows.push({
      ...row,
      status: nextStatus,
      updated_at_utc: now
    });

    attemptRows.push({
      queue_id: row.queue_id,
      count: nextAttempt,
      last_reason: reason,
      updated_at_utc: now
    });

    const alertKey = `watchdog|${row.queue_id}|watchdog`;
    if (!openAlertKeys.has(alertKey)) {
      alertRows.push({
        alert_id: createAlertId("WD"),
        type: "watchdog",
        severity: nextStatus === "paused_waiting_owner" ? "high" : "medium",
        mission_id: row.mission_id,
        queue_id: row.queue_id,
        message: nextStatus === "paused_waiting_owner"
          ? `Item pausado por watchdog após tentativas: ${row.title}`
          : `Retry automático ${nextAttempt}/2 por watchdog: ${row.title}`,
        status: "open",
        source: "watchdog",
        created_at_utc: now,
        updated_at_utc: now
      });
      openAlertKeys.add(alertKey);
    }
  }

  const nextQueue = changedRows.length > 0 ? upsertQueueItems(queueState, changedRows) : queueState;
  const nextAlerts = alertRows.length > 0 ? upsertAlerts(alertsState, alertRows) : alertsState;
  const nextWatchdog = attemptRows.length > 0 ? upsertWatchdogAttempts(watchdogState, attemptRows) : watchdogState;

  const saveOps = await Promise.all([
    changedRows.length > 0
      ? saveSnapshotPayload(config, {
          snapshotType: QUEUE_SNAPSHOT_TYPE,
          payload: nextQueue,
          createdBy: actor,
          sourceRepo: "gov-manager",
          sourceRef: "watchdog-queue"
        })
      : Promise.resolve(null),
    alertRows.length > 0
      ? saveSnapshotPayload(config, {
          snapshotType: ALERTS_SNAPSHOT_TYPE,
          payload: nextAlerts,
          createdBy: actor,
          sourceRepo: "gov-manager",
          sourceRef: "watchdog-alerts"
        })
      : Promise.resolve(null),
    attemptRows.length > 0
      ? saveSnapshotPayload(config, {
          snapshotType: WATCHDOG_SNAPSHOT_TYPE,
          payload: nextWatchdog,
          createdBy: actor,
          sourceRepo: "gov-manager",
          sourceRef: "watchdog-state"
        })
      : Promise.resolve(null)
  ]);

  await recordAuditEvent(config, {
    actor,
    role: actorRole,
    action: "watchdog.run",
    target: "execution-queue",
    after_state: JSON.stringify({ changed: changedRows.length, alerts: alertRows.length, stale_threshold_min: staleThresholdMin }),
    correlation_id: `watchdog-${Date.now()}`,
    source: "operations-watchdog",
    createdBy: actor
  });

  const hasUpstreamError = saveOps.some((row) => row && row.ok === false);
  return NextResponse.json(
    {
      status: hasUpstreamError ? "upstream_error" : "ok",
      stale_threshold_min: staleThresholdMin,
      changed: changedRows.length,
      reopened: changedRows.filter((row) => row.status === "open").length,
      paused_waiting_owner: changedRows.filter((row) => row.status === "paused_waiting_owner").length,
      alerts_opened: alertRows.length,
      watchdog_attempts_updated: attemptRows.length
    },
    { status: hasUpstreamError ? 502 : 200 }
  );
}
