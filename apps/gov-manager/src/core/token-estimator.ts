import { gzipSync, gunzipSync } from "zlib";

export interface TokenControlInput {
  enabled?: boolean;
  budget_usd?: number;
  budget_brl?: number;
  max_input_tokens?: number;
  max_output_tokens?: number;
  hard_stop?: boolean;
}

export interface CostPreviewInput {
  mission_id: string;
  agent_id: string;
  udn: string;
  objective?: string;
  token_control?: TokenControlInput | null;
}

export interface CostPreview {
  mission_id: string;
  model_profile: "CPP" | "CPP-IA" | "CUSTOM";
  projected_input_tokens: number;
  projected_output_tokens: number;
  projected_total_tokens: number;
  projected_cost_usd: number;
  projected_cost_brl: number;
  warnings: string[];
}

type MissionRunSnapshot = {
  mission_id?: string;
  status?: string;
  phase?: string;
  nn?: number;
  total?: number;
  updated_at?: string;
  udn_state?: string;
  udn_mission?: string;
  udn?: string;
};

// GPT-5.3-Codex default pricing (USD per 1K tokens)
const DEFAULT_USD_PER_1K_INPUT = 0.00175;
const DEFAULT_USD_PER_1K_OUTPUT = 0.014;
const DEFAULT_USD_TO_BRL = 5.2;

export function estimateTokenCount(text: string): number {
  // Approximation tuned for PT-BR/EN mixed operational payloads.
  const chars = String(text || "").length;
  return Math.max(1, Math.ceil(chars / 4));
}

export function buildCostPreview(input: CostPreviewInput): CostPreview {
  const warnings: string[] = [];
  const agent = normalizeAgent(input.agent_id);
  const udnTokens = estimateTokenCount(input.udn);
  const objectiveTokens = estimateTokenCount(input.objective || "");

  const overhead = agent === "CPP-IA" ? 320 : 220;
  const projectedInput = Math.max(80, udnTokens + objectiveTokens + overhead);
  const projectedOutput = Math.max(60, Math.round(projectedInput * (agent === "CPP-IA" ? 1.1 : 0.8)));

  const capInput = input.token_control?.max_input_tokens;
  const capOutput = input.token_control?.max_output_tokens;
  const boundedInput = typeof capInput === "number" && capInput > 0 ? Math.min(projectedInput, capInput) : projectedInput;
  const boundedOutput =
    typeof capOutput === "number" && capOutput > 0 ? Math.min(projectedOutput, capOutput) : projectedOutput;

  if (typeof capInput === "number" && projectedInput > capInput) {
    warnings.push("projecao de input acima do limite max_input_tokens");
  }
  if (typeof capOutput === "number" && projectedOutput > capOutput) {
    warnings.push("projecao de output acima do limite max_output_tokens");
  }

  const usdInputRate = parseEnvNumber("GOV_MANAGER_USD_PER_1K_INPUT", DEFAULT_USD_PER_1K_INPUT);
  const usdOutputRate = parseEnvNumber("GOV_MANAGER_USD_PER_1K_OUTPUT", DEFAULT_USD_PER_1K_OUTPUT);
  const usdToBrl = parseEnvNumber("GOV_MANAGER_USD_TO_BRL", DEFAULT_USD_TO_BRL);

  const usd = (boundedInput / 1000) * usdInputRate + (boundedOutput / 1000) * usdOutputRate;
  const brl = usd * usdToBrl;

  const budgetUsd = input.token_control?.budget_usd;
  const budgetBrl = input.token_control?.budget_brl;
  if (typeof budgetUsd === "number" && budgetUsd > 0 && usd > budgetUsd) {
    warnings.push("projecao acima de budget_usd");
  }
  if (typeof budgetBrl === "number" && budgetBrl > 0 && brl > budgetBrl) {
    warnings.push("projecao acima de budget_brl");
  }

  return {
    mission_id: input.mission_id,
    model_profile: agent,
    projected_input_tokens: boundedInput,
    projected_output_tokens: boundedOutput,
    projected_total_tokens: boundedInput + boundedOutput,
    projected_cost_usd: round2(usd),
    projected_cost_brl: round2(brl),
    warnings
  };
}

export function decodeMissionRunsSnapshot(payloadB64: string): MissionRunSnapshot[] {
  const buf = Buffer.from(payloadB64, "base64");
  const text = gunzipSync(buf).toString("utf8");
  const trimmed = String(text || "").trim();
  if (!trimmed) return [];

  // Preferred format: JSON payload { mission_runs: [...] }
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      const parsed = JSON.parse(trimmed) as { mission_runs?: unknown };
      const rows = Array.isArray(parsed?.mission_runs) ? parsed.mission_runs : [];
      return rows.filter((r) => r && typeof r === "object") as MissionRunSnapshot[];
    } catch {
      // fall through to compact !RUN parser
    }
  }

  // Compact format: !RUN|run_id|mission_id|status|phase|nn/total;
  const rows: MissionRunSnapshot[] = [];
  for (const rawLine of trimmed.split(/\r?\n/)) {
    const line = String(rawLine || "").trim();
    if (!line || !line.startsWith("!RUN|")) continue;
    const clean = line.replace(/;\s*$/, "");
    const parts = clean.split("|");
    if (parts.length < 6) continue;
    const mission_id = String(parts[2] || "").trim();
    const status = String(parts[3] || "").trim();
    const phase = String(parts[4] || "").trim();
    const progress = String(parts[5] || "").trim();
    const match = progress.match(/^(\d+)\s*\/\s*(\d+)$/);
    const nn = match ? Number.parseInt(match[1] ?? "0", 10) : 0;
    const total = match ? Number.parseInt(match[2] ?? "0", 10) : 0;
    rows.push({
      mission_id,
      status,
      phase,
      nn: Number.isFinite(nn) ? nn : 0,
      total: Number.isFinite(total) ? total : 0
    });
  }
  return rows;
}

export function encodeMissionRunsSnapshot(rows: unknown): string {
  const json = JSON.stringify({ mission_runs: rows });
  return gzipSync(Buffer.from(json, "utf8")).toString("base64");
}

export function computeRealtimeProjection(
  mission_id: string,
  preview: CostPreview,
  runs: MissionRunSnapshot[]
): {
  found: boolean;
  mission_id: string;
  status: string;
  phase: string;
  nn: number;
  total: number;
  progress_pct: number;
  estimated_used_tokens: number;
  estimated_remaining_tokens: number;
  estimated_used_usd: number;
  estimated_used_brl: number;
} {
  const target = runs.find((r) => String(r.mission_id || "") === mission_id);
  if (!target) {
    return {
      found: false,
      mission_id,
      status: "not_found",
      phase: "unknown",
      nn: 0,
      total: 0,
      progress_pct: 0,
      estimated_used_tokens: 0,
      estimated_remaining_tokens: preview.projected_total_tokens,
      estimated_used_usd: 0,
      estimated_used_brl: 0
    };
  }

  const nn = sanitizeInt(target.nn);
  const total = Math.max(1, sanitizeInt(target.total));
  const progress = Math.min(1, Math.max(0, nn / total));
  const used = Math.round(preview.projected_total_tokens * progress);
  const remaining = Math.max(0, preview.projected_total_tokens - used);

  return {
    found: true,
    mission_id,
    status: String(target.status || "unknown"),
    phase: String(target.phase || "unknown"),
    nn,
    total,
    progress_pct: round2(progress * 100),
    estimated_used_tokens: used,
    estimated_remaining_tokens: remaining,
    estimated_used_usd: round2(preview.projected_cost_usd * progress),
    estimated_used_brl: round2(preview.projected_cost_brl * progress)
  };
}

function parseEnvNumber(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const num = Number(raw);
  return Number.isFinite(num) && num > 0 ? num : fallback;
}

function normalizeAgent(value: string): "CPP" | "CPP-IA" | "CUSTOM" {
  const v = String(value || "").toUpperCase();
  if (v === "CPP") return "CPP";
  if (v === "CPP-IA") return "CPP-IA";
  return "CUSTOM";
}

function sanitizeInt(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.trunc(n));
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}
