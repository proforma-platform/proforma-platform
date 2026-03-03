export type BotHealthState = "ok" | "running" | "error" | "blocked" | "skipped" | "unknown";

export interface BotStatusRow {
  bot_id: string;
  workflow_id: string;
  state: BotHealthState;
  result: string;
  message: string;
  run_id: string;
  run_url: string;
  actor: string;
  updated_at_utc: string;
}

export interface BotStatusState {
  version: "1.0";
  updated_at_utc: string;
  rows: BotStatusRow[];
}

const ALLOWED_STATES = new Set<BotHealthState>(["ok", "running", "error", "blocked", "skipped", "unknown"]);

function clampText(value: unknown, max = 200): string {
  const text = String(value || "").trim();
  return text.slice(0, max);
}

function normalizeState(value: unknown): BotHealthState {
  const candidate = clampText(value, 32).toLowerCase() as BotHealthState;
  return ALLOWED_STATES.has(candidate) ? candidate : "unknown";
}

function normalizeUtcIso(value: unknown): string {
  const text = clampText(value, 48);
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return new Date().toISOString();
  return date.toISOString();
}

function normalizeRunUrl(value: unknown): string {
  const text = clampText(value, 600);
  if (!text.startsWith("https://")) return "";
  return text;
}

export function defaultBotStatusState(now = new Date().toISOString()): BotStatusState {
  return {
    version: "1.0",
    updated_at_utc: now,
    rows: []
  };
}

export function sanitizeBotStatusState(input: unknown): BotStatusState {
  const fallback = defaultBotStatusState();
  if (!input || typeof input !== "object") return fallback;
  const obj = input as Record<string, unknown>;
  const rows = Array.isArray(obj.rows) ? obj.rows : [];

  const sanitizedRows: BotStatusRow[] = rows
    .map((raw) => {
      if (!raw || typeof raw !== "object") return null;
      const row = raw as Record<string, unknown>;
      const botId = clampText(row.bot_id, 80);
      const workflowId = clampText(row.workflow_id, 80);
      if (!botId || !workflowId) return null;
      return {
        bot_id: botId,
        workflow_id: workflowId,
        state: normalizeState(row.state),
        result: clampText(row.result, 80),
        message: clampText(row.message, 240),
        run_id: clampText(row.run_id, 80),
        run_url: normalizeRunUrl(row.run_url),
        actor: clampText(row.actor, 80),
        updated_at_utc: normalizeUtcIso(row.updated_at_utc)
      } satisfies BotStatusRow;
    })
    .filter((row): row is BotStatusRow => Boolean(row))
    .sort((a, b) => b.updated_at_utc.localeCompare(a.updated_at_utc))
    .slice(0, 50);

  return {
    version: "1.0",
    updated_at_utc: normalizeUtcIso(obj.updated_at_utc),
    rows: sanitizedRows
  };
}

export function upsertBotStatusRow(
  state: BotStatusState,
  input: {
    bot_id: unknown;
    workflow_id: unknown;
    state: unknown;
    result?: unknown;
    message?: unknown;
    run_id?: unknown;
    run_url?: unknown;
    actor?: unknown;
    updated_at_utc?: unknown;
  }
): BotStatusState {
  const next: BotStatusRow = {
    bot_id: clampText(input.bot_id, 80),
    workflow_id: clampText(input.workflow_id, 80),
    state: normalizeState(input.state),
    result: clampText(input.result, 80),
    message: clampText(input.message, 240),
    run_id: clampText(input.run_id, 80),
    run_url: normalizeRunUrl(input.run_url),
    actor: clampText(input.actor, 80),
    updated_at_utc: normalizeUtcIso(input.updated_at_utc)
  };

  const key = `${next.bot_id}::${next.workflow_id}`;
  const rows = state.rows.filter((row) => `${row.bot_id}::${row.workflow_id}` !== key);
  rows.unshift(next);

  return {
    version: "1.0",
    updated_at_utc: new Date().toISOString(),
    rows: rows.sort((a, b) => b.updated_at_utc.localeCompare(a.updated_at_utc)).slice(0, 50)
  };
}
