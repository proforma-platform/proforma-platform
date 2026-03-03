import type { CostPreview } from "./token-estimator";

export interface TokenPolicy {
  daily_token_limit: number;
  daily_usd_limit: number;
  monthly_usd_limit: number;
  warn_threshold_pct: number;
  auto_pause_on_limit: boolean;
  hard_stop: boolean;
}

export interface TokenPolicyState {
  default_policy: TokenPolicy;
  owner_overrides: Array<{
    owner_id: string;
    policy: Partial<TokenPolicy>;
  }>;
  updated_at_utc: string;
}

export interface TokenUsageEntry {
  mission_id: string;
  owner_id: string;
  agent_id: string;
  projected_total_tokens: number;
  projected_cost_usd: number;
  projected_cost_brl: number;
  created_at_utc: string;
  status: "reserved" | "consumed" | "released";
}

export interface TokenUsageState {
  rows: TokenUsageEntry[];
  updated_at_utc: string;
}

export interface TokenUsageSummary {
  owner_id: string;
  daily_tokens: number;
  daily_usd: number;
  monthly_usd: number;
  daily_count: number;
  monthly_count: number;
}

export interface TokenGovernanceDecision {
  allowed: boolean;
  state: "ok" | "warn" | "paused_waiting_owner";
  reasons: string[];
  warnings: string[];
  summary: TokenUsageSummary;
  projected_after: {
    daily_tokens: number;
    daily_usd: number;
    monthly_usd: number;
  };
}

export function defaultTokenPolicyState(): TokenPolicyState {
  return {
    default_policy: {
      daily_token_limit: 60000,
      daily_usd_limit: 12,
      monthly_usd_limit: 240,
      warn_threshold_pct: 80,
      auto_pause_on_limit: true,
      hard_stop: true
    },
    owner_overrides: [],
    updated_at_utc: new Date().toISOString()
  };
}

export function defaultTokenUsageState(): TokenUsageState {
  return { rows: [], updated_at_utc: new Date().toISOString() };
}

export function sanitizeTokenPolicyState(input: unknown): TokenPolicyState {
  const fallback = defaultTokenPolicyState();
  const obj = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
  const defaultPolicyRaw = obj.default_policy && typeof obj.default_policy === "object"
    ? (obj.default_policy as Partial<TokenPolicy>)
    : {};

  const ownerOverridesRaw = Array.isArray(obj.owner_overrides) ? obj.owner_overrides : [];

  return {
    default_policy: sanitizePolicy({ ...fallback.default_policy, ...defaultPolicyRaw }),
    owner_overrides: ownerOverridesRaw
      .filter((row) => row && typeof row === "object")
      .map((row) => row as Record<string, unknown>)
      .map((row) => ({
        owner_id: String(row.owner_id || "").trim(),
        policy: sanitizePolicyPartial(row.policy && typeof row.policy === "object" ? (row.policy as Partial<TokenPolicy>) : {})
      }))
      .filter((row) => row.owner_id.length > 0)
      .slice(0, 300),
    updated_at_utc: typeof obj.updated_at_utc === "string" ? obj.updated_at_utc : fallback.updated_at_utc
  };
}

export function sanitizeTokenUsageState(input: unknown): TokenUsageState {
  const obj = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
  const rowsRaw = Array.isArray(obj.rows) ? obj.rows : [];

  const rows = rowsRaw
    .filter((row) => row && typeof row === "object")
    .map((row) => row as Record<string, unknown>)
    .map((row) => ({
      mission_id: String(row.mission_id || "").trim(),
      owner_id: String(row.owner_id || "").trim(),
      agent_id: String(row.agent_id || "CPP").trim(),
      projected_total_tokens: clampPositiveNumber(row.projected_total_tokens, 0),
      projected_cost_usd: clampPositiveNumber(row.projected_cost_usd, 0),
      projected_cost_brl: clampPositiveNumber(row.projected_cost_brl, 0),
      created_at_utc: String(row.created_at_utc || new Date().toISOString()),
      status: normalizeStatus(row.status)
    }))
    .filter((row) => row.mission_id && row.owner_id)
    .slice(-3000);

  return {
    rows,
    updated_at_utc: typeof obj.updated_at_utc === "string" ? obj.updated_at_utc : new Date().toISOString()
  };
}

export function resolvePolicyForOwner(policyState: TokenPolicyState, ownerId: string): TokenPolicy {
  const override = policyState.owner_overrides.find((entry) => entry.owner_id === ownerId);
  return sanitizePolicy({
    ...policyState.default_policy,
    ...(override ? override.policy : {})
  });
}

export function computeUsageSummary(usageState: TokenUsageState, ownerId: string, now = new Date()): TokenUsageSummary {
  const rows = usageState.rows.filter((row) => row.owner_id === ownerId && row.status !== "released");
  const dayKey = isoDay(now);
  const monthKey = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;

  const dailyRows = rows.filter((row) => isoDay(new Date(row.created_at_utc)) === dayKey);
  const monthlyRows = rows.filter((row) => {
    const dt = new Date(row.created_at_utc);
    return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}` === monthKey;
  });

  return {
    owner_id: ownerId,
    daily_tokens: sum(dailyRows.map((row) => row.projected_total_tokens)),
    daily_usd: round2(sum(dailyRows.map((row) => row.projected_cost_usd))),
    monthly_usd: round2(sum(monthlyRows.map((row) => row.projected_cost_usd))),
    daily_count: dailyRows.length,
    monthly_count: monthlyRows.length
  };
}

export function evaluateTokenGovernance(input: {
  preview: CostPreview;
  owner_id: string;
  policyState: TokenPolicyState;
  usageState: TokenUsageState;
  hardStopOverride?: boolean;
}): TokenGovernanceDecision {
  const policy = resolvePolicyForOwner(input.policyState, input.owner_id);
  const summary = computeUsageSummary(input.usageState, input.owner_id);
  const projected_after = {
    daily_tokens: summary.daily_tokens + input.preview.projected_total_tokens,
    daily_usd: round2(summary.daily_usd + input.preview.projected_cost_usd),
    monthly_usd: round2(summary.monthly_usd + input.preview.projected_cost_usd)
  };

  const reasons: string[] = [];
  if (projected_after.daily_tokens > policy.daily_token_limit) {
    reasons.push("daily_token_limit_exceeded");
  }
  if (projected_after.daily_usd > policy.daily_usd_limit) {
    reasons.push("daily_usd_limit_exceeded");
  }
  if (projected_after.monthly_usd > policy.monthly_usd_limit) {
    reasons.push("monthly_usd_limit_exceeded");
  }

  const warnings: string[] = [];
  const warnRatio = Math.max(1, Math.min(99, policy.warn_threshold_pct)) / 100;
  if (projected_after.daily_tokens >= Math.round(policy.daily_token_limit * warnRatio)) {
    warnings.push("daily_token_near_limit");
  }
  if (projected_after.daily_usd >= round2(policy.daily_usd_limit * warnRatio)) {
    warnings.push("daily_usd_near_limit");
  }
  if (projected_after.monthly_usd >= round2(policy.monthly_usd_limit * warnRatio)) {
    warnings.push("monthly_usd_near_limit");
  }

  const hardStop = input.hardStopOverride === true || policy.hard_stop;
  const mustPause = reasons.length > 0 && (hardStop || policy.auto_pause_on_limit);

  return {
    allowed: !mustPause,
    state: mustPause ? "paused_waiting_owner" : warnings.length > 0 ? "warn" : "ok",
    reasons,
    warnings,
    summary,
    projected_after
  };
}

export function appendUsageReservation(
  usageState: TokenUsageState,
  reservation: {
    mission_id: string;
    owner_id: string;
    agent_id: string;
    projected_total_tokens: number;
    projected_cost_usd: number;
    projected_cost_brl: number;
  }
): TokenUsageState {
  const next = usageState.rows.filter(
    (row) => !(row.mission_id === reservation.mission_id && row.owner_id === reservation.owner_id)
  );

  next.push({
    mission_id: reservation.mission_id,
    owner_id: reservation.owner_id,
    agent_id: reservation.agent_id,
    projected_total_tokens: Math.max(0, Math.trunc(reservation.projected_total_tokens)),
    projected_cost_usd: round2(Math.max(0, reservation.projected_cost_usd)),
    projected_cost_brl: round2(Math.max(0, reservation.projected_cost_brl)),
    created_at_utc: new Date().toISOString(),
    status: "reserved"
  });

  return {
    rows: next.slice(-3000),
    updated_at_utc: new Date().toISOString()
  };
}

function sanitizePolicy(policy: Partial<TokenPolicy>): TokenPolicy {
  return {
    daily_token_limit: Math.max(1000, Math.trunc(clampPositiveNumber(policy.daily_token_limit, 60000))),
    daily_usd_limit: Math.max(1, round2(clampPositiveNumber(policy.daily_usd_limit, 12))),
    monthly_usd_limit: Math.max(5, round2(clampPositiveNumber(policy.monthly_usd_limit, 240))),
    warn_threshold_pct: Math.max(1, Math.min(99, Math.trunc(clampPositiveNumber(policy.warn_threshold_pct, 80)))),
    auto_pause_on_limit: policy.auto_pause_on_limit !== false,
    hard_stop: policy.hard_stop !== false
  };
}

function sanitizePolicyPartial(policy: Partial<TokenPolicy>): Partial<TokenPolicy> {
  const out: Partial<TokenPolicy> = {};
  if (policy.daily_token_limit !== undefined) out.daily_token_limit = Math.max(1000, Math.trunc(clampPositiveNumber(policy.daily_token_limit, 1000)));
  if (policy.daily_usd_limit !== undefined) out.daily_usd_limit = Math.max(1, round2(clampPositiveNumber(policy.daily_usd_limit, 1)));
  if (policy.monthly_usd_limit !== undefined) out.monthly_usd_limit = Math.max(5, round2(clampPositiveNumber(policy.monthly_usd_limit, 5)));
  if (policy.warn_threshold_pct !== undefined) out.warn_threshold_pct = Math.max(1, Math.min(99, Math.trunc(clampPositiveNumber(policy.warn_threshold_pct, 80))));
  if (policy.auto_pause_on_limit !== undefined) out.auto_pause_on_limit = Boolean(policy.auto_pause_on_limit);
  if (policy.hard_stop !== undefined) out.hard_stop = Boolean(policy.hard_stop);
  return out;
}

function normalizeStatus(value: unknown): "reserved" | "consumed" | "released" {
  if (value === "consumed") return "consumed";
  if (value === "released") return "released";
  return "reserved";
}

function clampPositiveNumber(value: unknown, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function sum(values: number[]): number {
  return values.reduce((acc, item) => acc + item, 0);
}

function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
