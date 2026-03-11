import { readSessionFromRequest, type GovManagerRole, type GovManagerSessionData } from "../auth/session";

const ROLE_WEIGHT: Record<GovManagerRole, number> = {
  viewer: 1,
  engineer: 2,
  admin: 3
};

export function hasRequiredRole(current: GovManagerRole, required: GovManagerRole): boolean {
  return ROLE_WEIGHT[current] >= ROLE_WEIGHT[required];
}

export function getSessionOrNull(request: Request): GovManagerSessionData | null {
  return readSessionFromRequest(request);
}

export function requireRole(request: Request, required: GovManagerRole):
  | { ok: true; session: GovManagerSessionData }
  | { ok: false; status: number; error_code: string } {
  const session = readSessionFromRequest(request);
  if (!session) return { ok: false, status: 401, error_code: "AUTH_REQUIRED" };
  if (!hasRequiredRole(session.role, required)) return { ok: false, status: 403, error_code: "ROLE_FORBIDDEN" };
  return { ok: true, session };
}
