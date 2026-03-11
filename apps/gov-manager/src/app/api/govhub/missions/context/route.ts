import { NextResponse } from "next/server";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { hasSessionCookie } from "../../../../../auth/session";
import { decodeMissionRunsSnapshot } from "../../../../../core/token-estimator";

const execFileAsync = promisify(execFile);

function resolveGovhubConfig() {
  const baseUrl = String(process.env.GOVHUB_BASE_URL || "").trim();
  const token = String(process.env.GOVHUB_TOKEN || "").trim();
  const latestPath = String(
    process.env.GOVHUB_SNAPSHOTS_LATEST_PATH || "/webhook/govhub/snapshots/latest?snapshot_type=mission_runs_v1"
  ).trim();
  return { baseUrl, token, latestPath };
}

function extractMisBlock(raw: string): string {
  const text = String(raw || "").replace(/\r\n/g, "\n").trim();
  if (!text) return "";
  const idx = text.indexOf("!MIS|");
  return idx >= 0 ? text.slice(idx).trim() : "";
}

function isSafeMissionId(value: string): boolean {
  return /^[A-Z0-9._-]{3,120}$/.test(String(value || "").trim().toUpperCase());
}

async function loadMissionUdnFromGovDb(missionId: string): Promise<string> {
  if (!isSafeMissionId(missionId)) return "";
  const sql = `SELECT COALESCE(udn_mission,'') FROM gov.missions WHERE mission_id='${missionId}' ORDER BY created_at DESC LIMIT 1;`;
  try {
    const { stdout } = await execFileAsync(
      "docker",
      ["exec", "govhub-db", "psql", "-U", "postgres", "-d", "govhub_n8n", "-At", "-c", sql],
      { timeout: 5000, maxBuffer: 1024 * 1024 }
    );
    return extractMisBlock(String(stdout || "").trim());
  } catch {
    return "";
  }
}

export async function GET(request: Request) {
  if (!hasSessionCookie(request)) {
    return NextResponse.json({ status: "unauthorized", error_code: "AUTH_REQUIRED" }, { status: 401 });
  }

  const url = new URL(request.url);
  const missionId = String(url.searchParams.get("mission_id") || "").trim().toUpperCase();
  if (!missionId) {
    return NextResponse.json({ status: "invalid_request", error_code: "MISSION_ID_REQUIRED" }, { status: 400 });
  }

  // Source of truth for mission payload: gov.missions.udn_mission
  const missionFromDb = await loadMissionUdnFromGovDb(missionId);
  if (missionFromDb) {
    return NextResponse.json(
      {
        status: "ok",
        found: true,
        mission_id: missionId,
        udn_mission: missionFromDb,
        source: "gov.missions"
      },
      { status: 200 }
    );
  }

  const { baseUrl, token, latestPath } = resolveGovhubConfig();
  if (!baseUrl || !token) {
    return NextResponse.json({ status: "misconfigured", error_code: "GOVHUB_ENV_REQUIRED" }, { status: 500 });
  }

  const endpoint = `${baseUrl.replace(/\/+$/, "")}${latestPath.startsWith("/") ? latestPath : `/${latestPath}`}`;
  let upstreamResponse: Response;
  try {
    upstreamResponse = await fetch(endpoint, {
      method: "GET",
      headers: { "x-govhub-token": token },
      cache: "no-store"
    });
  } catch {
    return NextResponse.json({ status: "upstream_unreachable", error_code: "GOVHUB_FETCH_FAILED" }, { status: 502 });
  }

  let payload: unknown = null;
  try {
    payload = await upstreamResponse.json();
  } catch {
    payload = null;
  }
  if (!upstreamResponse.ok || !payload || typeof payload !== "object") {
    return NextResponse.json(
      {
        status: "upstream_error",
        error_code: "SNAPSHOT_LATEST_ERROR",
        govhub_http: upstreamResponse.status
      },
      { status: 502 }
    );
  }

  const payloadB64 = String((payload as Record<string, unknown>).payload_b64 || "").trim();
  if (!payloadB64) {
    return NextResponse.json({ status: "not_found", found: false, mission_id: missionId }, { status: 404 });
  }

  let runs: Array<Record<string, unknown>> = [];
  try {
    runs = decodeMissionRunsSnapshot(payloadB64) as Array<Record<string, unknown>>;
  } catch {
    return NextResponse.json({ status: "snapshot_invalid", error_code: "MISSION_RUNS_PAYLOAD_INVALID" }, { status: 422 });
  }

  const candidates = runs
    .filter((row) => String(row.mission_id || "").trim().toUpperCase() === missionId)
    .sort((a, b) => String(b.updated_at || "").localeCompare(String(a.updated_at || "")));
  const row = candidates[0] || null;
  if (!row) {
    return NextResponse.json({ status: "ok", found: false, mission_id: missionId }, { status: 200 });
  }

  const udnRaw =
    String(row.udn_state || "").trim() ||
    String(row.udn_mission || "").trim() ||
    String(row.udn || "").trim();
  const udnMission = extractMisBlock(udnRaw);

  return NextResponse.json(
    {
      status: "ok",
      found: Boolean(udnMission),
      mission_id: missionId,
      udn_mission: udnMission || "",
      source: "mission_runs_v1",
      run: {
        status: String(row.status || "").trim(),
        phase: String(row.phase || "").trim(),
        nn: Number(row.nn || 0),
        total: Number(row.total || 0),
        updated_at: String(row.updated_at || "").trim()
      }
    },
    { status: 200 }
  );
}
