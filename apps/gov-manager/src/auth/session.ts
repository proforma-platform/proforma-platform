import { createHmac, timingSafeEqual } from "crypto";
export const GOV_MANAGER_SESSION_COOKIE = "gov_manager_session";

export type GovManagerRole = "admin" | "engineer" | "viewer";

export interface GovManagerSessionData {
  username: string;
  role: GovManagerRole;
  issued_at_utc: string;
}

function parseCookies(cookieHeader: string): Record<string, string> {
  return cookieHeader
    .split(";")
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .reduce<Record<string, string>>((acc, item) => {
      const idx = item.indexOf("=");
      if (idx <= 0) return acc;
      const key = item.slice(0, idx).trim();
      const value = item.slice(idx + 1).trim();
      acc[key] = decodeURIComponent(value);
      return acc;
    }, {});
}

export function hasSessionCookie(request: Request): boolean {
  return Boolean(readSessionFromRequest(request));
}

export function resolveLoginConfig() {
  const username = String(process.env.GOV_MANAGER_LOGIN_USER || "staff").trim();
  const password = String(process.env.GOV_MANAGER_LOGIN_PASSWORD || "govmanager").trim();
  const roleRaw = String(process.env.GOV_MANAGER_LOGIN_ROLE || "admin").trim().toLowerCase();
  const role: GovManagerRole = roleRaw === "viewer" || roleRaw === "engineer" ? roleRaw : "admin";
  return { username, password, role };
}

export function isPrimaryAdminUser(username: string): boolean {
  const cfg = resolveLoginConfig();
  return String(username || "").trim().toLowerCase() === cfg.username.toLowerCase();
}

function resolveSessionSecret(): string {
  const envSecret = String(process.env.GOV_MANAGER_SESSION_SECRET || "").trim();
  if (envSecret) return envSecret;
  const cfg = resolveLoginConfig();
  return `${cfg.username}:${cfg.password}:gov-manager-session-v1`;
}

function sign(input: string): string {
  return createHmac("sha256", resolveSessionSecret()).update(input).digest("base64url");
}

export function createSessionValue(username: string, role: GovManagerRole): string {
  const payload = JSON.stringify({
    username,
    role,
    issued_at_utc: new Date().toISOString()
  } satisfies GovManagerSessionData);
  const encoded = Buffer.from(payload, "utf8").toString("base64url");
  const signature = sign(encoded);
  return `${encoded}.${signature}`;
}

export function readSessionFromRequest(request: Request): GovManagerSessionData | null {
  const cookieHeader = request.headers.get("cookie") || "";
  if (!cookieHeader) return null;
  const cookies = parseCookies(cookieHeader);
  const raw = String(cookies[GOV_MANAGER_SESSION_COOKIE] || "");
  if (!raw || !raw.includes(".")) return null;
  const [encoded, signature] = raw.split(".", 2);
  if (!encoded || !signature) return null;
  const expected = sign(encoded);
  try {
    const sigA = Buffer.from(signature, "base64url");
    const sigB = Buffer.from(expected, "base64url");
    if (sigA.length !== sigB.length || !timingSafeEqual(sigA, sigB)) return null;
    const decoded = Buffer.from(encoded, "base64url").toString("utf8");
    const payload = JSON.parse(decoded) as Partial<GovManagerSessionData>;
    const username = String(payload.username || "").trim();
    const roleRaw = String(payload.role || "").trim().toLowerCase();
    const role: GovManagerRole = roleRaw === "admin" || roleRaw === "engineer" || roleRaw === "viewer" ? roleRaw : "viewer";
    if (!username) return null;
    return {
      username,
      role,
      issued_at_utc: String(payload.issued_at_utc || new Date(0).toISOString())
    };
  } catch {
    return null;
  }
}
