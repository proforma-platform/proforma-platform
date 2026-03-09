import { NextResponse } from "next/server";
import { requireRole } from "../../../../../core/rbac";
import { resolveGovhubSnapshotConfig } from "../../../../../core/govhub-snapshots";
import { recomputeAndPersistOfficePresence } from "../../../../../core/office-presence";

function clampText(value: unknown, max = 120): string {
  return String(value || "").trim().slice(0, max);
}

function toBool(value: unknown, fallback = false): boolean {
  if (typeof value === "boolean") return value;
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) return fallback;
  if (["1", "true", "yes", "sim", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "nao", "não", "off"].includes(normalized)) return false;
  return fallback;
}

function parseNumber(value: unknown, fallback: number, min: number, max: number): number {
  const raw = Number(value);
  if (!Number.isFinite(raw)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(raw)));
}

export async function GET(request: Request) {
  const auth = requireRole(request, "viewer");
  if (!auth.ok) {
    return NextResponse.json({ status: "unauthorized", error_code: auth.error_code }, { status: auth.status });
  }

  const config = resolveGovhubSnapshotConfig();
  if (!config.baseUrl || !config.token) {
    return NextResponse.json(
      { status: "misconfigured", error_code: "GOVHUB_ENV_REQUIRED", message: "GOVHUB_BASE_URL and GOVHUB_TOKEN are required" },
      { status: 500 }
    );
  }

  const url = new URL(request.url);
  const persist = toBool(url.searchParams.get("persist"), false);
  const standbyAfterMin = parseNumber(url.searchParams.get("standby_after_min"), 20, 5, 480);
  const awaitingNextMin = parseNumber(url.searchParams.get("awaiting_next_min"), 20, 5, 480);
  const actor = auth.session.username;

  const result = await recomputeAndPersistOfficePresence(config, {
    actor,
    sourceRef: "operations-presence-get",
    forcePersist: persist,
    options: {
      standby_after_min: standbyAfterMin,
      awaiting_next_min: awaitingNextMin
    }
  });

  return NextResponse.json(
    {
      status: result.status,
      snapshot_type: result.snapshot_type,
      changed: result.changed,
      persisted: result.persisted,
      payload_sha256: result.payload_sha256,
      updated_at_utc: result.state.updated_at_utc,
      options: {
        standby_after_min: standbyAfterMin,
        awaiting_next_min: awaitingNextMin
      },
      assignee_rows: result.state.assignee_rows,
      identity_rows: result.state.identity_rows,
      office_rows: result.state.office_rows
    },
    { status: result.status === "ok" ? 200 : 502 }
  );
}

export async function POST(request: Request) {
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

  const standbyAfterMin = parseNumber(data.standby_after_min, 20, 5, 480);
  const awaitingNextMin = parseNumber(data.awaiting_next_min, 20, 5, 480);
  const forcePersist = toBool(data.force_persist, true);
  const sourceRef = clampText(data.source_ref, 80) || "operations-presence-post";
  const actor = auth.session.username;

  const result = await recomputeAndPersistOfficePresence(config, {
    actor,
    sourceRef,
    forcePersist,
    options: {
      standby_after_min: standbyAfterMin,
      awaiting_next_min: awaitingNextMin
    }
  });

  return NextResponse.json(
    {
      status: result.status,
      action: "run",
      changed: result.changed,
      persisted: result.persisted,
      snapshot_type: result.snapshot_type,
      payload_sha256: result.payload_sha256,
      updated_at_utc: result.state.updated_at_utc,
      options: {
        standby_after_min: standbyAfterMin,
        awaiting_next_min: awaitingNextMin
      },
      summary: {
        assignees: result.state.assignee_rows.length,
        identities: result.state.identity_rows.length,
        offices: result.state.office_rows.length
      }
    },
    { status: result.status === "ok" ? 200 : 502 }
  );
}

