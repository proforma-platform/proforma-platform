import { NextResponse } from "next/server";
import { loadSnapshotPayload, resolveGovhubSnapshotConfig, saveSnapshotPayload } from "../../../../../core/govhub-snapshots";
import { requireRole } from "../../../../../core/rbac";
import { recordAuditEvent } from "../../../../../core/audit-store";
import {
  buildMemoryRows,
  defaultContextMemoryState,
  sanitizeContextMemoryState,
  searchMemory,
  upsertMemoryRows,
  type ContextMemoryState
} from "../../../../../core/context-memory";

const MEMORY_SNAPSHOT_TYPE = String(process.env.GOVHUB_CONTEXT_MEMORY_SNAPSHOT_TYPE || "gov_manager_context_memory_v1").trim();

function clampText(value: unknown, max: number): string {
  return String(value || "").replace(/\r\n/g, "\n").trim().slice(0, max);
}

function hasGovhubToken(request: Request, expectedToken: string): boolean {
  const provided = String(request.headers.get("x-govhub-token") || "").trim();
  return Boolean(provided && expectedToken && provided === expectedToken);
}

function loadState(payload: unknown): ContextMemoryState {
  return payload ? sanitizeContextMemoryState(payload) : defaultContextMemoryState();
}

function buildStarterText(rows: ReturnType<typeof searchMemory>, query: string, namespace: string): string {
  const compact = rows
    .map((row, index) => {
      const mission = row.mission_id ? `;MIS=${row.mission_id}` : "";
      const role = row.role ? `;ROLE=${row.role}` : "";
      const tags = row.tags.length > 0 ? `;TAGS=${row.tags.join(",")}` : "";
      return `#R${index + 1}:${row.namespace}|${row.topic}${mission}${role}${tags}|${row.summary || row.content.slice(0, 180)};`;
    })
    .join("\n");
  return `!G|MEM|STARTER|T=${new Date().toISOString()};\n#Q:${query || "-"};\n#NS:${namespace || "-"};\n${compact || "#R0:sem_contexto_relevante;"}\n#E;`;
}

export async function GET(request: Request) {
  const config = resolveGovhubSnapshotConfig();
  const auth = requireRole(request, "viewer");
  const tokenAuth = hasGovhubToken(request, config.token);
  if (!auth.ok && !tokenAuth) {
    return NextResponse.json({ status: "unauthorized", error_code: auth.error_code }, { status: auth.status });
  }
  if (!config.baseUrl || !config.token) {
    return NextResponse.json({ status: "misconfigured", error_code: "GOVHUB_ENV_REQUIRED" }, { status: 500 });
  }

  const loaded = await loadSnapshotPayload(config, MEMORY_SNAPSHOT_TYPE);
  const state = loadState(loaded.found ? loaded.payload : null);
  const url = new URL(request.url);
  const query = clampText(url.searchParams.get("q"), 300);
  const namespace = clampText(url.searchParams.get("namespace"), 80);
  const missionId = clampText(url.searchParams.get("mission_id"), 120).toUpperCase();
  const role = clampText(url.searchParams.get("role"), 40).toUpperCase();
  const tags = clampText(url.searchParams.get("tags"), 400);
  const limit = Math.max(1, Math.min(20, Number(url.searchParams.get("limit") || 5)));
  const format = clampText(url.searchParams.get("format"), 20).toLowerCase();

  if (format === "export" || format === "backup") {
    const filename = `gov-memory-${state.updated_at_utc.replace(/[:.]/g, "-")}.json`;
    return new NextResponse(JSON.stringify(state, null, 2), {
      status: 200,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "content-disposition": `attachment; filename=\"${filename}\"`
      }
    });
  }

  const rows = searchMemory(state, {
    query,
    namespace,
    mission_id: missionId,
    role,
    tags,
    limit
  });

  return NextResponse.json(
    {
      status: "ok",
      snapshot_type: MEMORY_SNAPSHOT_TYPE,
      updated_at_utc: state.updated_at_utc,
      total_rows: state.rows.length,
      count: rows.length,
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
    return NextResponse.json({ status: "misconfigured", error_code: "GOVHUB_ENV_REQUIRED" }, { status: 500 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ status: "invalid_request", error_code: "JSON_INVALID" }, { status: 400 });
  }

  const data = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const action = clampText(data.action, 32).toLowerCase() || "store";
  const actor = auth.ok ? auth.session.username : "govhub-token";
  const actorRole = auth.ok ? auth.session.role : "admin";

  const loaded = await loadSnapshotPayload(config, MEMORY_SNAPSHOT_TYPE);
  const state = loadState(loaded.found ? loaded.payload : null);

  if (action === "store") {
    const namespace = clampText(data.namespace, 80);
    const topic = clampText(data.topic, 180);
    const content = clampText(data.content, 16000);
    if (!namespace || !topic || !content) {
      return NextResponse.json({ status: "invalid_request", error_code: "NAMESPACE_TOPIC_CONTENT_REQUIRED" }, { status: 400 });
    }
    const rows = buildMemoryRows({
      namespace,
      topic,
      content,
      summary: clampText(data.summary, 600),
      tags: data.tags,
      mission_id: clampText(data.mission_id, 120).toUpperCase(),
      role: clampText(data.role, 40).toUpperCase(),
      actor: clampText(data.actor, 120) || actor,
      source_type: clampText(data.source_type, 40) || "udn",
      memory_id: clampText(data.memory_id, 120)
    });
    if (rows.length === 0) {
      return NextResponse.json({ status: "invalid_request", error_code: "MEMORY_ROWS_EMPTY" }, { status: 400 });
    }
    const next = upsertMemoryRows(state, rows);
    const saved = await saveSnapshotPayload(config, {
      snapshotType: MEMORY_SNAPSHOT_TYPE,
      payload: next,
      createdBy: actor,
      sourceRepo: "gov-manager",
      sourceRef: "operations-memory-store"
    });
    await recordAuditEvent(config, {
      actor,
      role: actorRole,
      action: "memory.store",
      target: String(rows[0]?.memory_id || ""),
      after_state: JSON.stringify({ namespace, topic, rows: rows.length }),
      correlation_id: `memory-store-${Date.now()}`,
      source: "operations-memory",
      createdBy: actor
    });
    return NextResponse.json(
      {
        status: saved.ok ? "ok" : "upstream_error",
        govhub_http: saved.status,
        snapshot_type: MEMORY_SNAPSHOT_TYPE,
        stored_rows: rows.length,
        memory_id: rows[0]?.memory_id || null,
        updated_at_utc: next.updated_at_utc,
        payload_sha256: saved.payload_sha256,
        govhub_response: saved.response
      },
      { status: saved.ok ? 200 : 502 }
    );
  }

  if (action === "retrieve") {
    const rows = searchMemory(state, {
      query: clampText(data.query, 300),
      namespace: clampText(data.namespace, 80),
      mission_id: clampText(data.mission_id, 120).toUpperCase(),
      role: clampText(data.role, 40).toUpperCase(),
      tags: data.tags,
      limit: Math.max(1, Math.min(20, Number(data.limit) || 5))
    });
    await recordAuditEvent(config, {
      actor,
      role: actorRole,
      action: "memory.retrieve",
      target: clampText(data.namespace, 80) || "context-memory",
      after_state: JSON.stringify({ count: rows.length, query: clampText(data.query, 120) }),
      correlation_id: `memory-retrieve-${Date.now()}`,
      source: "operations-memory",
      createdBy: actor
    });
    return NextResponse.json(
      {
        status: "ok",
        snapshot_type: MEMORY_SNAPSHOT_TYPE,
        updated_at_utc: state.updated_at_utc,
        count: rows.length,
        rows,
        payload_sha256: loaded.payload_sha256 || null
      },
      { status: 200 }
    );
  }

  if (action === "starter") {
    const query = clampText(data.query, 300);
    const namespace = clampText(data.namespace, 80);
    const rows = searchMemory(state, {
      query,
      namespace,
      mission_id: clampText(data.mission_id, 120).toUpperCase(),
      role: clampText(data.role, 40).toUpperCase(),
      tags: data.tags,
      limit: Math.max(1, Math.min(10, Number(data.limit) || 5))
    });
    const starter_text = buildStarterText(rows, query, namespace);
    await recordAuditEvent(config, {
      actor,
      role: actorRole,
      action: "memory.starter",
      target: namespace || "context-memory",
      after_state: JSON.stringify({ count: rows.length, query: clampText(query, 120) }),
      correlation_id: `memory-starter-${Date.now()}`,
      source: "operations-memory",
      createdBy: actor
    });
    return NextResponse.json(
      {
        status: "ok",
        snapshot_type: MEMORY_SNAPSHOT_TYPE,
        updated_at_utc: state.updated_at_utc,
        count: rows.length,
        rows,
        starter_text,
        payload_sha256: loaded.payload_sha256 || null
      },
      { status: 200 }
    );
  }

  return NextResponse.json(
    { status: "invalid_request", error_code: "ACTION_NOT_SUPPORTED", allowed_actions: ["store", "retrieve", "starter"] },
    { status: 400 }
  );
}
