export function readNumber(value: unknown, fallback = 0): number {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

export function formatUsd(value: number): string {
  return `$${value.toFixed(2)}`;
}

export function formatPct(value: number): string {
  return `${Math.round(value)}%`;
}

export function formatDateTime(value: string): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "medium",
    timeZone: "America/Sao_Paulo"
  }).format(date);
}

export function formatDateOnly(value: string): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeZone: "America/Sao_Paulo"
  }).format(date);
}

export function formatAuditStatePreview(raw: string): string {
  const input = String(raw || "").trim();
  if (!input) return "-";
  try {
    const parsed = JSON.parse(input) as unknown;
    if (!parsed || typeof parsed !== "object") return compactText(input, 180);
    const obj = parsed as Record<string, unknown>;
    const keys = Object.keys(obj).slice(0, 5);
    if (keys.length === 0) return "-";
    const line = keys
      .map((key) => `${key}:${String(obj[key] ?? "-").slice(0, 42)}`)
      .join(" · ");
    return compactText(line, 180);
  } catch {
    return compactText(input, 180);
  }
}

export function compactText(value: string, max = 180): string {
  const clean = String(value || "").replace(/\s+/g, " ").trim();
  if (!clean) return "";
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max - 1)}…`;
}

export function normalizeChatMatch(value: string): string {
  return String(value || "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase();
}

export function replyCountLabel(count: number): string {
  const safe = Math.max(0, Math.trunc(count));
  const prefix = String(safe).padStart(2, "0");
  const suffix = safe === 1 ? "resposta" : "respostas";
  return `${prefix} ${suffix}`;
}

export function formatBytes(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "0 B";
  if (value >= 1024 * 1024) return `${(value / (1024 * 1024)).toFixed(1)} MB`;
  if (value >= 1024) return `${Math.round(value / 1024)} KB`;
  return `${Math.round(value)} B`;
}
