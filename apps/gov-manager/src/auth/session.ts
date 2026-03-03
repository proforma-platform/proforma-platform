export const GOV_MANAGER_SESSION_COOKIE = "gov_manager_session";

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
  const cookieHeader = request.headers.get("cookie") || "";
  if (!cookieHeader) return false;
  const cookies = parseCookies(cookieHeader);
  return Boolean(cookies[GOV_MANAGER_SESSION_COOKIE]);
}

export function resolveLoginConfig() {
  const username = String(process.env.GOV_MANAGER_LOGIN_USER || "staff").trim();
  const password = String(process.env.GOV_MANAGER_LOGIN_PASSWORD || "govmanager").trim();
  return { username, password };
}

