export interface AuthContext {
  actor: string;
  authenticated: boolean;
}

export function resolveAuthContext(headers: Headers): AuthContext {
  const actor = headers.get("x-gov-actor") || "anonymous";
  return {
    actor,
    authenticated: actor !== "anonymous"
  };
}
