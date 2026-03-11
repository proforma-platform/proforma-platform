import { NextResponse } from "next/server";
import { requireRole } from "../../../../../../core/rbac";
import { resolveGovhubSnapshotConfig } from "../../../../../../core/govhub-snapshots";

interface N8nWorkflowNode {
  type?: string;
  parameters?: Record<string, unknown>;
}

interface N8nWorkflow {
  id?: string;
  name?: string;
  active?: boolean;
  updatedAt?: string;
  nodes?: N8nWorkflowNode[];
  tags?: Array<{ id?: string; name?: string }>;
}

function clampText(value: unknown, max: number): string {
  return String(value ?? "").trim().slice(0, max);
}

function hasGovhubToken(request: Request, expectedToken: string): boolean {
  const provided = String(request.headers.get("x-govhub-token") || "").trim();
  return Boolean(provided && expectedToken && provided === expectedToken);
}

function resolveN8nConfig() {
  const baseUrl = String(process.env.N8N_BASE_URL || "https://n8n.proforma.net.br").replace(/\/+$/, "");
  const apiPath = String(process.env.N8N_WORKFLOWS_API_PATH || "/rest/workflows").trim();
  const apiKey = String(process.env.N8N_API_KEY || "").trim();
  const basicUser = String(process.env.N8N_BASIC_AUTH_USER || "").trim();
  const basicPassword = String(process.env.N8N_BASIC_AUTH_PASSWORD || "").trim();
  return { baseUrl, apiPath, apiKey, basicUser, basicPassword };
}

function buildAuthHeaders(config: ReturnType<typeof resolveN8nConfig>): HeadersInit | null {
  if (config.apiKey) {
    return {
      "x-n8n-api-key": config.apiKey
    };
  }
  if (config.basicUser && config.basicPassword) {
    const basic = Buffer.from(`${config.basicUser}:${config.basicPassword}`).toString("base64");
    return {
      authorization: `Basic ${basic}`
    };
  }
  return null;
}

function extractWebhookPaths(nodes: N8nWorkflowNode[]): string[] {
  const out = new Set<string>();
  for (const node of nodes) {
    const type = String(node?.type || "");
    if (!type.includes("webhook")) continue;
    const path = clampText(node?.parameters?.path, 240);
    if (path) out.add(path.startsWith("/") ? path : `/${path}`);
  }
  return Array.from(out);
}

function normalizeWorkflow(row: N8nWorkflow) {
  const nodes = Array.isArray(row.nodes) ? row.nodes : [];
  const tags = Array.isArray(row.tags) ? row.tags : [];
  const webhookPaths = extractWebhookPaths(nodes);
  return {
    id: clampText(row.id, 80),
    name: clampText(row.name, 180),
    active: Boolean(row.active),
    updated_at: clampText(row.updatedAt, 80),
    tags: tags
      .map((tag) => clampText(tag?.name, 80))
      .filter(Boolean),
    webhook_paths: webhookPaths
  };
}

export async function GET(request: Request) {
  const govhub = resolveGovhubSnapshotConfig();
  const auth = requireRole(request, "viewer");
  const tokenAuth = hasGovhubToken(request, govhub.token);
  if (!auth.ok && !tokenAuth) {
    return NextResponse.json({ status: "unauthorized", error_code: auth.error_code }, { status: auth.status });
  }

  const n8n = resolveN8nConfig();
  const authHeaders = buildAuthHeaders(n8n);
  if (!authHeaders) {
    return NextResponse.json(
      {
        status: "misconfigured",
        error_code: "N8N_AUTH_REQUIRED",
        message: "Configure N8N_API_KEY or N8N_BASIC_AUTH_USER/N8N_BASIC_AUTH_PASSWORD."
      },
      { status: 500 }
    );
  }

  const url = new URL(request.url);
  const limit = Math.max(1, Math.min(500, Number(url.searchParams.get("limit") || 100)));
  const activeOnly = String(url.searchParams.get("active_only") || "").trim().toLowerCase() === "true";
  const endpoint = `${n8n.baseUrl}${n8n.apiPath.startsWith("/") ? n8n.apiPath : `/${n8n.apiPath}`}?limit=${limit}`;

  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: "GET",
      headers: {
        accept: "application/json",
        ...authHeaders
      },
      cache: "no-store"
    });
  } catch {
    return NextResponse.json({ status: "upstream_unreachable", error_code: "N8N_FETCH_FAILED" }, { status: 502 });
  }

  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    return NextResponse.json(
      {
        status: "upstream_error",
        error_code: "N8N_API_ERROR",
        n8n_http: response.status,
        n8n_response: payload
      },
      { status: 502 }
    );
  }

  const obj = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
  const rowsRaw = Array.isArray(obj.data) ? obj.data : Array.isArray(payload) ? payload : [];
  const rows = rowsRaw
    .map((row) => normalizeWorkflow((row || {}) as N8nWorkflow))
    .filter((row) => (activeOnly ? row.active : true))
    .sort((a, b) => Number(b.active) - Number(a.active) || String(b.updated_at).localeCompare(String(a.updated_at)));

  return NextResponse.json(
    {
      status: "ok",
      source: "n8n-api",
      n8n_base_url: n8n.baseUrl,
      count: rows.length,
      rows
    },
    { status: 200 }
  );
}
