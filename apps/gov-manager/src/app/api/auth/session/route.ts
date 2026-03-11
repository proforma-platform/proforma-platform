import { NextResponse } from "next/server";
import { GOV_MANAGER_SESSION_COOKIE, createSessionValue, isPrimaryAdminUser, readSessionFromRequest, resolveLoginConfig, type GovManagerRole } from "../../../../auth/session";
import { loadSnapshotPayload, resolveGovhubSnapshotConfig } from "../../../../core/govhub-snapshots";
import { sanitizeGovManagerUserState, verifyPassword } from "../../../../core/gov-manager-users";

const SESSION_TTL_SECONDS = 60 * 60 * 8;
const IS_PROD = process.env.NODE_ENV === "production";
const USERS_SNAPSHOT_TYPE = String(process.env.GOVHUB_USERS_SNAPSHOT_TYPE || "gov_manager_users_v1").trim();

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ status: "error", error_code: "JSON_INVALID" }, { status: 400 });
  }

  const input = body as Record<string, unknown>;
  const username = String(input.username || "").trim();
  const password = String(input.password || "").trim();

  if (!username || !password) {
    return NextResponse.json({ status: "error", error_code: "AUTH_INVALID" }, { status: 401 });
  }

  let authenticated = false;
  let role: GovManagerRole = "viewer";

  const govhub = resolveGovhubSnapshotConfig();
  if (govhub.baseUrl && govhub.token) {
    try {
      const loaded = await loadSnapshotPayload(govhub, USERS_SNAPSHOT_TYPE);
      const state = loaded.found && loaded.payload ? sanitizeGovManagerUserState(loaded.payload) : sanitizeGovManagerUserState(null);
      const user = state.rows.find((row) => row.active && row.username.toLowerCase() === username.toLowerCase());
      if (user && verifyPassword(password, user.password_hash)) {
        authenticated = true;
        role = user.role;
      }
    } catch {
      // fail-closed on snapshot auth check, then fallback to bootstrap account only
    }
  }

  if (!authenticated) {
    const cfg = resolveLoginConfig();
    authenticated = username === cfg.username && password === cfg.password;
    if (authenticated) role = cfg.role;
  }

  if (!authenticated) {
    return NextResponse.json({ status: "error", error_code: "AUTH_INVALID" }, { status: 401 });
  }

  const token = createSessionValue(username, role);
  const response = NextResponse.json({ status: "ok", actor: username, next_action: "open_dashboard" }, { status: 200 });

  response.cookies.set(GOV_MANAGER_SESSION_COOKIE, token, {
    httpOnly: true,
    secure: IS_PROD,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_SECONDS
  });

  return response;
}

export async function GET(request: Request) {
  const session = readSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ status: "error", error_code: "AUTH_REQUIRED" }, { status: 401 });
  }
  const isPrimaryAdmin = session.role === "admin" && isPrimaryAdminUser(session.username);
  return NextResponse.json(
    { status: "ok", actor: session.username, role: session.role, is_primary_admin: isPrimaryAdmin, issued_at_utc: session.issued_at_utc },
    { status: 200 }
  );
}

export async function DELETE() {
  const response = NextResponse.json({ status: "ok", next_action: "logged_out" }, { status: 200 });
  response.cookies.set(GOV_MANAGER_SESSION_COOKIE, "", {
    httpOnly: true,
    secure: IS_PROD,
    sameSite: "lax",
    path: "/",
    maxAge: 0
  });
  return response;
}
