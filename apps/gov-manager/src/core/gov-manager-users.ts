import { pbkdf2Sync, randomBytes, timingSafeEqual } from "crypto";

export type GovManagerRole = "admin" | "engineer" | "viewer";

export interface GovManagerUserRow {
  username: string;
  role: GovManagerRole;
  active: boolean;
  password_hash: string;
  created_at_utc: string;
  updated_at_utc: string;
}

export interface GovManagerUserState {
  version: "1.0";
  updated_at_utc: string;
  rows: GovManagerUserRow[];
}

export interface GovManagerUserPublicRow {
  username: string;
  role: GovManagerRole;
  active: boolean;
  created_at_utc: string;
  updated_at_utc: string;
}

const ALLOWED_ROLES = new Set<GovManagerRole>(["admin", "engineer", "viewer"]);

function nowUtc(): string {
  return new Date().toISOString();
}

function clampText(value: unknown, max: number): string {
  return String(value || "").trim().slice(0, max);
}

export function isValidUsername(username: string): boolean {
  return /^[a-zA-Z0-9._-]{3,32}$/.test(username);
}

export function sanitizeGovManagerUserState(input: unknown): GovManagerUserState {
  if (!input || typeof input !== "object") {
    return { version: "1.0", updated_at_utc: nowUtc(), rows: [] };
  }
  const obj = input as Record<string, unknown>;
  const rowsRaw = Array.isArray(obj.rows) ? obj.rows : [];
  const rows = rowsRaw
    .map((row) => {
      if (!row || typeof row !== "object") return null;
      const r = row as Record<string, unknown>;
      const username = clampText(r.username, 32);
      const roleRaw = clampText(r.role, 24).toLowerCase() as GovManagerRole;
      const role: GovManagerRole = ALLOWED_ROLES.has(roleRaw) ? roleRaw : "engineer";
      const active = r.active !== false;
      const passwordHash = clampText(r.password_hash, 400);
      if (!username || !passwordHash || !isValidUsername(username)) return null;
      const created = new Date(clampText(r.created_at_utc, 64));
      const updated = new Date(clampText(r.updated_at_utc, 64));
      const createdAt = Number.isNaN(created.getTime()) ? nowUtc() : created.toISOString();
      const updatedAt = Number.isNaN(updated.getTime()) ? createdAt : updated.toISOString();
      return {
        username,
        role,
        active,
        password_hash: passwordHash,
        created_at_utc: createdAt,
        updated_at_utc: updatedAt
      } satisfies GovManagerUserRow;
    })
    .filter((row): row is GovManagerUserRow => Boolean(row))
    .sort((a, b) => a.username.localeCompare(b.username))
    .slice(0, 500);

  return {
    version: "1.0",
    updated_at_utc: nowUtc(),
    rows
  };
}

export function toPublicGovManagerUsers(state: GovManagerUserState): GovManagerUserPublicRow[] {
  return state.rows.map((row) => ({
    username: row.username,
    role: row.role,
    active: row.active,
    created_at_utc: row.created_at_utc,
    updated_at_utc: row.updated_at_utc
  }));
}

export function hashPassword(password: string): string {
  const normalized = String(password || "");
  const salt = randomBytes(16);
  const iterations = 120_000;
  const hash = pbkdf2Sync(normalized, salt, iterations, 32, "sha256");
  return `pbkdf2$sha256$${iterations}$${salt.toString("base64")}$${hash.toString("base64")}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  const parts = String(storedHash || "").split("$");
  if (parts.length !== 5) return false;
  const [scheme, digest, iterationsRaw, saltB64 = "", hashB64 = ""] = parts;
  if (scheme !== "pbkdf2" || digest !== "sha256") return false;
  const iterations = Number(iterationsRaw);
  if (!Number.isFinite(iterations) || iterations < 10_000 || iterations > 500_000) return false;
  try {
    const salt = Buffer.from(saltB64, "base64");
    const expected = Buffer.from(hashB64, "base64");
    const current = pbkdf2Sync(String(password || ""), salt, iterations, expected.length, "sha256");
    return expected.length === current.length && timingSafeEqual(expected, current);
  } catch {
    return false;
  }
}
