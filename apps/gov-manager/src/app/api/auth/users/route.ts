import { NextResponse } from "next/server";
import { hasSessionCookie, isPrimaryAdminUser, readSessionFromRequest } from "../../../../auth/session";
import { loadSnapshotPayload, resolveGovhubSnapshotConfig, saveSnapshotPayload } from "../../../../core/govhub-snapshots";
import { hashPassword, isValidUsername, sanitizeGovManagerUserState, toPublicGovManagerUsers, type GovManagerRole } from "../../../../core/gov-manager-users";

const USERS_SNAPSHOT_TYPE = String(process.env.GOVHUB_USERS_SNAPSHOT_TYPE || "gov_manager_users_v1").trim();

function isAllowedRole(role: string): role is GovManagerRole {
  return role === "admin" || role === "engineer" || role === "viewer";
}

export async function GET(request: Request) {
  if (!hasSessionCookie(request)) {
    return NextResponse.json({ status: "unauthorized", error_code: "AUTH_REQUIRED" }, { status: 401 });
  }

  const config = resolveGovhubSnapshotConfig();
  if (!config.baseUrl || !config.token) {
    return NextResponse.json(
      { status: "misconfigured", error_code: "GOVHUB_ENV_REQUIRED", message: "GOVHUB_BASE_URL and GOVHUB_TOKEN are required" },
      { status: 500 }
    );
  }

  const loaded = await loadSnapshotPayload(config, USERS_SNAPSHOT_TYPE);
  const state = loaded.found && loaded.payload ? sanitizeGovManagerUserState(loaded.payload) : sanitizeGovManagerUserState(null);

  return NextResponse.json(
    {
      status: "ok",
      snapshot_type: USERS_SNAPSHOT_TYPE,
      rows: toPublicGovManagerUsers(state),
      updated_at_utc: state.updated_at_utc,
      payload_sha256: loaded.payload_sha256 || null
    },
    { status: 200 }
  );
}

export async function POST(request: Request) {
  const session = readSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ status: "unauthorized", error_code: "AUTH_REQUIRED" }, { status: 401 });
  }
  if (session.role !== "admin" || !isPrimaryAdminUser(session.username)) {
    return NextResponse.json({ status: "forbidden", error_code: "ADMIN_REQUIRED" }, { status: 403 });
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
    return NextResponse.json({ status: "invalid_request", error_code: "JSON_INVALID" }, { status: 400 });
  }

  const data = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const username = String(data.username || "").trim();
  const password = String(data.password || "");
  const roleRaw = String(data.role || "engineer").trim().toLowerCase();
  const active = data.active !== false;
  const actor = String(data.actor || session.username).trim() || session.username;

  if (!isValidUsername(username) || password.length < 8 || !isAllowedRole(roleRaw)) {
    return NextResponse.json(
      { status: "invalid_request", error_code: "USERNAME_PASSWORD_ROLE_INVALID" },
      { status: 400 }
    );
  }

  const loaded = await loadSnapshotPayload(config, USERS_SNAPSHOT_TYPE);
  const state = loaded.found && loaded.payload ? sanitizeGovManagerUserState(loaded.payload) : sanitizeGovManagerUserState(null);
  const existing = state.rows.find((row) => row.username.toLowerCase() === username.toLowerCase());

  const now = new Date().toISOString();
  const next = {
    version: "1.0" as const,
    updated_at_utc: now,
    rows: existing
      ? state.rows.map((row) =>
          row.username.toLowerCase() === username.toLowerCase()
            ? {
                ...row,
                role: roleRaw,
                active,
                password_hash: hashPassword(password),
                updated_at_utc: now
              }
            : row
        )
      : [
          ...state.rows,
          {
            username,
            role: roleRaw,
            active,
            password_hash: hashPassword(password),
            created_at_utc: now,
            updated_at_utc: now
          }
        ]
  };

  const saved = await saveSnapshotPayload(config, {
    snapshotType: USERS_SNAPSHOT_TYPE,
    payload: next,
    createdBy: actor,
    sourceRepo: "gov-manager",
    sourceRef: "auth-users"
  });

  const publicRows = toPublicGovManagerUsers(next);
  const row = publicRows.find((item) => item.username.toLowerCase() === username.toLowerCase()) || null;
  return NextResponse.json(
    {
      status: saved.ok ? "ok" : "upstream_error",
      mode: existing ? "updated" : "created",
      govhub_http: saved.status,
      snapshot_type: USERS_SNAPSHOT_TYPE,
      row,
      payload_sha256: saved.payload_sha256,
      govhub_response: saved.response
    },
    { status: saved.ok ? 200 : 502 }
  );
}
