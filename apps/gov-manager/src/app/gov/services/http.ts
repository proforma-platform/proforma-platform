export async function getJson<T = unknown>(url: string, init?: RequestInit): Promise<{ ok: boolean; status: number; payload: T }> {
  const response = await fetch(url, { cache: "no-store", ...(init || {}) });
  const payload = (await response.json()) as T;
  return { ok: response.ok, status: response.status, payload };
}

export async function postJson<T = unknown>(url: string, body: unknown, init?: RequestInit): Promise<{ ok: boolean; status: number; payload: T }> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    ...(init || {})
  });
  const payload = (await response.json()) as T;
  return { ok: response.ok, status: response.status, payload };
}

export async function putJson<T = unknown>(url: string, body: unknown, init?: RequestInit): Promise<{ ok: boolean; status: number; payload: T }> {
  const response = await fetch(url, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    ...(init || {})
  });
  const payload = (await response.json()) as T;
  return { ok: response.ok, status: response.status, payload };
}
