import { getJson } from "./http";

export function loadPromptsApi() {
  return getJson<{ prompts?: unknown[] }>("/api/govhub/prompts");
}

export function loadSessionInfoApi() {
  return getJson("/api/auth/session");
}

export function loadPolicyApi() {
  return getJson<{ policy?: { default_policy?: unknown } }>("/api/govhub/token/policy");
}

export function loadUsersApi() {
  return getJson("/api/auth/users");
}

export function loadOfficeHierarchyApi() {
  return getJson("/api/govhub/operations/office");
}
