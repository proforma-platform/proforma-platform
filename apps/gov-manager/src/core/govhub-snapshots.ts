import { createHash } from "crypto";
import { gzipSync, gunzipSync } from "zlib";

export interface GovhubSnapshotConfig {
  baseUrl: string;
  token: string;
  latestBasePath: string;
  ingestPath: string;
}

export interface SnapshotLoadResult<T> {
  found: boolean;
  status: number;
  payload: T | null;
  payload_sha256?: string;
  created_at_utc?: string;
  error_code?: string;
}

export interface SnapshotSaveResult {
  ok: boolean;
  status: number;
  payload_sha256: string;
  payload_size_bytes: number;
  response: unknown;
}

export function resolveGovhubSnapshotConfig(): GovhubSnapshotConfig {
  return {
    baseUrl: String(process.env.GOVHUB_BASE_URL || "").trim(),
    token: String(process.env.GOVHUB_TOKEN || "").trim(),
    latestBasePath: String(process.env.GOVHUB_SNAPSHOTS_LATEST_BASE_PATH || "/webhook/govhub/snapshots/latest").trim(),
    ingestPath: String(process.env.GOVHUB_SNAPSHOTS_INGEST_PATH || "/webhook/govhub/snapshots/ingest").trim()
  };
}

export async function loadSnapshotPayload<T>(
  config: GovhubSnapshotConfig,
  snapshotType: string
): Promise<SnapshotLoadResult<T>> {
  const base = config.baseUrl.replace(/\/+$/, "");
  const latestPath = config.latestBasePath.startsWith("/") ? config.latestBasePath : `/${config.latestBasePath}`;
  const endpoint = `${base}${latestPath}?snapshot_type=${encodeURIComponent(snapshotType)}`;

  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: "GET",
      headers: { "x-govhub-token": config.token },
      cache: "no-store"
    });
  } catch {
    return { found: false, status: 502, payload: null, error_code: "SNAPSHOT_FETCH_FAILED" };
  }

  let data: unknown = null;
  try {
    data = await response.json();
  } catch {
    data = null;
  }

  if (!response.ok || !data || typeof data !== "object") {
    const obj = (data && typeof data === "object" ? data : {}) as Record<string, unknown>;
    return {
      found: false,
      status: response.status,
      payload: null,
      error_code: String(obj.error_code || "SNAPSHOT_LATEST_ERROR")
    };
  }

  const obj = data as Record<string, unknown>;
  const payloadB64 = String(obj.payload_b64 || "").trim();
  const payloadSha = String(obj.payload_sha256 || "").trim();

  if (!payloadB64) {
    return {
      found: false,
      status: response.status,
      payload: null,
      error_code: String(obj.error_code || "SNAPSHOT_NOT_FOUND")
    };
  }

  try {
    const payload = decodeSnapshotPayload<T>(payloadB64, payloadSha || undefined);
    return {
      found: true,
      status: response.status,
      payload,
      ...(payloadSha ? { payload_sha256: payloadSha } : {}),
      ...(typeof obj.created_at_utc === "string" ? { created_at_utc: obj.created_at_utc } : {})
    };
  } catch {
    return { found: false, status: 422, payload: null, error_code: "SNAPSHOT_PAYLOAD_INVALID" };
  }
}

export async function saveSnapshotPayload(
  config: GovhubSnapshotConfig,
  input: {
    snapshotType: string;
    payload: unknown;
    createdBy: string;
    sourceRepo?: string;
    sourceRef?: string;
  }
): Promise<SnapshotSaveResult> {
  const packed = encodeSnapshotPayload(input.payload);
  const base = config.baseUrl.replace(/\/+$/, "");
  const ingestPath = config.ingestPath.startsWith("/") ? config.ingestPath : `/${config.ingestPath}`;
  const endpoint = `${base}${ingestPath}`;

  const body = {
    snapshot_type: input.snapshotType,
    protocol: "UBIN",
    version: "1.0",
    encoding: "json",
    compression: "gzip",
    payload_b64: packed.payload_b64,
    payload_sha256: packed.payload_sha256,
    payload_size_bytes: packed.payload_size_bytes,
    created_by: input.createdBy,
    source_repo: input.sourceRepo || "gov-manager",
    source_ref: input.sourceRef || "main"
  };

  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-govhub-token": config.token
      },
      body: JSON.stringify(body),
      cache: "no-store"
    });
  } catch {
    return {
      ok: false,
      status: 502,
      payload_sha256: packed.payload_sha256,
      payload_size_bytes: packed.payload_size_bytes,
      response: { status: "upstream_unreachable", error_code: "SNAPSHOT_INGEST_FETCH_FAILED" }
    };
  }

  let json: unknown = null;
  try {
    json = await response.json();
  } catch {
    json = null;
  }

  return {
    ok: response.ok,
    status: response.status,
    payload_sha256: packed.payload_sha256,
    payload_size_bytes: packed.payload_size_bytes,
    response: json
  };
}

export function encodeSnapshotPayload(payload: unknown): {
  payload_b64: string;
  payload_sha256: string;
  payload_size_bytes: number;
} {
  const json = JSON.stringify(payload);
  const zipped = gzipSync(Buffer.from(json, "utf8"));
  const sha = createHash("sha256").update(zipped).digest("hex");
  return {
    payload_b64: zipped.toString("base64"),
    payload_sha256: sha,
    payload_size_bytes: zipped.length
  };
}

export function decodeSnapshotPayload<T>(payloadB64: string, expectedSha256?: string): T {
  const zipped = Buffer.from(payloadB64, "base64");
  const actualSha = createHash("sha256").update(zipped).digest("hex");
  if (expectedSha256 && expectedSha256.trim() && actualSha !== expectedSha256.trim()) {
    throw new Error("payload sha mismatch");
  }
  const text = gunzipSync(zipped).toString("utf8");
  return JSON.parse(text) as T;
}
