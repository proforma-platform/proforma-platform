export interface WatchdogAttempt {
  queue_id: string;
  count: number;
  last_reason: string;
  updated_at_utc: string;
}

export interface WatchdogState {
  version: "1.0";
  updated_at_utc: string;
  attempts: WatchdogAttempt[];
}

function nowUtc(): string {
  return new Date().toISOString();
}

function clampText(value: unknown, max: number): string {
  return String(value || "").trim().slice(0, max);
}

function toIso(value: unknown): string {
  const parsed = Date.parse(String(value || "").trim());
  if (!Number.isFinite(parsed)) return nowUtc();
  return new Date(parsed).toISOString();
}

export function defaultWatchdogState(): WatchdogState {
  return {
    version: "1.0",
    updated_at_utc: nowUtc(),
    attempts: []
  };
}

export function sanitizeWatchdogState(input: unknown): WatchdogState {
  if (!input || typeof input !== "object") return defaultWatchdogState();
  const obj = input as Record<string, unknown>;
  const attemptsRaw = Array.isArray(obj.attempts) ? obj.attempts : [];
  const attempts = attemptsRaw
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const row = item as Record<string, unknown>;
      const queueId = clampText(row.queue_id, 120);
      if (!queueId) return null;
      const count = Number(row.count);
      return {
        queue_id: queueId,
        count: Number.isFinite(count) ? Math.max(0, Math.min(10, Math.trunc(count))) : 0,
        last_reason: clampText(row.last_reason, 120),
        updated_at_utc: toIso(row.updated_at_utc)
      } satisfies WatchdogAttempt;
    })
    .filter((row): row is WatchdogAttempt => Boolean(row))
    .sort((a, b) => String(b.updated_at_utc).localeCompare(String(a.updated_at_utc)))
    .slice(0, 5000);

  return {
    version: "1.0",
    updated_at_utc: toIso(obj.updated_at_utc),
    attempts
  };
}

export function upsertWatchdogAttempts(state: WatchdogState, nextRows: WatchdogAttempt[]): WatchdogState {
  const map = new Map(state.attempts.map((row) => [row.queue_id, row] as const));
  for (const row of nextRows) map.set(row.queue_id, row);
  return {
    version: "1.0",
    updated_at_utc: nowUtc(),
    attempts: Array.from(map.values())
      .sort((a, b) => String(b.updated_at_utc).localeCompare(String(a.updated_at_utc)))
      .slice(0, 5000)
  };
}
