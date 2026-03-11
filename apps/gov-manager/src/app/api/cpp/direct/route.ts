import { NextResponse } from "next/server";
import { readSessionFromRequest } from "../../../../auth/session";
import { recordAuditEvent } from "../../../../core/audit-store";
import { resolveGovhubSnapshotConfig } from "../../../../core/govhub-snapshots";

type DirectTarget = "CPP" | "CPP-IA";

function clampText(value: unknown, max = 4000): string {
  return String(value || "").trim().slice(0, max);
}

function resolveTarget(value: unknown): DirectTarget {
  const normalized = clampText(value, 20).toUpperCase();
  return normalized === "CPP-IA" ? "CPP-IA" : "CPP";
}

function resolveDispatchConfig(target: DirectTarget): { endpoint: string; token: string } {
  const baseUrl = clampText(process.env.CPP_DIRECT_BASE_URL || "", 400).replace(/\/+$/, "");
  const token = clampText(process.env.CPP_DIRECT_TOKEN || "", 300);
  const cppPath = clampText(process.env.CPP_DIRECT_CPP_PATH || "/webhook/govhub/workers/cpp/dispatch", 300);
  const cppIaPath = clampText(process.env.CPP_DIRECT_CPPIA_PATH || "/webhook/govhub/workers/cppia/dispatch", 300);
  const rawPath = target === "CPP-IA" ? cppIaPath : cppPath;
  const path = rawPath.startsWith("/") ? rawPath : `/${rawPath}`;
  return {
    endpoint: `${baseUrl}${path}`,
    token
  };
}

export async function POST(request: Request) {
  const session = readSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ status: "unauthorized", error_code: "AUTH_REQUIRED" }, { status: 401 });
  }
  if (session.role === "viewer") {
    return NextResponse.json({ status: "forbidden", error_code: "ROLE_NOT_ALLOWED" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ status: "invalid_request", error_code: "JSON_INVALID" }, { status: 400 });
  }

  const data = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const missionId = clampText(data.mission_id, 120).toUpperCase();
  const target = resolveTarget(data.target);
  const message = clampText(data.message, 2000);
  const action = clampText(data.action || "MSG", 20).toUpperCase() || "MSG";
  const source = clampText(data.source || "cpp-direct-api", 60) || "cpp-direct-api";
  const correlationId = clampText(data.correlation_id || `cpp-direct-${Date.now()}`, 180);

  if (!missionId || !message) {
    return NextResponse.json(
      { status: "invalid_request", error_code: "MISSION_ID_AND_MESSAGE_REQUIRED" },
      { status: 400 }
    );
  }

  const { endpoint, token } = resolveDispatchConfig(target);
  if (!endpoint || !token || !endpoint.startsWith("http")) {
    return NextResponse.json(
      {
        status: "misconfigured",
        error_code: "CPP_DIRECT_ENV_REQUIRED",
        message: "Configure CPP_DIRECT_BASE_URL, CPP_DIRECT_TOKEN e paths CPP_DIRECT_CPP_PATH/CPP_DIRECT_CPPIA_PATH."
      },
      { status: 500 }
    );
  }

  const payload = {
    mission_id: missionId,
    task_id: missionId,
    queue_id: missionId,
    target,
    action,
    actor: session.username,
    message,
    source,
    correlation_id: correlationId,
    use_llm: action === "MSG"
  };

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-cpp-token": token
      },
      body: JSON.stringify(payload),
      cache: "no-store"
    });

    let dispatchPayload: unknown = null;
    try {
      dispatchPayload = await response.json();
    } catch {
      dispatchPayload = null;
    }

    const auditConfig = resolveGovhubSnapshotConfig();
    await recordAuditEvent(auditConfig, {
      actor: session.username,
      role: session.role,
      action: "cpp.direct.dispatch",
      target: `${target}:${missionId}`,
      before_state: "",
      after_state: JSON.stringify(
        {
          endpoint,
          correlation_id: correlationId,
          http_status: response.status
        },
        null,
        0
      ).slice(0, 2000),
      correlation_id: correlationId,
      source: "cpp-direct-api",
      createdBy: session.username
    });

    if (!response.ok) {
      return NextResponse.json(
        {
          status: "error",
          error_code: "CPP_DIRECT_DISPATCH_FAILED",
          mission_id: missionId,
          target,
          correlation_id: correlationId,
          dispatch_http: response.status,
          dispatch_payload: dispatchPayload
        },
        { status: 502 }
      );
    }

    return NextResponse.json(
      {
        status: "ok",
        mission_id: missionId,
        target,
        correlation_id: correlationId,
        dispatch_http: response.status,
        dispatch_payload: dispatchPayload
      },
      { status: 200 }
    );
  } catch {
    return NextResponse.json(
      {
        status: "error",
        error_code: "CPP_DIRECT_NETWORK_FAILED",
        mission_id: missionId,
        target,
        correlation_id: correlationId
      },
      { status: 502 }
    );
  }
}
