import { NextResponse } from "next/server";
import { loadSnapshotPayload, resolveGovhubSnapshotConfig, saveSnapshotPayload } from "../../../../../core/govhub-snapshots";
import { requireRole } from "../../../../../core/rbac";

const ASSETS_SNAPSHOT_TYPE = String(process.env.GOVHUB_MISSION_ASSETS_SNAPSHOT_TYPE || "gov_manager_mission_assets_v1").trim();
const MAX_FILE_BYTES = Math.max(128 * 1024, Number(process.env.GOVHUB_MISSION_ASSET_MAX_BYTES || 12 * 1024 * 1024));
const MAX_MISSION_TOTAL_BYTES = Math.max(MAX_FILE_BYTES, Number(process.env.GOVHUB_MISSION_ASSET_TOTAL_MAX_BYTES || 24 * 1024 * 1024));

interface MissionAssetRow {
  asset_id: string;
  mission_id: string;
  file_name: string;
  mime_type: string;
  size_bytes: number;
  content_b64: string;
  created_at_utc: string;
  created_by: string;
}

interface MissionAssetsState {
  version: "1.0";
  updated_at_utc: string;
  rows: MissionAssetRow[];
}

function nowUtc(): string {
  return new Date().toISOString();
}

function clampText(value: unknown, max: number): string {
  return String(value || "").trim().slice(0, max);
}

function hasGovhubToken(request: Request, expectedToken: string): boolean {
  const provided = String(request.headers.get("x-govhub-token") || "").trim();
  return Boolean(provided && expectedToken && provided === expectedToken);
}

function defaultState(): MissionAssetsState {
  return { version: "1.0", updated_at_utc: nowUtc(), rows: [] };
}

function sanitizeState(payload: unknown): MissionAssetsState {
  if (!payload || typeof payload !== "object") return defaultState();
  const src = payload as Record<string, unknown>;
  const rowsRaw = Array.isArray(src.rows) ? src.rows : [];
  const rows = rowsRaw
    .map((item) => {
      const row = item as Record<string, unknown>;
      const asset_id = clampText(row.asset_id, 180);
      const mission_id = clampText(row.mission_id, 120).toUpperCase();
      const file_name = clampText(row.file_name, 220);
      const mime_type = clampText(row.mime_type, 120) || "application/octet-stream";
      const content_b64 = clampText(row.content_b64, MAX_FILE_BYTES * 2);
      const size_bytes = Number(row.size_bytes || 0);
      if (!asset_id || !mission_id || !file_name || !content_b64) return null;
      return {
        asset_id,
        mission_id,
        file_name,
        mime_type,
        content_b64,
        size_bytes: Number.isFinite(size_bytes) ? Math.max(1, Math.trunc(size_bytes)) : Math.max(1, Math.trunc((content_b64.length * 3) / 4)),
        created_at_utc: clampText(row.created_at_utc, 40) || nowUtc(),
        created_by: clampText(row.created_by, 120) || "admin"
      } satisfies MissionAssetRow;
    })
    .filter((row): row is MissionAssetRow => Boolean(row));

  return {
    version: "1.0",
    updated_at_utc: clampText(src.updated_at_utc, 40) || nowUtc(),
    rows: rows.slice(0, 3000)
  };
}

function listRows(rows: MissionAssetRow[], missionId: string): Array<Omit<MissionAssetRow, "content_b64">> {
  return rows
    .filter((row) => row.mission_id === missionId)
    .sort((a, b) => String(b.created_at_utc || "").localeCompare(String(a.created_at_utc || "")))
    .map(({ content_b64: _drop, ...rest }) => rest);
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

  const url = new URL(request.url);
  const missionId = clampText(url.searchParams.get("mission_id"), 120).toUpperCase();
  const assetId = clampText(url.searchParams.get("asset_id"), 180);
  const download = String(url.searchParams.get("download") || "").trim().toLowerCase() === "1" || String(url.searchParams.get("download") || "").trim().toLowerCase() === "true";
  if (!missionId) return NextResponse.json({ status: "invalid_request", error_code: "MISSION_ID_REQUIRED" }, { status: 400 });

  const loaded = await loadSnapshotPayload(config, ASSETS_SNAPSHOT_TYPE);
  const state = sanitizeState(loaded.found ? loaded.payload : null);
  const missionRows = listRows(state.rows, missionId);

  if (download) {
    if (!assetId) return NextResponse.json({ status: "invalid_request", error_code: "ASSET_ID_REQUIRED" }, { status: 400 });
    const row = state.rows.find((item) => item.mission_id === missionId && item.asset_id === assetId);
    if (!row) return NextResponse.json({ status: "not_found", error_code: "ASSET_NOT_FOUND" }, { status: 404 });
    const buffer = Buffer.from(row.content_b64, "base64");
    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "content-type": row.mime_type || "application/octet-stream",
        "content-disposition": `inline; filename=\"${row.file_name.replace(/"/g, "'")}\"`,
        "cache-control": "no-store"
      }
    });
  }

  return NextResponse.json(
    {
      status: "ok",
      snapshot_type: ASSETS_SNAPSHOT_TYPE,
      mission_id: missionId,
      count: missionRows.length,
      rows: missionRows.map((row) => ({
        ...row,
        download_url: `/api/govhub/missions/assets?mission_id=${encodeURIComponent(missionId)}&asset_id=${encodeURIComponent(row.asset_id)}&download=1`
      })),
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

  const contentType = String(request.headers.get("content-type") || "").toLowerCase();
  let missionId = "";
  let fileName = "";
  let mimeType = "";
  let contentB64 = "";
  const actor = auth.ok ? auth.session.username : "govhub-token";

  if (contentType.includes("multipart/form-data")) {
    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      return NextResponse.json({ status: "invalid_request", error_code: "FORMDATA_INVALID" }, { status: 400 });
    }
    missionId = clampText(form.get("mission_id"), 120).toUpperCase();
    const fileEntry = form.get("file");
    if (!missionId || !(fileEntry instanceof File)) {
      return NextResponse.json({ status: "invalid_request", error_code: "MISSION_FILE_CONTENT_REQUIRED" }, { status: 400 });
    }
    fileName = clampText(fileEntry.name, 220) || "arquivo";
    mimeType = clampText(fileEntry.type, 120) || "application/octet-stream";
    if (fileEntry.size <= 0 || fileEntry.size > MAX_FILE_BYTES) {
      return NextResponse.json({ status: "invalid_request", error_code: "FILE_TOO_LARGE", max_bytes: MAX_FILE_BYTES }, { status: 400 });
    }
    contentB64 = Buffer.from(await fileEntry.arrayBuffer()).toString("base64");
  } else {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ status: "invalid_request", error_code: "JSON_INVALID" }, { status: 400 });
    }

    const data = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
    missionId = clampText(data.mission_id, 120).toUpperCase();
    fileName = clampText(data.file_name, 220);
    mimeType = clampText(data.mime_type, 120) || "application/octet-stream";
    contentB64 = clampText(data.content_b64, MAX_FILE_BYTES * 2);
    if (!missionId || !fileName || !contentB64) {
      return NextResponse.json({ status: "invalid_request", error_code: "MISSION_FILE_CONTENT_REQUIRED" }, { status: 400 });
    }
  }

  let sizeBytes = 0;
  try {
    sizeBytes = Buffer.from(contentB64, "base64").length;
  } catch {
    return NextResponse.json({ status: "invalid_request", error_code: "CONTENT_B64_INVALID" }, { status: 400 });
  }
  if (sizeBytes <= 0 || sizeBytes > MAX_FILE_BYTES) {
    return NextResponse.json({ status: "invalid_request", error_code: "FILE_TOO_LARGE", max_bytes: MAX_FILE_BYTES }, { status: 400 });
  }

  const loaded = await loadSnapshotPayload(config, ASSETS_SNAPSHOT_TYPE);
  const state = sanitizeState(loaded.found ? loaded.payload : null);
  const row: MissionAssetRow = {
    asset_id: `${missionId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    mission_id: missionId,
    file_name: fileName,
    mime_type: mimeType,
    size_bytes: sizeBytes,
    content_b64: contentB64,
    created_at_utc: nowUtc(),
    created_by: actor
  };
  const next = sanitizeState({
    ...state,
    updated_at_utc: nowUtc(),
    rows: [row, ...state.rows]
  });
  const missionTotalBytes = next.rows
    .filter((item) => item.mission_id === missionId)
    .reduce((sum, item) => sum + Math.max(0, Number(item.size_bytes || 0)), 0);
  if (missionTotalBytes > MAX_MISSION_TOTAL_BYTES) {
    return NextResponse.json(
      {
        status: "invalid_request",
        error_code: "MISSION_ASSET_TOTAL_TOO_LARGE",
        message: `Limite total de anexos da missão excedido (${missionTotalBytes} bytes).`,
        mission_total_bytes: missionTotalBytes,
        max_mission_total_bytes: MAX_MISSION_TOTAL_BYTES
      },
      { status: 400 }
    );
  }

  const saved = await saveSnapshotPayload(config, {
    snapshotType: ASSETS_SNAPSHOT_TYPE,
    payload: next,
    createdBy: actor,
    sourceRepo: "gov-manager",
    sourceRef: "missions-assets-upload"
  });

  if (!saved.ok) {
    return NextResponse.json(
      {
        status: "upstream_error",
        error_code: "SNAPSHOT_SAVE_FAILED",
        message: `Falha ao persistir anexos no GOV-HUB (HTTP ${saved.status}).`,
        govhub_http: saved.status,
        govhub_response: saved.response,
        payload_sha256: saved.payload_sha256,
        payload_size_bytes: saved.payload_size_bytes
      },
      { status: 502 }
    );
  }

  return NextResponse.json(
    {
      status: "ok",
      govhub_http: saved.status,
      row: {
        asset_id: row.asset_id,
        mission_id: row.mission_id,
        file_name: row.file_name,
        mime_type: row.mime_type,
        size_bytes: row.size_bytes,
        created_at_utc: row.created_at_utc,
        created_by: row.created_by,
        download_url: `/api/govhub/missions/assets?mission_id=${encodeURIComponent(row.mission_id)}&asset_id=${encodeURIComponent(row.asset_id)}&download=1`
      },
      payload_sha256: saved.payload_sha256
    },
    { status: 200 }
  );
}

export async function DELETE(request: Request) {
  const config = resolveGovhubSnapshotConfig();
  const auth = requireRole(request, "engineer");
  const tokenAuth = hasGovhubToken(request, config.token);
  if (!auth.ok && !tokenAuth) {
    return NextResponse.json({ status: "forbidden", error_code: auth.error_code }, { status: auth.status });
  }
  if (!config.baseUrl || !config.token) {
    return NextResponse.json({ status: "misconfigured", error_code: "GOVHUB_ENV_REQUIRED" }, { status: 500 });
  }
  const url = new URL(request.url);
  const missionId = clampText(url.searchParams.get("mission_id"), 120).toUpperCase();
  const assetId = clampText(url.searchParams.get("asset_id"), 180);
  if (!missionId || !assetId) {
    return NextResponse.json({ status: "invalid_request", error_code: "MISSION_ID_AND_ASSET_ID_REQUIRED" }, { status: 400 });
  }

  const loaded = await loadSnapshotPayload(config, ASSETS_SNAPSHOT_TYPE);
  const state = sanitizeState(loaded.found ? loaded.payload : null);
  const nextRows = state.rows.filter((row) => !(row.mission_id === missionId && row.asset_id === assetId));
  if (nextRows.length === state.rows.length) {
    return NextResponse.json({ status: "not_found", error_code: "ASSET_NOT_FOUND" }, { status: 404 });
  }

  const next = sanitizeState({ ...state, updated_at_utc: nowUtc(), rows: nextRows });
  const saved = await saveSnapshotPayload(config, {
    snapshotType: ASSETS_SNAPSHOT_TYPE,
    payload: next,
    createdBy: auth.ok ? auth.session.username : "govhub-token",
    sourceRepo: "gov-manager",
    sourceRef: "missions-assets-delete"
  });

  if (!saved.ok) {
    return NextResponse.json(
      {
        status: "upstream_error",
        error_code: "SNAPSHOT_SAVE_FAILED",
        message: `Falha ao atualizar anexos no GOV-HUB (HTTP ${saved.status}).`,
        govhub_http: saved.status,
        govhub_response: saved.response,
        payload_sha256: saved.payload_sha256,
        payload_size_bytes: saved.payload_size_bytes
      },
      { status: 502 }
    );
  }

  return NextResponse.json(
    {
      status: "ok",
      mission_id: missionId,
      asset_id: assetId,
      govhub_http: saved.status,
      payload_sha256: saved.payload_sha256
    },
    { status: 200 }
  );
}
