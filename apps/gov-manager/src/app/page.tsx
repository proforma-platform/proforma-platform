'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type Theme = "dark" | "light";
type Section = "visao" | "missoes" | "orquestracao" | "chat" | "execucoes" | "pendencias" | "prompts" | "governanca";
type MissionsTab = "cadastro" | "gestao";
type PartExecutor = "STAFF" | "CPP" | "CPP-IA";
type PartPriority = "P0" | "P1" | "P2";
type ChatUiAction = "MSG" | "STATUS" | "OK" | "PAUSAR" | "NEGAR" | "OWNER_CALL" | "NOVA_MISSAO";
type QueueWorkflowStatus = "open" | "in_progress" | "done" | "paused_waiting_owner";

interface MissionPart {
  part_id: string;
  goal: string;
  executor: PartExecutor;
  priority: PartPriority;
}

interface PromptEntry {
  prompt_id: string;
  title: string;
  description: string;
  purpose: string;
  tags: string[];
  template: string;
  variables: string[];
  prompt_hash: string;
}

interface TokenPolicy {
  daily_token_limit: number;
  daily_usd_limit: number;
  monthly_usd_limit: number;
  warn_threshold_pct: number;
  auto_pause_on_limit: boolean;
  hard_stop: boolean;
}

interface UsageSummary {
  daily_input_tokens?: number;
  daily_output_tokens?: number;
  daily_tokens?: number;
  monthly_input_tokens?: number;
  monthly_output_tokens?: number;
  daily_usd?: number;
  monthly_usd?: number;
  daily_count?: number;
  monthly_count?: number;
}

interface UsageRow {
  mission_id?: string;
  projected_input_tokens?: number;
  projected_output_tokens?: number;
  projected_total_tokens?: number;
  projected_cost_usd?: number;
  projected_cost_brl?: number;
  status?: string;
  created_at_utc?: string;
}

interface BotStatusRow {
  bot_id?: string;
  workflow_id?: string;
  state?: string;
  result?: string;
  message?: string;
  run_id?: string;
  run_url?: string;
  actor?: string;
  updated_at_utc?: string;
}

interface QueueRow {
  queue_id?: string;
  mission_id?: string;
  title?: string;
  description?: string;
  kind?: string;
  priority?: string;
  assignee?: string;
  status?: string;
  created_at_utc?: string;
  updated_at_utc?: string;
}

type QueueEtaConfidence = "alta" | "media" | "baixa";

interface QueueEtaEstimate {
  label: string;
  confidence: QueueEtaConfidence;
  deviation_min: number;
}

interface MissionBoardPackage {
  package_id?: string;
  mission_ids?: string[];
  note?: string;
  status?: string;
  created_by?: string;
  created_at_utc?: string;
  updated_at_utc?: string;
}

interface MissionBoardMission {
  mission_id?: string;
  objective?: string;
  assignee?: string;
  priority?: string;
  status?: string;
  notes?: string;
  updated_at_utc?: string;
  updated_by?: string;
}

interface ChatRow {
  message_id?: string;
  mission_id?: string;
  actor?: string;
  target?: string;
  action?: string;
  message?: string;
  direction?: string;
  in_reply_to?: string;
  source?: string;
  delivery_status?: string;
  dispatch_http?: number | null;
  created_at_utc?: string;
}

interface GovUserRow {
  username?: string;
  role?: string;
  active?: boolean;
  created_at_utc?: string;
  updated_at_utc?: string;
}

interface SessionInfo {
  actor?: string;
  role?: string;
  is_primary_admin?: boolean;
}

interface TopNotice {
  message: string;
  variant: "success" | "error" | "info";
}

interface SupportErrorReportInput {
  source: string;
  missionId?: string;
  queueId?: string;
  action?: string;
  errorCode?: string;
  message: string;
  payload?: unknown;
}

const ADMIN_COMMAND_ACTIONS = new Set<ChatUiAction>(["OK", "PAUSAR", "NEGAR", "OWNER_CALL", "NOVA_MISSAO"]);
const PRINCIPAL_ARCHITECT_TARGET = "PRINCIPAL_ARCHITECT";
const MISSION_INTAKE_AGENT = PRINCIPAL_ARCHITECT_TARGET;
const MISSION_ID_PREFIX = "GOV-MANAGER-V1-";
const MISSION_ID_DIGITS = 5;
const SUPPORT_REPORTED_SUFFIX = " (falha/erro reportado ao time de suporte).";
const SECTION_ITEMS: Array<{ id: Section; label: string; icon: string }> = [
  { id: "visao", label: "Visão geral", icon: "⌂" },
  { id: "missoes", label: "Missões", icon: "◫" },
  { id: "orquestracao", label: "Orquestração", icon: "◎" },
  { id: "chat", label: "Chat HUB", icon: "✉" },
  { id: "execucoes", label: "Execuções", icon: "▤" },
  { id: "pendencias", label: "Pendências", icon: "⎋" },
  { id: "prompts", label: "Prompts", icon: "⌘" },
  { id: "governanca", label: "Governança", icon: "◉" }
];
const KANBAN_COLUMNS: Array<{ status: QueueWorkflowStatus; label: string }> = [
  { status: "open", label: "A fazer" },
  { status: "in_progress", label: "Em progresso" },
  { status: "paused_waiting_owner", label: "Pausadas" },
  { status: "done", label: "Concluídas" }
];

function isAdminCommandAction(action: string): boolean {
  return ADMIN_COMMAND_ACTIONS.has(String(action || "").toUpperCase() as ChatUiAction);
}

const defaultPolicy: TokenPolicy = {
  daily_token_limit: 60000,
  daily_usd_limit: 12,
  monthly_usd_limit: 240,
  warn_threshold_pct: 80,
  auto_pause_on_limit: true,
  hard_stop: true
};

function resolveOwnerAckRequired(payload: unknown): boolean {
  const obj = (payload && typeof payload === "object" ? payload : {}) as Record<string, unknown>;
  if (obj.owner_ack_required === true) return true;
  const upstream = (obj.govhub_response && typeof obj.govhub_response === "object"
    ? obj.govhub_response
    : {}) as Record<string, unknown>;
  return upstream.owner_ack_required === true;
}

function parseVars(raw: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || !trimmed.includes("=")) continue;
    const idx = trimmed.indexOf("=");
    const key = trimmed.slice(0, idx).trim();
    const value = trimmed.slice(idx + 1).trim();
    if (key) out[key] = value;
  }
  return out;
}

function safeJsonParse(raw: string): Record<string, unknown> | null {
  if (!raw.trim()) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function parseMissionIds(raw: string): string[] {
  return Array.from(
    new Set(
      String(raw || "")
        .split(/[\s,;]+/)
        .map((value) => value.trim().toUpperCase())
        .filter(Boolean)
    )
  );
}

function readNumber(value: unknown, fallback = 0): number {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function formatUsd(value: number): string {
  return `$${value.toFixed(2)}`;
}

function formatPct(value: number): string {
  return `${Math.round(value)}%`;
}

function formatDateTime(value: string): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "medium",
    timeZone: "America/Sao_Paulo"
  }).format(date);
}

function compactText(value: string, max = 180): string {
  const clean = String(value || "").replace(/\s+/g, " ").trim();
  if (!clean) return "";
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max - 1)}…`;
}

function normalizeChatMatch(value: string): string {
  return String(value || "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase();
}

function isMissionFormattedRow(row: ChatRow): boolean {
  const action = String(row.action || "").trim().toUpperCase();
  if (action && action !== "MSG") return true;
  const normalized = normalizeChatMatch(String(row.message || ""));
  return (
    normalized.includes("resultado") ||
    normalized.includes("missao") ||
    normalized.includes("finaliz") ||
    normalized.includes("conclu") ||
    normalized.includes("proximo recomendado") ||
    normalized.includes("status")
  );
}

function chatActionUiLabel(action: string): string {
  const normalized = String(action || "").trim().toUpperCase();
  if (normalized === "MSG") return "Conversa";
  if (normalized === "STATUS") return "Confirmação de Missão";
  if (normalized === "OK") return "Aprovar Execução";
  if (normalized === "PAUSAR") return "Pausar Missão";
  if (normalized === "NEGAR") return "Negar Missão";
  if (normalized === "OWNER_CALL") return "Chamar Owner";
  if (normalized === "NOVA_MISSAO") return "Nova Missão";
  return normalized || "Conversa";
}

function replyCountLabel(count: number): string {
  const safe = Math.max(0, Math.trunc(count));
  const prefix = String(safe).padStart(2, "0");
  const suffix = safe === 1 ? "resposta" : "respostas";
  return `${prefix} ${suffix}`;
}

function chatRowSummary(row: ChatRow): string {
  const directMessage = compactText(String(row.message || ""), 180);
  if (directMessage) return directMessage;
  const pieces = [
    row.action ? String(row.action) : "",
    row.mission_id ? `Missão ${String(row.mission_id)}` : "",
    row.direction ? `Direção ${String(row.direction)}` : ""
  ].filter(Boolean);
  return compactText(pieces.join(" | "), 180) || "Sem conteúdo.";
}

function sanitizeMissionInline(value: string): string {
  return String(value || "")
    .replace(/\r?\n/g, " ")
    .replace(/[;|]/g, ",")
    .trim();
}

function missionRequiredIssues(mission: { id: string; target: string }, createdBy: string, parts: MissionPart[]): string[] {
  const issues: string[] = [];
  if (!String(mission.id || "").trim()) issues.push("Mission ID");
  if (!String(mission.target || "").trim()) issues.push("Objetivo");
  if (!String(createdBy || "").trim()) issues.push("Criado por");
  const hasPartGoal = parts.some((part) => String(part.goal || "").trim().length > 0);
  if (!hasPartGoal) issues.push("Entrega da Parte");
  return issues;
}

function normalizeTdvTags(raw: string): string {
  return String(raw || "")
    .replace(/#\s*mu\s*:/gi, "#μ:")
    .replace(/#\s*tau\s*:/gi, "#τ:")
    .replace(/#\s*sigma\s*:/gi, "#σ:")
    .replace(/#\s*rho\s*:/gi, "#ρ:")
    .replace(/#\s*delta\s*:/gi, "#δ:");
}

function udnContractIssues(rawUdn: string): string[] {
  const text = normalizeTdvTags(String(rawUdn || "")).trim().toUpperCase();
  const issues: string[] = [];
  if (!text) issues.push("UDN vazio");
  if (text && !text.includes("!MIS|")) issues.push("!MIS");
  if (text && !text.includes("#Μ:")) issues.push("#μ");
  return issues;
}

function repairMissionUdn(rawUdn: string, generatedUdn: string): { udn: string; repaired: string[] } {
  const rawLines = normalizeTdvTags(String(rawUdn || ""))
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const generatedLines = normalizeTdvTags(String(generatedUdn || ""))
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const repaired: string[] = [];
  const ensureLine = (prefix: string) => {
    const hasPrefix = rawLines.some((line) => line.toUpperCase().startsWith(prefix.toUpperCase()));
    if (hasPrefix) return;
    const fallback = generatedLines.find((line) => line.toUpperCase().startsWith(prefix.toUpperCase()));
    if (fallback) {
      rawLines.push(fallback);
      repaired.push(prefix);
    }
  };

  ensureLine("!MIS|");
  ensureLine("#μ:");
  if (rawLines.some((line) => line.toUpperCase().startsWith("!MIS|")) && !rawLines.some((line) => line.toUpperCase().startsWith("#τ:"))) {
    ensureLine("#τ:");
  }

  return { udn: normalizeTdvTags(rawLines.join("\n")), repaired };
}

function resolveRegisterError(payload: unknown): string {
  const obj = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
  const upstream = obj.govhub_response && typeof obj.govhub_response === "object"
    ? (obj.govhub_response as Record<string, unknown>)
    : {};

  const details = Array.isArray(obj.errors)
    ? obj.errors.map((value) => String(value || "").trim()).filter(Boolean).join("; ")
    : "";

  const candidates = [
    details ? `UDN inválido: ${details}` : "",
    obj.message,
    obj.error,
    obj.error_code,
    upstream.message,
    upstream.error,
    upstream.error_code
  ]
    .map((value) => String(value || "").trim())
    .filter(Boolean);

  const first = candidates[0];
  if (first) return first;
  return "REGISTER_FAILED";
}

function resolveErrorCode(payload: unknown): string {
  const obj = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
  const upstream = obj.govhub_response && typeof obj.govhub_response === "object"
    ? (obj.govhub_response as Record<string, unknown>)
    : {};
  const code = String(obj.error_code || upstream.error_code || "").trim().toUpperCase();
  return code || "UNKNOWN_ERROR";
}

function withSupportSuffix(message: string): string {
  const text = String(message || "").trim();
  if (!text) return SUPPORT_REPORTED_SUFFIX.trim();
  return text.endsWith(SUPPORT_REPORTED_SUFFIX) ? text : `${text}${SUPPORT_REPORTED_SUFFIX}`;
}

function botStateLabel(state: string): string {
  const normalized = String(state || "unknown").toLowerCase();
  if (normalized === "ok") return "OK";
  if (normalized === "running") return "Rodando";
  if (normalized === "error") return "Erro";
  if (normalized === "blocked") return "Bloqueado";
  if (normalized === "skipped") return "Ignorado";
  return "Desconhecido";
}

function deliveryStatusLabel(status: string): string {
  const normalized = String(status || "").toLowerCase();
  if (normalized === "dispatched") return "Entregue";
  if (normalized === "queued") return "Em fila";
  if (normalized === "failed") return "Falhou";
  return "Indefinido";
}

function deliveryStatusClass(status: string): string {
  const normalized = String(status || "").toLowerCase();
  if (normalized === "dispatched") return "gm-chip-ok";
  if (normalized === "failed") return "gm-chip-error";
  return "gm-chip-warn";
}

function formatChatIdentity(value: string): string {
  const normalized = String(value || "").trim().toUpperCase();
  if (normalized === PRINCIPAL_ARCHITECT_TARGET) return "Principal Architect";
  return String(value || "").trim();
}

function missionCodeNumber(value: string): number | null {
  const match = String(value || "")
    .trim()
    .toUpperCase()
    .match(/^GOV-MANAGER-V1-(\d{1,10})$/);
  if (!match) return null;
  const parsed = Number(match[1]);
  if (!Number.isInteger(parsed) || parsed < 0) return null;
  return parsed;
}

function formatMissionCode(value: number): string {
  const safe = Math.max(1, Math.trunc(value));
  return `${MISSION_ID_PREFIX}${String(safe).padStart(MISSION_ID_DIGITS, "0")}`;
}

function missionShortToken(value: string): string {
  const clean = String(value || "").trim().toUpperCase();
  const match = clean.match(/-(\d{1,10})$/);
  if (!match || !match[1]) return clean || "00001";
  return match[1].padStart(MISSION_ID_DIGITS, "0");
}

function toEpoch(value: unknown): number | null {
  const parsed = Date.parse(String(value || "").trim());
  return Number.isFinite(parsed) ? parsed : null;
}

function queuePriorityBaseMinutes(priority: string): number {
  const normalized = String(priority || "").trim().toUpperCase();
  if (normalized === "P0") return 25;
  if (normalized === "P1") return 45;
  if (normalized === "P2") return 75;
  if (normalized === "P3") return 120;
  return 60;
}

function queueAssigneeFactor(assignee: string): number {
  const normalized = String(assignee || "").trim().toUpperCase();
  if (normalized === "CPP-IA") return 0.85;
  if (normalized === "CPP") return 1;
  if (normalized === "STAFF") return 1.15;
  return 1;
}

function queueStatusLabel(status: string): string {
  const normalized = String(status || "").trim().toLowerCase();
  if (normalized === "open") return "A fazer";
  if (normalized === "in_progress") return "Em progresso";
  if (normalized === "paused_waiting_owner") return "Pausada";
  if (normalized === "done") return "Concluída";
  return "Indefinido";
}

function estimateQueueEta(row: QueueRow, nowEpoch: number): QueueEtaEstimate {
  const status = String(row.status || "").trim().toLowerCase();
  if (status === "done") return { label: "Concluída", confidence: "alta", deviation_min: 0 };
  if (status === "paused_waiting_owner") return { label: "Pausada", confidence: "baixa", deviation_min: 0 };

  const baseline = Math.max(10, Math.round(queuePriorityBaseMinutes(String(row.priority || "")) * queueAssigneeFactor(String(row.assignee || ""))));
  const createdEpoch = toEpoch(row.created_at_utc) ?? toEpoch(row.updated_at_utc) ?? nowEpoch;
  const updatedEpoch = toEpoch(row.updated_at_utc) ?? createdEpoch;

  const elapsedFromCreateMin = Math.max(0, Math.round((nowEpoch - createdEpoch) / 60000));
  const elapsedFromUpdateMin = Math.max(0, Math.round((nowEpoch - updatedEpoch) / 60000));
  const elapsedMin = status === "in_progress" ? elapsedFromUpdateMin : elapsedFromCreateMin;
  const staleMin = Math.max(0, Math.round((nowEpoch - updatedEpoch) / 60000));
  const deviation = elapsedMin - baseline;

  let remaining = baseline;
  if (status === "in_progress") {
    remaining = Math.max(3, baseline - elapsedMin);
    if (elapsedMin > baseline) {
      // Keep ETA realistic for long-running items instead of unbounded growth.
      const overtime = elapsedMin - baseline;
      remaining = Math.max(3, Math.min(Math.round(baseline * 1.25), Math.round(overtime * 0.25 + 6)));
    }
  }

  let score = 100;
  if (status === "open") score -= 25;
  if (staleMin > 5) score -= 10;
  if (staleMin > 15) score -= 20;
  if (staleMin > 30) score -= 20;
  if (Math.abs(deviation) > 30) score -= 15;
  if (Math.abs(deviation) > 60) score -= 20;

  const confidence: QueueEtaConfidence = score >= 75 ? "alta" : score >= 45 ? "media" : "baixa";
  return {
    label: `${remaining} min para conclusão`,
    confidence,
    deviation_min: deviation
  };
}

function buildMissionDraftKey(input: {
  mission: { id: string; target: string; branch: string; agent_id: string };
  createdBy: string;
  parts: MissionPart[];
  udn: string;
  tokenControl: {
    enabled: boolean;
    budget_usd: number;
    budget_brl: number;
    max_input_tokens: number;
    max_output_tokens: number;
    hard_stop: boolean;
  };
  selectedPromptId: string;
  promptVarsRaw: string;
}): string {
  return JSON.stringify({
    mission: input.mission,
    createdBy: input.createdBy,
    parts: input.parts,
    udn: normalizeTdvTags(input.udn),
    tokenControl: input.tokenControl,
    selectedPromptId: input.selectedPromptId,
    promptVarsRaw: input.promptVarsRaw
  });
}

function isFinalReportText(value: string): boolean {
  const normalized = String(value || "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase();
  return (
    normalized.includes("resultado") ||
    normalized.includes("finaliz") ||
    normalized.includes("conclu") ||
    normalized.includes("entrega")
  );
}

function playTimSound() {
  try {
    const Context = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Context) return;
    const ctx = new Context();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = 920;
    gain.gain.value = 0.0001;
    osc.connect(gain);
    gain.connect(ctx.destination);
    const now = ctx.currentTime;
    gain.gain.exponentialRampToValueAtTime(0.04, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.14);
    osc.start(now);
    osc.stop(now + 0.16);
    window.setTimeout(() => void ctx.close(), 220);
  } catch {
    // no-op
  }
}

export default function GovManagerPage() {
  const [theme, setTheme] = useState<Theme>("dark");
  const [section, setSection] = useState<Section>("visao");
  const [missionsTab, setMissionsTab] = useState<MissionsTab>("cadastro");

  const [mission, setMission] = useState({ id: "", target: "", branch: "main", agent_id: MISSION_INTAKE_AGENT });
  const [createdBy, setCreatedBy] = useState("staff@gov-manager");
  const [currentRole, setCurrentRole] = useState("viewer");
  const [isPrimaryAdmin, setIsPrimaryAdmin] = useState(false);
  const [topNotice, setTopNotice] = useState<TopNotice | null>(null);
  const [udn, setUdn] = useState("");
  const [status, setStatus] = useState("idle");
  const [responseText, setResponseText] = useState("");
  const [ackRequired, setAckRequired] = useState(false);
  const [ownerNote, setOwnerNote] = useState("");

  const [tokenControl, setTokenControl] = useState({
    enabled: true,
    budget_usd: 5,
    budget_brl: 26,
    max_input_tokens: 6000,
    max_output_tokens: 6000,
    hard_stop: true
  });
  const [tokenPreview, setTokenPreview] = useState("");
  const [tokenRealtime, setTokenRealtime] = useState("");

  const [parts, setParts] = useState<MissionPart[]>([
    {
      part_id: "P1",
      goal: "Classificar escopo e preparar distribuicao inicial.",
      executor: "STAFF",
      priority: "P0"
    }
  ]);

  const [promptLibrary, setPromptLibrary] = useState<PromptEntry[]>([]);
  const [promptForm, setPromptForm] = useState({ title: "", description: "", purpose: "", tags: "", template: "" });
  const [selectedPromptId, setSelectedPromptId] = useState("");
  const [promptVarsRaw, setPromptVarsRaw] = useState("contexto=govhub\nobjetivo=reduzir tokens");

  const [policy, setPolicy] = useState<TokenPolicy>(defaultPolicy);
  const [usageText, setUsageText] = useState("");
  const [usageRefreshSec, setUsageRefreshSec] = useState(45);
  const [monitorRefreshSec, setMonitorRefreshSec] = useState(30);
  const [botStatusRefreshSec, setBotStatusRefreshSec] = useState(30);
  const [usageRefreshNonce, setUsageRefreshNonce] = useState(0);
  const [monitorRefreshNonce, setMonitorRefreshNonce] = useState(0);
  const [botStatusRefreshNonce, setBotStatusRefreshNonce] = useState(0);
  const [usageUpdatedAt, setUsageUpdatedAt] = useState("");
  const [monitorUpdatedAt, setMonitorUpdatedAt] = useState("");
  const [botStatusText, setBotStatusText] = useState("");
  const [botStatusUpdatedAt, setBotStatusUpdatedAt] = useState("");
  const [queueText, setQueueText] = useState("");
  const [queueUpdatedAt, setQueueUpdatedAt] = useState("");
  const [queueLoading, setQueueLoading] = useState(false);
  const [queueRefreshSec, setQueueRefreshSec] = useState(30);
  const [queueRefreshNonce, setQueueRefreshNonce] = useState(0);
  const [queueNotice, setQueueNotice] = useState("");
  const [queueFocusedId, setQueueFocusedId] = useState("");
  const [queueAssigneeFilter, setQueueAssigneeFilter] = useState<"all" | PartExecutor>("all");
  const [queuePriorityFilter, setQueuePriorityFilter] = useState<"all" | "P0" | "P1" | "P2" | "P3">("all");
  const [queueMissionFilter, setQueueMissionFilter] = useState("");
  const [queueDragId, setQueueDragId] = useState("");
  const [queueDetailsOpen, setQueueDetailsOpen] = useState(false);
  const [queueDetailsRow, setQueueDetailsRow] = useState<QueueRow | null>(null);
  const [missionManageText, setMissionManageText] = useState("");
  const [missionManageUpdatedAt, setMissionManageUpdatedAt] = useState("");
  const [missionManageNotice, setMissionManageNotice] = useState("");
  const [groupPackageId, setGroupPackageId] = useState("");
  const [groupMissionIdsRaw, setGroupMissionIdsRaw] = useState("");
  const [groupNote, setGroupNote] = useState("");
  const [manageEdit, setManageEdit] = useState({ mission_id: "", objective: "", assignee: "STAFF", priority: "P1", notes: "" });
  const [manageExecution, setManageExecution] = useState({ mission_id: "", title: "", description: "", assignee: "CPP", priority: "P1" });
  const [chatText, setChatText] = useState("");
  const [chatUpdatedAt, setChatUpdatedAt] = useState("");
  const [chatRefreshSec, setChatRefreshSec] = useState(5);
  const [chatRefreshNonce, setChatRefreshNonce] = useState(0);
  const [chatAction, setChatAction] = useState<ChatUiAction>("MSG");
  const [chatTarget, setChatTarget] = useState("CPP");
  const [chatMessage, setChatMessage] = useState("");
  const [chatNotice, setChatNotice] = useState("");
  const [chatUnread, setChatUnread] = useState(0);
  const [chatReplyOpenId, setChatReplyOpenId] = useState("");
  const [chatPollState, setChatPollState] = useState<"online" | "offline">("online");
  const [chatPingAt, setChatPingAt] = useState("");
  const [watchMissionId, setWatchMissionId] = useState("");
  const [validatedDraftKey, setValidatedDraftKey] = useState("");
  const [projectMissionCount, setProjectMissionCount] = useState(8);
  const [usersOpen, setUsersOpen] = useState(false);
  const [usersText, setUsersText] = useState("");
  const [usersUpdatedAt, setUsersUpdatedAt] = useState("");
  const [userForm, setUserForm] = useState({ username: "", password: "", role: "engineer" });
  const [selectedUser, setSelectedUser] = useState("");
  const [userStatus, setUserStatus] = useState("");
  const chatSeenMessageIdRef = useRef("");
  const chatInitRef = useRef(false);
  const missionReportSeenRef = useRef<Record<string, boolean>>({});
  const supportErrorDedupRef = useRef<Record<string, number>>({});

  const reportSupportError = useCallback(async (input: SupportErrorReportInput) => {
    const missionId = String(input.missionId || mission.id || "GOV-MANAGER-V1-ERROR")
      .trim()
      .toUpperCase();
    if (!missionId) return;

    const baseMessage = String(input.message || "").trim();
    const errorCode = String(input.errorCode || "").trim().toUpperCase() || "UNKNOWN_ERROR";
    const dedupKey = [input.source, missionId, errorCode, baseMessage].join("|").toLowerCase();
    const now = Date.now();
    const lastSent = Number(supportErrorDedupRef.current[dedupKey] || 0);
    if (now - lastSent < 20_000) return;
    supportErrorDedupRef.current[dedupKey] = now;

    const payloadPreview = (() => {
      try {
        const raw = JSON.stringify(input.payload ?? {}, null, 0);
        return raw.slice(0, 320);
      } catch {
        return "";
      }
    })();

    const udn = [
      `!ERR|${sanitizeMissionInline(input.source || "GOV_MANAGER")}|${sanitizeMissionInline(missionId)}|REPORT`,
      `#μ:${sanitizeMissionInline(baseMessage || "Falha operacional no GOV-Manager")}`,
      `#σ:ERR_CODE=${sanitizeMissionInline(errorCode)};ACTION=${sanitizeMissionInline(input.action || "-")};QUEUE=${sanitizeMissionInline(input.queueId || "-")}`,
      `#τ:staff_triage;support_followup`,
      `#ctx:payload=${sanitizeMissionInline(payloadPreview || "-")}`,
      "!OUT:JSON_ONLY.NO_MD.NO_TXT."
    ].join("\n");

    try {
      await fetch("/api/govhub/operations/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          mission_id: missionId,
          actor: createdBy,
          target: "STAFF",
          action: "MSG",
          message: udn
        })
      });
    } catch {
      // no-op
    }
  }, [createdBy, mission.id]);

  const selectedPrompt = useMemo(
    () => promptLibrary.find((prompt) => prompt.prompt_id === selectedPromptId) || null,
    [promptLibrary, selectedPromptId]
  );

  useEffect(() => {
    const persisted = window.localStorage.getItem("gov-manager-theme");
    const next = persisted === "light" ? "light" : "dark";
    setTheme(next);
    document.documentElement.dataset.theme = next;
  }, []);

  useEffect(() => {
    loadSessionInfo();
    loadPrompts();
    loadPolicy();
    loadUsers();
  }, []);

  useEffect(() => {
    if (!createdBy) return;
    let active = true;

    const pullUsage = async () => {
      try {
        const response = await fetch("/api/govhub/token/usage?owner_id=all", {
          cache: "no-store"
        });
        const payload = await response.json();
        if (active) {
          setUsageText(JSON.stringify(payload, null, 2));
          setUsageUpdatedAt(new Date().toISOString());
        }
      } catch {
        if (active) {
          setUsageText(JSON.stringify({ status: "error", error_code: "USAGE_FETCH_FAILED" }, null, 2));
          setUsageUpdatedAt(new Date().toISOString());
        }
      }
    };

    pullUsage();
    const interval = window.setInterval(pullUsage, Math.max(15, usageRefreshSec) * 1000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [createdBy, usageRefreshNonce, usageRefreshSec]);

  useEffect(() => {
    if (section !== "chat") return;
    void loadUsers();
  }, [section]);

  useEffect(() => {
    if (section !== "missoes" || missionsTab !== "gestao") return;
    void loadMissionManage();
  }, [missionsTab, queueRefreshNonce, section]);

  useEffect(() => {
    let active = true;

    const pullBotStatus = async () => {
      try {
        const response = await fetch("/api/govhub/bots/status", { cache: "no-store" });
        const payload = await response.json();
        if (active) {
          setBotStatusText(JSON.stringify(payload, null, 2));
          setBotStatusUpdatedAt(new Date().toISOString());
        }
      } catch {
        if (active) {
          setBotStatusText(JSON.stringify({ status: "error", error_code: "BOT_STATUS_FETCH_FAILED" }, null, 2));
          setBotStatusUpdatedAt(new Date().toISOString());
        }
      }
    };

    pullBotStatus();
    const interval = window.setInterval(pullBotStatus, Math.max(15, botStatusRefreshSec) * 1000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [botStatusRefreshNonce, botStatusRefreshSec]);

  const pullQueueNow = useCallback(
    async (options?: { silent?: boolean }) => {
      const silent = options?.silent === true;
      setQueueLoading(true);
      try {
        const response = await fetch("/api/govhub/operations/queue", { cache: "no-store" });
        const payload = await response.json();
        setQueueText(JSON.stringify(payload, null, 2));
        setQueueUpdatedAt(new Date().toISOString());
        if (!silent) setQueueNotice("Fila atualizada.");
      } catch {
        setQueueText(JSON.stringify({ status: "error", error_code: "QUEUE_FETCH_FAILED" }, null, 2));
        setQueueUpdatedAt(new Date().toISOString());
        if (!silent) {
          const baseMessage = "Falha ao atualizar fila.";
          void reportSupportError({
            source: "QUEUE_PULL",
            action: "GET_QUEUE",
            errorCode: "QUEUE_FETCH_FAILED",
            message: baseMessage
          });
          setQueueNotice(withSupportSuffix(baseMessage));
        }
      } finally {
        setQueueLoading(false);
      }
    },
    [reportSupportError]
  );

  useEffect(() => {
    let active = true;
    const pullQueue = async () => {
      if (!active) return;
      await pullQueueNow({ silent: true });
    };

    pullQueue();
    const interval = window.setInterval(pullQueue, Math.max(15, queueRefreshSec) * 1000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [pullQueueNow, queueRefreshNonce, queueRefreshSec]);

  useEffect(() => {
    let active = true;
    const pullChat = async () => {
      try {
        const response = await fetch("/api/govhub/operations/chat", { cache: "no-store" });
        const payload = await response.json();
        if (active) {
          const rows = Array.isArray(payload?.rows) ? (payload.rows as ChatRow[]) : [];
          const newestMessageId = String(rows[0]?.message_id || "").trim();
          if (newestMessageId) {
            if (!chatInitRef.current) {
              chatInitRef.current = true;
              chatSeenMessageIdRef.current = newestMessageId;
            } else if (chatSeenMessageIdRef.current !== newestMessageId) {
              const unseenRows: ChatRow[] = [];
              for (const row of rows) {
                const rowId = String(row.message_id || "").trim();
                if (!rowId) continue;
                if (rowId === chatSeenMessageIdRef.current) break;
                unseenRows.push(row);
              }
              const unseenInbound = unseenRows.filter((row) => {
                const actor = String(row.actor || "").trim().toLowerCase();
                const mine = createdBy.trim().toLowerCase();
                return actor && actor !== mine;
              }).length;
              if (unseenInbound > 0) {
                setChatUnread((prev) => prev + unseenInbound);
                setChatNotice(`Vc tem ${unseenInbound} nova(s) msg.`);
                if (section !== "chat") playTimSound();
              }
              chatSeenMessageIdRef.current = newestMessageId;
            }
          }
          setChatText(JSON.stringify(payload, null, 2));
          setChatUpdatedAt(new Date().toISOString());
          setChatPingAt(new Date().toISOString());
          setChatPollState("online");
        }
      } catch {
        if (active) {
          setChatText(JSON.stringify({ status: "error", error_code: "CHAT_FETCH_FAILED" }, null, 2));
          setChatUpdatedAt(new Date().toISOString());
          setChatPingAt(new Date().toISOString());
          setChatPollState("offline");
        }
      }
    };

    pullChat();
    const interval = window.setInterval(pullChat, Math.max(2, chatRefreshSec) * 1000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [chatRefreshNonce, chatRefreshSec, createdBy, mission.id, section]);

  useEffect(() => {
    if (currentRole !== "admin" && chatAction !== "MSG" && chatAction !== "STATUS") {
      setChatAction("MSG");
    }
  }, [chatAction, currentRole]);

  useEffect(() => {
    if (section !== "chat") return;
    if (!chatText) return;
    const payload = safeJsonParse(chatText);
    const rows = Array.isArray(payload?.rows) ? (payload.rows as ChatRow[]) : [];
    const newestMessageId = String(rows[0]?.message_id || "").trim();
    if (newestMessageId) {
      chatSeenMessageIdRef.current = newestMessageId;
      chatInitRef.current = true;
    }
  }, [chatText, section]);

  async function loadPrompts() {
    try {
      const response = await fetch("/api/govhub/prompts", { cache: "no-store" });
      const payload = await response.json();
      if (Array.isArray(payload.prompts)) setPromptLibrary(payload.prompts);
    } catch {
      // no-op
    }
  }

  async function loadSessionInfo() {
    try {
      const response = await fetch("/api/auth/session", { cache: "no-store" });
      const payload = (await response.json()) as SessionInfo;
      if (response.ok) {
        const actor = String(payload.actor || "").trim();
        const role = String(payload.role || "").trim().toLowerCase();
        if (actor) setCreatedBy(actor);
        setCurrentRole(role === "viewer" || role === "engineer" ? role : "admin");
        setIsPrimaryAdmin(payload.is_primary_admin === true);
      }
    } catch {
      // no-op
    }
  }

  async function savePrompt() {
    setStatus("saving_prompt");
    try {
      const response = await fetch("/api/govhub/prompts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "upsert",
          created_by: createdBy,
          prompt: {
            title: promptForm.title,
            description: promptForm.description,
            purpose: promptForm.purpose,
            tags: promptForm.tags
              .split(",")
              .map((tag) => tag.trim())
              .filter(Boolean),
            template: promptForm.template
          }
        })
      });
      const payload = await response.json();
      setResponseText(JSON.stringify(payload, null, 2));
      setStatus(response.ok ? "success" : "error");
      await loadPrompts();
      setPromptForm({ title: "", description: "", purpose: "", tags: "", template: "" });
    } catch {
      setStatus("error");
      setResponseText(JSON.stringify({ status: "error", error_code: "PROMPT_SAVE_FAILED" }, null, 2));
    }
  }

  async function deletePrompt(promptId: string) {
    setStatus("deleting_prompt");
    try {
      const response = await fetch("/api/govhub/prompts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "delete", prompt_id: promptId, created_by: createdBy })
      });
      const payload = await response.json();
      setResponseText(JSON.stringify(payload, null, 2));
      setStatus(response.ok ? "success" : "error");
      if (selectedPromptId === promptId) setSelectedPromptId("");
      await loadPrompts();
    } catch {
      setStatus("error");
      setResponseText(JSON.stringify({ status: "error", error_code: "PROMPT_DELETE_FAILED" }, null, 2));
    }
  }

  async function loadPolicy() {
    try {
      const response = await fetch("/api/govhub/token/policy", { cache: "no-store" });
      const payload = await response.json();
      if (payload?.policy?.default_policy) {
        setPolicy(payload.policy.default_policy as TokenPolicy);
      }
    } catch {
      // no-op
    }
  }

  async function savePolicy() {
    setStatus("saving_policy");
    try {
      const response = await fetch("/api/govhub/token/policy", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          updated_by: createdBy,
          policy: {
            default_policy: policy,
            owner_overrides: [],
            updated_at_utc: new Date().toISOString()
          }
        })
      });
      const payload = await response.json();
      setResponseText(JSON.stringify(payload, null, 2));
      setStatus(response.ok ? "success" : "error");
    } catch {
      setStatus("error");
      setResponseText(JSON.stringify({ status: "error", error_code: "POLICY_SAVE_FAILED" }, null, 2));
    }
  }

  function updateTheme(next: Theme) {
    setTheme(next);
    document.documentElement.dataset.theme = next;
    window.localStorage.setItem("gov-manager-theme", next);
  }

  function scrollToContent() {
    window.requestAnimationFrame(() => {
      const content = document.querySelector(".gm-main");
      if (content) {
        content.scrollIntoView({ behavior: "smooth", block: "start" });
      } else {
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
    });
  }

  function goToSection(next: Section) {
    setSection(next);
    scrollToContent();
  }

  async function logout() {
    await fetch("/api/auth/session", { method: "DELETE" });
    window.location.href = "/login";
  }

  async function loadUsers() {
    try {
      const response = await fetch("/api/auth/users", { cache: "no-store" });
      const payload = await response.json();
      setUsersText(JSON.stringify(payload, null, 2));
      setUsersUpdatedAt(new Date().toISOString());
    } catch {
      setUsersText(JSON.stringify({ status: "error", error_code: "USERS_FETCH_FAILED" }, null, 2));
      setUsersUpdatedAt(new Date().toISOString());
    }
  }

  async function openUsersModal() {
    if (!isPrimaryAdmin) return;
    setUsersOpen(true);
    setUserStatus("");
    setSelectedUser("");
    setUserForm({ username: "", password: "", role: "engineer" });
    await loadUsers();
  }

  function selectUserForEdit(username: string) {
    const clean = String(username || "").trim();
    if (!clean) {
      setSelectedUser("");
      setUserForm({ username: "", password: "", role: "engineer" });
      setUserStatus("Novo usuário.");
      return;
    }
    const row = usersRows.find((item) => String(item.username || "").toLowerCase() === clean.toLowerCase());
    setSelectedUser(clean);
    setUserForm({
      username: clean,
      password: "",
      role: String(row?.role || "engineer")
    });
    setUserStatus(`Editando usuário: ${clean}`);
  }

  async function createUser() {
    const username = String(userForm.username || "").trim();
    const password = String(userForm.password || "");
    if (!username) {
      setUserStatus("Informe o usuário.");
      return;
    }
    if (password.length < 8) {
      setUserStatus("Senha mínima: 8 caracteres.");
      return;
    }
    setUserStatus("salvando");
    try {
      const response = await fetch("/api/auth/users", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          username,
          password,
          role: userForm.role,
          active: true,
          actor: createdBy
        })
      });
      const payload = await response.json();
      setResponseText(JSON.stringify(payload, null, 2));
      if (!response.ok) {
        setUserStatus(`erro: ${String(payload?.error_code || "USER_CREATE_FAILED")}`);
        return;
      }
      const mode = String(payload?.mode || "created");
      const savedUsername = String(payload?.row?.username || username);
      const savedRole = String(payload?.row?.role || userForm.role);
      setSelectedUser(savedUsername);
      setUserForm({ username: savedUsername, password: "", role: savedRole });
      setUserStatus(mode === "updated" ? "Usuario atualizado!" : "Usuario cadastrado!");
      await loadUsers();
    } catch {
      setUserStatus("erro: USER_CREATE_NETWORK_FAILED");
    }
  }

  async function loadMissionManage() {
    try {
      const response = await fetch("/api/govhub/missions/manage", { cache: "no-store" });
      const payload = await response.json();
      setMissionManageText(JSON.stringify(payload, null, 2));
      setMissionManageUpdatedAt(new Date().toISOString());
    } catch {
      setMissionManageText(JSON.stringify({ status: "error", error_code: "MISSION_MANAGE_FETCH_FAILED" }, null, 2));
      setMissionManageUpdatedAt(new Date().toISOString());
    }
  }

  async function groupMissions() {
    const missionIds = parseMissionIds(groupMissionIdsRaw);
    if (missionIds.length === 0) {
      setMissionManageNotice("Informe ao menos uma missão para agrupar.");
      return;
    }
    setStatus("mission_grouping");
    try {
      const response = await fetch("/api/govhub/missions/manage", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "group_missions",
          actor: createdBy,
          package_id: String(groupPackageId || "").trim() || `PACOTE-${Date.now()}`,
          mission_ids: missionIds,
          note: groupNote
        })
      });
      const payload = await response.json();
      setResponseText(JSON.stringify(payload, null, 2));
      if (!response.ok) {
        const baseMessage = `Falha ao agrupar: ${resolveRegisterError(payload)}.`;
        await reportSupportError({
          source: "MISSION_GROUP",
          action: "group_missions",
          ...(String(missionIds[0] || mission.id || "").trim()
            ? { missionId: String(missionIds[0] || mission.id || "").trim().toUpperCase() }
            : {}),
          errorCode: resolveErrorCode(payload),
          message: baseMessage,
          payload
        });
        setStatus("error");
        setMissionManageNotice(withSupportSuffix(baseMessage));
        return;
      }
      setStatus("success");
      setMissionManageNotice(`Pacote ${String(payload?.package?.package_id || "-")} salvo com ${missionIds.length} missão(ões).`);
      await loadMissionManage();
    } catch {
      const baseMessage = "Falha de rede ao agrupar missões.";
      await reportSupportError({
        source: "MISSION_GROUP",
        action: "group_missions",
        missionId: mission.id,
        errorCode: "NETWORK_ERROR",
        message: baseMessage
      });
      setStatus("error");
      setMissionManageNotice(withSupportSuffix(baseMessage));
    }
  }

  async function editMissionInProgress() {
    const missionId = String(manageEdit.mission_id || "").trim().toUpperCase();
    if (!missionId) {
      setMissionManageNotice("Informe a missão para editar.");
      return;
    }
    setStatus("mission_editing");
    try {
      const response = await fetch("/api/govhub/missions/manage", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "edit_mission",
          actor: createdBy,
          mission_id: missionId,
          objective: manageEdit.objective,
          assignee: manageEdit.assignee,
          priority: manageEdit.priority,
          notes: manageEdit.notes
        })
      });
      const payload = await response.json();
      setResponseText(JSON.stringify(payload, null, 2));
      if (!response.ok) {
        const baseMessage = `Edição bloqueada: ${resolveRegisterError(payload)}.`;
        await reportSupportError({
          source: "MISSION_EDIT",
          action: "edit_mission",
          missionId,
          errorCode: resolveErrorCode(payload),
          message: baseMessage,
          payload
        });
        setStatus("error");
        setMissionManageNotice(withSupportSuffix(baseMessage));
        return;
      }
      setStatus("success");
      setMissionManageNotice(`Missão ${missionId} atualizada.`);
      await loadMissionManage();
    } catch {
      const baseMessage = "Falha de rede ao editar missão.";
      await reportSupportError({
        source: "MISSION_EDIT",
        action: "edit_mission",
        missionId,
        errorCode: "NETWORK_ERROR",
        message: baseMessage
      });
      setStatus("error");
      setMissionManageNotice(withSupportSuffix(baseMessage));
    }
  }

  async function addExecutionToMission() {
    const missionId = String(manageExecution.mission_id || "").trim().toUpperCase();
    const title = String(manageExecution.title || "").trim();
    if (!missionId || !title) {
      setMissionManageNotice("Informe missão e título da execução.");
      return;
    }
    setStatus("mission_add_execution");
    try {
      const response = await fetch("/api/govhub/missions/manage", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "add_execution",
          actor: createdBy,
          mission_id: missionId,
          title,
          description: manageExecution.description,
          assignee: manageExecution.assignee,
          priority: manageExecution.priority
        })
      });
      const payload = await response.json();
      setResponseText(JSON.stringify(payload, null, 2));
      if (!response.ok) {
        const baseMessage = `Falha ao adicionar execução: ${resolveRegisterError(payload)}.`;
        await reportSupportError({
          source: "MISSION_ADD_EXECUTION",
          action: "add_execution",
          missionId,
          errorCode: resolveErrorCode(payload),
          message: baseMessage,
          payload
        });
        setStatus("error");
        setMissionManageNotice(withSupportSuffix(baseMessage));
        return;
      }
      setStatus("success");
      setMissionManageNotice(`Nova execução adicionada na missão ${missionId}.`);
      setQueueRefreshNonce((prev) => prev + 1);
      await loadMissionManage();
    } catch {
      const baseMessage = "Falha de rede ao incluir execução.";
      await reportSupportError({
        source: "MISSION_ADD_EXECUTION",
        action: "add_execution",
        missionId,
        errorCode: "NETWORK_ERROR",
        message: baseMessage
      });
      setStatus("error");
      setMissionManageNotice(withSupportSuffix(baseMessage));
    }
  }

  async function startAllNonPausedMissions() {
    setStatus("mission_bulk_start");
    try {
      const response = await fetch("/api/govhub/missions/manage", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "start_all_non_paused",
          actor: createdBy
        })
      });
      const payload = await response.json();
      setResponseText(JSON.stringify(payload, null, 2));
      if (!response.ok) {
        const baseMessage = `Falha no início em lote: ${resolveRegisterError(payload)}.`;
        await reportSupportError({
          source: "MISSION_BULK_START",
          action: "start_all_non_paused",
          missionId: mission.id,
          errorCode: resolveErrorCode(payload),
          message: baseMessage,
          payload
        });
        setStatus("error");
        setMissionManageNotice(withSupportSuffix(baseMessage));
        return;
      }
      const changed = Number(payload?.changed || 0);
      setStatus("success");
      setMissionManageNotice(changed > 0 ? `${changed} item(ns) colocados em execução.` : "Sem itens elegíveis para iniciar.");
      setQueueRefreshNonce((prev) => prev + 1);
      await loadMissionManage();
    } catch {
      const baseMessage = "Falha de rede ao iniciar missões não pausadas.";
      await reportSupportError({
        source: "MISSION_BULK_START",
        action: "start_all_non_paused",
        missionId: mission.id,
        errorCode: "NETWORK_ERROR",
        message: baseMessage
      });
      setStatus("error");
      setMissionManageNotice(withSupportSuffix(baseMessage));
    }
  }

  function loadMissionIntoManageForms(row: QueueRow) {
    const missionId = String(row.mission_id || "").trim().toUpperCase();
    if (!missionId) return;
    setManageEdit((prev) => ({
      ...prev,
      mission_id: missionId,
      assignee: String(row.assignee || prev.assignee || "STAFF"),
      priority: String(row.priority || prev.priority || "P1"),
      objective: String(row.title || prev.objective || "")
    }));
    setManageExecution((prev) => ({ ...prev, mission_id: missionId, assignee: String(row.assignee || prev.assignee || "CPP"), priority: String(row.priority || prev.priority || "P1") }));
  }

  function openQueueDetails(row: QueueRow) {
    const queueId = String(row.queue_id || "").trim();
    if (queueId) setQueueFocusedId(queueId);
    setQueueDetailsRow(row);
    setQueueDetailsOpen(true);
  }

  function openMissionManageFromQueue(row: QueueRow) {
    const missionId = String(row.mission_id || "").trim().toUpperCase();
    if (missionId) {
      setMission((prev) => ({ ...prev, id: missionId }));
      setWatchMissionId(missionId);
      setQueueMissionFilter(missionId);
    }
    loadMissionIntoManageForms(row);
    setMissionsTab("gestao");
    setQueueDetailsOpen(false);
    goToSection("missoes");
  }

  function buildMissionUdn(missionDraft = mission) {
    const missionToken = missionShortToken(missionDraft.id || nextMissionCode || "00001");
    const compactTasks = parts
      .map((part, index) => {
        const partId = sanitizeMissionInline(part.part_id || `P${index + 1}`) || `P${index + 1}`;
        const executor = String(part.executor || "STAFF").toUpperCase();
        const priority = String(part.priority || "P1").toUpperCase();
        return `${partId}:${executor}:${priority}`;
      })
      .slice(0, 16)
      .join(";");
    const lines = [
      `!MIS|${missionToken}`,
      `#μ:${missionDraft.target || "Registrar missao no GOV-HUB."}`,
      `#τ:${compactTasks || "P1:STAFF:P1"};MON`
    ];
    return lines.join("\n");
  }

  function compileUdn() {
    setUdn(buildMissionUdn());
  }

  function addPart() {
    setParts((prev) => [
      ...prev,
      {
        part_id: `P${prev.length + 1}`,
        goal: "",
        executor: "CPP",
        priority: "P1"
      }
    ]);
  }

  function updatePart(index: number, patch: Partial<MissionPart>) {
    setParts((prev) => prev.map((part, i) => (i === index ? { ...part, ...patch } : part)));
  }

  function removePart(index: number) {
    setParts((prev) => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== index)));
  }

  function validateMissionForSubmit(options?: { silent?: boolean }): {
    ok: boolean;
    missionPayload?: { id: string; target: string; branch: string; agent_id: string };
    udnPayload?: string;
    udnAutoRepaired?: boolean;
    repairedTokens?: string[];
    draftKey?: string;
  } {
    const silent = options?.silent === true;
    const trimmedMissionId = String(mission.id || "").trim();
    const nextId = String(nextMissionCode || "").trim().toUpperCase();
    const currentUpper = trimmedMissionId.toUpperCase();
    const currentNum = missionCodeNumber(trimmedMissionId);
    const nextNum = missionCodeNumber(nextId);
    const shouldAutoAdvance =
      (!trimmedMissionId && Boolean(nextId)) ||
      (Boolean(nextId) &&
        currentUpper !== nextId &&
        (knownMissionIds.has(currentUpper) || (currentNum !== null && nextNum !== null && currentNum < nextNum)));

    const missionId = shouldAutoAdvance ? nextId : trimmedMissionId;
    if (shouldAutoAdvance && nextId) {
      setMission((prev) => ({ ...prev, id: nextId }));
      if (!silent) {
        setTopNotice({
          message: `Mission ID ajustado automaticamente para ${nextId}.`,
          variant: "info"
        });
      }
    }
    const missionPayload = {
      id: missionId,
      target: mission.target,
      branch: mission.branch,
      agent_id: MISSION_INTAKE_AGENT
    };
    const requiredIssues = missionRequiredIssues(missionPayload, createdBy, parts);
    if (requiredIssues.length > 0) {
      if (!silent) {
        setStatus("error");
        setTopNotice({
          message: `Campos obrigatórios pendentes: ${requiredIssues.join(", ")}.`,
          variant: "error"
        });
      }
      return { ok: false };
    }
    const manualUdn = String(udn || "").trim();
    const generatedUdn = buildMissionUdn(missionPayload);
    let udnPayload = normalizeTdvTags(manualUdn || generatedUdn);
    let udnAutoRepaired = false;
    let repairedTokens: string[] = [];
    if (!manualUdn) {
      setUdn(udnPayload);
    } else {
      const contractIssues = udnContractIssues(udnPayload);
      if (contractIssues.length > 0) {
        const repaired = repairMissionUdn(manualUdn, generatedUdn);
        udnPayload = normalizeTdvTags(repaired.udn);
        repairedTokens = repaired.repaired;
        setUdn(udnPayload);
        udnAutoRepaired = repairedTokens.length > 0;
      } else {
        setUdn(udnPayload);
      }
    }
    const contractIssues = udnContractIssues(udnPayload);
    if (contractIssues.length > 0) {
      if (!silent) {
        setStatus("error");
        setTopNotice({
          message: `Campos UDN pendentes: ${contractIssues.join(", ")}.`,
          variant: "error"
        });
      }
      return { ok: false };
    }
    const draftKey = buildMissionDraftKey({
      mission: missionPayload,
      createdBy,
      parts,
      udn: udnPayload,
      tokenControl,
      selectedPromptId,
      promptVarsRaw
    });

    return {
      ok: true,
      missionPayload,
      udnPayload,
      udnAutoRepaired,
      repairedTokens,
      draftKey
    };
  }

  function validateMission() {
    const result = validateMissionForSubmit();
    if (!result.ok) {
      setValidatedDraftKey("");
      return;
    }
    setValidatedDraftKey(String(result.draftKey || ""));
    setStatus("success");
    setTopNotice({
      message: "Validação concluída. Registrar no HUB liberado.",
      variant: "success"
    });
  }

  async function registerMission() {
    const validation = validateMissionForSubmit({ silent: true });
    if (!validation.ok || !validation.missionPayload || !validation.udnPayload || !validation.draftKey) {
      setValidatedDraftKey("");
      setStatus("error");
      setTopNotice({
        message: "Validação pendente. Clique em Validar missão para ver o que falta.",
        variant: "error"
      });
      return;
    }
    if (validatedDraftKey !== validation.draftKey) {
      setStatus("error");
      setTopNotice({
        message: "Alterações detectadas. Clique em Validar missão antes de registrar.",
        variant: "info"
      });
      return;
    }
    const { missionPayload, udnPayload, udnAutoRepaired = false, repairedTokens = [] } = validation;
    setStatus("sending");
    try {
      const response = await fetch("/api/govhub/missions/register", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          udn: udnPayload,
          mission: {
            ...missionPayload
          },
          created_by: createdBy,
          token_control: tokenControl,
          parts,
          ...(selectedPrompt
            ? {
                prompt_ref: {
                  prompt_id: selectedPrompt.prompt_id,
                  prompt_hash: selectedPrompt.prompt_hash,
                  inject_mode: "append_ref",
                  variables: parseVars(promptVarsRaw)
                }
              }
            : {})
        })
      });
      const payload = await response.json();
      setResponseText(JSON.stringify(payload, null, 2));
      setAckRequired(resolveOwnerAckRequired(payload));
      setStatus(response.ok ? "success" : "error");
      if (response.ok) {
        setValidatedDraftKey("");
        const missionId = String((payload && typeof payload === "object" ? (payload as Record<string, unknown>).mission_id : "") || missionPayload.id).trim();
        const queueSync = payload && typeof payload === "object" ? (payload as Record<string, unknown>).queue_sync : null;
        const queueSyncObj = queueSync && typeof queueSync === "object" ? (queueSync as Record<string, unknown>) : null;
        const queueInserted = queueSyncObj ? Number(queueSyncObj.inserted || 0) : 0;
        const queueStatus = queueSyncObj ? String(queueSyncObj.status || "").trim() : "";
        const queueNotice =
          queueInserted > 0
            ? ` Enfileirada automaticamente (${queueInserted} item(ns)).`
            : queueStatus === "already_exists"
              ? " Missão já estava na fila."
              : "";
        if (missionId) {
          setWatchMissionId(missionId);
          missionReportSeenRef.current[missionId] = false;
        }
        setTopNotice({
          message: udnAutoRepaired
            ? `Missão ${missionId || mission.id || "-"} adicionada com sucesso. UDN ajustado automaticamente (${repairedTokens.join(", ")}).${queueNotice}`
            : `Missão ${missionId || mission.id || "-"} adicionada com sucesso.${queueNotice} Você receberá um balão de resultado quando o Principal Architect finalizar.`,
          variant: "success"
        });
      } else {
        const baseMessage = `Falha ao registrar missão: ${resolveRegisterError(payload)}.`;
        await reportSupportError({
          source: "MISSION_REGISTER",
          action: "register_mission",
          missionId: String(missionPayload.id || mission.id || "").trim().toUpperCase(),
          errorCode: resolveErrorCode(payload),
          message: baseMessage,
          payload
        });
        setValidatedDraftKey("");
        setWatchMissionId("");
        setTopNotice({
          message: withSupportSuffix(baseMessage),
          variant: "error"
        });
      }
      goToSection("execucoes");
    } catch {
      const baseMessage = "Erro de rede ao registrar missão. Clique para fechar.";
      await reportSupportError({
        source: "MISSION_REGISTER",
        action: "register_mission",
        missionId: String(missionPayload.id || mission.id || "").trim().toUpperCase(),
        errorCode: "NETWORK_ERROR",
        message: baseMessage
      });
      setStatus("error");
      setResponseText(JSON.stringify({ status: "error", error_code: "NETWORK_ERROR" }, null, 2));
      setTopNotice({
        message: withSupportSuffix(baseMessage),
        variant: "error"
      });
    }
  }

  async function createExecutionPlan() {
    setStatus("queue_planning");
    try {
      const response = await fetch("/api/govhub/operations/queue", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "create_plan",
          actor: createdBy,
          mission_id: mission.id || `mission-${Date.now()}`,
          tasks: parts.map((part, index) => ({
            title: part.goal || `Parte ${index + 1}`,
            description: part.goal || "Execução definida pelo staff",
            kind: part.executor,
            priority: part.priority
          }))
        })
      });
      const payload = await response.json();
      setResponseText(JSON.stringify(payload, null, 2));
      setStatus(response.ok ? "success" : "error");
      setQueueRefreshNonce((prev) => prev + 1);
      goToSection("orquestracao");
    } catch {
      setStatus("error");
      setResponseText(JSON.stringify({ status: "error", error_code: "QUEUE_PLAN_FAILED" }, null, 2));
    }
  }

  async function sendOpsCommand() {
    if (currentRole !== "admin" && isAdminCommandAction(chatAction)) {
      setStatus("error");
      setChatNotice("Ação bloqueada: apenas Admin pode executar comando operacional.");
      setResponseText(JSON.stringify({ status: "forbidden", error_code: "ADMIN_REQUIRED_FOR_COMMAND" }, null, 2));
      return;
    }
    setStatus("chat_dispatch");
    try {
      const missionId = mission.id.trim() || `mission-${Date.now()}`;
      const response = await fetch("/api/govhub/operations/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          mission_id: missionId,
          actor: createdBy,
          target: chatTarget,
          action: chatAction,
          message: chatMessage
        })
      });
      const payload = await response.json();
      setResponseText(JSON.stringify(payload, null, 2));
      setStatus(response.ok ? "success" : "error");
      if (response.ok) {
        setChatMessage("");
        setChatNotice(isAdminCommandAction(chatAction) ? "Comando enviado ao HUB." : "Mensagem enviada.");
      } else {
        const baseMessage = `Falha no envio: ${resolveRegisterError(payload)}.`;
        await reportSupportError({
          source: "CHAT_DISPATCH",
          action: chatAction,
          missionId,
          errorCode: resolveErrorCode(payload),
          message: baseMessage,
          payload
        });
        setChatNotice(withSupportSuffix(baseMessage));
      }
      setChatRefreshNonce((prev) => prev + 1);
      goToSection("chat");
    } catch {
      const missionId = mission.id.trim() || `mission-${Date.now()}`;
      const baseMessage = "Falha de rede ao enviar mensagem/comando.";
      await reportSupportError({
        source: "CHAT_DISPATCH",
        action: chatAction,
        missionId,
        errorCode: "CHAT_DISPATCH_FAILED",
        message: baseMessage
      });
      setStatus("error");
      setChatNotice(withSupportSuffix(baseMessage));
      setResponseText(JSON.stringify({ status: "error", error_code: "CHAT_DISPATCH_FAILED" }, null, 2));
    }
  }

  async function ensureAssigneeHealthy(assigneeRaw: string): Promise<boolean> {
    const role = String(assigneeRaw || "").trim().toUpperCase();
    if (!role) return false;
    if (role === "STAFF") return true;
    if (role !== "CPP" && role !== "CPP-IA") return false;

    const agentId = `AUTO-UI-${role.replace(/[^A-Z0-9-]/g, "_")}-${Date.now()}`;
    try {
      const registerResponse = await fetch("/api/govhub/operations/agents", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "register",
          agent_id: agentId,
          role,
          group: "ui-autofix",
          capabilities: ["queue", "execute"],
          max_concurrency: 1,
          heartbeat_interval_sec: 30,
          health: "up",
          current_load: 0
        })
      });
      if (!registerResponse.ok) return false;

      const heartbeatResponse = await fetch("/api/govhub/operations/agents", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "heartbeat",
          agent_id: agentId,
          current_load: 0,
          health: "up"
        })
      });
      return heartbeatResponse.ok;
    } catch {
      return false;
    }
  }

  async function updateQueueStatus(row: QueueRow, nextStatus: "open" | "in_progress" | "done" | "paused_waiting_owner", notice: string) {
    const queueId = String(row.queue_id || "").trim();
    if (!queueId) {
      setQueueNotice("Item de fila inválido.");
      return;
    }
    setStatus("queue_update");
    try {
      const requestBody = {
        action: "update_status",
        actor: createdBy,
        queue_id: queueId,
        status: nextStatus
      };
      const postUpdate = async () => {
        const response = await fetch("/api/govhub/operations/queue", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(requestBody)
        });
        const payload = await response.json();
        return { response, payload };
      };

      let { response, payload } = await postUpdate();
      if (!response.ok && nextStatus === "in_progress" && resolveErrorCode(payload) === "ASSIGNEE_NOT_HEALTHY") {
        const recovered = await ensureAssigneeHealthy(String(row.assignee || ""));
        if (recovered) {
          ({ response, payload } = await postUpdate());
          if (response.ok) {
            setResponseText(JSON.stringify(payload, null, 2));
            setStatus("success");
            setQueueNotice(`${notice} Auto-recuperação aplicada para ${String(row.assignee || "-")}.`);
            setQueueRefreshNonce((prev) => prev + 1);
            return;
          }
        }
      }

      setResponseText(JSON.stringify(payload, null, 2));
      if (!response.ok) {
        const baseMessage = `Falha ao atualizar item da fila: ${resolveRegisterError(payload)}.`;
        await reportSupportError({
          source: "QUEUE_UPDATE",
          action: "update_status",
          ...(String(row.mission_id || "").trim()
            ? { missionId: String(row.mission_id || "").trim().toUpperCase() }
            : {}),
          queueId,
          errorCode: resolveErrorCode(payload),
          message: baseMessage,
          payload
        });
        setStatus("error");
        setQueueNotice(withSupportSuffix(baseMessage));
        return;
      }
      setStatus("success");
      setQueueNotice(notice);
      setQueueRefreshNonce((prev) => prev + 1);
    } catch {
      const baseMessage = "Falha de rede ao atualizar fila.";
      await reportSupportError({
        source: "QUEUE_UPDATE",
        action: "update_status",
        ...(String(row.mission_id || "").trim()
          ? { missionId: String(row.mission_id || "").trim().toUpperCase() }
          : {}),
        queueId,
        errorCode: "NETWORK_ERROR",
        message: baseMessage
      });
      setStatus("error");
      setQueueNotice(withSupportSuffix(baseMessage));
    }
  }

  async function moveQueueCard(queueId: string, nextStatus: QueueWorkflowStatus) {
    const id = String(queueId || "").trim();
    if (!id) return;
    const row = queueOrderedRows.find((item) => String(item.queue_id || "") === id);
    if (!row) {
      setQueueNotice("Item não encontrado para mover.");
      return;
    }
    const current = String(row.status || "").toLowerCase();
    if (current === nextStatus) return;
    await updateQueueStatus(row, nextStatus, `Item movido para ${queueStatusLabel(nextStatus)}.`);
    setQueueFocusedId(id);
  }

  async function requestNextMissionApproval() {
    if (currentRole === "viewer") {
      setQueueNotice("Perfil viewer não pode solicitar próxima missão.");
      return;
    }
    setStatus("chat_dispatch");
    try {
      const missionId = String(nextMissionCode || "").trim() || `GOV-NEXT-MISSION-${Date.now()}`;
      const response = await fetch("/api/govhub/operations/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          mission_id: missionId,
          target: PRINCIPAL_ARCHITECT_TARGET,
          action: "MSG",
          message: "Solicitação de próxima missão: fila sem itens ativos. Favor analisar e recomendar abertura da próxima missão."
        })
      });
      const payload = await response.json();
      setResponseText(JSON.stringify(payload, null, 2));
      if (!response.ok) {
        const baseMessage = `Falha ao solicitar próxima missão: ${resolveRegisterError(payload)}.`;
        await reportSupportError({
          source: "NEXT_MISSION_REQUEST",
          action: "MSG",
          missionId,
          errorCode: resolveErrorCode(payload),
          message: baseMessage,
          payload
        });
        setStatus("error");
        setQueueNotice(withSupportSuffix(baseMessage));
        return;
      }
      setStatus("success");
      setQueueNotice("Solicitação enviada com sucesso. Verifique no Chat HUB.");
      setTopNotice({
        message: "Solicitação de próxima missão enviada. Abra o Chat HUB para acompanhar o retorno.",
        variant: "success"
      });
      setChatRefreshNonce((prev) => prev + 1);
      goToSection("chat");
    } catch {
      const baseMessage = "Falha de rede ao enviar solicitação ao Admin.";
      await reportSupportError({
        source: "NEXT_MISSION_REQUEST",
        action: "MSG",
        missionId: String(nextMissionCode || "").trim() || mission.id,
        errorCode: "NETWORK_ERROR",
        message: baseMessage
      });
      setStatus("error");
      setQueueNotice(withSupportSuffix(baseMessage));
    }
  }

  async function estimateCost() {
    setStatus("token_preview");
    try {
      const response = await fetch("/api/govhub/missions/cost-preview", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          udn,
          mission,
          created_by: createdBy,
          token_control: tokenControl,
          parts,
          ...(selectedPrompt
            ? {
                prompt_ref: {
                  prompt_id: selectedPrompt.prompt_id,
                  prompt_hash: selectedPrompt.prompt_hash,
                  inject_mode: "append_ref",
                  variables: parseVars(promptVarsRaw)
                }
              }
            : {})
        })
      });
      const payload = await response.json();
      setTokenPreview(JSON.stringify(payload, null, 2));
      setStatus(response.ok ? "success" : "error");
      goToSection("execucoes");
    } catch {
      setStatus("error");
      setTokenPreview(JSON.stringify({ status: "error", error_code: "TOKEN_PREVIEW_NETWORK_ERROR" }, null, 2));
    }
  }

  useEffect(() => {
    if (!mission.id || !udn) return;
    let active = true;
    const tick = async () => {
      try {
        const qs = new URLSearchParams({
          mission_id: mission.id,
          agent_id: mission.agent_id,
          udn,
          objective: mission.target,
          owner_id: createdBy,
          token_control: JSON.stringify(tokenControl)
        });
        const response = await fetch(`/api/govhub/missions/token-monitor?${qs.toString()}`, { cache: "no-store" });
        const payload = await response.json();
        if (active) {
          setTokenRealtime(JSON.stringify(payload, null, 2));
          setMonitorUpdatedAt(new Date().toISOString());
        }
      } catch {
        if (active) {
          setTokenRealtime(JSON.stringify({ status: "error", error_code: "TOKEN_MONITOR_NETWORK_ERROR" }, null, 2));
          setMonitorUpdatedAt(new Date().toISOString());
        }
      }
    };
    tick();
    const interval = window.setInterval(tick, Math.max(15, monitorRefreshSec) * 1000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [createdBy, mission.id, mission.agent_id, mission.target, monitorRefreshNonce, monitorRefreshSec, tokenControl, udn]);

  async function ownerAck(decision: "approve" | "deny") {
    setStatus("owner_ack");
    try {
      const response = await fetch("/api/govhub/missions/owner-ack", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          mission_id: mission.id,
          decision,
          owner_id: createdBy,
          note: ownerNote
        })
      });
      const payload = await response.json();
      setResponseText(JSON.stringify(payload, null, 2));
      setStatus(response.ok ? "success" : "error");
      if (response.ok && decision === "approve") setAckRequired(false);
    } catch {
      setStatus("error");
      setResponseText(JSON.stringify({ status: "error", error_code: "NETWORK_ERROR" }, null, 2));
    }
  }

  const missingMissionFields = useMemo(
    () => missionRequiredIssues(mission, createdBy, parts),
    [createdBy, mission, parts]
  );

  const missionDraftKey = useMemo(
    () =>
      JSON.stringify({
        mission,
        createdBy,
        parts,
        udn: normalizeTdvTags(udn),
        tokenControl,
        selectedPromptId,
        promptVarsRaw
      }),
    [createdBy, mission, parts, promptVarsRaw, selectedPromptId, tokenControl, udn]
  );

  const missionCanSubmit = missingMissionFields.length === 0 && status !== "sending";
  const missionReadyToRegister = missionCanSubmit && validatedDraftKey === missionDraftKey;

  const pendingItems = useMemo(() => {
    const list: string[] = [];
    if (missingMissionFields.length > 0) list.push(`Campos obrigatórios pendentes: ${missingMissionFields.join(", ")}.`);
    if (!udn.trim()) list.push("UDN será gerado automaticamente no envio, se necessário.");
    if (!mission.id.trim()) list.push("Definir Mission ID.");
    if (ackRequired) list.push("Missao aguardando aprovacao do owner.");
    if (status === "error") list.push("Existe erro operacional pendente no ultimo ciclo.");
    if (list.length === 0) list.push("Sem pendencias criticas neste momento.");
    return list;
  }, [ackRequired, mission.id, missingMissionFields, status, udn]);

  const pageTitle = useMemo(() => {
    if (section === "missoes") return "Missões";
    if (section === "orquestracao") return "Orquestração";
    if (section === "chat") return "Chat HUB";
    if (section === "execucoes") return "Execuções";
    if (section === "pendencias") return "Pendências";
    if (section === "prompts") return "Biblioteca de Prompts";
    if (section === "governanca") return "Governança de Tokens";
    return "Visão geral";
  }, [section]);

  const pageSubtitle = useMemo(() => {
    if (section === "missoes") return "Cadastro de missão (UDN V2 compacto), particionamento e envio ao HUB.";
    if (section === "orquestracao") return "Fila priorizada e distribuição de execução entre Staff, CPP e CPP-IA.";
    if (section === "chat") return "Comando rápido remoto: envio de ação pré-definida via webhook n8n/worker.";
    if (section === "execucoes") return "Monitoramento operacional e retorno de execução.";
    if (section === "pendencias") return "Itens que exigem ação para manter fluxo contínuo.";
    if (section === "prompts") return "Reuso por referência para reduzir custo de tokens.";
    if (section === "governanca") return "Política de limites, alertas e consumo em tempo real.";
    return "Painel oficial do GOV-HUB com operação direta e responsiva.";
  }, [section]);

  const previewPayload = useMemo(() => safeJsonParse(tokenPreview), [tokenPreview]);
  const realtimePayload = useMemo(() => safeJsonParse(tokenRealtime), [tokenRealtime]);
  const usagePayload = useMemo(() => safeJsonParse(usageText), [usageText]);
  const botStatusPayload = useMemo(() => safeJsonParse(botStatusText), [botStatusText]);
  const queuePayload = useMemo(() => safeJsonParse(queueText), [queueText]);
  const chatPayload = useMemo(() => safeJsonParse(chatText), [chatText]);

  const previewData = useMemo(() => {
    const preview = previewPayload?.preview;
    return preview && typeof preview === "object" ? (preview as Record<string, unknown>) : null;
  }, [previewPayload]);

  const realtimeData = useMemo(() => {
    const realtime = realtimePayload?.realtime;
    return realtime && typeof realtime === "object" ? (realtime as Record<string, unknown>) : null;
  }, [realtimePayload]);

  const monitorPolicy = useMemo(() => {
    const governance = realtimePayload?.governance;
    if (!governance || typeof governance !== "object") return policy;
    const p = (governance as Record<string, unknown>).policy;
    if (!p || typeof p !== "object") return policy;
    const candidate = p as Record<string, unknown>;
    return {
      daily_token_limit: Math.max(1, Math.trunc(readNumber(candidate.daily_token_limit, policy.daily_token_limit))),
      daily_usd_limit: Math.max(0.01, readNumber(candidate.daily_usd_limit, policy.daily_usd_limit)),
      monthly_usd_limit: Math.max(0.01, readNumber(candidate.monthly_usd_limit, policy.monthly_usd_limit)),
      warn_threshold_pct: Math.max(1, Math.min(99, Math.trunc(readNumber(candidate.warn_threshold_pct, policy.warn_threshold_pct)))),
      auto_pause_on_limit: candidate.auto_pause_on_limit !== false,
      hard_stop: candidate.hard_stop !== false
    } as TokenPolicy;
  }, [policy, realtimePayload]);

  const monitorUsage = useMemo(() => {
    const governance = realtimePayload?.governance;
    if (!governance || typeof governance !== "object") return {} as UsageSummary;
    const usage = (governance as Record<string, unknown>).usage;
    if (!usage || typeof usage !== "object") return {} as UsageSummary;
    return usage as UsageSummary;
  }, [realtimePayload]);

  const monitorRisk = useMemo(() => {
    const dailyTokenRatio = readNumber(monitorUsage.daily_tokens) / Math.max(1, monitorPolicy.daily_token_limit);
    const dailyUsdRatio = readNumber(monitorUsage.daily_usd) / Math.max(0.01, monitorPolicy.daily_usd_limit);
    const monthlyUsdRatio = readNumber(monitorUsage.monthly_usd) / Math.max(0.01, monitorPolicy.monthly_usd_limit);
    const ratio = Math.max(dailyTokenRatio, dailyUsdRatio, monthlyUsdRatio);
    const warnRatio = Math.max(1, Math.min(99, monitorPolicy.warn_threshold_pct)) / 100;
    if (ratio >= 1) return { level: "limite", pct: formatPct(ratio * 100) };
    if (ratio >= warnRatio) return { level: "atencao", pct: formatPct(ratio * 100) };
    return { level: "ok", pct: formatPct(ratio * 100) };
  }, [monitorPolicy, monitorUsage]);

  const usageSummary = useMemo(() => {
    const summary = usagePayload?.summary;
    if (!summary || typeof summary !== "object") return {} as UsageSummary;
    return summary as UsageSummary;
  }, [usagePayload]);

  const usageRows = useMemo(() => {
    const rows = usagePayload?.rows;
    return Array.isArray(rows) ? (rows as UsageRow[]) : [];
  }, [usagePayload]);
  const usageLastAt = useMemo(() => {
    if (usageRows.length === 0) return "";
    const first = usageRows[0];
    return String(first?.created_at_utc || "");
  }, [usageRows]);

  const botRows = useMemo(() => {
    const rows = botStatusPayload?.rows;
    return Array.isArray(rows) ? (rows as BotStatusRow[]) : [];
  }, [botStatusPayload]);

  const botSummary = useMemo(() => {
    const total = botRows.length;
    const ok = botRows.filter((row) => String(row.state || "").toLowerCase() === "ok").length;
    const error = botRows.filter((row) => String(row.state || "").toLowerCase() === "error").length;
    const blocked = botRows.filter((row) => String(row.state || "").toLowerCase() === "blocked").length;
    return { total, ok, error, blocked };
  }, [botRows]);

  const queueRows = useMemo(() => {
    const rows = queuePayload?.rows;
    return Array.isArray(rows) ? (rows as QueueRow[]) : [];
  }, [queuePayload]);

  const queueOrderedRows = useMemo(() => {
    return [...queueRows].sort((a, b) => {
      const aTime = Date.parse(String(a.updated_at_utc || a.created_at_utc || ""));
      const bTime = Date.parse(String(b.updated_at_utc || b.created_at_utc || ""));
      const aEpoch = Number.isFinite(aTime) ? aTime : 0;
      const bEpoch = Number.isFinite(bTime) ? bTime : 0;
      if (bEpoch !== aEpoch) return bEpoch - aEpoch;

      const aMissionNum = missionCodeNumber(String(a.mission_id || "")) ?? -1;
      const bMissionNum = missionCodeNumber(String(b.mission_id || "")) ?? -1;
      if (bMissionNum !== aMissionNum) return bMissionNum - aMissionNum;

      const aMissionId = String(a.mission_id || "");
      const bMissionId = String(b.mission_id || "");
      const missionCmp = bMissionId.localeCompare(aMissionId);
      if (missionCmp !== 0) return missionCmp;

      return String(b.queue_id || "").localeCompare(String(a.queue_id || ""));
    });
  }, [queueRows]);

  const queueFilteredRows = useMemo(() => {
    const missionNeedle = String(queueMissionFilter || "").trim().toLowerCase();
    return queueOrderedRows.filter((row) => {
      const assignee = String(row.assignee || "").toUpperCase();
      const priority = String(row.priority || "").toUpperCase();
      const missionId = String(row.mission_id || "").toLowerCase();
      const title = String(row.title || "").toLowerCase();
      if (queueAssigneeFilter !== "all" && assignee !== queueAssigneeFilter) return false;
      if (queuePriorityFilter !== "all" && priority !== queuePriorityFilter) return false;
      if (missionNeedle && !missionId.includes(missionNeedle) && !title.includes(missionNeedle)) return false;
      return true;
    });
  }, [queueAssigneeFilter, queueMissionFilter, queueOrderedRows, queuePriorityFilter]);

  const queueRowsByStatus = useMemo(() => {
    const grouped: Record<QueueWorkflowStatus, QueueRow[]> = {
      open: [],
      in_progress: [],
      paused_waiting_owner: [],
      done: []
    };
    for (const row of queueFilteredRows) {
      const status = String(row.status || "").toLowerCase();
      if (status === "open" || status === "in_progress" || status === "paused_waiting_owner" || status === "done") {
        grouped[status].push(row);
      }
    }
    return grouped;
  }, [queueFilteredRows]);

  const queueEtaById = useMemo(() => {
    const now = Date.now();
    const map = new Map<string, QueueEtaEstimate>();
    for (const row of queueOrderedRows) {
      const key = String(row.queue_id || `${row.mission_id}-${row.title}`);
      map.set(key, estimateQueueEta(row, now));
    }
    return map;
  }, [queueOrderedRows]);

  const queueOpenRows = useMemo(() => {
    return queueOrderedRows.filter((row) => {
      const statusValue = String(row.status || "").toLowerCase();
      return statusValue === "open";
    });
  }, [queueOrderedRows]);

  const queueLead = useMemo(() => (queueOpenRows.length > 0 ? queueOpenRows[0] : null), [queueOpenRows]);
  const queueInProgressRows = useMemo(() => {
    return queueOrderedRows.filter((row) => String(row.status || "").toLowerCase() === "in_progress");
  }, [queueOrderedRows]);
  const queueRunningLead = useMemo(() => (queueInProgressRows.length > 0 ? queueInProgressRows[0] : null), [queueInProgressRows]);

  const queueSummary = useMemo(() => {
    const fromApi = queuePayload?.summary;
    if (fromApi && typeof fromApi === "object") return fromApi as Record<string, unknown>;
    return {};
  }, [queuePayload]);

  const activeMissionCount = useMemo(() => {
    const ids = new Set<string>();
    for (const row of queueOrderedRows) {
      const statusValue = String(row.status || "").toLowerCase();
      if (statusValue !== "open" && statusValue !== "in_progress") continue;
      const missionId = String(row.mission_id || "").trim();
      if (!missionId) continue;
      ids.add(missionId);
    }
    return ids.size;
  }, [queueOrderedRows]);

  const queueDoneCount = useMemo(
    () => queueOrderedRows.filter((row) => String(row.status || "").toLowerCase() === "done").length,
    [queueOrderedRows]
  );

  const queuePausedCount = useMemo(
    () => queueOrderedRows.filter((row) => String(row.status || "").toLowerCase() === "paused_waiting_owner").length,
    [queueOrderedRows]
  );

  const metrics = useMemo(
    () => [
      { label: "Execuções ativas", value: queueInProgressRows.length.toLocaleString("pt-BR") },
      { label: "Missões ativas", value: activeMissionCount.toLocaleString("pt-BR") },
      { label: "Fila pendente", value: queueOpenRows.length.toLocaleString("pt-BR") },
      { label: "Concluídas", value: queueDoneCount.toLocaleString("pt-BR") },
      { label: "Pausadas/Falha", value: queuePausedCount.toLocaleString("pt-BR") },
      { label: "Tokens hoje", value: Math.round(readNumber(usageSummary.daily_tokens)).toLocaleString("pt-BR") }
    ],
    [activeMissionCount, queueDoneCount, queueInProgressRows.length, queueOpenRows.length, queuePausedCount, usageSummary.daily_tokens]
  );

  const chatRows = useMemo(() => {
    const rows = chatPayload?.rows;
    if (!Array.isArray(rows)) return [];
    return [...(rows as ChatRow[])].sort((a, b) => {
      const aTime = Date.parse(String(a.created_at_utc || ""));
      const bTime = Date.parse(String(b.created_at_utc || ""));
      const aEpoch = Number.isFinite(aTime) ? aTime : 0;
      const bEpoch = Number.isFinite(bTime) ? bTime : 0;
      if (bEpoch !== aEpoch) return bEpoch - aEpoch;
      return String(b.message_id || "").localeCompare(String(a.message_id || ""));
    });
  }, [chatPayload]);

  const chatReplyRowsByParentId = useMemo(() => {
    const out = new Map<string, ChatRow[]>();
    for (const row of chatRows) {
      const parentId = String(row.in_reply_to || "").trim();
      if (!parentId) continue;
      const current = out.get(parentId) || [];
      current.push(row);
      out.set(parentId, current);
    }
    return out;
  }, [chatRows]);

  const chatTopRows = useMemo(() => {
    const rows = chatRows.filter((row) => !String(row.in_reply_to || "").trim());
    const seenMissionKeys = new Set<string>();
    const out: ChatRow[] = [];
    for (const row of rows) {
      if (isMissionFormattedRow(row)) {
        const key = [
          String(row.mission_id || "").trim(),
          String(row.action || "").trim().toUpperCase(),
          String(row.direction || "").trim().toLowerCase(),
          String(row.actor || "").trim().toLowerCase(),
          String(row.target || "").trim().toLowerCase(),
          compactText(String(row.message || ""), 140).toLowerCase()
        ].join("|");
        if (seenMissionKeys.has(key)) continue;
        seenMissionKeys.add(key);
      }
      out.push(row);
      if (out.length >= 20) break;
    }
    return out;
  }, [chatRows]);

  const nextMissionCode = useMemo(() => {
    let max = 0;
    const collect = (value: unknown) => {
      const num = missionCodeNumber(String(value || ""));
      if (num !== null) max = Math.max(max, num);
    };
    for (const row of queueRows) collect(row.mission_id);
    for (const row of chatRows) collect(row.mission_id);
    for (const row of usageRows) collect(row.mission_id);
    return formatMissionCode(max + 1);
  }, [chatRows, queueRows, usageRows]);

  const knownMissionIds = useMemo(() => {
    const out = new Set<string>();
    const collect = (value: unknown) => {
      const clean = String(value || "").trim().toUpperCase();
      if (clean) out.add(clean);
    };
    for (const row of queueRows) collect(row.mission_id);
    for (const row of chatRows) collect(row.mission_id);
    for (const row of usageRows) collect(row.mission_id);
    return out;
  }, [chatRows, queueRows, usageRows]);

  const missionManagePayload = useMemo(() => safeJsonParse(missionManageText), [missionManageText]);
  const missionPackages = useMemo(() => {
    const rows = missionManagePayload?.packages;
    if (!Array.isArray(rows)) return [];
    return [...(rows as MissionBoardPackage[])].sort((a, b) => {
      const aTime = Date.parse(String(a.updated_at_utc || a.created_at_utc || ""));
      const bTime = Date.parse(String(b.updated_at_utc || b.created_at_utc || ""));
      const aEpoch = Number.isFinite(aTime) ? aTime : 0;
      const bEpoch = Number.isFinite(bTime) ? bTime : 0;
      return bEpoch - aEpoch;
    });
  }, [missionManagePayload]);

  const managedMissionRows = useMemo(() => {
    const rows = missionManagePayload?.missions;
    if (!Array.isArray(rows)) return [];
    return [...(rows as MissionBoardMission[])].sort((a, b) => {
      const aTime = Date.parse(String(a.updated_at_utc || ""));
      const bTime = Date.parse(String(b.updated_at_utc || ""));
      const aEpoch = Number.isFinite(aTime) ? aTime : 0;
      const bEpoch = Number.isFinite(bTime) ? bTime : 0;
      return bEpoch - aEpoch;
    });
  }, [missionManagePayload]);

  const queueInProgressMissionIds = useMemo(() => {
    return Array.from(
      new Set(
        queueRows
          .filter((row) => String(row.status || "").toLowerCase() === "in_progress")
          .map((row) => String(row.mission_id || "").trim().toUpperCase())
          .filter(Boolean)
      )
    );
  }, [queueRows]);

  useEffect(() => {
    if (String(mission.id || "").trim()) return;
    if (!nextMissionCode) return;
    setMission((prev) => {
      if (String(prev.id || "").trim()) return prev;
      return { ...prev, id: nextMissionCode };
    });
  }, [mission.id, nextMissionCode]);

  useEffect(() => {
    if (section !== "missoes") return;
    const current = String(mission.id || "").trim();
    const currentUpper = current.toUpperCase();
    const currentNum = missionCodeNumber(current);
    const nextNum = missionCodeNumber(nextMissionCode);
    if (!nextMissionCode) return;
    if (
      !current ||
      knownMissionIds.has(currentUpper) ||
      (currentNum !== null && nextNum !== null && currentNum < nextNum)
    ) {
      if (current !== nextMissionCode) {
        setMission((prev) => ({ ...prev, id: nextMissionCode }));
      }
    }
  }, [knownMissionIds, mission.id, nextMissionCode, section]);

  useEffect(() => {
    if (section !== "missoes" || missionsTab !== "gestao") return;
    const firstInProgress = queueInProgressMissionIds[0] || "";
    if (!manageEdit.mission_id && firstInProgress) {
      setManageEdit((prev) => ({ ...prev, mission_id: firstInProgress }));
    }
    if (!manageExecution.mission_id && firstInProgress) {
      setManageExecution((prev) => ({ ...prev, mission_id: firstInProgress }));
    }
  }, [manageEdit.mission_id, manageExecution.mission_id, missionsTab, queueInProgressMissionIds, section]);

  useEffect(() => {
    const missionId = String(watchMissionId || "").trim();
    if (!missionId) return;
    if (missionReportSeenRef.current[missionId]) return;

    const myActor = String(createdBy || "").trim().toLowerCase();
    const architectReply = chatRows.find((row) => {
      const rowMissionId = String(row.mission_id || "").trim();
      if (rowMissionId !== missionId) return false;
      const actor = String(row.actor || "").trim().toUpperCase();
      if (actor !== PRINCIPAL_ARCHITECT_TARGET) return false;
      const direction = String(row.direction || "").trim().toLowerCase();
      if (direction !== "inbound") return false;
      const target = String(row.target || "").trim().toLowerCase();
      if (myActor && target !== myActor) return false;
      return isFinalReportText(String(row.message || ""));
    });

    if (architectReply) {
      missionReportSeenRef.current[missionId] = true;
      const summary = compactText(String(architectReply.message || ""), 240);
      setTopNotice({
        message: `Missão ${missionId} - Resultado: ${summary || "Finalização recebida do Principal Architect."}`,
        variant: "success"
      });
      return;
    }

    const missionQueueRows = queueRows.filter((row) => String(row.mission_id || "").trim() === missionId);
    if (missionQueueRows.length === 0) return;
    const hasOpen = missionQueueRows.some((row) => {
      const statusValue = String(row.status || "").toLowerCase();
      return statusValue === "open" || statusValue === "in_progress";
    });
    const doneCount = missionQueueRows.filter((row) => String(row.status || "").toLowerCase() === "done").length;
    if (!hasOpen && doneCount > 0) {
      missionReportSeenRef.current[missionId] = true;
      setTopNotice({
        message: `Missão ${missionId} - Resultado: finalizada na fila (${doneCount}/${missionQueueRows.length} itens concluídos).`,
        variant: "info"
      });
    }
  }, [chatRows, createdBy, queueRows, watchMissionId]);

  const usersPayload = useMemo(() => safeJsonParse(usersText), [usersText]);
  const usersRows = useMemo(() => {
    const rows = usersPayload?.rows;
    return Array.isArray(rows) ? (rows as GovUserRow[]) : [];
  }, [usersPayload]);

  const chatTargetOptions = useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    const push = (value: unknown) => {
      const clean = String(value || "").trim();
      if (!clean) return;
      const key = clean.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      out.push(clean);
    };

    push("STAFF");
    push("CPP");
    push("CPP-IA");
    push("ADMIN");
    push(PRINCIPAL_ARCHITECT_TARGET);
    push(createdBy);

    for (const row of usersRows) {
      push(row.username);
    }

    const chat = safeJsonParse(chatText);
    const rows = Array.isArray(chat?.rows) ? (chat.rows as ChatRow[]) : [];
    for (const row of rows.slice(0, 120)) {
      push(row.actor);
      push(row.target);
    }

    return out;
  }, [chatText, createdBy, usersRows]);

  const chatActionOptions = useMemo(
    () =>
      currentRole === "admin"
        ? (["MSG", "STATUS", "OK", "PAUSAR", "NEGAR", "OWNER_CALL", "NOVA_MISSAO"] as ChatUiAction[])
        : (["MSG", "STATUS"] as ChatUiAction[]),
    [currentRole]
  );

  const chatSendLabel = useMemo(
    () => (currentRole === "admin" && isAdminCommandAction(chatAction) ? "Enviar comando" : "Enviar mensagem"),
    [chatAction, currentRole]
  );

  const chatTargetIsPrincipalArchitect = useMemo(() => {
    return String(chatTarget || "")
      .trim()
      .replace(/\s+/g, "_")
      .toUpperCase() === PRINCIPAL_ARCHITECT_TARGET;
  }, [chatTarget]);

  const chatConversationIsOnline = chatPollState === "online";

  const chatTargetDynamicOptions = useMemo(() => {
    const fixed = new Set(["STAFF", "CPP", "CPP-IA", "ADMIN", PRINCIPAL_ARCHITECT_TARGET]);
    return chatTargetOptions.filter((target) => !fixed.has(String(target || "").toUpperCase()));
  }, [chatTargetOptions]);

  const topMissionUsage = useMemo(() => {
    const map = new Map<string, { mission_id: string; usd: number; tokens: number; input: number; output: number; count: number; last_at: string }>();
    for (const row of usageRows) {
      const missionId = String(row.mission_id || "").trim();
      if (!missionId) continue;
      const current = map.get(missionId) || { mission_id: missionId, usd: 0, tokens: 0, input: 0, output: 0, count: 0, last_at: "" };
      current.usd += readNumber(row.projected_cost_usd);
      current.input += readNumber(row.projected_input_tokens);
      current.output += readNumber(row.projected_output_tokens);
      current.tokens += readNumber(row.projected_total_tokens);
      current.count += 1;
      const createdAt = String(row.created_at_utc || "");
      if (createdAt > current.last_at) current.last_at = createdAt;
      map.set(missionId, current);
    }
    return Array.from(map.values())
      .sort((a, b) => b.usd - a.usd)
      .slice(0, 8);
  }, [usageRows]);

  const missionForecastUsd = useMemo(() => {
    const previewUsd = previewData ? readNumber(previewData.projected_cost_usd) : 0;
    const realtimePreview = realtimePayload?.preview;
    const realtimePreviewUsd = realtimePreview && typeof realtimePreview === "object"
      ? readNumber((realtimePreview as Record<string, unknown>).projected_cost_usd)
      : 0;
    return Math.max(previewUsd, realtimePreviewUsd);
  }, [previewData, realtimePayload]);

  const missionForecastTokens = useMemo(() => {
    const previewTokens = previewData ? readNumber(previewData.projected_total_tokens) : 0;
    const realtimePreview = realtimePayload?.preview;
    const realtimePreviewTokens = realtimePreview && typeof realtimePreview === "object"
      ? readNumber((realtimePreview as Record<string, unknown>).projected_total_tokens)
      : 0;
    return Math.max(previewTokens, realtimePreviewTokens);
  }, [previewData, realtimePayload]);

  const missionForecastBrl = useMemo(() => {
    const previewBrl = previewData ? readNumber(previewData.projected_cost_brl) : 0;
    const realtimePreview = realtimePayload?.preview;
    const realtimePreviewBrl = realtimePreview && typeof realtimePreview === "object"
      ? readNumber((realtimePreview as Record<string, unknown>).projected_cost_brl)
      : 0;
    return Math.max(previewBrl, realtimePreviewBrl);
  }, [previewData, realtimePayload]);

  return (
    <main className="gm-shell">
      <aside className="gm-sidebar">
        <div className="gm-rail">
          <div className="gm-rail-brand" title="GOV-HUB">
            <img className="gm-rail-brand-seal" src="/selo-govhub.png" alt="GOV-HUB" />
          </div>
          <nav className="gm-rail-nav">
            {SECTION_ITEMS.map((item) => (
              <button
                key={`rail-${item.id}`}
                className={section === item.id ? "active" : ""}
                title={item.label}
                aria-label={item.label}
                onClick={() => goToSection(item.id)}
              >
                <span>{item.icon}</span>
                {item.id === "chat" && chatUnread > 0 ? <small className="gm-rail-dot">{chatUnread}</small> : null}
              </button>
            ))}
          </nav>
          <div className="gm-rail-bottom">
            {isPrimaryAdmin ? (
              <button title="Usuários" aria-label="Usuários" onClick={openUsersModal}>
                <span>⚙</span>
              </button>
            ) : null}
            <button
              title={theme === "dark" ? "Tema escuro" : "Tema claro"}
              aria-label="Alternar tema"
              onClick={() => updateTheme(theme === "dark" ? "light" : "dark")}
            >
              <span>{theme === "dark" ? "☾" : "☀"}</span>
            </button>
            <button title="Sair" aria-label="Sair" onClick={logout}>
              <span>⇦</span>
            </button>
          </div>
        </div>
      </aside>

      <section className="gm-main">
        <header className="gm-header gm-header-shell">
          <div className="gm-header-copy">
            <h1>{pageTitle}</h1>
            <p>{pageSubtitle}</p>
          </div>
          <div className="gm-header-actions">
            <label className="gm-header-search">
              <span>Pesquisar</span>
              <input type="text" placeholder="Pesquisar no GOV..." />
            </label>
            <div className="gm-header-icon-group">
              <button
                className="gm-header-icon-btn"
                type="button"
                onClick={() => goToSection("missoes")}
                aria-label="Criar missão"
                title="Criar missão"
              >
                ⊞
              </button>
              <button
                className="gm-header-icon-btn gm-header-icon-btn-accent"
                type="button"
                onClick={compileUdn}
                aria-label="Gerar UDN"
                title="Gerar UDN"
              >
                ↻
              </button>
            </div>
          </div>
        </header>

        {topNotice ? (
          <button
            type="button"
            className={`gm-top-notice gm-top-notice-${topNotice.variant}`}
            onClick={() => setTopNotice(null)}
          >
            <span>{topNotice.message}</span>
            <strong>Fechar</strong>
          </button>
        ) : null}

        {queueLead ? (
          <section className="gm-queue-alert" role="status" aria-live="polite">
            <div className="gm-queue-alert-copy">
              <strong>Missão na fila</strong>
              <span>
                Próximo recomendado: {queueLead.title || "avaliar item da fila"}.
              </span>
              <small>
                Missão {queueLead.mission_id || "-"} | Executor {queueLead.assignee || "-"} | Prioridade {queueLead.priority || "-"}
              </small>
              {(() => {
                const eta = estimateQueueEta(queueLead, Date.now());
                return <small>ETA: {eta.label} | Confiança: {eta.confidence.toUpperCase()}</small>;
              })()}
            </div>
            <div className="gm-queue-alert-actions">
              <button
                type="button"
                className="gm-icon-action"
                onClick={() => { void updateQueueStatus(queueLead, "in_progress", "Item marcado como em andamento."); }}
                aria-label="Continuar"
                title="Continuar"
              >
                ▶
              </button>
              <button
                type="button"
                className="gm-icon-action"
                onClick={() => { void updateQueueStatus(queueLead, "paused_waiting_owner", "Item pausado."); }}
                aria-label="Pausar"
                title="Pausar"
              >
                ⏸
              </button>
              <button
                type="button"
                className="gm-icon-action"
                onClick={() => {
                  openQueueDetails(queueLead);
                }}
                aria-label="Ver detalhes"
                title="Ver detalhes"
              >
                ⌕
              </button>
              <button
                type="button"
                className="gm-icon-action"
                onClick={() => { void updateQueueStatus(queueLead, "paused_waiting_owner", "Item removido da fila ativa e movido para pendente."); }}
                aria-label="Remover da fila"
                title="Remover da fila"
              >
                ✕
              </button>
            </div>
          </section>
        ) : queueRunningLead ? (
          <section className="gm-queue-alert" role="status" aria-live="polite">
            <div className="gm-queue-alert-copy">
              <strong>Missão em andamento</strong>
              <span>
                Execução em progresso: {queueRunningLead.title || "item em andamento"}.
              </span>
              <small>
                Missão {queueRunningLead.mission_id || "-"} | Executor {queueRunningLead.assignee || "-"} | Prioridade {queueRunningLead.priority || "-"}
              </small>
              {(() => {
                const eta = estimateQueueEta(queueRunningLead, Date.now());
                return <small>ETA: {eta.label} | Confiança: {eta.confidence.toUpperCase()}</small>;
              })()}
            </div>
            <div className="gm-queue-alert-actions">
              <button
                type="button"
                className="gm-icon-action"
                onClick={() => {
                  openQueueDetails(queueRunningLead);
                }}
                aria-label="Ver detalhes"
                title="Ver detalhes"
              >
                ⌕
              </button>
              <button
                type="button"
                className="gm-icon-action"
                onClick={() => { void updateQueueStatus(queueRunningLead, "paused_waiting_owner", "Item pausado."); }}
                aria-label="Pausar"
                title="Pausar"
              >
                ⏸
              </button>
              <button
                type="button"
                className="gm-icon-action"
                onClick={() => { void updateQueueStatus(queueRunningLead, "done", "Item marcado como concluído."); }}
                aria-label="Concluir"
                title="Concluir"
              >
                ✓
              </button>
            </div>
          </section>
        ) : (
          <section className="gm-queue-empty-alert" role="status" aria-live="polite">
            <div className="gm-queue-alert-copy">
              <strong>Fila ativa vazia</strong>
              <span>Se não há itens em execução, o Staff deve solicitar ao Admin aprovação para a próxima missão.</span>
            </div>
            <div className="gm-queue-alert-actions">
              <button type="button" onClick={requestNextMissionApproval}>
                Solicitar próxima missão
              </button>
              <button type="button" onClick={() => { void pullQueueNow(); }}>
                {queueLoading ? "Atualizando..." : "Atualizar fila"}
              </button>
            </div>
          </section>
        )}
        {queueNotice ? <p className="gm-queue-notice">{queueNotice}</p> : null}

        <section className="gm-token-strip" aria-label="Métricas de token e custo">
          <article>
            <span>Tokens hoje (SP)</span>
            <strong>{Math.round(readNumber(usageSummary.daily_tokens)).toLocaleString("pt-BR")}</strong>
          </article>
          <article>
            <span>Input hoje (SP)</span>
            <strong>{Math.round(readNumber(usageSummary.daily_input_tokens)).toLocaleString("pt-BR")}</strong>
          </article>
          <article>
            <span>Output hoje (SP)</span>
            <strong>{Math.round(readNumber(usageSummary.daily_output_tokens)).toLocaleString("pt-BR")}</strong>
          </article>
          <article>
            <span>Custo hoje (SP)</span>
            <strong>{formatUsd(readNumber(usageSummary.daily_usd))}</strong>
          </article>
          <article>
            <span>Tokens mês</span>
            <strong>{Math.round(readNumber(usageSummary.monthly_input_tokens) + readNumber(usageSummary.monthly_output_tokens)).toLocaleString("pt-BR")}</strong>
          </article>
          <article>
            <span>Custo mês</span>
            <strong>{formatUsd(readNumber(usageSummary.monthly_usd))}</strong>
          </article>
        </section>
        {readNumber(usageSummary.daily_tokens) <= 0 && readNumber(usageSummary.monthly_usd) > 0 ? (
          <p className="gm-meta">Sem lançamentos no dia atual (São Paulo). Último registro: {formatDateTime(usageLastAt)}</p>
        ) : null}

        <div className="gm-metrics">
          {metrics.map((item) => (
            <article key={item.label}>
              <span>{item.label}</span>
              <strong>{item.value}</strong>
            </article>
          ))}
        </div>

        {section === "visao" ? (
          <div className="gm-grid">
            <section className="gm-card">
              <h2>Resumo Operacional</h2>
              <div className="gm-list">
                <p>Missão atual: <strong>{mission.id || "não definida"}</strong></p>
                <p>Owner: <strong>{createdBy}</strong></p>
                <p>Partes em fila: <strong>{parts.length}</strong></p>
                <p>Prompt por referência: <strong>{selectedPrompt ? selectedPrompt.prompt_id : "nenhum"}</strong></p>
              </div>
              <button onClick={() => goToSection("missoes")}>Ir para Missões</button>
              <button onClick={createExecutionPlan}>Gerar Fila Automatizada</button>
            </section>

            <section className="gm-card">
              <h2>Consumo e Controle</h2>
              <div className="gm-list">
                <p>Token control: <strong>{tokenControl.enabled ? "ativo" : "inativo"}</strong></p>
                <p>Hard stop: <strong>{tokenControl.hard_stop ? "ativo" : "inativo"}</strong></p>
                <p>Limite input/output: <strong>{tokenControl.max_input_tokens} / {tokenControl.max_output_tokens}</strong></p>
              </div>
              <button onClick={() => goToSection("governanca")}>Ir para Governança</button>
            </section>

            <section className="gm-card">
              <h2>Status dos Bots</h2>
              <div className="gm-row">
                <label>
                  Atualização bots (seg)
                  <select value={botStatusRefreshSec} onChange={(e) => setBotStatusRefreshSec(Number(e.target.value || 30))}>
                    <option value={15}>15s</option>
                    <option value={30}>30s</option>
                    <option value={45}>45s</option>
                    <option value={60}>60s</option>
                    <option value={120}>120s</option>
                  </select>
                </label>
                <button type="button" onClick={() => setBotStatusRefreshNonce((prev) => prev + 1)}>
                  Atualizar agora
                </button>
              </div>
              <div className="gm-mini-metrics">
                <article>
                  <span>Total</span>
                  <strong>{botSummary.total}</strong>
                </article>
                <article>
                  <span>OK</span>
                  <strong>{botSummary.ok}</strong>
                </article>
                <article>
                  <span>Erro</span>
                  <strong>{botSummary.error}</strong>
                </article>
                <article>
                  <span>Bloqueado</span>
                  <strong>{botSummary.blocked}</strong>
                </article>
              </div>
              <p className="gm-meta">Último status BR (São Paulo): {formatDateTime(botStatusUpdatedAt)}</p>
              <div className="gm-bot-list">
                {botRows.length === 0 ? (
                  <p className="gm-empty">Sem status registrado dos bots ainda.</p>
                ) : (
                  botRows.map((row) => (
                    <article key={`${row.bot_id || "bot"}-${row.workflow_id || "workflow"}`} className="gm-bot-item">
                      <strong>{row.bot_id || "bot"}</strong>
                      <span>{row.workflow_id || "-"}</span>
                      <span className={`gm-bot-state gm-bot-state-${String(row.state || "unknown").toLowerCase()}`}>
                        {botStateLabel(String(row.state || "unknown"))}
                      </span>
                      <small>Resultado: {row.result || "-"}</small>
                      <small>Atualizado: {formatDateTime(String(row.updated_at_utc || ""))}</small>
                      {row.run_url ? (
                        <a href={row.run_url} target="_blank" rel="noreferrer">
                          Abrir execução
                        </a>
                      ) : null}
                    </article>
                  ))
                )}
              </div>
            </section>
          </div>
        ) : null}

        {section === "missoes" ? (
          <section className="gm-card">
            <div className="gm-subtabs">
              <button
                type="button"
                className={missionsTab === "cadastro" ? "active" : ""}
                onClick={() => setMissionsTab("cadastro")}
              >
                Cadastro
              </button>
              <button
                type="button"
                className={missionsTab === "gestao" ? "active" : ""}
                onClick={() => setMissionsTab("gestao")}
              >
                Gestão
              </button>
            </div>
            {missionsTab === "cadastro" ? (
              <>
            <h2>Criar Missão</h2>
            <label>
              Mission ID
              <input value={mission.id} onChange={(e) => setMission({ ...mission, id: e.target.value })} />
            </label>
            <p className="gm-meta">
              Próximo código automático: {nextMissionCode}.
            </p>
            <label>
              Objetivo
              <input value={mission.target} onChange={(e) => setMission({ ...mission, target: e.target.value })} />
            </label>
            <div className="gm-row">
              <label>
                Branch
                <input value={mission.branch} onChange={(e) => setMission({ ...mission, branch: e.target.value })} />
              </label>
              <label>
                Agente
                <select value={mission.agent_id} onChange={(e) => setMission({ ...mission, agent_id: e.target.value })}>
                  <option value={MISSION_INTAKE_AGENT}>Principal Architect</option>
                </select>
              </label>
            </div>
            <label>
              Criado por
              <input value={createdBy} onChange={(e) => setCreatedBy(e.target.value)} />
            </label>
            <label className="gm-mission-paste">
              Missão / UDN (V2 compacto)
              <textarea
                rows={7}
                value={udn}
                onChange={(e) => setUdn(e.target.value)}
                placeholder="Cole o UDN mínimo (!MIS|id, #μ, #τ). Defaults (#σ, !OUT, #af) são aplicados no backend."
              />
            </label>
            {missingMissionFields.length > 0 ? (
              <p className="gm-form-warning">
                Preencha para habilitar envio: {missingMissionFields.join(", ")}.
              </p>
            ) : (
              <p className={missionReadyToRegister ? "gm-form-ok" : "gm-form-warning"}>
                {missionReadyToRegister
                  ? "Validação concluída. Pode registrar no HUB."
                  : "Campos preenchidos. Clique em Validar missão para liberar o registro."}
              </p>
            )}

            <div className="gm-row">
              <label>
                Prompt de referência
                <select value={selectedPromptId} onChange={(e) => setSelectedPromptId(e.target.value)}>
                  <option value="">Sem referência</option>
                  {promptLibrary.map((prompt) => (
                    <option key={prompt.prompt_id} value={prompt.prompt_id}>{prompt.prompt_id} - {prompt.title}</option>
                  ))}
                </select>
              </label>
              <label>
                Variáveis (chave=valor)
                <textarea rows={3} value={promptVarsRaw} onChange={(e) => setPromptVarsRaw(e.target.value)} />
              </label>
            </div>

            <h3>Particionamento (Staff)</h3>
            <div className="gm-part-list">
              {parts.map((part, index) => (
                <div key={`${part.part_id}-${index}`} className="gm-part-item">
                  <div className="gm-row">
                    <label>
                      Parte
                      <input
                        value={part.part_id}
                        onChange={(e) => updatePart(index, { part_id: e.target.value })}
                        placeholder={`P${index + 1}`}
                      />
                    </label>
                    <label>
                      Prioridade
                      <select value={part.priority} onChange={(e) => updatePart(index, { priority: e.target.value as PartPriority })}>
                        <option value="P0">P0</option>
                        <option value="P1">P1</option>
                        <option value="P2">P2</option>
                      </select>
                    </label>
                  </div>
                  <div className="gm-row">
                    <label>
                      Executor
                      <select value={part.executor} onChange={(e) => updatePart(index, { executor: e.target.value as PartExecutor })}>
                        <option value="STAFF">STAFF</option>
                        <option value="CPP">CPP</option>
                        <option value="CPP-IA">CPP-IA</option>
                      </select>
                    </label>
                    <button type="button" onClick={() => removePart(index)}>Remover</button>
                  </div>
                  <label>
                    Entrega da Parte
                    <input value={part.goal} onChange={(e) => updatePart(index, { goal: e.target.value })} placeholder="Descreva o objetivo desta parte" />
                  </label>
                </div>
              ))}
            </div>
            <button type="button" onClick={addPart}>+ Adicionar parte</button>

            <div className="gm-row">
              <label>
                Budget USD
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={tokenControl.budget_usd}
                  onChange={(e) => setTokenControl({ ...tokenControl, budget_usd: Number(e.target.value || 0) })}
                />
              </label>
              <label>
                Budget BRL
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={tokenControl.budget_brl}
                  onChange={(e) => setTokenControl({ ...tokenControl, budget_brl: Number(e.target.value || 0) })}
                />
              </label>
            </div>

            <div className="gm-row">
              <label>
                Max Input Tokens
                <input
                  type="number"
                  min={1}
                  step={1}
                  value={tokenControl.max_input_tokens}
                  onChange={(e) => setTokenControl({ ...tokenControl, max_input_tokens: Number(e.target.value || 1) })}
                />
              </label>
              <label>
                Max Output Tokens
                <input
                  type="number"
                  min={1}
                  step={1}
                  value={tokenControl.max_output_tokens}
                  onChange={(e) => setTokenControl({ ...tokenControl, max_output_tokens: Number(e.target.value || 1) })}
                />
              </label>
            </div>
            <p className="gm-meta">
              Métrica de consumo: <strong>Inbound (Input)</strong> = Max Input Tokens, <strong>Outbound (Output)</strong> = Max Output Tokens.
            </p>

            <div className="gm-row">
              <button onClick={() => setTokenControl({ ...tokenControl, enabled: !tokenControl.enabled })}>
                Token Control: {tokenControl.enabled ? "ON" : "OFF"}
              </button>
              <button onClick={() => setTokenControl({ ...tokenControl, hard_stop: !tokenControl.hard_stop })}>
                Hard Stop: {tokenControl.hard_stop ? "ON" : "OFF"}
              </button>
            </div>

            <div className="gm-row">
              <button onClick={estimateCost}>Prospecção de Custo</button>
              <button type="button" onClick={validateMission}>Validar missão</button>
            </div>
            <div className="gm-row">
              <button className="gm-primary" onClick={registerMission} disabled={!missionReadyToRegister}>Registrar no HUB</button>
              <button type="button" onClick={() => setMission((prev) => ({ ...prev, id: nextMissionCode }))}>
                Auto Mission ID
              </button>
            </div>
            <div className="gm-row">
              <button onClick={createExecutionPlan}>Gerar Fila Staff/CPP/CPP-IA</button>
              <button onClick={() => goToSection("orquestracao")}>Abrir Orquestração</button>
            </div>
              </>
            ) : (
              <>
                <h2>Gestão de Missões</h2>
                <p className="gm-meta">
                  Operações permitidas enquanto a missão estiver em progresso: agrupar, editar e incluir execuções.
                </p>

                <div className="gm-row">
                  <button type="button" onClick={startAllNonPausedMissions}>
                    Iniciar todas não pausadas
                  </button>
                  <button type="button" onClick={() => void loadMissionManage()}>
                    Atualizar gestão
                  </button>
                </div>

                <section className="gm-manage-block">
                  <h3>Agrupar Missões (Pacote)</h3>
                  <div className="gm-row">
                    <label>
                      Código do pacote
                      <input value={groupPackageId} onChange={(e) => setGroupPackageId(e.target.value)} placeholder="ex.: PACOTE-Q2-ARQ" />
                    </label>
                    <label>
                      Missões (IDs)
                      <input
                        value={groupMissionIdsRaw}
                        onChange={(e) => setGroupMissionIdsRaw(e.target.value)}
                        placeholder="ex.: GOV-MANAGER-V1-00010, GOV-MANAGER-V1-00011"
                      />
                    </label>
                  </div>
                  <label>
                    Nota do pacote
                    <input value={groupNote} onChange={(e) => setGroupNote(e.target.value)} placeholder="Contexto do pacote" />
                  </label>
                  <button type="button" onClick={groupMissions}>Salvar pacote</button>
                </section>

                <section className="gm-manage-block">
                  <h3>Editar Missão em Progresso</h3>
                  <div className="gm-row">
                    <label>
                      Missão
                      <input
                        value={manageEdit.mission_id}
                        onChange={(e) => setManageEdit((prev) => ({ ...prev, mission_id: e.target.value.toUpperCase() }))}
                        placeholder="ex.: GOV-MANAGER-V1-00015"
                      />
                    </label>
                    <label>
                      Executor
                      <select value={manageEdit.assignee} onChange={(e) => setManageEdit((prev) => ({ ...prev, assignee: e.target.value }))}>
                        <option value="STAFF">STAFF</option>
                        <option value="CPP">CPP</option>
                        <option value="CPP-IA">CPP-IA</option>
                      </select>
                    </label>
                  </div>
                  <div className="gm-row">
                    <label>
                      Prioridade
                      <select value={manageEdit.priority} onChange={(e) => setManageEdit((prev) => ({ ...prev, priority: e.target.value }))}>
                        <option value="P0">P0</option>
                        <option value="P1">P1</option>
                        <option value="P2">P2</option>
                        <option value="P3">P3</option>
                      </select>
                    </label>
                    <label>
                      Objetivo
                      <input value={manageEdit.objective} onChange={(e) => setManageEdit((prev) => ({ ...prev, objective: e.target.value }))} />
                    </label>
                  </div>
                  <label>
                    Notas
                    <textarea rows={3} value={manageEdit.notes} onChange={(e) => setManageEdit((prev) => ({ ...prev, notes: e.target.value }))} />
                  </label>
                  <button type="button" onClick={editMissionInProgress}>Salvar edição</button>
                </section>

                <section className="gm-manage-block">
                  <h3>+ Execução na Missão</h3>
                  <div className="gm-row">
                    <label>
                      Missão
                      <input
                        value={manageExecution.mission_id}
                        onChange={(e) => setManageExecution((prev) => ({ ...prev, mission_id: e.target.value.toUpperCase() }))}
                        placeholder="ex.: GOV-MANAGER-V1-00015"
                      />
                    </label>
                    <label>
                      Título da execução
                      <input value={manageExecution.title} onChange={(e) => setManageExecution((prev) => ({ ...prev, title: e.target.value }))} />
                    </label>
                  </div>
                  <label>
                    Descrição
                    <input value={manageExecution.description} onChange={(e) => setManageExecution((prev) => ({ ...prev, description: e.target.value }))} />
                  </label>
                  <div className="gm-row">
                    <label>
                      Executor
                      <select value={manageExecution.assignee} onChange={(e) => setManageExecution((prev) => ({ ...prev, assignee: e.target.value }))}>
                        <option value="STAFF">STAFF</option>
                        <option value="CPP">CPP</option>
                        <option value="CPP-IA">CPP-IA</option>
                      </select>
                    </label>
                    <label>
                      Prioridade
                      <select value={manageExecution.priority} onChange={(e) => setManageExecution((prev) => ({ ...prev, priority: e.target.value }))}>
                        <option value="P0">P0</option>
                        <option value="P1">P1</option>
                        <option value="P2">P2</option>
                        <option value="P3">P3</option>
                      </select>
                    </label>
                  </div>
                  <button type="button" onClick={addExecutionToMission}>Adicionar execução</button>
                </section>

                {missionManageNotice ? <p className="gm-chat-notice">{missionManageNotice}</p> : null}

                <div className="gm-mini-metrics">
                  <article>
                    <span>Missões em progresso</span>
                    <strong>{queueInProgressMissionIds.length}</strong>
                  </article>
                  <article>
                    <span>Pacotes</span>
                    <strong>{missionPackages.length}</strong>
                  </article>
                  <article>
                    <span>Missões gerenciadas</span>
                    <strong>{managedMissionRows.length}</strong>
                  </article>
                  <article>
                    <span>Atualização</span>
                    <strong>{formatDateTime(missionManageUpdatedAt)}</strong>
                  </article>
                </div>

                <div className="gm-manage-list">
                  <article>
                    <h3>Missões em progresso</h3>
                    {queueInProgressRows.length === 0 ? (
                      <p className="gm-empty">Sem missão em progresso no momento.</p>
                    ) : (
                      queueInProgressRows.slice(0, 8).map((row) => (
                        <button key={String(row.queue_id || `${row.mission_id}-${row.title}`)} type="button" onClick={() => loadMissionIntoManageForms(row)}>
                          {String(row.mission_id || "-")} · {String(row.title || "Sem título")}
                        </button>
                      ))
                    )}
                  </article>
                  <article>
                    <h3>Pacotes</h3>
                    {missionPackages.length === 0 ? (
                      <p className="gm-empty">Sem pacotes registrados.</p>
                    ) : (
                      missionPackages.slice(0, 8).map((pack) => (
                        <p key={String(pack.package_id || "")}>
                          <strong>{pack.package_id || "-"}</strong> · {Array.isArray(pack.mission_ids) ? pack.mission_ids.length : 0} missão(ões)
                        </p>
                      ))
                    )}
                  </article>
                </div>
              </>
            )}
          </section>
        ) : null}

        {section === "orquestracao" ? (
          <section className="gm-card">
            <h2>Fila de Execução Priorizada</h2>
            <div className="gm-row">
              <label>
                Atualização fila (seg)
                <select value={queueRefreshSec} onChange={(e) => setQueueRefreshSec(Number(e.target.value || 30))}>
                  <option value={15}>15s</option>
                  <option value={30}>30s</option>
                  <option value={45}>45s</option>
                  <option value={60}>60s</option>
                  <option value={120}>120s</option>
                </select>
              </label>
              <button type="button" onClick={() => { void pullQueueNow(); }}>
                {queueLoading ? "Atualizando..." : "Atualizar agora"}
              </button>
            </div>
            <div className="gm-mini-metrics">
              <article>
                <span>Total aberto</span>
                <strong>{Math.round(queueOpenRows.length).toLocaleString("pt-BR")}</strong>
              </article>
              <article>
                <span>Staff</span>
                <strong>{Math.round(readNumber((queueSummary.by_assignee as Record<string, unknown> | undefined)?.STAFF)).toLocaleString("pt-BR")}</strong>
              </article>
              <article>
                <span>CPP</span>
                <strong>{Math.round(readNumber((queueSummary.by_assignee as Record<string, unknown> | undefined)?.CPP)).toLocaleString("pt-BR")}</strong>
              </article>
              <article>
                <span>CPP-IA</span>
                <strong>{Math.round(readNumber((queueSummary.by_assignee as Record<string, unknown> | undefined)?.["CPP-IA"])).toLocaleString("pt-BR")}</strong>
              </article>
            </div>
            <p className="gm-meta">Última sincronização BR (São Paulo): {formatDateTime(queueUpdatedAt)}</p>
            <div className="gm-kanban-toolbar">
              <label>
                Executor
                <select value={queueAssigneeFilter} onChange={(e) => setQueueAssigneeFilter(e.target.value as "all" | PartExecutor)}>
                  <option value="all">Todos</option>
                  <option value="STAFF">STAFF</option>
                  <option value="CPP">CPP</option>
                  <option value="CPP-IA">CPP-IA</option>
                </select>
              </label>
              <label>
                Prioridade
                <select value={queuePriorityFilter} onChange={(e) => setQueuePriorityFilter(e.target.value as "all" | "P0" | "P1" | "P2" | "P3")}>
                  <option value="all">Todas</option>
                  <option value="P0">P0</option>
                  <option value="P1">P1</option>
                  <option value="P2">P2</option>
                  <option value="P3">P3</option>
                </select>
              </label>
              <label>
                Buscar missão/título
                <input value={queueMissionFilter} onChange={(e) => setQueueMissionFilter(e.target.value)} placeholder="ex.: GOV-MANAGER-V1-00017" />
              </label>
              <button
                type="button"
                onClick={() => {
                  setQueueAssigneeFilter("all");
                  setQueuePriorityFilter("all");
                  setQueueMissionFilter("");
                }}
              >
                Limpar filtros
              </button>
            </div>
            <div className="gm-kanban-board">
              {KANBAN_COLUMNS.map((column) => {
                const rows = queueRowsByStatus[column.status] || [];
                return (
                  <section
                    key={column.status}
                    className="gm-kanban-column"
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={(event) => {
                      event.preventDefault();
                      const dropped = String(event.dataTransfer.getData("text/plain") || queueDragId || "").trim();
                      setQueueDragId("");
                      if (dropped) void moveQueueCard(dropped, column.status);
                    }}
                  >
                    <header className="gm-kanban-column-head">
                      <h3>{column.label}</h3>
                      <span>{rows.length}</span>
                    </header>
                    <div className="gm-kanban-cards">
                      {rows.length === 0 ? (
                        <p className="gm-empty">Sem itens.</p>
                      ) : (
                        rows.map((row) => {
                          const queueId = String(row.queue_id || `${row.mission_id}-${row.title}`);
                          const eta = queueEtaById.get(queueId) || estimateQueueEta(row, Date.now());
                          const statusValue = String(row.status || "").toLowerCase();
                          return (
                            <article
                              key={queueId}
                              className={queueFocusedId && queueFocusedId === queueId ? "gm-kanban-card is-focused" : "gm-kanban-card"}
                              draggable
                              onDragStart={(event) => {
                                event.dataTransfer.setData("text/plain", queueId);
                                setQueueDragId(queueId);
                              }}
                              onDragEnd={() => setQueueDragId("")}
                            >
                              <div className="gm-kanban-card-head">
                                <strong>{row.title || "Sem título"}</strong>
                                <small>{row.priority || "-"}</small>
                              </div>
                              <p>Missão: {row.mission_id || "-"}</p>
                              <p>Executor: {row.assignee || "-"}</p>
                              <p>Status: {queueStatusLabel(String(row.status || ""))}</p>
                              <p>ETA: {eta.label}</p>
                              <small>Atualizado: {formatDateTime(String(row.updated_at_utc || ""))}</small>
                              <div className="gm-kanban-actions">
                                <button type="button" onClick={() => openQueueDetails(row)}>Detalhes</button>
                                {statusValue === "open" ? (
                                  <button type="button" onClick={() => { void moveQueueCard(queueId, "in_progress"); }}>Iniciar</button>
                                ) : null}
                                {statusValue === "in_progress" ? (
                                  <>
                                    <button type="button" onClick={() => { void moveQueueCard(queueId, "paused_waiting_owner"); }}>Pausar</button>
                                    <button type="button" onClick={() => { void moveQueueCard(queueId, "done"); }}>Concluir</button>
                                  </>
                                ) : null}
                                {statusValue === "paused_waiting_owner" ? (
                                  <button type="button" onClick={() => { void moveQueueCard(queueId, "in_progress"); }}>Retomar</button>
                                ) : null}
                                {statusValue === "done" ? (
                                  <button type="button" onClick={() => { void moveQueueCard(queueId, "open"); }}>Reabrir</button>
                                ) : null}
                              </div>
                            </article>
                          );
                        })
                      )}
                    </div>
                  </section>
                );
              })}
            </div>
            <div className="gm-queue-list">
              {queueOrderedRows.length === 0 ? (
                <p className="gm-empty">Sem itens em aberto na fila.</p>
              ) : (
                queueOrderedRows.map((row) => (
                  <article
                    key={row.queue_id || `${row.mission_id}-${row.title}`}
                    className={queueFocusedId && queueFocusedId === String(row.queue_id || "") ? "gm-queue-item-active" : ""}
                  >
                    {(() => {
                      const key = String(row.queue_id || `${row.mission_id}-${row.title}`);
                      const eta = queueEtaById.get(key) || estimateQueueEta(row, Date.now());
                      const deviationLabel = `${eta.deviation_min > 0 ? "+" : ""}${eta.deviation_min} min`;
                      return (
                        <div className="gm-queue-item-head">
                          <strong>{row.title || "Sem título"}</strong>
                          <span className="gm-queue-eta-chip">{eta.label}</span>
                          <small className={`gm-queue-eta-meta gm-queue-eta-${eta.confidence}`}>
                            Confiança: {eta.confidence.toUpperCase()} | Desvio: {deviationLabel}
                          </small>
                        </div>
                      );
                    })()}
                    <span>Missão: {row.mission_id || "-"}</span>
                    <span>Executor: {row.assignee || "-"}</span>
                    <span>Prioridade: {row.priority || "-"}</span>
                    <span>Status: {row.status || "-"}</span>
                    <small>Atualizado: {formatDateTime(String(row.updated_at_utc || ""))}</small>
                  </article>
                ))
              )}
            </div>
            <details className="gm-debug">
              <summary>Fila detalhada (diagnóstico)</summary>
              <pre>{queueText || "Sem dados de fila no momento..."}</pre>
            </details>
          </section>
        ) : null}

        {section === "chat" ? (
          <section className="gm-card">
            <h2>Chat Operacional HUB</h2>
            <div className="gm-row">
              <label>
                Mission ID
                <input value={mission.id} onChange={(e) => setMission({ ...mission, id: e.target.value })} placeholder="ex.: GOV-MANAGER-V1-FOUNDATION" />
              </label>
              <label>
                Destino
                <select value={chatTarget} onChange={(e) => setChatTarget(e.target.value)}>
                  <option value={PRINCIPAL_ARCHITECT_TARGET}>Principal Architect</option>
                  <option value="CPP">CPP</option>
                  <option value="CPP-IA">CPP-IA</option>
                  <option value="STAFF">STAFF</option>
                  <option value="ADMIN">ADMIN</option>
                  {chatTargetDynamicOptions.map((target) => (
                    <option key={target} value={target}>{formatChatIdentity(target)}</option>
                  ))}
                </select>
              </label>
            </div>
            <div className="gm-row">
              <label>
                Ação
                <select value={chatAction} onChange={(e) => setChatAction(e.target.value as ChatUiAction)}>
                  {chatActionOptions.map((action) => (
                    <option key={action} value={action}>{chatActionUiLabel(action)}</option>
                  ))}
                </select>
              </label>
              <label>
                Atualização chat (seg)
                <select value={chatRefreshSec} onChange={(e) => setChatRefreshSec(Number(e.target.value || 30))}>
                  <option value={3}>3s</option>
                  <option value={5}>5s</option>
                  <option value={10}>10s</option>
                  <option value={15}>15s</option>
                  <option value={30}>30s</option>
                  <option value={45}>45s</option>
                  <option value={60}>60s</option>
                  <option value={120}>120s</option>
                </select>
              </label>
            </div>
            {chatAction === "MSG" ? (
              <div className={`gm-conversation-status ${chatConversationIsOnline ? "gm-conversation-status-online" : "gm-conversation-status-offline"}`}>
                {chatTargetIsPrincipalArchitect ? (
                  <>
                    <strong>{chatConversationIsOnline ? "Principal Architect online" : "Principal Architect offline"}</strong>
                    <small>Último ping BR (São Paulo): {formatDateTime(chatPingAt)}</small>
                  </>
                ) : (
                  <>
                    <strong>Conversa interna com {formatChatIdentity(chatTarget)}</strong>
                    <small>Para falar comigo, selecione Destino: Principal Architect.</small>
                  </>
                )}
              </div>
            ) : null}
            <label>
              Mensagem
              <textarea
                rows={4}
                value={chatMessage}
                onChange={(e) => setChatMessage(e.target.value)}
                placeholder={isAdminCommandAction(chatAction) ? "Comando curto para operação remota no HUB..." : "Mensagem interna para equipe HUB..."}
              />
            </label>
            {chatNotice ? <p className="gm-chat-notice" role="status" aria-live="polite">{chatNotice}</p> : null}
            {currentRole !== "admin" ? (
              <p className="gm-meta">Perfil atual: {currentRole}. Você pode conversar via chat. Comandos operacionais são exclusivos do Admin.</p>
            ) : null}
            <div className="gm-row">
              <button onClick={sendOpsCommand}>{chatSendLabel}</button>
              <button type="button" onClick={() => setChatRefreshNonce((prev) => prev + 1)}>
                Atualizar agora
              </button>
            </div>
            {chatUnread > 0 ? (
              <div className="gm-chat-alert" role="status" aria-live="polite">
                <span>Vc tem {chatUnread} nova(s) msg.</span>
                <button type="button" onClick={() => setChatUnread(0)}>Marcar lidas</button>
              </div>
            ) : null}
            <div className="gm-row">
              <button onClick={() => { setChatAction("MSG"); setChatMessage("Recebido. Seguimos no fluxo normal."); }}>Preset: MSG</button>
              {currentRole === "admin" ? <button onClick={() => { setChatAction("OK"); setChatMessage("OK. Prosseguir com a execução."); }}>Preset: OK</button> : null}
              {currentRole === "admin" ? <button onClick={() => { setChatAction("PAUSAR"); setChatMessage("Pausar execução e aguardar owner."); }}>Preset: PAUSAR</button> : null}
            </div>
            <p className="gm-meta">Última sincronização BR (São Paulo): {formatDateTime(chatUpdatedAt)}</p>
            <div className="gm-chat-feed">
              {chatTopRows.length === 0 ? (
                <p className="gm-empty">Sem mensagens no chat operacional.</p>
              ) : (
                chatTopRows.map((row, index) => {
                  const rowId = String(row.message_id || `${row.created_at_utc || "row"}-${index}`);
                  const opened = chatReplyOpenId === rowId;
                  const missionFormatted = isMissionFormattedRow(row);
                  const rowLabel = missionFormatted && String(row.action || "").trim().toUpperCase() === "MSG"
                    ? "Confirmação de Missão"
                    : chatActionUiLabel(String(row.action || "MSG"));
                  const replyRows = chatReplyRowsByParentId.get(rowId) || [];
                  const replyCount = replyRows.length;
                  return (
                    <article key={rowId} className={`gm-chat-item ${missionFormatted ? "gm-chat-item-mission" : "gm-chat-item-simple"}`}>
                      {missionFormatted ? (
                        <>
                          <div className="gm-chat-item-head">
                            <strong>{rowLabel}</strong>
                            <span>
                              Missão: {row.mission_id || "-"} - Direção: {row.direction || "outbound"} - Ator: {formatChatIdentity(String(row.actor || "-"))} - Destino: {formatChatIdentity(String(row.target || "-"))} - Status: {deliveryStatusLabel(String(row.delivery_status || ""))} - Fonte: {row.source || "-"}
                            </span>
                            <small>BR: {formatDateTime(String(row.created_at_utc || ""))}</small>
                          </div>
                          <p className="gm-chat-mission-text"><strong>Mensagem completa:</strong> {row.message || "-"}</p>
                        </>
                      ) : (
                        <div className="gm-chat-simple-body">
                          <strong>{formatChatIdentity(String(row.actor || "-"))}</strong>
                          <p>{row.message || chatRowSummary(row)}</p>
                          <small>BR: {formatDateTime(String(row.created_at_utc || ""))}</small>
                        </div>
                      )}
                      {replyCount > 0 ? (
                        <>
                          <button
                            type="button"
                            className="gm-reply-toggle"
                            onClick={() => {
                              const nextOpen = opened ? "" : rowId;
                              setChatReplyOpenId(nextOpen);
                              if (nextOpen) {
                                const mine = String(createdBy || "").trim().toLowerCase();
                                const inboundReplies = replyRows.filter((reply) => {
                                  const actor = String(reply.actor || "").trim().toLowerCase();
                                  return actor && actor !== mine;
                                }).length;
                                if (inboundReplies > 0) {
                                  setChatUnread((prev) => Math.max(0, prev - inboundReplies));
                                  setChatNotice("");
                                  const newest = String(chatRows[0]?.message_id || "").trim();
                                  if (newest) {
                                    chatSeenMessageIdRef.current = newest;
                                    chatInitRef.current = true;
                                  }
                                }
                              }
                            }}
                          >
                            {opened ? "Fechar resposta" : replyCountLabel(replyCount)}
                          </button>
                          {opened ? (
                            <div className="gm-chat-replies">
                              {replyRows.map((reply, replyIndex) => {
                                const replyId = String(reply.message_id || `${rowId}-reply-${replyIndex}`);
                                return (
                                  <article key={replyId} className="gm-chat-reply-item">
                                    <small>
                                      {formatChatIdentity(String(reply.actor || "-"))} · BR: {formatDateTime(String(reply.created_at_utc || ""))}
                                    </small>
                                    <p><strong>Resposta:</strong> {reply.message || "-"}</p>
                                  </article>
                                );
                              })}
                            </div>
                          ) : null}
                        </>
                      ) : null}
                    </article>
                  );
                })
              )}
            </div>
          </section>
        ) : null}

        {section === "execucoes" ? (
          <section className="gm-card">
            <h2>Monitoramento</h2>
            <div className="gm-row">
              <label>
                Atualização monitor (seg)
                <select value={monitorRefreshSec} onChange={(e) => setMonitorRefreshSec(Number(e.target.value || 30))}>
                  <option value={15}>15s</option>
                  <option value={30}>30s</option>
                  <option value={45}>45s</option>
                  <option value={60}>60s</option>
                  <option value={120}>120s</option>
                </select>
              </label>
              <button type="button" onClick={() => setMonitorRefreshNonce((prev) => prev + 1)}>
                Atualizar agora
              </button>
            </div>
            <div className="gm-mini-metrics">
              <article>
                <span>Progresso</span>
                <strong>{formatPct(readNumber(realtimeData?.progress_pct))}</strong>
              </article>
              <article>
                <span>Status/Fase</span>
                <strong>{String(realtimeData?.status || "aguardando")} · {String(realtimeData?.phase || "-")}</strong>
              </article>
              <article className={`gm-risk-${monitorRisk.level}`}>
                <span>Risco de limite</span>
                <strong>{monitorRisk.level.toUpperCase()} ({monitorRisk.pct})</strong>
              </article>
              <article>
                <span>Tokens usados</span>
                <strong>{Math.round(readNumber(realtimeData?.estimated_used_tokens)).toLocaleString("pt-BR")}</strong>
              </article>
              <article>
                <span>Tokens restantes</span>
                <strong>{Math.round(readNumber(realtimeData?.estimated_remaining_tokens)).toLocaleString("pt-BR")}</strong>
              </article>
              <article>
                <span>Custo missão</span>
                <strong>{formatUsd(missionForecastUsd)}</strong>
              </article>
            </div>
            <p className="gm-meta">Último monitor BR (São Paulo): {formatDateTime(monitorUpdatedAt)}</p>
            <textarea value={udn} onChange={(e) => setUdn(e.target.value)} rows={8} />
            {ackRequired ? (
              <div className="gm-ack">
                <input value={ownerNote} onChange={(e) => setOwnerNote(e.target.value)} placeholder="Nota do owner (opcional)" />
                <div className="gm-row">
                  <button onClick={() => ownerAck("approve")}>Aprovar</button>
                  <button onClick={() => ownerAck("deny")}>Negar</button>
                </div>
              </div>
            ) : null}
            <details className="gm-debug">
              <summary>Resposta da missão (diagnóstico)</summary>
              <pre>{responseText || "Aguardando operação..."}</pre>
            </details>
            <details className="gm-debug">
              <summary>Prospecção detalhada (diagnóstico)</summary>
              <pre>{tokenPreview || "Prospecção de custo pendente..."}</pre>
            </details>
            <details className="gm-debug">
              <summary>Monitor detalhado (diagnóstico)</summary>
              <pre>{tokenRealtime || "Monitoramento em tempo real aguardando..."}</pre>
            </details>
          </section>
        ) : null}

        {section === "pendencias" ? (
          <section className="gm-card">
            <h2>Pendências Atuais</h2>
            <ul className="gm-pending-list">
              {pendingItems.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
            <div className="gm-row">
              <button onClick={() => goToSection("missoes")}>Abrir Missões</button>
              <button onClick={() => goToSection("execucoes")}>Abrir Execuções</button>
            </div>
          </section>
        ) : null}

        {section === "prompts" ? (
          <div className="gm-grid">
            <section className="gm-card">
              <h2>Cadastro de Prompt</h2>
              <label>
                Título
                <input value={promptForm.title} onChange={(e) => setPromptForm({ ...promptForm, title: e.target.value })} />
              </label>
              <label>
                Descrição
                <input value={promptForm.description} onChange={(e) => setPromptForm({ ...promptForm, description: e.target.value })} />
              </label>
              <label>
                Finalidade
                <input value={promptForm.purpose} onChange={(e) => setPromptForm({ ...promptForm, purpose: e.target.value })} />
              </label>
              <label>
                Tags (vírgula)
                <input value={promptForm.tags} onChange={(e) => setPromptForm({ ...promptForm, tags: e.target.value })} />
              </label>
              <label>
                Template
                <textarea rows={8} value={promptForm.template} onChange={(e) => setPromptForm({ ...promptForm, template: e.target.value })} />
              </label>
              <button className="gm-primary" onClick={savePrompt}>Salvar Prompt</button>
            </section>

            <section className="gm-card">
              <h2>Biblioteca</h2>
              <div className="gm-prompt-list">
                {promptLibrary.map((prompt) => (
                  <article key={prompt.prompt_id} className={`gm-prompt-item ${selectedPromptId === prompt.prompt_id ? "active" : ""}`}>
                    <button onClick={() => setSelectedPromptId(prompt.prompt_id)}>{prompt.prompt_id} - {prompt.title}</button>
                    <small>{prompt.description || prompt.purpose || "Sem descrição"}</small>
                    <div className="gm-tag-list">
                      {prompt.tags.map((tag) => (
                        <span key={`${prompt.prompt_id}-${tag}`}>{tag}</span>
                      ))}
                    </div>
                    <div className="gm-row">
                      <button onClick={() => {
                        setSelectedPromptId(prompt.prompt_id);
                        goToSection("missoes");
                      }}>
                        Usar na Missão
                      </button>
                      <button onClick={() => deletePrompt(prompt.prompt_id)}>Excluir</button>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          </div>
        ) : null}

        {section === "governanca" ? (
          <div className="gm-grid">
            <section className="gm-card">
              <h2>Política de Custo</h2>
              <div className="gm-row">
                <label>
                  Limite diário (tokens)
                  <input
                    type="number"
                    min={1000}
                    step={100}
                    value={policy.daily_token_limit}
                    onChange={(e) => setPolicy({ ...policy, daily_token_limit: Number(e.target.value || 1000) })}
                  />
                </label>
                <label>
                  Limite diário (USD)
                  <input
                    type="number"
                    min={1}
                    step="0.1"
                    value={policy.daily_usd_limit}
                    onChange={(e) => setPolicy({ ...policy, daily_usd_limit: Number(e.target.value || 1) })}
                  />
                </label>
              </div>
              <div className="gm-row">
                <label>
                  Limite mensal (USD)
                  <input
                    type="number"
                    min={5}
                    step="0.1"
                    value={policy.monthly_usd_limit}
                    onChange={(e) => setPolicy({ ...policy, monthly_usd_limit: Number(e.target.value || 5) })}
                  />
                </label>
                <label>
                  Alerta em (%)
                  <input
                    type="number"
                    min={1}
                    max={99}
                    step={1}
                    value={policy.warn_threshold_pct}
                    onChange={(e) => setPolicy({ ...policy, warn_threshold_pct: Number(e.target.value || 80) })}
                  />
                </label>
              </div>
              <div className="gm-row">
                <button onClick={() => setPolicy({ ...policy, auto_pause_on_limit: !policy.auto_pause_on_limit })}>
                  Auto Pause: {policy.auto_pause_on_limit ? "ON" : "OFF"}
                </button>
                <button onClick={() => setPolicy({ ...policy, hard_stop: !policy.hard_stop })}>
                  Hard Stop: {policy.hard_stop ? "ON" : "OFF"}
                </button>
              </div>
              <button className="gm-primary" onClick={savePolicy}>Salvar Política</button>
            </section>

            <section className="gm-card">
              <h2>Uso em Tempo Real</h2>
              <div className="gm-row">
                <label>
                  Atualização uso (seg)
                  <select value={usageRefreshSec} onChange={(e) => setUsageRefreshSec(Number(e.target.value || 45))}>
                    <option value={15}>15s</option>
                    <option value={30}>30s</option>
                    <option value={45}>45s</option>
                    <option value={60}>60s</option>
                    <option value={120}>120s</option>
                  </select>
                </label>
                <button type="button" onClick={() => setUsageRefreshNonce((prev) => prev + 1)}>
                  Atualizar agora
                </button>
              </div>
              <div className="gm-mini-metrics">
                <article>
                  <span>Tokens hoje</span>
                  <strong>{Math.round(readNumber(usageSummary.daily_tokens)).toLocaleString("pt-BR")}</strong>
                </article>
                <article>
                  <span>Input hoje</span>
                  <strong>{Math.round(readNumber(usageSummary.daily_input_tokens)).toLocaleString("pt-BR")}</strong>
                </article>
                <article>
                  <span>Output hoje</span>
                  <strong>{Math.round(readNumber(usageSummary.daily_output_tokens)).toLocaleString("pt-BR")}</strong>
                </article>
                <article>
                  <span>Missões hoje</span>
                  <strong>{Math.round(readNumber(usageSummary.daily_count)).toLocaleString("pt-BR")}</strong>
                </article>
                <article>
                  <span>USD hoje</span>
                  <strong>{formatUsd(readNumber(usageSummary.daily_usd))}</strong>
                </article>
                <article>
                  <span>USD mês</span>
                  <strong>{formatUsd(readNumber(usageSummary.monthly_usd))}</strong>
                </article>
              </div>
              <p className="gm-meta">Último uso BR (São Paulo): {formatDateTime(usageUpdatedAt)}</p>
              <div className="gm-usage-list">
                {topMissionUsage.length === 0 ? (
                  <p className="gm-empty">Sem missões consumindo tokens no momento.</p>
                ) : (
                  topMissionUsage.map((item) => (
                    <article key={item.mission_id}>
                      <strong>{item.mission_id}</strong>
                      <span>{item.tokens.toLocaleString("pt-BR")} tokens</span>
                      <span>in/out: {item.input.toLocaleString("pt-BR")} / {item.output.toLocaleString("pt-BR")}</span>
                      <span>{formatUsd(item.usd)}</span>
                      <span>{item.count} lançamentos</span>
                      <span>BR {formatDateTime(item.last_at)}</span>
                    </article>
                  ))
                )}
              </div>
              <details className="gm-debug">
                <summary>Uso detalhado (diagnóstico)</summary>
                <pre>{usageText || "Sem dados de uso no momento..."}</pre>
              </details>
            </section>

            <section className="gm-card">
              <h2>Prospecção de Projeto</h2>
              <label>
                Quantidade de missões planejadas
                <input
                  type="number"
                  min={1}
                  step={1}
                  value={projectMissionCount}
                  onChange={(e) => setProjectMissionCount(Math.max(1, Math.trunc(Number(e.target.value || 1))))}
                />
              </label>
              <div className="gm-mini-metrics">
                <article>
                  <span>Base por missão (tokens)</span>
                  <strong>{Math.round(missionForecastTokens).toLocaleString("pt-BR")}</strong>
                </article>
                <article>
                  <span>Base por missão (USD)</span>
                  <strong>{formatUsd(missionForecastUsd)}</strong>
                </article>
                <article>
                  <span>Projeto estimado (tokens)</span>
                  <strong>{Math.round(missionForecastTokens * projectMissionCount).toLocaleString("pt-BR")}</strong>
                </article>
                <article>
                  <span>Projeto estimado (USD)</span>
                  <strong>{formatUsd(missionForecastUsd * projectMissionCount)}</strong>
                </article>
                <article>
                  <span>Projeto estimado (BRL)</span>
                  <strong>R$ {(missionForecastBrl * projectMissionCount).toFixed(2)}</strong>
                </article>
              </div>
              <p className="gm-meta">
                Base calculada na última prospecção da missão atual. Atualize em "Missões" com "Prospecção de Custo" para refinar.
              </p>
              <button type="button" onClick={() => goToSection("missoes")}>
                Revisar parâmetros da missão
              </button>
            </section>
          </div>
        ) : null}
      </section>

      {queueDetailsOpen && queueDetailsRow ? (
        <div className="gm-modal-backdrop" onClick={() => setQueueDetailsOpen(false)}>
          <section className="gm-modal" onClick={(event) => event.stopPropagation()}>
            <header>
              <h2>Detalhes da Missão</h2>
              <button type="button" onClick={() => setQueueDetailsOpen(false)}>Fechar</button>
            </header>
            {(() => {
              const row = queueDetailsRow;
              const queueId = String(row.queue_id || "").trim();
              const statusValue = String(row.status || "").toLowerCase() as QueueWorkflowStatus;
              const eta = estimateQueueEta(row, Date.now());
              return (
                <>
                  <div className="gm-detail-grid">
                    <article>
                      <span>Missão</span>
                      <strong>{row.mission_id || "-"}</strong>
                    </article>
                    <article>
                      <span>Queue ID</span>
                      <strong>{queueId || "-"}</strong>
                    </article>
                    <article>
                      <span>Executor</span>
                      <strong>{row.assignee || "-"}</strong>
                    </article>
                    <article>
                      <span>Prioridade</span>
                      <strong>{row.priority || "-"}</strong>
                    </article>
                    <article>
                      <span>Status</span>
                      <strong>{queueStatusLabel(String(row.status || ""))}</strong>
                    </article>
                    <article>
                      <span>ETA</span>
                      <strong>{eta.label}</strong>
                    </article>
                    <article>
                      <span>Criado</span>
                      <strong>{formatDateTime(String(row.created_at_utc || ""))}</strong>
                    </article>
                    <article>
                      <span>Atualizado</span>
                      <strong>{formatDateTime(String(row.updated_at_utc || ""))}</strong>
                    </article>
                  </div>
                  <article className="gm-manage-block">
                    <h3>{row.title || "Sem título"}</h3>
                    <p>{row.description || "Sem descrição detalhada para este item."}</p>
                  </article>
                  <div className="gm-detail-actions">
                    <button type="button" onClick={() => openMissionManageFromQueue(row)}>Abrir em Missões/Gestão</button>
                    {queueId && statusValue === "open" ? (
                      <button type="button" onClick={() => { void moveQueueCard(queueId, "in_progress"); setQueueDetailsOpen(false); }}>Iniciar</button>
                    ) : null}
                    {queueId && statusValue === "in_progress" ? (
                      <>
                        <button type="button" onClick={() => { void moveQueueCard(queueId, "paused_waiting_owner"); setQueueDetailsOpen(false); }}>Pausar</button>
                        <button type="button" onClick={() => { void moveQueueCard(queueId, "done"); setQueueDetailsOpen(false); }}>Concluir</button>
                      </>
                    ) : null}
                    {queueId && statusValue === "paused_waiting_owner" ? (
                      <button type="button" onClick={() => { void moveQueueCard(queueId, "in_progress"); setQueueDetailsOpen(false); }}>Retomar</button>
                    ) : null}
                    {queueId && statusValue === "done" ? (
                      <button type="button" onClick={() => { void moveQueueCard(queueId, "open"); setQueueDetailsOpen(false); }}>Reabrir</button>
                    ) : null}
                  </div>
                </>
              );
            })()}
          </section>
        </div>
      ) : null}

      {usersOpen ? (
        <div className="gm-modal-backdrop" onClick={() => setUsersOpen(false)}>
          <section className="gm-modal" onClick={(event) => event.stopPropagation()}>
            <header>
              <h2>Cadastro de Usuários</h2>
              <button type="button" onClick={() => setUsersOpen(false)}>Fechar</button>
            </header>
            <div className="gm-row">
              <label>
                Selecionar usuário
                <select value={selectedUser} onChange={(e) => selectUserForEdit(e.target.value)}>
                  <option value="">Novo usuário</option>
                  {usersRows.map((row) => {
                    const username = String(row.username || "").trim();
                    if (!username) return null;
                    return (
                      <option key={`select-${username}`} value={username}>
                        {username}
                      </option>
                    );
                  })}
                </select>
              </label>
              <label>
                Perfil
                <select value={userForm.role} onChange={(e) => setUserForm({ ...userForm, role: e.target.value })}>
                  <option value="admin">admin</option>
                  <option value="engineer">engineer</option>
                  <option value="viewer">viewer</option>
                </select>
              </label>
            </div>
            <div className="gm-row">
              <label>
                Usuário
                <input
                  value={userForm.username}
                  onChange={(e) => setUserForm({ ...userForm, username: e.target.value })}
                  placeholder="engenheiro.01"
                />
              </label>
              <div />
            </div>
            <label>
              Senha
              <input
                type="password"
                value={userForm.password}
                onChange={(e) => setUserForm({ ...userForm, password: e.target.value })}
                placeholder="mínimo 8 caracteres"
              />
            </label>
            <div className="gm-row">
              <button className="gm-primary" type="button" onClick={createUser}>
                {selectedUser ? "Atualizar usuário" : "Cadastrar usuário"}
              </button>
              <button
                type="button"
                onClick={async () => {
                  await loadUsers();
                  setUserStatus("Lista atualizada.");
                }}
              >
                Atualizar lista
              </button>
            </div>
            <p className="gm-meta">Última sincronização BR (São Paulo): {formatDateTime(usersUpdatedAt)}</p>
            <p className="gm-meta">Status: {userStatus || "idle"}</p>
            <div className="gm-queue-list">
              {usersRows.length === 0 ? (
                <p className="gm-empty">Sem usuários cadastrados.</p>
              ) : (
                usersRows.map((row) => (
                  <article key={`${row.username || "user"}-${row.updated_at_utc || ""}`}>
                    <strong>{row.username || "-"}</strong>
                    <span>Perfil: {row.role || "-"}</span>
                    <span>Ativo: {row.active === false ? "não" : "sim"}</span>
                    <small>Atualizado: {formatDateTime(String(row.updated_at_utc || ""))}</small>
                    <button
                      type="button"
                      onClick={() => selectUserForEdit(String(row.username || ""))}
                    >
                      Editar
                    </button>
                  </article>
                ))
              )}
            </div>
          </section>
        </div>
      ) : null}
    </main>
  );
}
