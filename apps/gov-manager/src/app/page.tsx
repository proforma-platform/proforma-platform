'use client';

import { type KeyboardEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CHAT_TRANSCRIPTION_LANGUAGES,
  CHAT_TRANSCRIPTION_MAX_BYTES,
  CHAT_TRANSCRIPTION_MAX_DURATION_SEC,
  DEFAULT_CHAT_TRANSCRIPTION_LANGUAGE,
  type ChatTranscriptionLanguageId
} from "../core/chat-transcription";
import {
  ADMIN_COMMAND_ACTIONS,
  defaultPolicy,
  KANBAN_COLUMNS,
  MISSION_ID_DIGITS,
  MISSION_ID_PREFIX,
  MISSION_INTAKE_AGENT,
  PRINCIPAL_ARCHITECT_TARGET,
  SECTION_ITEMS,
  SUPPORT_REPORTED_SUFFIX
} from "./gov/constants";
import {
  formatBytes,
  replyCountLabel
} from "./gov/formatters";
import type {
  AgentStatusRow,
  AgentVitalityLevel,
  AuditEventRow,
  BotStatusRow,
  ChatRow,
  ChatUiAction,
  ExecutionEventRow,
  ExecutionSessionRow,
  GovUserRow,
  MemoryChunkRow,
  MissionAssetRow,
  MissionBoardMission,
  MissionBoardPackage,
  MissionManageConfirmAction,
  MissionPart,
  MissionsTab,
  OfficeAgentCard,
  OfficeHierarchyRow,
  PartExecutor,
  PartPriority,
  PresenceAssigneeRow,
  PresenceIdentityRow,
  PresenceOfficeRow,
  PromptEntry,
  QueueEtaEstimate,
  QueueEtaConfidence,
  QueueRow,
  QueueUpdateExtras,
  QueueWorkflowStatus,
  ReviewerGuardApproval,
  Section,
  SessionInfo,
  SupportErrorReportInput,
  Theme,
  TokenPolicy,
  TopNotice,
  UsageRow,
  UsageSummary
} from "./gov/types";

function isAdminCommandAction(action: string): boolean {
  return ADMIN_COMMAND_ACTIONS.has(String(action || "").toUpperCase() as ChatUiAction);
}

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

async function fetchJsonWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs = 15_000
): Promise<{ response: Response; payload: Record<string, unknown> }> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), Math.max(1_000, timeoutMs));
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    const raw = await response.text();
    try {
      const parsed = JSON.parse(raw) as unknown;
      const payload = parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
      return { response, payload };
    } catch {
      return { response, payload: { status: "invalid_response", raw: raw.slice(0, 500) } };
    }
  } finally {
    clearTimeout(timeoutId);
  }
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

function formatDateOnly(value: string): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeZone: "America/Sao_Paulo"
  }).format(date);
}

function formatAuditStatePreview(raw: string): string {
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

function compactText(value: string, max = 180): string {
  const clean = String(value || "").replace(/\s+/g, " ").trim();
  if (!clean) return "";
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max - 1)}…`;
}

function normalizeChatMatch(value: string): string {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
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
  const raw = String(value || "").trim();
  const normalized = raw.toUpperCase().replace(/_/g, "-");
  if (!normalized) return "-";
  const aliasMap: Record<string, string> = {
    [PRINCIPAL_ARCHITECT_TARGET]: "Principal Architect",
    "PRINCIPAL-ARCHITECT": "Principal Architect",
    "P-ARQ": "Principal Architect",
    "PLANNER": "Planner Agent",
    "PLANNER-AGENT": "Planner Agent",
    "STAFF": "Staff Engineer",
    "STAFF-ENGINEER": "Staff Engineer",
    "ORCHESTRATOR": "Orchestrator Agent",
    "CPP": "CPP",
    "CPP-IA": "IC Executor",
    "IC-EXECUTOR": "IC Executor",
    "REVIEWER": "Reviewer Agent",
    "ADMIN": "Reviewer Agent",
    "OWNER": "Owner"
  };
  const alias = aliasMap[normalized];
  if (alias) return alias;
  const numericSuffix = normalized.match(/(\d{4,})$/)?.[1] || "";
  const withSuffix = (base: string) => (numericSuffix ? `${base} #${numericSuffix}` : base);
  if (normalized.includes("PRINCIPAL") || normalized.includes("P-ARQ")) return withSuffix("Principal Architect");
  if (normalized.includes("PLANNER")) return withSuffix("Planner Agent");
  if (normalized.includes("CPP-IA")) return withSuffix("IC Executor");
  if (normalized.includes("CPP")) return withSuffix("CPP");
  if (normalized.includes("STAFF")) return withSuffix("Staff Engineer");
  if (normalized.includes("REVIEWER") || normalized.includes("ADMIN")) return withSuffix("Reviewer Agent");
  if (normalized.includes("OWNER")) return withSuffix("Owner");
  return raw;
}

function formatRoleAlias(value: string): string {
  const raw = String(value || "").trim();
  const normalized = raw.toUpperCase().replace(/_/g, "-");
  if (!normalized) return "-";
  if (normalized === "PLANNER" || normalized === "PLANNER-AGENT") return "Planner Agent";
  if (normalized === "STAFF") return "Staff Engineer";
  if (normalized === "STAFF-ENGINEER") return "Staff Engineer";
  if (normalized === "ORCHESTRATOR") return "Orchestrator Agent";
  if (normalized === "CPP") return "CPP";
  if (normalized === "CPP-IA") return "IC Executor";
  if (normalized === "IC-EXECUTOR") return "IC Executor";
  if (normalized === PRINCIPAL_ARCHITECT_TARGET || normalized === "P-ARQ") return "Principal Architect";
  if (normalized === "REVIEWER") return "Reviewer Agent";
  if (normalized === "ADMIN") return "Reviewer Agent";
  return raw;
}

function officeLabel(value: string): string {
  const clean = String(value || "").trim().toUpperCase();
  if (clean === "P-ARQ") return "Office of Principal Architect";
  if (clean === "STAFF") return "Staff Engineering Office";
  if (clean === "CPP") return "Orchestration Office";
  if (clean === "CPP-IA") return "IC Execution Office";
  if (clean === "REVIEWER" || clean === "ADMIN") return "Review Office";
  if (clean === "OWNER") return "Executive Office";
  if (!clean) return "-";
  return clean
    .split(/[-_]/g)
    .filter(Boolean)
    .map((part) => part.slice(0, 1) + part.slice(1).toLowerCase())
    .join(" ");
}

function officeRoleAllowed(officeIdRaw: string, roleRaw: string): boolean {
  const officeId = String(officeIdRaw || "").trim().toUpperCase();
  const role = normalizeRoleKey(roleRaw);
  if (!officeId || !role) return false;

  if (officeId === "P-ARQ") {
    return role === PRINCIPAL_ARCHITECT_TARGET || role === "STAFF" || role === "REVIEWER" || role === "OWNER";
  }
  if (officeId === "STAFF") {
    return role === "STAFF" || role === "CPP";
  }
  if (officeId === "CPP") {
    return role === "CPP" || role === "CPP-IA";
  }
  if (officeId === "CPP-IA") {
    return role === "CPP-IA";
  }

  return true;
}

function officeRolePolicyLabel(officeIdRaw: string): string {
  const officeId = String(officeIdRaw || "").trim().toUpperCase();
  if (officeId === "P-ARQ") return "Principal Architect / Staff / Reviewer / Owner";
  if (officeId === "STAFF") return "Staff Engineer / CPP";
  if (officeId === "CPP") return "CPP / IC Executor";
  if (officeId === "CPP-IA") return "IC Executor";
  return "Cargo compatível";
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function normalizeRoleKey(value: string): string {
  const normalized = String(value || "").trim().toUpperCase().replace(/_/g, "-");
  if (!normalized) return "";
  if (normalized.includes("CPP-IA") || normalized.includes("IC-EXECUTOR")) return "CPP-IA";
  if (normalized.includes("CPP") || normalized.includes("ORCHESTRATOR")) return "CPP";
  if (normalized.includes("STAFF")) return "STAFF";
  if (normalized.includes("PRINCIPAL") || normalized.includes("P-ARQ")) return PRINCIPAL_ARCHITECT_TARGET;
  if (normalized.includes("REVIEWER") || normalized.includes("ADMIN")) return "REVIEWER";
  if (normalized.includes("OWNER")) return "OWNER";
  return normalized;
}

function roleHierarchyWeight(value: string): number {
  const role = normalizeRoleKey(value);
  if (role === PRINCIPAL_ARCHITECT_TARGET) return 0;
  if (role === "STAFF") return 1;
  if (role === "CPP") return 2;
  if (role === "CPP-IA") return 3;
  if (role === "REVIEWER") return 4;
  if (role === "OWNER") return 5;
  return 9;
}

function vitalityLevel(score: number): AgentVitalityLevel {
  if (score >= 80) return "saudavel";
  if (score >= 60) return "atencao";
  if (score >= 40) return "risco";
  return "perigo";
}

function vitalityLabel(level: AgentVitalityLevel): string {
  if (level === "saudavel") return "Saudável";
  if (level === "atencao") return "Atenção";
  if (level === "risco") return "Risco";
  return "Perigo";
}

function agentStateLabel(stateRaw: string): string {
  const state = String(stateRaw || "").trim().toLowerCase();
  if (state === "running") return "Em execução";
  if (state === "idle") return "Disponível";
  if (state === "stale") return "Instável";
  if (state === "down") return "Off-line";
  return "Indefinido";
}

function sanitizeSkillToken(value: string): string {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function skillMatchRatio(capabilitiesRaw: string[], demandTextRaw: string, demandOpen: number, demandInProgress: number): number {
  const capabilities = capabilitiesRaw
    .map((item) => sanitizeSkillToken(item))
    .filter(Boolean);
  if (capabilities.length === 0) return 0.2;

  const demandText = sanitizeSkillToken(demandTextRaw);
  let hits = 0;

  for (const capability of capabilities) {
    let matched = false;
    if (demandText && demandText.includes(capability)) matched = true;
    if (!matched && capability.includes("queue") && demandOpen > 0) matched = true;
    if (!matched && (capability.includes("execute") || capability.includes("build") || capability.includes("run")) && demandInProgress > 0) matched = true;
    if (!matched && (capability.includes("review") || capability.includes("approve")) && (demandOpen + demandInProgress) > 0) matched = true;
    if (!matched && (capability.includes("plan") || capability.includes("scope")) && demandOpen > 0) matched = true;
    if (matched) hits += 1;
  }

  return clampNumber(hits / capabilities.length, 0, 1);
}

function minutesSince(value: string, nowEpoch: number): number {
  const epoch = Date.parse(String(value || "").trim());
  if (!Number.isFinite(epoch)) return 24 * 60;
  return Math.max(0, Math.round((nowEpoch - epoch) / 60000));
}

function formatMinutesAge(value: number): string {
  const safe = Math.max(0, Math.round(value));
  if (safe < 60) return `${safe} min`;
  const hours = Math.floor(safe / 60);
  const mins = safe % 60;
  if (hours < 24) return `${hours}h ${mins}m`;
  const days = Math.floor(hours / 24);
  const remHours = hours % 24;
  return `${days}d ${remHours}h`;
}

function heartbeatAgeMinutes(value: string): number | null {
  const raw = String(value || "").trim();
  if (!raw) return null;
  const parsed = Date.parse(raw);
  if (!Number.isFinite(parsed)) return null;
  return Math.max(0, Math.round((Date.now() - parsed) / 60000));
}

function formatExecutionMonitorLabel(session: ExecutionSessionRow | null, event: ExecutionEventRow | null): string {
  if (!session) return "Monitor: sem sessão ativa vinculada";
  const sessionStatus = String(session.status || "online").trim().toUpperCase();
  const eventType = String(event?.event_type || "").trim().toLowerCase();
  const eventMessage = String(event?.message || "").trim();
  const ageMinutes = heartbeatAgeMinutes(String(session.last_heartbeat_at_utc || ""));
  const heartbeatLabel = session.last_heartbeat_at_utc
    ? `Último heartbeat: ${formatDateTime(String(session.last_heartbeat_at_utc || ""))}`
    : "Último heartbeat: sem registro";
  if (eventType === "blocked") {
    return `Monitor: ${eventMessage || "executor bloqueado"} · aguardando sinal · ${heartbeatLabel}`;
  }
  if (eventType === "warning") {
    return `Monitor: ${eventMessage || "executor reportou aviso"} · ${heartbeatLabel}`;
  }
  if (ageMinutes !== null && ageMinutes >= 10) {
    return `Monitor: sem progresso novo · sessão ${sessionStatus} · ${heartbeatLabel}`;
  }
  if (eventType === "progress" || eventType === "heartbeat" || eventType === "start_ack") {
    return `Monitor: ${eventMessage || "execução ativa"} · sessão ${sessionStatus} · ${heartbeatLabel}`;
  }
  return `Monitor: ${eventMessage || "missão recebida"} · sessão ${sessionStatus} · ${heartbeatLabel}`;
}

function sessionLooksOnline(statusRaw: string): boolean {
  const status = String(statusRaw || "").trim().toLowerCase();
  return status === "online" || status === "busy" || status === "registered" || status === "waiting";
}

function inferRoleFromIdentity(identityRaw: string): string {
  const identity = String(identityRaw || "").trim().toLowerCase();
  if (!identity) return "WORKER";
  if (identity.includes("principal")) return PRINCIPAL_ARCHITECT_TARGET;
  if (identity.includes("cpp-ia")) return "CPP-IA";
  if (identity.includes("cpp")) return "CPP";
  if (identity.includes("staff")) return "STAFF";
  return "WORKER";
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

function parseRequestAndNotes(raw: string): { requestText: string; notesText: string } {
  const text = String(raw || "").trim();
  if (!text) return { requestText: "", notesText: "" };
  const requestMatch = text.match(/Solicitação:\s*([\s\S]*?)(?:\n\s*Notas:\s*|$)/i);
  const notesMatch = text.match(/\n\s*Notas:\s*([\s\S]*)$/i);
  if (requestMatch || notesMatch) {
    return {
      requestText: String(requestMatch?.[1] || "").trim(),
      notesText: String(notesMatch?.[1] || "").trim()
    };
  }
  return { requestText: "", notesText: text };
}

function composeCompactMissionUdn(missionId: string, objective: string): string {
  const missionCode = missionShortToken(missionId || "00001");
  const mu = sanitizeMissionInline(objective || "Missão registrada no GOV-HUB.") || "Missão registrada no GOV-HUB.";
  return `!MIS|${missionCode}\n#μ:${mu}`;
}

function isLowSignalRequest(value: string): boolean {
  const normalized = String(value || "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized) return true;
  if (normalized.length < 12) return true;
  if (normalized.startsWith("resultado factual |")) return true;
  if (normalized.startsWith("missao_recebida |")) return true;
  if (normalized.includes(" queue=") && normalized.includes(" session=") && normalized.includes(" trace=") && normalized.includes(" run=")) return true;
  return (
    normalized === "classificar escopo e preparar distribuicao inicial." ||
    normalized === "classificar escopo e preparar distribuicao inicial"
  );
}

function mergeMissionUdnWithRequest(udnText: string, missionId: string, requestText: string): string {
  const request = sanitizeMissionInline(String(requestText || "").trim());
  if (!request) return String(udnText || "").trim();
  const base = String(udnText || "").trim();
  if (!base) return composeCompactMissionUdn(missionId, request);
  const lines = base.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const hasMu = lines.some((line) => /^#μ:/i.test(line));
  const next = lines.map((line) => {
    if (!/^#μ:/i.test(line)) return line;
    const current = line.replace(/^#μ:\s*/i, "").trim();
    if (!isLowSignalRequest(current)) return line;
    return `#μ:${request}`;
  });
  if (!hasMu) next.push(`#μ:${request}`);
  return next.join("\n");
}

function extractUdnMu(rawInput: string): string {
  const normalized = normalizeTdvTags(String(rawInput || "")).trim();
  const idx = normalized.indexOf("!MIS|");
  const text = idx >= 0 ? normalized.slice(idx).trim() : normalized;
  if (!text) return "";
  const match = text.match(/#μ:\s*([^\n]+)/i);
  return String(match?.[1] || "").trim();
}

function extractUdnPartGoals(rawInput: string): string[] {
  const normalized = normalizeTdvTags(String(rawInput || "")).trim();
  const idx = normalized.indexOf("!MIS|");
  const text = idx >= 0 ? normalized.slice(idx).trim() : normalized;
  if (!text) return [];
  const goals = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => /^#part:/i.test(line))
    .map((line) => {
      const body = line.replace(/^#part:/i, "").trim();
      const fields = body.split(";").map((field) => field.trim());
      const goalField = fields.find((field) => /^goal=/i.test(field));
      return String(goalField || "")
        .replace(/^goal=/i, "")
        .trim();
    })
    .filter(Boolean);
  return Array.from(new Set(goals));
}

function buildPrimaryRequestFromUdn(rawInput: string): string {
  const goals = extractUdnPartGoals(rawInput);
  if (goals.length > 0) return goals.join("\n");
  return extractUdnMu(rawInput);
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

function queuePriorityAccent(priority: string): string {
  const baseMin = queuePriorityBaseMinutes(priority);
  if (baseMin <= 25) return "#B83847";
  if (baseMin <= 45) return "#F58634";
  if (baseMin <= 75) return "#6B809B";
  return "#00A859";
}

function queueEtaAdjustmentMinutes(row: QueueRow): number {
  const raw = Number(row.eta_adjustment_min ?? 0);
  if (!Number.isFinite(raw)) return 0;
  return Math.max(-120, Math.min(360, Math.trunc(raw)));
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
  if (normalized === "staff_validation_gate") return "Gate Staff";
  if (normalized === "open") return "A fazer";
  if (normalized === "in_progress") return "Em progresso";
  if (normalized === "paused_waiting_owner") return "Pausada";
  if (normalized === "done") return "Concluída";
  return "Indefinido";
}

function queueStatusLedMeta(status: string): { tone: "open" | "progress" | "paused" | "done" | "unknown"; label: string } {
  const normalized = String(status || "").trim().toLowerCase();
  if (normalized === "staff_validation_gate") return { tone: "paused", label: "Validação Staff" };
  if (normalized === "open") return { tone: "open", label: "Aguardando início" };
  if (normalized === "in_progress") return { tone: "progress", label: "Executando" };
  if (normalized === "paused_waiting_owner") return { tone: "paused", label: "Pausada" };
  if (normalized === "done") return { tone: "done", label: "Concluída" };
  return { tone: "unknown", label: "Indefinido" };
}

function queueTransitionReasonLabel(row: QueueRow): string {
  const msg = String(row.last_transition_reason_message || "").trim();
  if (msg) return msg;
  const code = String(row.last_transition_reason_code || "").trim().toUpperCase();
  if (!code) return "";
  return code
    .split("_")
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function sameIdentityLabel(left: string, right: string): boolean {
  const normalize = (value: string) =>
    String(value || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "");
  const a = normalize(left);
  const b = normalize(right);
  return Boolean(a && b && a === b);
}

function queueExecutionProgressPercent(row: QueueRow, event?: ExecutionEventRow | null): number {
  const status = String(row.status || "").trim().toLowerCase();
  if (status === "done") return 100;
  if (status !== "in_progress") return 0;
  const eventRaw = Number(event?.progress_pct);
  if (Number.isFinite(eventRaw)) {
    return clampNumber(Math.trunc(eventRaw), 0, 100);
  }
  const raw = Number(row.execution_progress_pct);
  if (!Number.isFinite(raw)) return 0;
  return clampNumber(Math.trunc(raw), 0, 100);
}

function queueLiveProgressPercent(row: QueueRow, nowEpoch: number, event?: ExecutionEventRow | null): number {
  const base = queueExecutionProgressPercent(row, event);
  if (base >= 100) return 100;
  const status = String(row.status || "").trim().toLowerCase();
  if (status !== "in_progress") return base;

  const baselineMin = Math.max(10, Math.round(queuePriorityBaseMinutes(String(row.priority || "")) * queueAssigneeFactor(String(row.assignee || ""))));
  const startedEpoch = toEpoch(row.updated_at_utc) ?? toEpoch(row.created_at_utc);
  if (!startedEpoch) return base;
  const elapsedMin = Math.max(0, (nowEpoch - startedEpoch) / 60000);
  const estimated = clampNumber(Math.trunc((elapsedMin / baselineMin) * 100), 3, 95);
  return Math.max(base, estimated);
}

function estimateQueueEta(row: QueueRow, nowEpoch: number): QueueEtaEstimate {
  const status = String(row.status || "").trim().toLowerCase();
  if (status === "done") return { label: "Concluída", confidence: "alta", deviation_min: 0 };
  if (status === "paused_waiting_owner") return { label: "Pausada", confidence: "baixa", deviation_min: 0 };

  const baselineBase = Math.round(queuePriorityBaseMinutes(String(row.priority || "")) * queueAssigneeFactor(String(row.assignee || "")));
  const baseline = Math.max(10, baselineBase + queueEtaAdjustmentMinutes(row));
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
  mission: { id: string; target: string; notes: string; branch: string; agent_id: string };
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
    .replace(/[\u0300-\u036f]/g, "")
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

function promptReviewerGuardApproval(): ReviewerGuardApproval | null {
  const reviewerByRaw = window.prompt("Reviewer Guard (ID/usuário):", "");
  if (reviewerByRaw === null) return null;
  const reviewerBy = String(reviewerByRaw || "").trim();
  if (!reviewerBy) return null;

  const reviewerNoteRaw = window.prompt("Parecer do Reviewer Guard (mínimo 8 caracteres):", "");
  if (reviewerNoteRaw === null) return null;
  const reviewerNote = String(reviewerNoteRaw || "").trim();
  if (reviewerNote.length < 8) return null;

  return {
    reviewer_guard_approved: true,
    reviewer_guard_by: reviewerBy,
    reviewer_guard_note: reviewerNote
  };
}

export default function GovManagerPage() {
  const [theme, setTheme] = useState<Theme>("dark");
  const [section, setSection] = useState<Section>("visao");
  const [missionsTab, setMissionsTab] = useState<MissionsTab>("cadastro");

  const [mission, setMission] = useState({ id: "", target: "", notes: "", branch: "main", agent_id: MISSION_INTAKE_AGENT });
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
  const [agentsText, setAgentsText] = useState("");
  const [agentsUpdatedAt, setAgentsUpdatedAt] = useState("");
  const [presenceText, setPresenceText] = useState("");
  const [presenceUpdatedAt, setPresenceUpdatedAt] = useState("");
  const [sessionsText, setSessionsText] = useState("");
  const [sessionsUpdatedAt, setSessionsUpdatedAt] = useState("");
  const [officeText, setOfficeText] = useState("");
  const [officeUpdatedAt, setOfficeUpdatedAt] = useState("");
  const [officeAuditText, setOfficeAuditText] = useState("");
  const [officeAuditUpdatedAt, setOfficeAuditUpdatedAt] = useState("");
  const [officeNotice, setOfficeNotice] = useState("");
  const [officeEdit, setOfficeEdit] = useState({
    office_id: "P-ARQ",
    leader_id: "",
    subordinate_ids: [] as string[]
  });
  const [officeDragAgentId, setOfficeDragAgentId] = useState("");
  const [officeOnboarding, setOfficeOnboarding] = useState(false);
  const [officeOnboard, setOfficeOnboard] = useState({
    agent_id: "",
    role: "CPP",
    office_id: "CPP",
    priority: "P1",
    notes: "",
    owner_ack_required: true
  });
  const [queueLoading, setQueueLoading] = useState(false);
  const [queueRefreshSec, setQueueRefreshSec] = useState(30);
  const [queueRefreshNonce, setQueueRefreshNonce] = useState(0);
  const [liveNowEpoch, setLiveNowEpoch] = useState<number>(() => Date.now());
  const [queueNotice, setQueueNotice] = useState("");
  const [officeContextCollapsed, setOfficeContextCollapsed] = useState(false);
  const [officeInsightsCollapsed, setOfficeInsightsCollapsed] = useState(true);
  const [officeCatalogCollapsed, setOfficeCatalogCollapsed] = useState(true);
  const [officeAuditCollapsed, setOfficeAuditCollapsed] = useState(true);
  const [orchestrationContextCollapsed, setOrchestrationContextCollapsed] = useState(true);
  const [memoryText, setMemoryText] = useState("");
  const [memoryUpdatedAt, setMemoryUpdatedAt] = useState("");
  const [memoryNotice, setMemoryNotice] = useState("");
  const [memoryQuery, setMemoryQuery] = useState("");
  const [memoryNamespace, setMemoryNamespace] = useState("gov_principal_architect");
  const [memoryMissionId, setMemoryMissionId] = useState("");
  const [memoryRole, setMemoryRole] = useState("");
  const [memoryTags, setMemoryTags] = useState("");
  const [memoryStoreTopic, setMemoryStoreTopic] = useState("");
  const [memoryStoreSummary, setMemoryStoreSummary] = useState("");
  const [memoryStoreContent, setMemoryStoreContent] = useState("");
  const [memoryRefreshSec, setMemoryRefreshSec] = useState(60);
  const [memoryRefreshNonce, setMemoryRefreshNonce] = useState(0);
  const [officeCardInsightsOpen, setOfficeCardInsightsOpen] = useState<Record<string, boolean>>({});
  const [queueFocusedId, setQueueFocusedId] = useState("");
  const [queueAssigneeFilter, setQueueAssigneeFilter] = useState<"all" | PartExecutor>("all");
  const [queuePriorityFilter, setQueuePriorityFilter] = useState<"all" | "P0" | "P1" | "P2" | "P3">("all");
  const [queueMissionFilter, setQueueMissionFilter] = useState("");
  const [queueDragId, setQueueDragId] = useState("");
  const [queueReasonOpenId, setQueueReasonOpenId] = useState("");
  const [queueDetailsOpen, setQueueDetailsOpen] = useState(false);
  const [queueDetailsRow, setQueueDetailsRow] = useState<QueueRow | null>(null);
  const [missionUdnById, setMissionUdnById] = useState<Record<string, string>>({});
  const [missionAssets, setMissionAssets] = useState<MissionAssetRow[]>([]);
  const [missionAssetBusy, setMissionAssetBusy] = useState(false);
  const [missionAssetNotice, setMissionAssetNotice] = useState("");
  const [missionAssetPreviewId, setMissionAssetPreviewId] = useState("");
  const [missionAssetsOpen, setMissionAssetsOpen] = useState(false);
  const [missionManageText, setMissionManageText] = useState("");
  const [missionManageUpdatedAt, setMissionManageUpdatedAt] = useState("");
  const [missionManageNotice, setMissionManageNotice] = useState("");
  const [missionManageBusy, setMissionManageBusy] = useState<"" | "group" | "edit" | "execution">("");
  const [missionManageConfirm, setMissionManageConfirm] = useState<{
    action: MissionManageConfirmAction;
    title: string;
    summary: string;
  } | null>(null);
  const [groupPackageId, setGroupPackageId] = useState("");
  const [groupMissionIdsRaw, setGroupMissionIdsRaw] = useState("");
  const [groupNote, setGroupNote] = useState("");
  const [manageEdit, setManageEdit] = useState({
    mission_id: "",
    objective: "",
    assignee: "STAFF",
    priority: "P1",
    request_text: "",
    notes: ""
  });
  const [manageExecution, setManageExecution] = useState({ mission_id: "", title: "", description: "", assignee: "CPP", priority: "P1" });
  const [chatText, setChatText] = useState("");
  const [chatUpdatedAt, setChatUpdatedAt] = useState("");
  const [chatRefreshSec, setChatRefreshSec] = useState(5);
  const [chatRefreshNonce, setChatRefreshNonce] = useState(0);
  const [chatAction, setChatAction] = useState<ChatUiAction>("MSG");
  const [chatTarget, setChatTarget] = useState("CPP");
  const [chatMessage, setChatMessage] = useState("");
  const [chatNotice, setChatNotice] = useState("");
  const [chatCopyNotice, setChatCopyNotice] = useState("");
  const [chatComposerToolsOpen, setChatComposerToolsOpen] = useState(false);
  const [chatTranscriptionLanguage, setChatTranscriptionLanguage] = useState<ChatTranscriptionLanguageId>(DEFAULT_CHAT_TRANSCRIPTION_LANGUAGE);
  const [chatTranscriptionState, setChatTranscriptionState] = useState<"idle" | "recording" | "uploading">("idle");
  const [chatTranscriptionDurationSec, setChatTranscriptionDurationSec] = useState(0);
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
  const usagePollLockRef = useRef(false);
  const botPollLockRef = useRef(false);
  const queuePollLockRef = useRef(false);
  const agentsPollLockRef = useRef(false);
  const memoryPollLockRef = useRef(false);
  const presencePollLockRef = useRef(false);
  const sessionsPollLockRef = useRef(false);
  const officeAuditPollLockRef = useRef(false);
  const officePollLockRef = useRef(false);
  const chatPollLockRef = useRef(false);
  const chatMessageRef = useRef<HTMLTextAreaElement | null>(null);
  const chatMediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chatMediaStreamRef = useRef<MediaStream | null>(null);
  const chatRecordingStartedAtRef = useRef(0);
  const chatRecordingChunksRef = useRef<Blob[]>([]);
  const chatCopyNoticeTimerRef = useRef<number | null>(null);

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
    loadOfficeHierarchy();
  }, []);

  useEffect(() => () => {
    stopChatRecordingStream();
    if (chatCopyNoticeTimerRef.current) window.clearTimeout(chatCopyNoticeTimerRef.current);
  }, []);

  useEffect(() => {
    if (!createdBy) return;
    let active = true;

    const pullUsage = async () => {
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
      if (usagePollLockRef.current) return;
      usagePollLockRef.current = true;
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
      } finally {
        usagePollLockRef.current = false;
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
    if (section !== "memoria") return;
    let active = true;
    const pullMemory = async () => {
      if (!active) return;
      await loadMemory({ silent: true });
    };
    void pullMemory();
    const interval = window.setInterval(pullMemory, Math.max(30, memoryRefreshSec) * 1000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [memoryRefreshNonce, memoryRefreshSec, section]);

  useEffect(() => {
    let active = true;

    const pullBotStatus = async () => {
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
      if (botPollLockRef.current) return;
      botPollLockRef.current = true;
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
      } finally {
        botPollLockRef.current = false;
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
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
      if (queuePollLockRef.current) return;
      queuePollLockRef.current = true;
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
        queuePollLockRef.current = false;
        setQueueLoading(false);
      }
    },
    [reportSupportError]
  );

  useEffect(() => {
    const tick = window.setInterval(() => setLiveNowEpoch(Date.now()), 1000);
    return () => window.clearInterval(tick);
  }, []);

  useEffect(() => {
    let active = true;
    const pullQueue = async () => {
      if (!active) return;
      await pullQueueNow({ silent: true });
    };

    pullQueue();
    const interval = window.setInterval(pullQueue, Math.max(5, queueRefreshSec) * 1000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [pullQueueNow, queueRefreshNonce, queueRefreshSec]);

  useEffect(() => {
    let active = true;
    const pullAgents = async () => {
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
      if (agentsPollLockRef.current) return;
      agentsPollLockRef.current = true;
      try {
        const response = await fetch("/api/govhub/operations/agents", { cache: "no-store" });
        const payload = await response.json();
        if (active) {
          setAgentsText(JSON.stringify(payload, null, 2));
          setAgentsUpdatedAt(new Date().toISOString());
        }
      } catch {
        if (active) {
          setAgentsText(JSON.stringify({ status: "error", error_code: "AGENTS_FETCH_FAILED" }, null, 2));
          setAgentsUpdatedAt(new Date().toISOString());
        }
      } finally {
        agentsPollLockRef.current = false;
      }
    };

    pullAgents();
    const interval = window.setInterval(pullAgents, Math.max(10, queueRefreshSec) * 1000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [queueRefreshNonce, queueRefreshSec]);

  useEffect(() => {
    let active = true;
    const pullPresence = async () => {
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
      if (presencePollLockRef.current) return;
      presencePollLockRef.current = true;
      try {
        const response = await fetch("/api/govhub/operations/presence", { cache: "no-store" });
        const payload = await response.json();
        if (active) {
          setPresenceText(JSON.stringify(payload, null, 2));
          setPresenceUpdatedAt(new Date().toISOString());
        }
      } catch {
        if (active) {
          setPresenceText(JSON.stringify({ status: "error", error_code: "PRESENCE_FETCH_FAILED" }, null, 2));
          setPresenceUpdatedAt(new Date().toISOString());
        }
      } finally {
        presencePollLockRef.current = false;
      }
    };

    pullPresence();
    const interval = window.setInterval(pullPresence, Math.max(15, queueRefreshSec) * 1000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [queueRefreshNonce, queueRefreshSec]);

  useEffect(() => {
    let active = true;
    const pullSessions = async () => {
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
      if (sessionsPollLockRef.current) return;
      sessionsPollLockRef.current = true;
      try {
        const response = await fetch("/api/govhub/operations/sessions", { cache: "no-store" });
        const payload = await response.json();
        if (active) {
          setSessionsText(JSON.stringify(payload, null, 2));
          setSessionsUpdatedAt(new Date().toISOString());
        }
      } catch {
        if (active) {
          setSessionsText(JSON.stringify({ status: "error", error_code: "SESSIONS_FETCH_FAILED" }, null, 2));
          setSessionsUpdatedAt(new Date().toISOString());
        }
      } finally {
        sessionsPollLockRef.current = false;
      }
    };

    pullSessions();
    const interval = window.setInterval(pullSessions, Math.max(5, queueRefreshSec) * 1000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [queueRefreshNonce, queueRefreshSec]);

  useEffect(() => {
    let active = true;
    const pullOfficeAudit = async () => {
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
      if (officeAuditPollLockRef.current) return;
      officeAuditPollLockRef.current = true;
      try {
        const response = await fetch("/api/govhub/operations/audit?limit=30&action=office", { cache: "no-store" });
        const payload = await response.json();
        if (active) {
          setOfficeAuditText(JSON.stringify(payload, null, 2));
          setOfficeAuditUpdatedAt(new Date().toISOString());
        }
      } catch {
        if (active) {
          setOfficeAuditText(JSON.stringify({ status: "error", error_code: "OFFICE_AUDIT_FETCH_FAILED" }, null, 2));
          setOfficeAuditUpdatedAt(new Date().toISOString());
        }
      } finally {
        officeAuditPollLockRef.current = false;
      }
    };

    pullOfficeAudit();
    const interval = window.setInterval(pullOfficeAudit, Math.max(20, queueRefreshSec) * 1000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [queueRefreshNonce, queueRefreshSec]);

  useEffect(() => {
    let active = true;
    const pullOffice = async () => {
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
      if (officePollLockRef.current) return;
      officePollLockRef.current = true;
      try {
        const response = await fetch("/api/govhub/operations/office", { cache: "no-store" });
        const payload = await response.json();
        if (active) {
          setOfficeText(JSON.stringify(payload, null, 2));
          setOfficeUpdatedAt(new Date().toISOString());
        }
      } catch {
        if (active) {
          setOfficeText(JSON.stringify({ status: "error", error_code: "OFFICE_FETCH_FAILED" }, null, 2));
          setOfficeUpdatedAt(new Date().toISOString());
        }
      } finally {
        officePollLockRef.current = false;
      }
    };

    pullOffice();
    const interval = window.setInterval(pullOffice, Math.max(20, queueRefreshSec) * 1000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [queueRefreshNonce, queueRefreshSec]);

  useEffect(() => {
    let active = true;
    const pullChat = async () => {
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
      if (chatPollLockRef.current) return;
      chatPollLockRef.current = true;
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
      } finally {
        chatPollLockRef.current = false;
      }
    };

    pullChat();
    const interval = window.setInterval(pullChat, Math.max(5, chatRefreshSec) * 1000);
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

  useEffect(() => {
    if (!queueDetailsOpen || !queueDetailsRow) return;
    const missionId = String(queueDetailsRow.mission_id || "").trim().toUpperCase();
    if (!missionId) return;
    void loadMissionUdnContext(missionId);
  }, [queueDetailsOpen, queueDetailsRow]);

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

  async function loadOfficeHierarchy() {
    try {
      const response = await fetch("/api/govhub/operations/office", { cache: "no-store" });
      const payload = await response.json();
      setOfficeText(JSON.stringify(payload, null, 2));
      setOfficeUpdatedAt(new Date().toISOString());
    } catch {
      setOfficeText(JSON.stringify({ status: "error", error_code: "OFFICE_FETCH_FAILED" }, null, 2));
      setOfficeUpdatedAt(new Date().toISOString());
    }
  }

  function selectOfficeNode(node: OfficeHierarchyRow) {
    const office = String(node.office_id || "P-ARQ").trim().toUpperCase() || "P-ARQ";
    setOfficeEdit({
      office_id: office,
      leader_id: String(node.leader_id || "").trim().toLowerCase(),
      subordinate_ids: Array.isArray(node.subordinate_ids)
        ? Array.from(new Set(node.subordinate_ids.map((item) => String(item || "").trim().toLowerCase()).filter(Boolean)))
        : []
    });
  }

  async function saveOfficeNode() {
    if (currentRole !== "admin") {
      setOfficeNotice("Apenas admin pode alterar o Escritório.");
      return;
    }
    const leaderId = String(officeEdit.leader_id || "").trim().toLowerCase();
    if (!leaderId) {
      setOfficeNotice("Defina um líder para o escritório.");
      return;
    }
    setStatus("office_saving");
    try {
      const response = await fetch("/api/govhub/operations/office", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "upsert_node",
          office_id: String(officeEdit.office_id || "").trim().toUpperCase(),
          leader_id: leaderId,
          subordinate_ids: officeEdit.subordinate_ids
        })
      });
      const payload = await response.json();
      setResponseText(JSON.stringify(payload, null, 2));
      if (!response.ok) {
        setStatus("error");
        setOfficeNotice(`Falha ao salvar escritório: ${resolveRegisterError(payload)}.`);
        return;
      }
      setStatus("success");
      setOfficeNotice(`Escritório ${officeEdit.office_id} atualizado.`);
      await loadOfficeHierarchy();
    } catch {
      setStatus("error");
      setOfficeNotice("Falha de rede ao salvar escritório.");
    }
  }

  async function normalizeOfficeIdentities() {
    if (currentRole !== "admin") {
      setOfficeNotice("Somente Admin pode normalizar identidades do escritório.");
      return;
    }
    setStatus("office_normalizing");
    try {
      const response = await fetch("/api/govhub/operations/office", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "normalize_identities" })
      });
      const payload = await response.json();
      setResponseText(JSON.stringify(payload, null, 2));
      if (!response.ok) {
        setStatus("error");
        setOfficeNotice(`Falha na normalização: ${resolveRegisterError(payload)}.`);
        return;
      }
      const changedCount = Number(payload?.changed_count || 0);
      const unresolvedCount = Array.isArray(payload?.unresolved) ? payload.unresolved.length : 0;
      setStatus("success");
      setOfficeNotice(`Identidades normalizadas. Alterações: ${changedCount}. Pendências: ${unresolvedCount}.`);
      await loadOfficeHierarchy();
    } catch {
      setStatus("error");
      setOfficeNotice("Falha de rede na normalização de identidades.");
    }
  }

  async function moveOfficeMember(agentIdRaw: string, targetOfficeRaw: string) {
    const agentId = String(agentIdRaw || "").trim().toLowerCase();
    const targetOfficeId = String(targetOfficeRaw || "").trim().toUpperCase();
    if (!agentId || !targetOfficeId) return;
    if (currentRole !== "admin") {
      setOfficeNotice("Somente Admin pode mover funcionário IA entre escritórios.");
      return;
    }

    const targetAgent = agentRows.find((row) => String(row.agent_id || "").trim().toLowerCase() === agentId);
    const sourceOffice = officeRowsSorted.find((row) => {
      const leader = String(row.leader_id || "").trim().toLowerCase();
      if (leader === agentId) return true;
      const subs = Array.isArray(row.subordinate_ids) ? row.subordinate_ids : [];
      return subs.some((item) => String(item || "").trim().toLowerCase() === agentId);
    });
    const sourceOfficeId = String(sourceOffice?.office_id || "").trim().toUpperCase();
    if (sourceOfficeId && sourceOfficeId === targetOfficeId) {
      setOfficeNotice(`Sem alteração: ${formatChatIdentity(agentId)} já está em ${officeLabel(targetOfficeId)}.`);
      return;
    }
    if (sourceOffice && String(sourceOffice.leader_id || "").trim().toLowerCase() === agentId) {
      setOfficeNotice(`Movimentação bloqueada: ${formatChatIdentity(agentId)} é líder do escritório ${officeLabel(sourceOfficeId)}.`);
      return;
    }

    const normalizedRole = normalizeRoleKey(String(targetAgent?.role || inferRoleFromIdentity(agentId)));
    if (!officeRoleAllowed(targetOfficeId, normalizedRole)) {
      setOfficeNotice(
        `Movimentação bloqueada por governança: cargo ${formatRoleAlias(normalizedRole)} não é compatível com ${officeLabel(targetOfficeId)}. Regra: ${officeRolePolicyLabel(targetOfficeId)}.`
      );
      return;
    }

    const state = String(targetAgent?.state || "").trim().toLowerCase();
    const currentLoad = Number(targetAgent?.current_load || 0);
    if (state === "running" || currentLoad > 0) {
      setOfficeNotice(`Movimentação bloqueada: ${formatChatIdentity(agentId)} está em execução.`);
      return;
    }

    setStatus("office_moving");
    try {
      const response = await fetch("/api/govhub/operations/office", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "move_member",
          agent_id: agentId,
          target_office_id: targetOfficeId
        })
      });
      const payload = await response.json();
      if (!response.ok) {
        setStatus("error");
        setOfficeNotice(`Falha ao mover: ${resolveRegisterError(payload)}.`);
        return;
      }
      setStatus("success");
      setOfficeNotice(`Movido: ${formatChatIdentity(agentId)} -> ${officeLabel(targetOfficeId)}.`);
      await loadOfficeHierarchy();
    } catch {
      setStatus("error");
      setOfficeNotice("Falha de rede ao mover funcionário IA.");
    } finally {
      setOfficeDragAgentId("");
    }
  }

  async function requestOfficeOnboarding() {
    if (currentRole !== "admin") {
      setOfficeNotice("Somente Admin pode solicitar onboarding de funcionário IA.");
      return;
    }
    const agentId = String(officeOnboard.agent_id || "").trim().toLowerCase();
    if (!agentId) {
      setOfficeNotice("Informe o ID do funcionário IA.");
      return;
    }
    const targetOfficeId = String(officeOnboard.office_id || "").trim().toUpperCase() || "CPP";
    const role = String(officeOnboard.role || "").trim().toUpperCase() || "CPP";
    const priority = String(officeOnboard.priority || "").trim().toUpperCase() || "P1";
    const ownerAckRequired = officeOnboard.owner_ack_required === true;

    setOfficeOnboarding(true);
    setStatus("office_onboarding");
    try {
      const response = await fetch("/api/govhub/operations/office", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "request_onboarding",
          agent_id: agentId,
          role,
          office_id: targetOfficeId,
          priority,
          notes: officeOnboard.notes,
          owner_ack_required: ownerAckRequired
        })
      });
      const payload = await response.json();
      setResponseText(JSON.stringify(payload, null, 2));
      if (!response.ok) {
        setStatus("error");
        setOfficeNotice(`Falha no onboarding: ${resolveRegisterError(payload)}.`);
        return;
      }
      setStatus("success");
      const queueMissionId = String(payload?.mission_id || "-").trim();
      const queueStatus = String(payload?.queue_item?.status || "").trim().toLowerCase();
      const queuedForOwner = queueStatus === "paused_waiting_owner" || resolveOwnerAckRequired(payload);
      const queueLabel = queuedForOwner ? "Pausadas (aguardando owner)" : "A fazer";
      setOfficeNotice(`Onboarding solicitado para ${formatChatIdentity(agentId)}. Missão ${queueMissionId} criada em ${queueLabel}.`);
      setOfficeOnboard((prev) => ({ ...prev, agent_id: "", notes: "" }));
      await Promise.all([loadOfficeHierarchy(), pullQueueNow()]);
      setQueueRefreshNonce((value) => value + 1);
    } catch {
      setStatus("error");
      setOfficeNotice("Falha de rede no onboarding de funcionário IA.");
    } finally {
      setOfficeOnboarding(false);
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

  async function loadMemory(options?: { starter?: boolean; silent?: boolean }) {
    const starter = options?.starter === true;
    const silent = options?.silent === true;
    if (memoryPollLockRef.current) return;
    memoryPollLockRef.current = true;
    try {
      const query = memoryQuery.trim();
      const namespace = memoryNamespace.trim();
      const missionId = memoryMissionId.trim().toUpperCase();
      const role = memoryRole.trim().toUpperCase();
      const tags = memoryTags.trim();
      const response = await fetch(
        "/api/govhub/operations/memory",
        starter
          ? {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({
                action: "starter",
                query,
                namespace,
                mission_id: missionId,
                role,
                tags,
                limit: 5
              }),
              cache: "no-store"
            }
          : {
              method: "GET",
              cache: "no-store"
            }
      );
      const payload = await response.json();
      setMemoryText(JSON.stringify(payload, null, 2));
      setMemoryUpdatedAt(new Date().toISOString());
      if (!silent) {
        setMemoryNotice(starter ? "Starter atualizado." : "Memória atualizada.");
      }
    } catch {
      setMemoryText(JSON.stringify({ status: "error", error_code: "MEMORY_FETCH_FAILED" }, null, 2));
      setMemoryUpdatedAt(new Date().toISOString());
      if (!silent) setMemoryNotice("Falha ao consultar memória.");
    } finally {
      memoryPollLockRef.current = false;
    }
  }

  async function storeMemory() {
    const namespace = memoryNamespace.trim();
    const topic = memoryStoreTopic.trim();
    const content = memoryStoreContent.trim();
    if (!namespace || !topic || !content) {
      setMemoryNotice("Namespace, tópico e conteúdo são obrigatórios.");
      return;
    }
    try {
      const response = await fetch("/api/govhub/operations/memory", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "store",
          namespace,
          topic,
          content,
          summary: memoryStoreSummary.trim(),
          tags: memoryTags,
          mission_id: memoryMissionId.trim().toUpperCase(),
          role: memoryRole.trim().toUpperCase(),
          actor: createdBy,
          source_type: "udn"
        })
      });
      const payload = await response.json();
      setMemoryText(JSON.stringify(payload, null, 2));
      setMemoryUpdatedAt(new Date().toISOString());
      if (!response.ok) {
        setMemoryNotice(`Falha ao salvar memória: ${resolveRegisterError(payload)}.`);
        return;
      }
      setMemoryNotice(`Memória salva em ${namespace}.`);
      setMemoryRefreshNonce((value) => value + 1);
    } catch {
      setMemoryNotice("Falha de rede ao salvar memória.");
    }
  }

  async function downloadMemorySnapshot(format: "backup" | "export") {
    try {
      const url = `/api/govhub/operations/memory?format=${format}`;
      const response = await fetch(url, { cache: "no-store" });
      if (!response.ok) {
        setMemoryNotice(`Falha ao gerar ${format === "backup" ? "backup" : "download"}.`);
        return;
      }
      const blob = await response.blob();
      const disposition = String(response.headers.get("content-disposition") || "");
      const filenameMatch = disposition.match(/filename=\"([^\"]+)\"/i);
      const filename = filenameMatch?.[1] || `gov-memory-${format}.json`;
      const objectUrl = window.URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.URL.revokeObjectURL(objectUrl);
      setMemoryNotice(format === "backup" ? "Backup gerado." : "Download concluído.");
    } catch {
      setMemoryNotice(`Falha de rede ao ${format === "backup" ? "gerar backup" : "baixar exportação"}.`);
    }
  }

  async function groupMissions() {
    if (missionManageBusy) return;
    const matrixMissionId = String(groupPackageId || "").trim().toUpperCase();
    const missionIds = parseMissionIds(groupMissionIdsRaw).filter((missionId) => missionId !== matrixMissionId);
    if (!matrixMissionId) {
      setMissionManageNotice("Informe a Missão Matriz.");
      setTopNotice({ message: "Informe a Missão Matriz.", variant: "error" });
      return;
    }
    if (missionIds.length === 0) {
      setMissionManageNotice("Informe ao menos uma missão para herdar na matriz.");
      setTopNotice({ message: "Informe ao menos uma missão para herdar na matriz.", variant: "error" });
      return;
    }
    setMissionManageBusy("group");
    setMissionManageNotice("Salvando agrupamento na missão matriz...");
    setTopNotice({ message: "Salvando agrupamento na missão matriz...", variant: "info" });
    setStatus("mission_grouping");
    try {
      const { response, payload } = await fetchJsonWithTimeout("/api/govhub/missions/manage", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "group_missions",
          actor: createdBy,
          matrix_mission_id: matrixMissionId,
          package_id: matrixMissionId,
          mission_ids: missionIds,
          note: groupNote
        })
      });
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
        setTopNotice({ message: withSupportSuffix(baseMessage), variant: "error" });
        return;
      }
      setStatus("success");
      const groupedPackage =
        payload.package && typeof payload.package === "object"
          ? (payload.package as Record<string, unknown>)
          : {};
      const packageId = String(groupedPackage.package_id || matrixMissionId || "-");
      const inheritedParts = Number(payload.inherited_parts || 0);
      setMissionManageNotice(`Matriz ${packageId} atualizada com ${missionIds.length} missão(ões) herdadas (${inheritedParts} parte(s)).`);
      setTopNotice({
        message: `Matriz ${packageId} atualizada com ${missionIds.length} missão(ões) herdadas.`,
        variant: "success"
      });
      await loadMissionManage();
    } catch (error) {
      const timeout = error instanceof DOMException && error.name === "AbortError";
      const baseMessage = timeout ? "Tempo limite ao agrupar missões na matriz." : "Falha de rede ao agrupar missões na matriz.";
      await reportSupportError({
        source: "MISSION_GROUP",
        action: "group_missions",
        missionId: mission.id,
        errorCode: "NETWORK_ERROR",
        message: baseMessage
      });
      setStatus("error");
      setMissionManageNotice(withSupportSuffix(baseMessage));
      setTopNotice({ message: withSupportSuffix(baseMessage), variant: "error" });
    } finally {
      setMissionManageBusy("");
    }
  }

  function requestGroupMissionsConfirm() {
    const matrixMissionId = String(groupPackageId || "").trim().toUpperCase();
    const missionIds = parseMissionIds(groupMissionIdsRaw).filter((missionId) => missionId !== matrixMissionId);
    if (!matrixMissionId) {
      setMissionManageNotice("Informe a Missão Matriz.");
      setTopNotice({ message: "Informe a Missão Matriz.", variant: "error" });
      return;
    }
    if (missionIds.length === 0) {
      setMissionManageNotice("Informe ao menos uma missão para herdar na matriz.");
      setTopNotice({ message: "Informe ao menos uma missão para herdar na matriz.", variant: "error" });
      return;
    }
    setMissionManageConfirm({
      action: "group",
      title: "Confirmar agrupamento na Missão Matriz",
      summary: `Matriz ${matrixMissionId} receberá ${missionIds.length} missão(ões): ${missionIds.join(", ")}`
    });
  }

  async function editMissionInProgress() {
    if (missionManageBusy) return;
    const missionId = String(manageEdit.mission_id || "").trim().toUpperCase();
    if (!missionId) {
      setMissionManageNotice("Informe a missão para editar.");
      return;
    }
    const issues = validateMissionEditDraft();
    if (issues.length > 0) {
      const message = `Validação da edição falhou: ${issues.join(", ")}.`;
      setMissionManageNotice(message);
      setTopNotice({ message, variant: "error" });
      return;
    }
    const notesPayload = composeEditNotesPayload();
    setMissionManageBusy("edit");
    setMissionManageNotice(`Salvando edição da missão ${missionId}...`);
    setTopNotice({ message: `Salvando edição da missão ${missionId}...`, variant: "info" });
    setStatus("mission_editing");
    try {
      const { response, payload } = await fetchJsonWithTimeout("/api/govhub/missions/manage", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "edit_mission",
          actor: createdBy,
          mission_id: missionId,
          objective: manageEdit.objective,
          assignee: manageEdit.assignee,
          priority: manageEdit.priority,
          notes: notesPayload
        })
      });
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
        setTopNotice({ message: withSupportSuffix(baseMessage), variant: "error" });
        return;
      }
      setStatus("success");
      setMissionManageNotice(`Missão ${missionId} atualizada.`);
      setTopNotice({ message: `Missão ${missionId} atualizada.`, variant: "success" });
      await loadMissionManage();
    } catch (error) {
      const timeout = error instanceof DOMException && error.name === "AbortError";
      const baseMessage = timeout ? "Tempo limite ao editar missão." : "Falha de rede ao editar missão.";
      await reportSupportError({
        source: "MISSION_EDIT",
        action: "edit_mission",
        missionId,
        errorCode: "NETWORK_ERROR",
        message: baseMessage
      });
      setStatus("error");
      setMissionManageNotice(withSupportSuffix(baseMessage));
      setTopNotice({ message: withSupportSuffix(baseMessage), variant: "error" });
    } finally {
      setMissionManageBusy("");
    }
  }

  function requestEditMissionConfirm() {
    const missionId = String(manageEdit.mission_id || "").trim().toUpperCase();
    if (!missionId) {
      setMissionManageNotice("Informe a missão para editar.");
      setTopNotice({ message: "Informe a missão para editar.", variant: "error" });
      return;
    }
    const issues = validateMissionEditDraft();
    if (issues.length > 0) {
      const message = `Validação da edição falhou: ${issues.join(", ")}.`;
      setMissionManageNotice(message);
      setTopNotice({ message, variant: "error" });
      return;
    }
    setMissionManageConfirm({
      action: "edit",
      title: `Confirmar edição da missão ${missionId}`,
      summary: `Executor: ${manageEdit.assignee} | Prioridade: ${manageEdit.priority} | Objetivo: ${String(manageEdit.objective || "-").trim() || "-"}`
    });
  }

  async function confirmMissionManageAction() {
    const pending = missionManageConfirm;
    if (!pending) return;
    setMissionManageConfirm(null);
    if (pending.action === "group") {
      await groupMissions();
      return;
    }
    await editMissionInProgress();
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
    const candidates = queueOrderedRows.filter((row) => String(row.status || "").toLowerCase() === "open");
    if (candidates.length === 0) {
      setMissionManageNotice("Sem itens elegíveis para iniciar.");
      setTopNotice({ message: "Sem itens elegíveis para iniciar.", variant: "info" });
      return;
    }
    setStatus("mission_bulk_start");
    setTopNotice({ message: `Iniciando ${candidates.length} item(ns) com ACK obrigatório...`, variant: "info" });
    try {
      let started = 0;
      let rolledBack = 0;
      let failed = 0;
      const failureSamples: Array<{
        missionId: string;
        queueId: string;
        errorCode: string;
        message: string;
        payload?: unknown;
      }> = [];

      for (const row of candidates) {
        const queueId = String(row.queue_id || "").trim();
        if (!queueId) continue;
        try {
          const { response, payload } = await fetchJsonWithTimeout("/api/govhub/operations/queue", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              action: "update_status",
              actor: createdBy,
              queue_id: queueId,
              status: "in_progress"
            })
          });
          const errorCode = resolveErrorCode(payload);
          if (response.ok) {
            started += 1;
          } else if (errorCode === "START_ACK_TIMEOUT" || errorCode === "WORKER_UNREACHABLE" || errorCode.startsWith("START_ACK_")) {
            rolledBack += 1;
            failureSamples.push({
              missionId: String(row.mission_id || "").trim().toUpperCase(),
              queueId,
              errorCode,
              message: resolveRegisterError(payload),
              payload
            });
          } else {
            failed += 1;
            failureSamples.push({
              missionId: String(row.mission_id || "").trim().toUpperCase(),
              queueId,
              errorCode,
              message: resolveRegisterError(payload),
              payload
            });
          }
        } catch {
          failed += 1;
          failureSamples.push({
            missionId: String(row.mission_id || "").trim().toUpperCase(),
            queueId,
            errorCode: "NETWORK_ERROR",
            message: "Falha de rede ao iniciar item."
          });
        }
      }

      const firstFailure = failureSamples[0];
      if (firstFailure) {
        const baseMessage = `Falha no início em lote (${firstFailure.errorCode}): ${firstFailure.message}.`;
        await reportSupportError({
          source: "MISSION_BULK_START",
          action: "start_all_non_paused",
          missionId: firstFailure.missionId || mission.id,
          queueId: firstFailure.queueId,
          errorCode: firstFailure.errorCode,
          message: baseMessage,
          ...(firstFailure.payload ? { payload: firstFailure.payload } : {})
        });
      }

      const summary = `Início em lote: ${started} iniciado(s), ${rolledBack} rollback ACK, ${failed} falha(s).`;
      setMissionManageNotice(rolledBack > 0 || failed > 0 ? withSupportSuffix(summary) : summary);
      setTopNotice({
        message: rolledBack > 0 || failed > 0 ? withSupportSuffix(summary) : summary,
        variant: rolledBack > 0 || failed > 0 ? "error" : "success"
      });
      setStatus(rolledBack > 0 || failed > 0 ? "error" : "success");
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
      objective: String(row.title || prev.objective || ""),
      request_text: String(row.description || row.title || prev.request_text || "")
    }));
    setManageExecution((prev) => ({ ...prev, mission_id: missionId, assignee: String(row.assignee || prev.assignee || "CPP"), priority: String(row.priority || prev.priority || "P1") }));
  }

  function parseMissionContext(rawInput: string): {
    objective: string;
    assignee: "STAFF" | "CPP" | "CPP-IA" | "";
    priority: "P0" | "P1" | "P2" | "P3" | "";
    requestText: string;
  } {
    const raw = String(rawInput || "").trim();
    if (!raw) return { objective: "", assignee: "", priority: "", requestText: "" };
    const lines = raw
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    const muLine = lines.find((line) => line.startsWith("#μ:"));
    const tauLine = lines.find((line) => line.startsWith("#τ:"));
    const freeText = lines.find(
      (line) => !line.startsWith("!MIS|") && !line.startsWith("#μ:") && !line.startsWith("#τ:") && !line.startsWith("#σ:") && !line.startsWith("!OUT:")
    );

    let objective = muLine ? muLine.replace(/^#μ:\s*/i, "").trim() : "";
    if (!objective && freeText) objective = freeText;
    if (!objective) objective = raw.slice(0, 240);

    let assignee: "STAFF" | "CPP" | "CPP-IA" | "" = "";
    let priority: "P0" | "P1" | "P2" | "P3" | "" = "";
    if (tauLine) {
      const partMatch = tauLine.replace(/^#τ:\s*/i, "").match(/P\d+\s*:\s*(STAFF|CPP-IA|CPP)\s*:\s*(P[0-3])/i);
      if (partMatch) {
        assignee = String(partMatch[1] || "").toUpperCase() as "STAFF" | "CPP" | "CPP-IA";
        priority = String(partMatch[2] || "").toUpperCase() as "P0" | "P1" | "P2" | "P3";
      }
    }

    return { objective, assignee, priority, requestText: raw };
  }

  function extractMissionUdnBlock(rawInput: string): string {
    const normalized = normalizeTdvTags(String(rawInput || "")).trim();
    if (!normalized) return "";
    const idx = normalized.indexOf("!MIS|");
    if (idx < 0) return "";
    return normalized.slice(idx).trim();
  }

  function stripMissionUdnBlock(rawInput: string): string {
    const normalized = normalizeTdvTags(String(rawInput || "")).trim();
    if (!normalized) return "";
    const idx = normalized.indexOf("!MIS|");
    if (idx < 0) return normalized;
    return normalized.slice(0, idx).trim();
  }

  async function loadMissionUdnContext(missionIdRaw: string): Promise<string> {
    const missionId = String(missionIdRaw || "").trim().toUpperCase();
    if (!missionId) return "";
    const cached = String(missionUdnById[missionId] || "").trim();
    if (cached) return cached;
    try {
      const response = await fetch(`/api/govhub/missions/context?mission_id=${encodeURIComponent(missionId)}`, {
        cache: "no-store"
      });
      const payload = await response.json();
      if (!response.ok) return "";
      const udnText = String(payload?.udn_mission || "").trim();
      if (!udnText) return "";
      setMissionUdnById((prev) => ({ ...prev, [missionId]: udnText }));
      return udnText;
    } catch {
      return "";
    }
  }

  async function openMissionByIdForEdit() {
    const missionId = String(manageEdit.mission_id || "").trim().toUpperCase();
    if (!missionId) {
      setMissionManageNotice("Informe o Mission ID e clique em Abrir.");
      setTopNotice({ message: "Mission ID obrigatório para abrir a missão.", variant: "error" });
      return;
    }

    const queueItems = queueRows.filter((row) => String(row.mission_id || "").trim().toUpperCase() === missionId);
    const boardRow = managedMissionRows.find((row) => String(row.mission_id || "").trim().toUpperCase() === missionId);
    if (queueItems.length === 0 && !boardRow) {
      setMissionManageNotice(`Missão ${missionId} não encontrada.`);
      setTopNotice({ message: `Missão ${missionId} não encontrada para abrir.`, variant: "error" });
      return;
    }

    const preferredQueueRow =
      queueItems.find((row) => String(row.status || "").toLowerCase() === "in_progress") ||
      queueItems.find((row) => String(row.status || "").toLowerCase() === "open") ||
      queueItems[0] ||
      null;

    const boardNotesText = String(boardRow?.notes || "").trim();
    const parsedBoardNotes = parseRequestAndNotes(boardNotesText);
    const missionQueueRows = queueItems.length > 0 ? queueItems : queueRows.filter((row) => String(row.mission_id || "").trim().toUpperCase() === missionId);
    const missionChatTexts = chatRows
      .filter((msg) => String(msg.mission_id || "").trim().toUpperCase() === missionId)
      .map((msg) => String(msg.message || "").trim())
      .filter(Boolean)
      .filter((text) => !/^recebido[,.\s]/i.test(text))
      .filter((text) => !/leitura inicial/i.test(text))
      .filter((text) => !/proximo passo recomendado/i.test(text))
      .filter((text) => !/^resultado factual\s*\|/i.test(text))
      .filter((text) => !/^missao_recebida\s*\|/i.test(text));
    const sourceCandidates = [
      String(preferredQueueRow?.description || "").trim(),
      ...missionQueueRows.map((row) => String(row.description || "").trim()),
      ...missionChatTexts,
      String(preferredQueueRow?.title || "").trim(),
      String(boardRow?.objective || "").trim()
    ].filter(Boolean);
    const parsedQueueNotes = parseRequestAndNotes(sourceCandidates[0] || "");
    const missionContextUdn = await loadMissionUdnContext(missionId);
    const udnSource = [missionContextUdn, boardNotesText, ...sourceCandidates].find((text) => text.includes("!MIS|")) || "";
    const parsed = parseMissionContext(udnSource || sourceCandidates[0] || "");

    const assignee = (parsed.assignee ||
      String(boardRow?.assignee || preferredQueueRow?.assignee || "STAFF").toUpperCase()) as "STAFF" | "CPP" | "CPP-IA";
    const priority = (parsed.priority ||
      String(boardRow?.priority || preferredQueueRow?.priority || "P1").toUpperCase()) as "P0" | "P1" | "P2" | "P3";
    const objective =
      parsed.objective ||
      String(boardRow?.objective || "").trim() ||
      String(preferredQueueRow?.title || "").trim() ||
      "Objetivo não identificado.";
    const missionUdnText =
      extractMissionUdnBlock(missionContextUdn) ||
      extractMissionUdnBlock(boardNotesText) ||
      missionChatTexts.map((value) => extractMissionUdnBlock(value)).find(Boolean) ||
      sourceCandidates.map((value) => extractMissionUdnBlock(value)).find(Boolean) ||
      "";
    const udnPrimaryRequest = buildPrimaryRequestFromUdn(missionUdnText);
    const muFromUdn = extractUdnMu(missionUdnText);
    const requestTextCandidates = [
      udnPrimaryRequest,
      parsedBoardNotes.requestText,
      parsedBoardNotes.notesText,
      ...missionChatTexts,
      ...missionQueueRows.map((row) => String(row.description || "").trim()),
      String(preferredQueueRow?.description || "").trim(),
      String(boardRow?.objective || "").trim(),
      String(preferredQueueRow?.title || "").trim(),
      muFromUdn
    ]
      .map((value) => stripMissionUdnBlock(value))
      .map((value) => value.replace(/^Solicitação:\s*/i, "").trim())
      .filter(Boolean);
    const highSignalRequest = requestTextCandidates.find((value) => !isLowSignalRequest(value)) || "";
    const bestRequest = highSignalRequest || udnPrimaryRequest || objective;
    const requestText =
      mergeMissionUdnWithRequest(
        missionUdnText || composeCompactMissionUdn(missionId, objective),
        missionId,
        bestRequest
      );
    const objectiveSeed = String(bestRequest || objective)
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find(Boolean) || objective;
    const objectiveFinal = !isLowSignalRequest(objectiveSeed) ? objectiveSeed : objective;
    const notesTextFallback = parsedBoardNotes.notesText || parsedQueueNotes.notesText || String(boardNotesText).trim();
    const notesText = stripMissionUdnBlock(notesTextFallback.replace(/^Solicitação:\s*/i, "").trim());
    const notesFinal = !isLowSignalRequest(notesText) ? notesText : "";

    setManageEdit((prev) => ({
      ...prev,
      mission_id: missionId,
      assignee,
      priority,
      objective: objectiveFinal.slice(0, 240),
      request_text: requestText.slice(0, 4000),
      notes: (notesFinal || "").slice(0, 4000)
    }));
    const lowSignalDetected = !highSignalRequest;
    setMissionManageNotice(
      lowSignalDetected
        ? `Missão ${missionId} aberta. Solicitação principal não encontrada no histórico salvo desta missão.`
        : `Missão ${missionId} aberta e preenchida automaticamente.`
    );
    setTopNotice({
      message: lowSignalDetected
        ? `Missão ${missionId} carregada, mas sem solicitação principal no histórico.`
        : `Missão ${missionId} carregada para edição.`,
      variant: lowSignalDetected ? "info" : "success"
    });
  }

  function validateMissionEditDraft(): string[] {
    const issues: string[] = [];
    const missionId = String(manageEdit.mission_id || "").trim().toUpperCase();
    const objective = String(manageEdit.objective || "").trim();
    const assignee = String(manageEdit.assignee || "").trim().toUpperCase();
    const priority = String(manageEdit.priority || "").trim().toUpperCase();
    if (!missionId) issues.push("Mission ID");
    if (!objective) issues.push("Objetivo");
    if (!["STAFF", "CPP", "CPP-IA"].includes(assignee)) issues.push("Executor");
    if (!["P0", "P1", "P2", "P3"].includes(priority)) issues.push("Prioridade");
    const missionEditable = queueRows.some((row) => {
      const sameMission = String(row.mission_id || "").trim().toUpperCase() === missionId;
      const status = String(row.status || "").toLowerCase();
      return sameMission && (status === "staff_validation_gate" || status === "open" || status === "paused_waiting_owner" || status === "in_progress" || status === "done");
    });
    if (missionId && !missionEditable) issues.push("Missão precisa estar em A Fazer, pausada, em progresso ou concluída");
    return issues;
  }

  function composeEditNotesPayload(): string {
    const requestText = String(manageEdit.request_text || "").trim();
    const notes = String(manageEdit.notes || "").trim();
    if (requestText && notes) return `Solicitação:\n${requestText}\n\nNotas:\n${notes}`.slice(0, 12000);
    if (requestText) return requestText.slice(0, 8000);
    return notes.slice(0, 8000);
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
    missionPayload?: { id: string; target: string; notes: string; branch: string; agent_id: string };
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
      notes: String(mission.notes || "").trim(),
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

  const missionAssetMissionId = String(mission.id || "").trim().toUpperCase();
  const missionAssetPreview = missionAssets.find((item) => item.asset_id === missionAssetPreviewId) || null;

  function formatAssetBytes(value: number): string {
    const bytes = Number(value || 0);
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  function missionAssetNotesBlock(): string {
    if (!missionAssetMissionId || missionAssets.length === 0) return "";
    const header = `Anexos da missão (${missionAssets.length}):`;
    const lines = missionAssets.map((item, index) => {
      const url = `/api/govhub/missions/assets?mission_id=${encodeURIComponent(item.mission_id)}&asset_id=${encodeURIComponent(item.asset_id)}&download=1`;
      return `${index + 1}. ${item.file_name} (${item.mime_type}, ${formatAssetBytes(item.size_bytes)}) => ${url}`;
    });
    return `${header}\n${lines.join("\n")}`;
  }

  function toBase64(bytes: Uint8Array): string {
    let binary = "";
    const chunkSize = 0x8000;
    for (let index = 0; index < bytes.length; index += chunkSize) {
      const chunk = bytes.subarray(index, index + chunkSize);
      binary += String.fromCharCode(...chunk);
    }
    return btoa(binary);
  }

  async function loadMissionAssets() {
    if (!missionAssetMissionId) {
      setMissionAssets([]);
      return;
    }
    try {
      const response = await fetch(`/api/govhub/missions/assets?mission_id=${encodeURIComponent(missionAssetMissionId)}`, { cache: "no-store" });
      let payload: unknown = null;
      try {
        payload = await response.json();
      } catch {
        const text = await response.text().catch(() => "");
        payload = { error_code: "NON_JSON_RESPONSE", message: text.slice(0, 180) || "Resposta não-JSON do backend." };
      }
      if (!response.ok) {
        setMissionAssetNotice(`Falha ao carregar anexos: ${resolveRegisterError(payload)}.`);
        return;
      }
      const payloadObj = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
      const rows = Array.isArray(payloadObj.rows) ? payloadObj.rows : [];
      setMissionAssets(rows);
      setMissionAssetNotice(rows.length > 0 ? `${rows.length} anexo(s) disponível(is).` : "Sem anexos para esta missão.");
      if (rows.length === 0) setMissionAssetPreviewId("");
    } catch {
      setMissionAssetNotice("Falha de rede ao carregar anexos.");
    }
  }

  async function uploadMissionFiles(fileList: FileList | null) {
    const MAX_UPLOAD_BYTES = 12 * 1024 * 1024;
    const UPLOAD_TIMEOUT_MS = 120000;
    if (!fileList || fileList.length === 0) return;
    if (!missionAssetMissionId) {
      setMissionAssetNotice("Defina o Mission ID antes de anexar arquivos.");
      return;
    }
    setMissionAssetBusy(true);
    setMissionAssetNotice("Enviando anexos...");
    try {
      for (const file of Array.from(fileList)) {
        if (file.size > MAX_UPLOAD_BYTES) {
          setMissionAssetNotice(`Falha no upload: ${file.name} excede 12 MB.`);
          return;
        }
        const fileName = String(file.name || "arquivo").trim() || "arquivo";
        const controller = new AbortController();
        const timeout = window.setTimeout(() => controller.abort(), UPLOAD_TIMEOUT_MS);
        const formData = new FormData();
        formData.append("mission_id", missionAssetMissionId);
        formData.append("file", file, fileName);
        const response = await fetch("/api/govhub/missions/assets", {
          method: "POST",
          signal: controller.signal,
          body: formData
        }).finally(() => window.clearTimeout(timeout));
        let payload: unknown = null;
        try {
          payload = await response.json();
        } catch {
          const text = await response.text().catch(() => "");
          payload = { error_code: "NON_JSON_RESPONSE", message: text.slice(0, 180) || "Resposta não-JSON do backend." };
        }
        if (!response.ok) {
          setMissionAssetNotice(`Falha no upload: ${resolveRegisterError(payload)}.`);
          return;
        }
      }
      await loadMissionAssets();
      setMissionAssetNotice("Anexos atualizados.");
    } catch (error) {
      const err = error as { name?: string; message?: string } | null;
      const name = String(err?.name || "").trim();
      const message = String(err?.message || "").trim();
      if (name === "AbortError") {
        setMissionAssetNotice("Falha no upload: tempo limite excedido.");
      } else if (message) {
        setMissionAssetNotice(`Falha no upload: ${message}.`);
      } else {
        setMissionAssetNotice("Falha no upload: conexão indisponível.");
      }
    } finally {
      setMissionAssetBusy(false);
    }
  }

  async function removeMissionAsset(assetId: string) {
    if (!missionAssetMissionId || !assetId) return;
    setMissionAssetBusy(true);
    try {
      const response = await fetch(
        `/api/govhub/missions/assets?mission_id=${encodeURIComponent(missionAssetMissionId)}&asset_id=${encodeURIComponent(assetId)}`,
        { method: "DELETE" }
      );
      let payload: unknown = null;
      try {
        payload = await response.json();
      } catch {
        const text = await response.text().catch(() => "");
        payload = { error_code: "NON_JSON_RESPONSE", message: text.slice(0, 180) || "Resposta não-JSON do backend." };
      }
      if (!response.ok) {
        setMissionAssetNotice(`Falha ao excluir anexo: ${resolveRegisterError(payload)}.`);
        return;
      }
      await loadMissionAssets();
      if (missionAssetPreviewId === assetId) setMissionAssetPreviewId("");
      setMissionAssetNotice("Anexo removido.");
    } catch {
      setMissionAssetNotice("Falha de rede ao excluir anexo.");
    } finally {
      setMissionAssetBusy(false);
    }
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
    const assetBlock = missionAssetNotesBlock();
    const notesWithAssets = [String(missionPayload.notes || "").trim(), assetBlock].filter(Boolean).join("\n\n");
    setStatus("sending");
    try {
      const { response, payload } = await fetchJsonWithTimeout("/api/govhub/missions/register", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          udn: udnPayload,
          mission: {
            ...missionPayload,
            notes: notesWithAssets
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
        const payloadObj = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
        const isInvalidResponse = String(payloadObj.status || "").trim().toLowerCase() === "invalid_response";
        const govhubHttp = Number(payloadObj.govhub_http || response.status || 0);
        const govhubResponse = payloadObj.govhub_response && typeof payloadObj.govhub_response === "object"
          ? (payloadObj.govhub_response as Record<string, unknown>)
          : {};
        const upstreamErrorCode = String(govhubResponse.error_code || payloadObj.error_code || "").trim().toUpperCase();
        const failureDetail = isInvalidResponse
          ? `resposta inválida do backend (HTTP ${response.status})`
          : resolveRegisterError(payload);
        const normalizedCode = resolveErrorCode(payload);
        const errorCode = normalizedCode === "UNKNOWN_ERROR" ? `HTTP_${response.status}` : normalizedCode;
        const diagnostics: string[] = [];
        if (Number.isFinite(govhubHttp) && govhubHttp > 0) diagnostics.push(`govhub_http=${govhubHttp}`);
        if (upstreamErrorCode) diagnostics.push(`upstream_code=${upstreamErrorCode}`);
        const diagnosticSuffix = diagnostics.length > 0 ? ` [${diagnostics.join(" | ")}]` : "";
        const baseMessage = `Falha ao registrar missão: ${failureDetail}.${diagnosticSuffix}`;
        await reportSupportError({
          source: "MISSION_REGISTER",
          action: "register_mission",
          missionId: String(missionPayload.id || mission.id || "").trim().toUpperCase(),
          errorCode,
          message: baseMessage,
          payload: {
            ...payloadObj,
            http_status: response.status
          }
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

  async function deleteChatMessage(messageId: string) {
    const cleanId = String(messageId || "").trim();
    if (!cleanId) return;
    setStatus("chat_dispatch");
    try {
      const response = await fetch(`/api/govhub/operations/chat?message_id=${encodeURIComponent(cleanId)}`, {
        method: "DELETE"
      });
      const payload = await response.json();
      setResponseText(JSON.stringify(payload, null, 2));
      setStatus(response.ok ? "success" : "error");
      if (response.ok) {
        setChatNotice("Mensagem excluída.");
        setChatRefreshNonce((prev) => prev + 1);
      } else {
        setChatNotice(`Falha ao excluir: ${resolveRegisterError(payload)}.`);
      }
    } catch {
      setStatus("error");
      setChatNotice("Falha de rede ao excluir mensagem.");
      setResponseText(JSON.stringify({ status: "error", error_code: "CHAT_DELETE_FAILED" }, null, 2));
    }
  }

  async function deleteAllChatMessages() {
    if (currentRole !== "admin") {
      setChatNotice("Ação bloqueada: apenas Admin pode excluir todas as mensagens.");
      return;
    }
    if (chatRows.length === 0) {
      setChatNotice("Não há mensagens para excluir.");
      return;
    }
    const confirmed = window.confirm("Tem certeza que deseja excluir todas as conversas do Chat HUB?");
    if (!confirmed) return;

    setStatus("chat_dispatch");
    try {
      const response = await fetch("/api/govhub/operations/chat?all=true", {
        method: "DELETE"
      });
      const payload = await response.json();
      setResponseText(JSON.stringify(payload, null, 2));
      setStatus(response.ok ? "success" : "error");
      if (response.ok) {
        setChatNotice("Todas as mensagens foram excluídas.");
        setChatUnread(0);
        setChatRefreshNonce((prev) => prev + 1);
      } else {
        setChatNotice(`Falha ao excluir todas: ${resolveRegisterError(payload)}.`);
      }
    } catch {
      setStatus("error");
      setChatNotice("Falha de rede ao excluir todas as mensagens.");
      setResponseText(JSON.stringify({ status: "error", error_code: "CHAT_DELETE_ALL_FAILED" }, null, 2));
    }
  }

  async function handleChatMessageKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== "Enter" || event.shiftKey) return;
    if (chatTranscriptionState === "recording" || chatTranscriptionState === "uploading") return;
    event.preventDefault();
    if (!chatMessage.trim()) return;
    await sendOpsCommand();
  }

  function stopChatRecordingStream() {
    if (chatMediaRecorderRef.current && chatMediaRecorderRef.current.state !== "inactive") {
      chatMediaRecorderRef.current.stop();
    }
    if (chatMediaStreamRef.current) {
      for (const track of chatMediaStreamRef.current.getTracks()) track.stop();
      chatMediaStreamRef.current = null;
    }
  }

  async function uploadChatTranscription(blob: Blob, durationSec: number) {
    if (!blob.size) {
      setChatNotice("Nenhum audio foi capturado.");
      setChatTranscriptionState("idle");
      return;
    }
    if (blob.size > CHAT_TRANSCRIPTION_MAX_BYTES) {
      setChatNotice(`Audio excede ${formatBytes(CHAT_TRANSCRIPTION_MAX_BYTES)}.`);
      setChatTranscriptionState("idle");
      return;
    }
    if (durationSec > CHAT_TRANSCRIPTION_MAX_DURATION_SEC) {
      setChatNotice(`Audio excede ${CHAT_TRANSCRIPTION_MAX_DURATION_SEC}s.`);
      setChatTranscriptionState("idle");
      return;
    }

    setChatTranscriptionState("uploading");
    setChatNotice("Transcrevendo audio...");

    const formData = new FormData();
    formData.set("audio", new File([blob], "chat-hub-recording.webm", { type: blob.type || "audio/webm" }));
    formData.set("language", chatTranscriptionLanguage);
    formData.set("duration_sec", String(durationSec));

    try {
      const response = await fetch("/api/govhub/operations/chat/transcribe", {
        method: "POST",
        body: formData
      });
      const payload = await response.json();
      if (!response.ok) {
        setChatNotice(`Falha na transcricao: ${resolveRegisterError(payload)}.`);
        setChatTranscriptionState("idle");
        return;
      }
      const text = String(payload.text || "").trim();
      if (!text) {
        setChatNotice("Transcricao vazia.");
        setChatTranscriptionState("idle");
        return;
      }
      setChatMessage((prev) => (prev.trim() ? `${prev.trim()}\n${text}` : text));
      setChatNotice("Transcricao inserida no campo Msg.");
      setChatTranscriptionState("idle");
      window.setTimeout(() => chatMessageRef.current?.focus(), 0);
    } catch {
      setChatNotice("Falha de rede na transcricao.");
      setChatTranscriptionState("idle");
    }
  }

  async function toggleChatTranscriptionRecording() {
    if (chatTranscriptionState === "uploading") return;
    if (chatTranscriptionState === "recording") {
      stopChatRecordingStream();
      setChatTranscriptionState("idle");
      return;
    }

    if (typeof window === "undefined" || !navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setChatNotice("Gravacao nao suportada neste navegador.");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus") ? "audio/webm;codecs=opus" : "audio/webm";
      const recorder = new MediaRecorder(stream, { mimeType });
      chatMediaStreamRef.current = stream;
      chatMediaRecorderRef.current = recorder;
      chatRecordingChunksRef.current = [];
      chatRecordingStartedAtRef.current = Date.now();
      setChatTranscriptionDurationSec(0);

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) chatRecordingChunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        const durationSec = Math.max(1, Math.round((Date.now() - chatRecordingStartedAtRef.current) / 1000));
        setChatTranscriptionDurationSec(durationSec);
        const blob = new Blob(chatRecordingChunksRef.current, { type: recorder.mimeType || "audio/webm" });
        chatRecordingChunksRef.current = [];
        void uploadChatTranscription(blob, durationSec);
      };

      recorder.start();
      setChatTranscriptionState("recording");
      setChatNotice("Gravacao iniciada.");
    } catch {
      setChatNotice("Nao foi possivel acessar o microfone.");
    }
  }

  async function copyChatMessageToClipboard() {
    const text = chatMessage.trim();
    if (!text) {
      setChatCopyNotice("Nada para copiar.");
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      setChatCopyNotice("Copiado.");
    } catch {
      setChatCopyNotice("Falha ao copiar.");
    }
    if (chatCopyNoticeTimerRef.current) window.clearTimeout(chatCopyNoticeTimerRef.current);
    chatCopyNoticeTimerRef.current = window.setTimeout(() => setChatCopyNotice(""), 1600);
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

  async function updateQueueStatus(
    row: QueueRow,
    nextStatus: "staff_validation_gate" | "open" | "in_progress" | "done" | "paused_waiting_owner",
    notice: string,
    extras?: QueueUpdateExtras
  ) {
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
        status: nextStatus,
        ...(extras?.validationDecision ? { validation_decision: extras.validationDecision } : {}),
        ...(extras?.assignee ? { assignee: extras.assignee } : {}),
        ...(nextStatus === "done" && extras?.reviewerGuard ? extras.reviewerGuard : {}),
        ...(typeof extras?.etaDeltaMin === "number" ? { eta_delta_min: extras.etaDeltaMin } : {}),
        ...(String(extras?.etaReason || "").trim() ? { eta_reason: String(extras?.etaReason || "").trim() } : {}),
        ...(nextStatus === "done" && String(extras?.completionNote || "").trim()
          ? { completion_note: String(extras?.completionNote || "").trim() }
          : {})
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
            setQueueNotice(`${notice} Auto-recuperação aplicada para ${formatChatIdentity(String(row.assignee || "-"))}.`);
            setQueueRefreshNonce((prev) => prev + 1);
            return;
          }
        }
      }

      setResponseText(JSON.stringify(payload, null, 2));
      if (!response.ok) {
        const errorCode = resolveErrorCode(payload);
        const baseMessage = `Falha ao atualizar item da fila: ${resolveRegisterError(payload)}.`;
        await reportSupportError({
          source: "QUEUE_UPDATE",
          action: "update_status",
          ...(String(row.mission_id || "").trim()
            ? { missionId: String(row.mission_id || "").trim().toUpperCase() }
            : {}),
          queueId,
          errorCode,
          message: baseMessage,
          payload
        });
        setStatus("error");
        setQueueNotice(withSupportSuffix(baseMessage));
        if (errorCode === "START_ACK_TIMEOUT" || errorCode === "WORKER_UNREACHABLE" || errorCode.startsWith("START_ACK_")) {
          setTopNotice({ message: withSupportSuffix(baseMessage), variant: "error" });
        }
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
    if (nextStatus === "done") {
      if (currentRole !== "admin") {
        setQueueNotice("Conclusão bloqueada: apenas admin pode concluir item.");
        return;
      }
      const reviewGuard = promptReviewerGuardApproval();
      if (!reviewGuard) {
        setQueueNotice("Conclusão cancelada: parecer do Reviewer Guard é obrigatório.");
        return;
      }
      const completionNote = `Relatório GOV: missão concluída por ${formatChatIdentity(String(row.assignee || "-"))}. Encerramento validado por ${formatChatIdentity(String(reviewGuard.reviewer_guard_by || "-"))}.`;
      await updateQueueStatus(row, nextStatus, `Item movido para ${queueStatusLabel(nextStatus)}.`, {
        reviewerGuard: reviewGuard,
        completionNote
      });
      setQueueFocusedId(id);
      return;
    }
    await updateQueueStatus(row, nextStatus, `Item movido para ${queueStatusLabel(nextStatus)}.`);
    setQueueFocusedId(id);
  }

  async function reconnectQueueBinding(queueId: string) {
    const id = String(queueId || "").trim();
    if (!id) return;
    const row = queueOrderedRows.find((item) => String(item.queue_id || "") === id);
    if (!row) {
      setQueueNotice("Item não encontrado para reconectar vínculo.");
      return;
    }
    const assignee = String(row.assignee || "").trim().toUpperCase();
    if (assignee !== "CPP" && assignee !== "CPP-IA") {
      setQueueNotice("Reconexão de vínculo disponível apenas para executores CPP.");
      return;
    }
    await updateQueueStatus(
      row,
      "open",
      `Reconexão/vínculo CPP solicitada para ${formatChatIdentity(String(row.assignee || "-"))}.`,
      {
        validationDecision: "bind_cpp",
        assignee: assignee as "CPP" | "CPP-IA"
      }
    );
    setQueueFocusedId(id);
  }

  async function adjustQueueEta(queueId: string, deltaMin = 5) {
    const id = String(queueId || "").trim();
    if (!id) return;
    const row = queueOrderedRows.find((item) => String(item.queue_id || "") === id);
    if (!row) {
      setQueueNotice("Item não encontrado para ajustar ETA.");
      return;
    }
    if (String(row.status || "").toLowerCase() !== "in_progress") {
      setQueueNotice("Ajuste ETA permitido apenas para item em progresso.");
      return;
    }
    const safeDelta = Number.isFinite(deltaMin) ? Math.max(-30, Math.min(60, Math.trunc(deltaMin))) : 5;
    if (safeDelta === 0 || Math.abs(safeDelta) % 5 !== 0) {
      setQueueNotice("Ajuste ETA inválido. Use múltiplos de 5 min.");
      return;
    }
    const reason = safeDelta > 0 ? "extensão operacional de execução" : "redução operacional de execução";
    await updateQueueStatus(
      row,
      "in_progress",
      `ETA ajustado em ${safeDelta > 0 ? "+" : ""}${safeDelta} min.`,
      { etaDeltaMin: safeDelta, etaReason: reason }
    );
    setQueueFocusedId(id);
  }

  async function finalizeQueueCard(queueId: string) {
    const id = String(queueId || "").trim();
    if (!id) return;
    const row = queueOrderedRows.find((item) => String(item.queue_id || "") === id) || null;
    const missionId = String(row?.mission_id || "").trim().toUpperCase();
    setStatus("queue_update");
    try {
      const response = await fetch("/api/govhub/operations/queue", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "remove_item",
          actor: createdBy,
          queue_id: id
        })
      });
      const payload = await response.json();
      setResponseText(JSON.stringify(payload, null, 2));
      if (!response.ok) {
        const baseMessage = `Falha ao finalizar item concluído: ${resolveRegisterError(payload)}.`;
        await reportSupportError({
          source: "QUEUE_FINALIZE",
          action: "remove_item",
          ...(missionId ? { missionId } : {}),
          queueId: id,
          errorCode: resolveErrorCode(payload),
          message: baseMessage,
          payload
        });
        setStatus("error");
        setQueueNotice(withSupportSuffix(baseMessage));
        return;
      }
      setStatus("success");
      setQueueNotice("Item concluído finalizado e removido da esteira.");
      setQueueFocusedId("");
      setQueueRefreshNonce((prev) => prev + 1);
    } catch {
      const baseMessage = "Falha de rede ao finalizar item concluído.";
      await reportSupportError({
        source: "QUEUE_FINALIZE",
        action: "remove_item",
        ...(missionId ? { missionId } : {}),
        queueId: id,
        errorCode: "NETWORK_ERROR",
        message: baseMessage
      });
      setStatus("error");
      setQueueNotice(withSupportSuffix(baseMessage));
    }
  }

  async function clearDoneQueueCards() {
    setStatus("queue_update");
    try {
      const response = await fetch("/api/govhub/operations/queue", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "clear_done",
          actor: createdBy
        })
      });
      const payload = await response.json();
      setResponseText(JSON.stringify(payload, null, 2));
      if (!response.ok) {
        const baseMessage = `Falha ao limpar concluídas: ${resolveRegisterError(payload)}.`;
        await reportSupportError({
          source: "QUEUE_CLEAR_DONE",
          action: "clear_done",
          errorCode: resolveErrorCode(payload),
          message: baseMessage,
          payload
        });
        setStatus("error");
        setQueueNotice(withSupportSuffix(baseMessage));
        return;
      }
      const removed = Number(payload?.removed || 0);
      setStatus("success");
      setQueueNotice(removed > 0 ? `${removed} item(ns) concluído(s) removido(s).` : "Nenhum item concluído para limpar.");
      setQueueFocusedId("");
      setQueueRefreshNonce((prev) => prev + 1);
    } catch {
      const baseMessage = "Falha de rede ao limpar concluídas.";
      await reportSupportError({
        source: "QUEUE_CLEAR_DONE",
        action: "clear_done",
        errorCode: "NETWORK_ERROR",
        message: baseMessage
      });
      setStatus("error");
      setQueueNotice(withSupportSuffix(baseMessage));
    }
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

  useEffect(() => {
    if (section !== "missoes" || missionsTab !== "cadastro") return;
    if (!missionAssetMissionId) {
      setMissionAssets([]);
      setMissionAssetPreviewId("");
      return;
    }
    void loadMissionAssets();
  }, [missionAssetMissionId, missionsTab, section]);

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
    if (section === "escritorio") return "Control Plane de Agentes";
    if (section === "chat") return "Chat HUB";
    if (section === "execucoes") return "Execuções";
    if (section === "pendencias") return "Pendências";
    if (section === "prompts") return "Biblioteca de Prompts";
    if (section === "governanca") return "Governança de Tokens";
    if (section === "memoria") return "Memória Operacional";
    return "Visão geral";
  }, [section]);

  const pageSubtitle = useMemo(() => {
    if (section === "missoes") return "Cadastro de missão (UDN V2 compacto), particionamento e envio ao HUB.";
    if (section === "orquestracao") return "Fila priorizada e distribuição de execução entre Staff, CPP e CPP-IA.";
    if (section === "escritorio") return "Estrutura operacional com escritórios, líderes técnicos e agentes subordinados por governança.";
    if (section === "chat") return "Comando rápido remoto: envio de ação pré-definida via webhook n8n/worker.";
    if (section === "execucoes") return "Monitoramento operacional e retorno de execução.";
    if (section === "pendencias") return "Itens que exigem ação para manter fluxo contínuo.";
    if (section === "prompts") return "Reuso por referência para reduzir custo de tokens.";
    if (section === "governanca") return "Política de limites, alertas e consumo em tempo real.";
    if (section === "memoria") return "RAG operacional do GOV com busca, starter, backup e exportação.";
    return "Painel oficial do GOV-HUB com operação direta e responsiva.";
  }, [section]);

  const previewPayload = useMemo(() => safeJsonParse(tokenPreview), [tokenPreview]);
  const realtimePayload = useMemo(() => safeJsonParse(tokenRealtime), [tokenRealtime]);
  const usagePayload = useMemo(() => safeJsonParse(usageText), [usageText]);
  const botStatusPayload = useMemo(() => safeJsonParse(botStatusText), [botStatusText]);
  const queuePayload = useMemo(() => safeJsonParse(queueText), [queueText]);
  const agentsPayload = useMemo(() => safeJsonParse(agentsText), [agentsText]);
  const presencePayload = useMemo(() => safeJsonParse(presenceText), [presenceText]);
  const sessionsPayload = useMemo(() => safeJsonParse(sessionsText), [sessionsText]);
  const officePayload = useMemo(() => safeJsonParse(officeText), [officeText]);
  const officeAuditPayload = useMemo(() => safeJsonParse(officeAuditText), [officeAuditText]);
  const chatPayload = useMemo(() => safeJsonParse(chatText), [chatText]);
  const memoryPayload = useMemo(() => safeJsonParse(memoryText), [memoryText]);

  const previewData = useMemo(() => {
    const preview = previewPayload?.preview;
    return preview && typeof preview === "object" ? (preview as Record<string, unknown>) : null;
  }, [previewPayload]);

  const memoryRows = useMemo(
    () => (Array.isArray(memoryPayload?.rows) ? (memoryPayload.rows as MemoryChunkRow[]) : []),
    [memoryPayload]
  );

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

  const agentRows = useMemo(() => {
    const rows = agentsPayload?.rows;
    return Array.isArray(rows) ? (rows as AgentStatusRow[]) : [];
  }, [agentsPayload]);

  const presenceAssigneeRows = useMemo(() => {
    const rows = presencePayload?.assignee_rows;
    return Array.isArray(rows) ? (rows as PresenceAssigneeRow[]) : [];
  }, [presencePayload]);

  const presenceIdentityRows = useMemo(() => {
    const rows = presencePayload?.identity_rows;
    return Array.isArray(rows) ? (rows as PresenceIdentityRow[]) : [];
  }, [presencePayload]);

  const presenceOfficeRows = useMemo(() => {
    const rows = presencePayload?.office_rows;
    return Array.isArray(rows) ? (rows as PresenceOfficeRow[]) : [];
  }, [presencePayload]);

  const executionSessionRows = useMemo(() => {
    const rows = sessionsPayload?.sessions;
    return Array.isArray(rows) ? (rows as ExecutionSessionRow[]) : [];
  }, [sessionsPayload]);

  const executionEventRows = useMemo(() => {
    const rows = sessionsPayload?.events;
    return Array.isArray(rows) ? (rows as ExecutionEventRow[]) : [];
  }, [sessionsPayload]);

  const officeRows = useMemo(() => {
    const rows = officePayload?.rows;
    if (!Array.isArray(rows)) return [] as OfficeHierarchyRow[];
    return rows as OfficeHierarchyRow[];
  }, [officePayload]);

  const officeAuditRows = useMemo(() => {
    const rows = officeAuditPayload?.rows;
    if (!Array.isArray(rows)) return [] as AuditEventRow[];
    return [...(rows as AuditEventRow[])]
      .filter((row) => String(row.action || "").trim().toLowerCase().startsWith("office."))
      .sort((a, b) => {
        const aTime = Date.parse(String(a.created_at_utc || ""));
        const bTime = Date.parse(String(b.created_at_utc || ""));
        const aEpoch = Number.isFinite(aTime) ? aTime : 0;
        const bEpoch = Number.isFinite(bTime) ? bTime : 0;
        return bEpoch - aEpoch;
      })
      .slice(0, 12);
  }, [officeAuditPayload]);

  const officeRowsSorted = useMemo(() => {
    const sortOrder = new Map<string, number>([
      ["P-ARQ", 0],
      ["STAFF", 1],
      ["CPP", 2]
    ]);
    return [...officeRows].sort((a, b) => {
      const aId = String(a.office_id || "").trim().toUpperCase();
      const bId = String(b.office_id || "").trim().toUpperCase();
      const aOrder = sortOrder.get(aId) ?? 100;
      const bOrder = sortOrder.get(bId) ?? 100;
      if (aOrder !== bOrder) return aOrder - bOrder;
      return aId.localeCompare(bId);
    });
  }, [officeRows]);

  const officeIdentityOptions = useMemo(() => {
    const payloadIdentities = Array.isArray(officePayload?.identities) ? officePayload?.identities : [];
    const seen = new Set<string>();
    const out: string[] = [];
    const push = (value: unknown) => {
      const clean = String(value || "").trim().toLowerCase();
      if (!clean || seen.has(clean)) return;
      seen.add(clean);
      out.push(clean);
    };
    for (const value of payloadIdentities || []) push(value);
    for (const row of agentRows) {
      push(row.agent_id);
    }
    push(createdBy);
    push("principal_architect");
    return out.sort((a, b) => a.localeCompare(b));
  }, [agentRows, createdBy, officePayload?.identities]);

  const officeCardsByOffice = useMemo(() => {
    const officeIds = officeRowsSorted.map((row) => String(row.office_id || "").trim().toUpperCase()).filter(Boolean);
    const fallbackOffice = officeIds[0] || "STAFF";
    const bucket = new Map<string, OfficeAgentCard[]>();
    const seen = new Set<string>();
    for (const officeId of officeIds) bucket.set(officeId, []);

    const agentMap = new Map<string, AgentStatusRow>();
    for (const row of agentRows) {
      const id = String(row.agent_id || "").trim().toLowerCase();
      if (!id) continue;
      if (!agentMap.has(id)) agentMap.set(id, row);
    }
    const bestAgentByRole = new Map<string, AgentStatusRow>();
    const groupedByRole = new Map<string, AgentStatusRow[]>();
    for (const row of agentRows) {
      const role = String(row.role || "").trim().toUpperCase();
      if (!role) continue;
      const list = groupedByRole.get(role) || [];
      list.push(row);
      groupedByRole.set(role, list);
    }
    const stateWeight = (stateRaw: string) => {
      const state = String(stateRaw || "").trim().toLowerCase();
      if (state === "running") return 0;
      if (state === "idle") return 1;
      if (state === "stale") return 2;
      return 3;
    };
    const healthWeight = (healthRaw: string) => {
      const health = String(healthRaw || "").trim().toLowerCase();
      if (health === "up") return 0;
      if (health === "degraded") return 1;
      return 2;
    };
    for (const [role, rows] of groupedByRole.entries()) {
      const sorted = [...rows].sort((a, b) => {
        const byState = stateWeight(String(a.state || "")) - stateWeight(String(b.state || ""));
        if (byState !== 0) return byState;
        const byHealth = healthWeight(String(a.health || "")) - healthWeight(String(b.health || ""));
        if (byHealth !== 0) return byHealth;
        const byLoad = Number(a.current_load || 0) - Number(b.current_load || 0);
        if (byLoad !== 0) return byLoad;
        const aUpdated = Date.parse(String(a.updated_at_utc || "")) || 0;
        const bUpdated = Date.parse(String(b.updated_at_utc || "")) || 0;
        return bUpdated - aUpdated;
      });
      if (sorted[0]) bestAgentByRole.set(role, sorted[0]);
    }

    const pushCard = (officeIdRaw: string, identityRaw: string, isLeader: boolean) => {
      const officeId = String(officeIdRaw || "").trim().toUpperCase() || fallbackOffice;
      const identity = String(identityRaw || "").trim().toLowerCase();
      if (!identity) return;
      if (seen.has(identity)) return;
      seen.add(identity);
      const row = agentMap.get(identity);
      const inferredRole = String(row?.role || inferRoleFromIdentity(identity)).trim().toUpperCase();
      const roleFallbackRow = row ? null : bestAgentByRole.get(inferredRole);
      const sourceRow = row || roleFallbackRow || null;
      const card: OfficeAgentCard = {
        agent_id: identity,
        resolved_agent_id: String(sourceRow?.agent_id || "").trim().toLowerCase(),
        role: inferredRole,
        office_id: officeId,
        is_leader: isLeader,
        status_source: row ? "exact" : roleFallbackRow ? "role_fallback" : "unknown",
        state: String(sourceRow?.state || "down").trim().toLowerCase(),
        health: String(sourceRow?.health || "down").trim().toLowerCase(),
        current_load: Number(sourceRow?.current_load || 0),
        max_concurrency: Number(sourceRow?.max_concurrency || 1),
        created_at_utc: String(sourceRow?.created_at_utc || ""),
        updated_at_utc: String(sourceRow?.updated_at_utc || sourceRow?.last_heartbeat_at_utc || ""),
        capabilities: Array.isArray(sourceRow?.capabilities)
          ? sourceRow?.capabilities.map((item) => String(item || "").trim()).filter(Boolean).slice(0, 6)
          : []
      };
      const list = bucket.get(officeId) || [];
      list.push(card);
      bucket.set(officeId, list);
    };

    for (const office of officeRowsSorted) {
      const officeId = String(office.office_id || "").trim().toUpperCase() || fallbackOffice;
      const leader = String(office.leader_id || "").trim().toLowerCase();
      if (leader) pushCard(officeId, leader, true);
      const subs = Array.isArray(office.subordinate_ids) ? office.subordinate_ids : [];
      for (const sub of subs) {
        pushCard(officeId, String(sub || "").trim().toLowerCase(), false);
      }
    }

    for (const row of agentRows) {
      const identity = String(row.agent_id || "").trim().toLowerCase();
      if (!identity || seen.has(identity)) continue;
      pushCard(fallbackOffice, identity, false);
    }

    for (const officeId of officeIds) {
      const list = bucket.get(officeId) || [];
      list.sort((a, b) => {
        if (a.is_leader !== b.is_leader) return a.is_leader ? -1 : 1;
        const roleWeightDelta = roleHierarchyWeight(a.role) - roleHierarchyWeight(b.role);
        if (roleWeightDelta !== 0) return roleWeightDelta;
        const aRunning = a.state === "running" ? 0 : 1;
        const bRunning = b.state === "running" ? 0 : 1;
        if (aRunning !== bRunning) return aRunning - bRunning;
        return formatChatIdentity(a.agent_id).localeCompare(formatChatIdentity(b.agent_id));
      });
      bucket.set(officeId, list);
    }
    return bucket;
  }, [agentRows, officeRowsSorted]);

  const officeAgentInsights = useMemo(() => {
    type InsightRow = {
      agent_id: string;
      office_id: string;
      role: string;
      rank_score: number;
      participation_score: number;
      vitality_score: number;
      vitality_level: AgentVitalityLevel;
      skill_match_ratio: number;
      idle_min: number;
      demand_open: number;
      demand_in_progress: number;
      current_load: number;
      max_concurrency: number;
      state: string;
      health: string;
    };

    const now = Date.now();
    const byRoleDemand = new Map<string, { open: number; in_progress: number; demandText: string[] }>();
    const byRoleFlow = new Map<string, { inProgress: number; doneRecent24h: number }>();
    const relevantStatuses = new Set(["open", "in_progress"]);
    for (const row of queueRows) {
      const status = String(row.status || "").trim().toLowerCase();
      const role = normalizeRoleKey(String(row.assignee || ""));
      if (!role) continue;
      if (relevantStatuses.has(status)) {
        const current = byRoleDemand.get(role) || { open: 0, in_progress: 0, demandText: [] as string[] };
        if (status === "open") current.open += 1;
        if (status === "in_progress") current.in_progress += 1;
        const text = compactText([String(row.title || ""), String(row.description || "")].filter(Boolean).join(" "), 240);
        if (text) current.demandText.push(text);
        byRoleDemand.set(role, current);
      }

      const flow = byRoleFlow.get(role) || { inProgress: 0, doneRecent24h: 0 };
      if (status === "in_progress") flow.inProgress += 1;
      if (status === "done") {
        const updatedEpoch = Date.parse(String(row.updated_at_utc || row.created_at_utc || "").trim());
        const ageMin = Number.isFinite(updatedEpoch) ? Math.max(0, Math.round((now - updatedEpoch) / 60000)) : 24 * 60;
        if (ageMin <= 24 * 60) flow.doneRecent24h += 1;
      }
      byRoleFlow.set(role, flow);
    }

    const rows: InsightRow[] = [];
    for (const office of officeRowsSorted) {
      const officeId = String(office.office_id || "").trim().toUpperCase();
      const cards = officeCardsByOffice.get(officeId) || [];
      for (const card of cards) {
        const role = normalizeRoleKey(card.role);
        const demand = byRoleDemand.get(role) || { open: 0, in_progress: 0, demandText: [] as string[] };
        const flow = byRoleFlow.get(role) || { inProgress: 0, doneRecent24h: 0 };
        const demandText = demand.demandText.join(" ");
        const match = skillMatchRatio(card.capabilities, demandText, demand.open, demand.in_progress);
        const maxConcurrency = Math.max(1, Number(card.max_concurrency || 1));
        const load = clampNumber(Number(card.current_load || 0), 0, maxConcurrency);
        const utilization = clampNumber(load / maxConcurrency, 0, 1);
        const idleMin = minutesSince(card.updated_at_utc || card.created_at_utc, now);

        let rank = 55;
        rank += Math.round(utilization * 20);
        rank += Math.round(match * 15);
        rank += card.is_leader ? 5 : 0;
        if (card.state === "running") rank += 10;
        else if (card.state === "idle") rank += 5;
        else if (card.state === "stale") rank -= 10;
        else rank -= 18;
        if (card.health === "up") rank += 5;
        else rank -= 8;
        if ((demand.open + demand.in_progress) > 0) rank += 4;
        rank = clampNumber(rank, 0, 100);

        let participation = 35;
        participation += Math.round(utilization * 35);
        participation += Math.min(20, flow.inProgress * 8);
        participation += Math.min(18, flow.doneRecent24h * 4);
        if ((demand.open + demand.in_progress) > 0 && idleMin > 60 && load <= 0) participation -= 18;
        if ((demand.open + demand.in_progress) === 0 && idleMin > 60) participation -= 6;
        if (card.state === "running") participation += 8;
        if (card.state === "stale") participation -= 10;
        if (card.state === "down") participation -= 15;
        participation = clampNumber(participation, 0, 100);

        let vitality = 100;
        if (idleMin > 15) vitality -= 10;
        if (idleMin > 60) vitality -= 15;
        if (idleMin > 180) vitality -= 20;
        if (idleMin > 720) vitality -= 20;
        if ((demand.open + demand.in_progress) > 0 && load <= 0) {
          if (idleMin > 15) vitality -= 10;
          if (idleMin > 60) vitality -= 15;
          if (idleMin > 180) vitality -= 20;
        }
        if ((demand.open + demand.in_progress) === 0 && load <= 0) vitality += 5;
        if (match < 0.35 && (demand.open + demand.in_progress) > 0) vitality -= 10;
        if (card.state === "running") vitality += 8;
        if (card.state === "stale") vitality -= 15;
        if (card.state === "down") vitality -= 25;
        if (card.health !== "up") vitality -= 10;
        vitality = clampNumber(vitality, 0, 100);

        rows.push({
          agent_id: card.agent_id,
          office_id: officeId,
          role: role || card.role,
          rank_score: rank,
          participation_score: participation,
          vitality_score: vitality,
          vitality_level: vitalityLevel(vitality),
          skill_match_ratio: match,
          idle_min: idleMin,
          demand_open: demand.open,
          demand_in_progress: demand.in_progress,
          current_load: load,
          max_concurrency: maxConcurrency,
          state: card.state,
          health: card.health
        });
      }
    }

    rows.sort((a, b) => {
      const roleDelta = roleHierarchyWeight(a.role) - roleHierarchyWeight(b.role);
      if (roleDelta !== 0) return roleDelta;
      if (b.rank_score !== a.rank_score) return b.rank_score - a.rank_score;
      return formatChatIdentity(a.agent_id).localeCompare(formatChatIdentity(b.agent_id));
    });

    const total = rows.length;
    const rankAvg = total ? rows.reduce((acc, row) => acc + row.rank_score, 0) / total : 0;
    const participationAvg = total ? rows.reduce((acc, row) => acc + row.participation_score, 0) / total : 0;
    const vitalityAvg = total ? rows.reduce((acc, row) => acc + row.vitality_score, 0) / total : 0;
    const riskCount = rows.filter((row) => row.vitality_level === "risco" || row.vitality_level === "perigo").length;
    const healthyCount = rows.filter((row) => row.vitality_level === "saudavel").length;

    return {
      rows,
      summary: {
        total,
        rankAvg: Math.round(rankAvg),
        participationAvg: Math.round(participationAvg),
        vitalityAvg: Math.round(vitalityAvg),
        riskCount,
        healthyCount
      }
    };
  }, [officeCardsByOffice, officeRowsSorted, queueRows]);

  const officeSummaryByOffice = useMemo(() => {
    const byOffice = new Map<string, { count: number; rankSum: number; participationSum: number; vitalitySum: number; riskCount: number }>();
    for (const row of officeAgentInsights.rows) {
      const current = byOffice.get(row.office_id) || { count: 0, rankSum: 0, participationSum: 0, vitalitySum: 0, riskCount: 0 };
      current.count += 1;
      current.rankSum += row.rank_score;
      current.participationSum += row.participation_score;
      current.vitalitySum += row.vitality_score;
      if (row.vitality_level === "risco" || row.vitality_level === "perigo") current.riskCount += 1;
      byOffice.set(row.office_id, current);
    }
    return officeRowsSorted.map((office) => {
      const officeId = String(office.office_id || "").trim().toUpperCase();
      const raw = byOffice.get(officeId) || { count: 0, rankSum: 0, participationSum: 0, vitalitySum: 0, riskCount: 0 };
      const rankAvg = raw.count > 0 ? Math.round(raw.rankSum / raw.count) : 0;
      const participationAvg = raw.count > 0 ? Math.round(raw.participationSum / raw.count) : 0;
      const vitalityAvg = raw.count > 0 ? Math.round(raw.vitalitySum / raw.count) : 0;
      return {
        office_id: officeId,
        count: raw.count,
        rankAvg,
        participationAvg,
        vitalityAvg,
        riskCount: raw.riskCount,
        vitalityLevel: vitalityLevel(vitalityAvg)
      };
    });
  }, [officeAgentInsights.rows, officeRowsSorted]);

  const officeInsightByCardKey = useMemo(() => {
    const map = new Map<string, (typeof officeAgentInsights.rows)[number]>();
    for (const row of officeAgentInsights.rows) {
      const officeId = String(row.office_id || "").trim().toUpperCase();
      const agentId = String(row.agent_id || "").trim().toLowerCase();
      if (!officeId || !agentId) continue;
      map.set(`${officeId}|${agentId}`, row);
    }
    return map;
  }, [officeAgentInsights.rows]);

  const officeCatalogRows = useMemo(() => {
    const officeByAgent = new Map<string, string>();
    for (const [officeId, cards] of officeCardsByOffice.entries()) {
      for (const card of cards) {
        const agentId = String(card.agent_id || "").trim().toLowerCase();
        if (!agentId) continue;
        if (!officeByAgent.has(agentId)) officeByAgent.set(agentId, officeId);
      }
    }

    const sessionByAgent = new Map<string, ExecutionSessionRow>();
    for (const row of executionSessionRows) {
      const agentId = String(row.agent_id || "").trim().toLowerCase();
      if (!agentId) continue;
      const current = sessionByAgent.get(agentId);
      const currentEpoch = Date.parse(String(current?.updated_at_utc || current?.last_heartbeat_at_utc || "")) || 0;
      const nextEpoch = Date.parse(String(row.updated_at_utc || row.last_heartbeat_at_utc || "")) || 0;
      if (!current || nextEpoch >= currentEpoch) sessionByAgent.set(agentId, row);
    }

    return [...agentRows]
      .map((row) => {
        const agentId = String(row.agent_id || "").trim().toLowerCase();
        const officeId = officeByAgent.get(agentId) || String(sessionByAgent.get(agentId)?.office_id || normalizeRoleKey(String(row.role || "")) || "CPP").trim().toUpperCase();
        const role = normalizeRoleKey(String(row.role || ""));
        const insight = officeInsightByCardKey.get(`${officeId}|${agentId}`);
        const session = sessionByAgent.get(agentId);
        const capabilities = Array.isArray(row.capabilities) ? row.capabilities.map((item) => String(item || "").trim()).filter(Boolean) : [];
        const noToken = capabilities.some((item) => /heartbeat|poll|relay|monitor|proof|resume|queue|snapshot/i.test(item));
        const tokenMode = noToken && capabilities.length === 1 ? "no-token" : noToken ? "hybrid" : "token";
        return {
          agent_id: agentId,
          alias: formatChatIdentity(agentId),
          role,
          office_id: officeId,
          office_label: officeLabel(officeId),
          type_label: formatRoleAlias(role),
          state: String(row.state || session?.status || "down").trim().toLowerCase(),
          health: String(row.health || "down").trim().toLowerCase(),
          parent_executor: role === "CPP-IA" ? "CPP" : role === "CPP" ? "Staff Engineer" : role === "STAFF" ? "Principal Architect" : "-",
          skills: capabilities,
          token_mode: tokenMode,
          current_load: Number(row.current_load || 0),
          max_concurrency: Number(row.max_concurrency || 1),
          last_activity_at: String(session?.last_heartbeat_at_utc || row.last_heartbeat_at_utc || row.updated_at_utc || ""),
          rank_score: insight?.rank_score ?? 0,
          vitality_score: insight?.vitality_score ?? 0
        };
      })
      .sort((a, b) => {
        const officeDelta = officeLabel(a.office_id).localeCompare(officeLabel(b.office_id));
        if (officeDelta !== 0) return officeDelta;
        const roleDelta = roleHierarchyWeight(a.role) - roleHierarchyWeight(b.role);
        if (roleDelta !== 0) return roleDelta;
        return a.alias.localeCompare(b.alias);
      });
  }, [agentRows, executionSessionRows, officeCardsByOffice, officeInsightByCardKey]);

  const agentRolePresence = useMemo(() => {
    const map = new Map<string, { online: boolean; stale: boolean }>();
    const statesByRole = new Map<string, string[]>();
    for (const row of agentRows) {
      const role = String(row.role || "").trim().toUpperCase();
      if (!role) continue;
      const state = String(row.state || "").trim().toLowerCase();
      if (!state) continue;
      const list = statesByRole.get(role) || [];
      list.push(state);
      statesByRole.set(role, list);
    }
    for (const [role, states] of statesByRole.entries()) {
      const online = states.some((state) => state === "running" || state === "idle");
      const stale = !online && states.some((state) => state === "stale");
      map.set(role, { online, stale });
    }
    return map;
  }, [agentRows]);

  const presenceByAssignee = useMemo(() => {
    const map = new Map<string, PresenceAssigneeRow>();
    for (const row of presenceAssigneeRows) {
      const key = String(row.assignee || row.role || "").trim().toUpperCase();
      if (!key) continue;
      map.set(key, row);
    }
    return map;
  }, [presenceAssigneeRows]);

  const presenceByIdentity = useMemo(() => {
    const map = new Map<string, PresenceIdentityRow>();
    for (const row of presenceIdentityRows) {
      const key = String(row.identity || "").trim().toLowerCase();
      if (!key) continue;
      map.set(key, row);
    }
    return map;
  }, [presenceIdentityRows]);

  const presenceByResolvedAgent = useMemo(() => {
    const map = new Map<string, PresenceIdentityRow>();
    for (const row of presenceIdentityRows) {
      const key = String(row.resolved_agent_id || "").trim().toLowerCase();
      if (!key || map.has(key)) continue;
      map.set(key, row);
    }
    return map;
  }, [presenceIdentityRows]);

  const resolveAssigneePresence = useCallback(
    (assigneeRaw: string) => {
      const role = String(assigneeRaw || "").trim().toUpperCase();
      const fromPresence = presenceByAssignee.get(role);
      if (fromPresence) {
        return {
          online: fromPresence.online === true,
          stale: fromPresence.stale === true,
          label: String(fromPresence.label || "Off-line")
        };
      }
      if (role === "STAFF") return { online: true, stale: false, label: "On-line" };
      const roleState = agentRolePresence.get(role);
      if (!roleState) return { online: false, stale: false, label: "Off-line" };
      if (roleState.online) return { online: true, stale: false, label: "On-line" };
      if (roleState.stale) return { online: false, stale: true, label: "Instável" };
      return { online: false, stale: false, label: "Off-line" };
    },
    [agentRolePresence, presenceByAssignee]
  );

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

  const missionCreateRiskNotice = useMemo(() => {
    const onlineSessionByAgent = new Map<string, boolean>();
    for (const row of executionSessionRows) {
      const agentId = String(row.agent_id || "").trim().toLowerCase();
      if (!agentId) continue;
      const status = String(row.status || "").trim().toLowerCase();
      const online = status === "online" || status === "busy" || status === "registered" || status === "waiting";
      if (online) onlineSessionByAgent.set(agentId, true);
    }
    const risky = agentRows.find((row) => {
      const role = String(row.role || "").trim().toUpperCase();
      if (role !== "CPP" && role !== "CPP-IA") return false;
      const agentId = String(row.agent_id || "").trim().toLowerCase();
      return !onlineSessionByAgent.get(agentId);
    });
    if (!risky) return "";
    const agentId = String(risky.agent_id || "").trim() || "cpp-unknown";
    const state = String(agentStateLabel(String(risky.state || "")) || "Off-line").toLowerCase();
    return `AVISO: Há executor sem vínculo detectado (${agentId} - status ${state}).`;
  }, [agentRows, executionSessionRows]);

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
      staff_validation_gate: [],
      open: [],
      in_progress: [],
      paused_waiting_owner: [],
      done: []
    };
    for (const row of queueFilteredRows) {
      const status = String(row.status || "").toLowerCase();
      if (status === "staff_validation_gate" || status === "open" || status === "in_progress" || status === "paused_waiting_owner" || status === "done") {
        grouped[status].push(row);
      }
    }
    return grouped;
  }, [queueFilteredRows]);

  const executionSessionByMission = useMemo(() => {
    const map = new Map<string, ExecutionSessionRow>();
    for (const row of executionSessionRows) {
      const missionId = String(row.current_mission_id || "").trim().toUpperCase();
      if (!missionId) continue;
      const current = map.get(missionId);
      if (!current || String(row.updated_at_utc || "").localeCompare(String(current.updated_at_utc || "")) > 0) {
        map.set(missionId, row);
      }
    }
    return map;
  }, [executionSessionRows]);

  const executionSessionByAgentId = useMemo(() => {
    const map = new Map<string, ExecutionSessionRow>();
    for (const row of executionSessionRows) {
      const agentId = String(row.agent_id || "").trim().toLowerCase();
      if (!agentId) continue;
      const current = map.get(agentId);
      if (!current || String(row.updated_at_utc || "").localeCompare(String(current.updated_at_utc || "")) > 0) {
        map.set(agentId, row);
      }
    }
    return map;
  }, [executionSessionRows]);

  const executionLatestEventByMission = useMemo(() => {
    const map = new Map<string, ExecutionEventRow>();
    for (const row of executionEventRows) {
      const missionId = String(row.mission_id || "").trim().toUpperCase();
      if (!missionId) continue;
      const current = map.get(missionId);
      if (!current || String(row.created_at_utc || "").localeCompare(String(current.created_at_utc || "")) > 0) {
        map.set(missionId, row);
      }
    }
    return map;
  }, [executionEventRows]);

  const executionLatestProgressEventByMission = useMemo(() => {
    const map = new Map<string, ExecutionEventRow>();
    for (const row of executionEventRows) {
      const missionId = String(row.mission_id || "").trim().toUpperCase();
      if (!missionId) continue;
      if (!Number.isFinite(Number(row.progress_pct))) continue;
      const current = map.get(missionId);
      if (!current || String(row.created_at_utc || "").localeCompare(String(current.created_at_utc || "")) > 0) {
        map.set(missionId, row);
      }
    }
    return map;
  }, [executionEventRows]);

  const queueEtaById = useMemo(() => {
    const map = new Map<string, QueueEtaEstimate>();
    for (const row of queueOrderedRows) {
      const key = String(row.queue_id || `${row.mission_id}-${row.title}`);
      map.set(key, estimateQueueEta(row, liveNowEpoch));
    }
    return map;
  }, [liveNowEpoch, queueOrderedRows]);

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

  const missionPackageMap = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const pack of missionPackages) {
      const packageId = String(pack.package_id || "").trim();
      if (!packageId) continue;
      const missionIds = Array.isArray(pack.mission_ids) ? pack.mission_ids : [];
      for (const missionIdRaw of missionIds) {
        const missionId = String(missionIdRaw || "").trim().toUpperCase();
        if (!missionId) continue;
        const current = map.get(missionId) || [];
        if (!current.includes(packageId)) current.push(packageId);
        map.set(missionId, current);
      }
    }
    return map;
  }, [missionPackages]);

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
    if (officeRowsSorted.length === 0) return;
    const selected = officeRowsSorted.find((row) => String(row.office_id || "").toUpperCase() === officeEdit.office_id) || officeRowsSorted[0];
    if (!selected) return;
    const leader = String(selected.leader_id || "").trim().toLowerCase();
    const subs = Array.isArray(selected.subordinate_ids)
      ? Array.from(new Set(selected.subordinate_ids.map((item) => String(item || "").trim().toLowerCase()).filter(Boolean)))
      : [];
    setOfficeEdit((prev) => {
      if (prev.office_id !== officeEdit.office_id) return prev;
      const sameLeader = prev.leader_id === leader;
      const sameSubs = prev.subordinate_ids.length === subs.length && prev.subordinate_ids.every((value, idx) => value === subs[idx]);
      if (sameLeader && sameSubs) return prev;
      return { ...prev, leader_id: leader, subordinate_ids: subs };
    });
  }, [officeEdit.office_id, officeRowsSorted]);

  useEffect(() => {
    if (officeRowsSorted.length === 0) return;
    const currentOffice = String(officeOnboard.office_id || "").trim().toUpperCase();
    const hasCurrent = officeRowsSorted.some((row) => String(row.office_id || "").trim().toUpperCase() === currentOffice);
    if (hasCurrent) return;
    const firstOffice = String(officeRowsSorted[0]?.office_id || "CPP").trim().toUpperCase();
    setOfficeOnboard((prev) => ({ ...prev, office_id: firstOffice || "CPP" }));
  }, [officeOnboard.office_id, officeRowsSorted]);

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

        <section className="gm-collapsible-strip">
          <button
            type="button"
            className="gm-collapsible-toggle"
            onClick={() => setOfficeContextCollapsed((prev) => !prev)}
            aria-expanded={!officeContextCollapsed}
            aria-controls="office-operational-context"
          >
            <span>{officeContextCollapsed ? "Mostrar contexto operacional" : "Recolher contexto operacional"}</span>
            <strong>{officeContextCollapsed ? "Abrir" : "Recolher"}</strong>
          </button>
        </section>

        {!officeContextCollapsed ? (
          <div id="office-operational-context" className="gm-operational-context">
        {queueLead ? (
          <section className="gm-queue-alert" role="status" aria-live="polite">
            <div className="gm-queue-alert-copy">
              <strong>Missão na fila</strong>
              <span>
                Próximo recomendado: {queueLead.title || "avaliar item da fila"}.
              </span>
              <small>
                Missão {queueLead.mission_id || "-"} | Executor {formatChatIdentity(String(queueLead.assignee || "-"))} | Prioridade {queueLead.priority || "-"}
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
                Missão {queueRunningLead.mission_id || "-"} | Executor {formatChatIdentity(String(queueRunningLead.assignee || "-"))} | Prioridade {queueRunningLead.priority || "-"}
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
              {currentRole === "admin" ? (
                <button
                  type="button"
                  className="gm-icon-action"
                  onClick={() => {
                    const reviewGuard = promptReviewerGuardApproval();
                    if (!reviewGuard) {
                      setQueueNotice("Conclusão cancelada: parecer do Reviewer Guard é obrigatório.");
                      return;
                    }
                    void updateQueueStatus(queueRunningLead, "done", "Item marcado como concluído.", {
                      reviewerGuard: reviewGuard,
                      completionNote: `Relatório GOV: missão concluída por ${formatChatIdentity(String(queueRunningLead.assignee || "-"))}. Encerramento validado por ${formatChatIdentity(String(reviewGuard.reviewer_guard_by || "-"))}.`
                    });
                  }}
                  aria-label="Concluir"
                  title="Concluir"
                >
                  ✓
                </button>
              ) : null}
            </div>
          </section>
        ) : (
          <section className="gm-queue-empty-alert" role="status" aria-live="polite">
            <div className="gm-queue-alert-copy">
              <strong>Fila ativa vazia</strong>
              <span>Se não há itens em execução, o Staff deve solicitar ao Admin aprovação para a próxima missão.</span>
            </div>
            <div className="gm-queue-alert-actions">
              <button type="button" className="gm-icon-action" onClick={requestNextMissionApproval} aria-label="Solicitar próxima missão" title="Solicitar próxima missão">
                ✉
              </button>
              <button
                type="button"
                className="gm-icon-action"
                onClick={() => { void pullQueueNow(); }}
                aria-label={queueLoading ? "Atualizando fila" : "Atualizar fila"}
                title={queueLoading ? "Atualizando fila" : "Atualizar fila"}
              >
                ↻
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
          </div>
        ) : (
          <p className="gm-meta">Contexto operacional recolhido. Use “Mostrar contexto operacional” para abrir novamente.</p>
        )}

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
              <div className="gm-icon-row">
                <button type="button" className="gm-icon-action" onClick={() => goToSection("missoes")} aria-label="Ir para Missões" title="Ir para Missões">☰</button>
                <button type="button" className="gm-icon-action" onClick={createExecutionPlan} aria-label="Gerar fila automatizada" title="Gerar fila automatizada">⚡</button>
              </div>
            </section>

            <section className="gm-card">
              <h2>Consumo e Controle</h2>
              <div className="gm-list">
                <p>Token control: <strong>{tokenControl.enabled ? "ativo" : "inativo"}</strong></p>
                <p>Hard stop: <strong>{tokenControl.hard_stop ? "ativo" : "inativo"}</strong></p>
                <p>Limite input/output: <strong>{tokenControl.max_input_tokens} / {tokenControl.max_output_tokens}</strong></p>
              </div>
              <button type="button" className="gm-icon-action" onClick={() => goToSection("governanca")} aria-label="Ir para Governança" title="Ir para Governança">◉</button>
            </section>

            <section className="gm-card">
              <h2>Status dos Bots</h2>
              <div className="gm-inline-row">
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
                <button type="button" className="gm-icon-action" onClick={() => setBotStatusRefreshNonce((prev) => prev + 1)} aria-label="Atualizar bots agora" title="Atualizar bots agora">↻</button>
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
                onClick={() => {
                  setMissionsTab("cadastro");
                  setQueueRefreshNonce((prev) => prev + 1);
                  setBotStatusRefreshNonce((prev) => prev + 1);
                  void pullQueueNow({ silent: true });
                }}
                title="Cadastro"
                aria-label="Cadastro"
              >
                ⊞
              </button>
              <button
                type="button"
                className={missionsTab === "gestao" ? "active" : ""}
                onClick={() => setMissionsTab("gestao")}
                title="Gestão"
                aria-label="Gestão"
              >
                ⚙
              </button>
              <button
                type="button"
                onClick={() => setMissionAssetsOpen(true)}
                title="Imagens e Arquivos"
                aria-label="Imagens e Arquivos"
              >
                🖼
              </button>
              {missionsTab === "cadastro" && missionCreateRiskNotice ? (
                <p className="gm-inline-alert-critical">{missionCreateRiskNotice}</p>
              ) : null}
            </div>
            {missionsTab === "cadastro" && missionCreateRiskNotice ? (
              <p className="gm-inline-alert-critical">{missionCreateRiskNotice}</p>
            ) : null}
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
            <label>
              Notas
              <textarea
                rows={3}
                value={mission.notes}
                onChange={(e) => setMission({ ...mission, notes: e.target.value })}
                placeholder="Contexto adicional da missão (opcional)."
              />
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
                    <button type="button" className="gm-icon-action" onClick={() => removePart(index)} aria-label="Remover parte" title="Remover parte">⌫</button>
                  </div>
                  <label>
                    Entrega da Parte
                    <input value={part.goal} onChange={(e) => updatePart(index, { goal: e.target.value })} placeholder="Descreva o objetivo desta parte" />
                  </label>
                </div>
              ))}
            </div>
            <button type="button" className="gm-icon-action" onClick={addPart} aria-label="Adicionar parte" title="Adicionar parte">＋</button>

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

            <div className="gm-action-row">
              <button
                type="button"
                className="gm-icon-action"
                onClick={() => setTokenControl({ ...tokenControl, enabled: !tokenControl.enabled })}
                aria-label={`Token control ${tokenControl.enabled ? "ON" : "OFF"}`}
                title={`Token control ${tokenControl.enabled ? "ON" : "OFF"}`}
              >
                {tokenControl.enabled ? "🟢" : "⚪"}
              </button>
              <button
                type="button"
                className="gm-icon-action"
                onClick={() => setTokenControl({ ...tokenControl, hard_stop: !tokenControl.hard_stop })}
                aria-label={`Hard stop ${tokenControl.hard_stop ? "ON" : "OFF"}`}
                title={`Hard stop ${tokenControl.hard_stop ? "ON" : "OFF"}`}
              >
                {tokenControl.hard_stop ? "⛔" : "⭕"}
              </button>
            </div>

            <div className="gm-action-row">
              <button type="button" className="gm-icon-action" onClick={estimateCost} aria-label="Prospecção de custo" title="Prospecção de custo">₿</button>
              <button type="button" className="gm-icon-action" onClick={validateMission} aria-label="Validar missão" title="Validar missão">✓</button>
            </div>
            <div className="gm-action-row">
              <button className="gm-icon-action gm-icon-primary" onClick={registerMission} disabled={!missionReadyToRegister} aria-label="Registrar no HUB" title="Registrar no HUB">⬆</button>
              <button type="button" className="gm-icon-action" onClick={() => setMission((prev) => ({ ...prev, id: nextMissionCode }))} aria-label="Auto Mission ID" title="Auto Mission ID">#</button>
            </div>
            <div className="gm-action-row">
              <button type="button" className="gm-icon-action" onClick={createExecutionPlan} aria-label="Gerar fila Staff/CPP/CPP-IA" title="Gerar fila Staff/CPP/CPP-IA">⚡</button>
              <button type="button" className="gm-icon-action" onClick={() => goToSection("orquestracao")} aria-label="Abrir Orquestração" title="Abrir Orquestração">◎</button>
            </div>
              </>
            ) : (
              <>
                <h2>Gestão de Missões</h2>
                <p className="gm-meta">
                  Operações permitidas enquanto a missão estiver em progresso: agrupar, editar e incluir execuções.
                </p>

                <div className="gm-action-row">
                  <button type="button" className="gm-icon-action" onClick={startAllNonPausedMissions} aria-label="Iniciar todas não pausadas" title="Iniciar todas não pausadas">▶</button>
                  <button type="button" className="gm-icon-action" onClick={() => void loadMissionManage()} aria-label="Atualizar gestão" title="Atualizar gestão">↻</button>
                </div>

                <section className="gm-manage-block">
                  <h3>Agrupar Missões na Matriz</h3>
                  <p className="gm-meta">Defina a missão matriz e liste abaixo as missões que serão herdadas por ela.</p>
                  <div className="gm-row">
                    <label className="gm-matrix-field">
                      Missão Matriz
                      <input
                        value={groupPackageId}
                        onChange={(e) => setGroupPackageId(e.target.value.toUpperCase())}
                        placeholder="ex.: GOV-MANAGER-V1-00021"
                      />
                    </label>
                    <label>
                      Missões (IDs) para agrupar na matriz
                      <input
                        value={groupMissionIdsRaw}
                        onChange={(e) => setGroupMissionIdsRaw(e.target.value)}
                        placeholder="ex.: GOV-MANAGER-V1-00024, GOV-MANAGER-V1-00025"
                      />
                    </label>
                  </div>
                  <label>
                    Nota do pacote
                    <input value={groupNote} onChange={(e) => setGroupNote(e.target.value)} placeholder="Contexto do pacote" />
                  </label>
                  <button
                    type="button"
                    className="gm-icon-action gm-icon-primary"
                    onClick={requestGroupMissionsConfirm}
                    disabled={missionManageBusy === "group"}
                    aria-label="Salvar pacote"
                    title="Salvar pacote"
                  >
                    {missionManageBusy === "group" ? "⏳" : "💾"}
                  </button>
                </section>

                <section className="gm-manage-block">
                  <h3>Editar Missão em Progresso</h3>
                  <div className="gm-row">
                    <label>
                      Missão
                      <div className="gm-inline-action">
                        <input
                          value={manageEdit.mission_id}
                          onChange={(e) => setManageEdit((prev) => ({ ...prev, mission_id: e.target.value.toUpperCase() }))}
                          placeholder="ex.: GOV-MANAGER-V1-00015"
                        />
                        <button type="button" onClick={() => void openMissionByIdForEdit()} title="Abrir missão para edição">
                          &gt;
                        </button>
                      </div>
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
                    Solicitação da missão (UDN/Texto)
                    <textarea
                      rows={5}
                      value={manageEdit.request_text}
                      onChange={(e) => setManageEdit((prev) => ({ ...prev, request_text: e.target.value }))}
                      placeholder="Texto original da solicitação da missão."
                    />
                  </label>
                  <label>
                    Notas
                    <textarea rows={3} value={manageEdit.notes} onChange={(e) => setManageEdit((prev) => ({ ...prev, notes: e.target.value }))} />
                  </label>
                  <button
                    type="button"
                    className="gm-icon-action gm-icon-primary"
                    onClick={requestEditMissionConfirm}
                    disabled={missionManageBusy === "edit"}
                    aria-label="Salvar edição"
                    title="Salvar edição"
                  >
                    {missionManageBusy === "edit" ? "⏳" : "💾"}
                  </button>
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
                  <button type="button" className="gm-icon-action gm-icon-primary" onClick={addExecutionToMission} aria-label="Adicionar execução" title="Adicionar execução">＋</button>
                </section>

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
                        <button
                          key={String(row.queue_id || `${row.mission_id}-${row.title}`)}
                          type="button"
                          className="gm-icon-action"
                          onClick={() => loadMissionIntoManageForms(row)}
                          aria-label={`Carregar missão ${String(row.mission_id || "-")}`}
                          title={`${String(row.mission_id || "-")} · ${String(row.title || "Sem título")}`}
                        >
                          ↗
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
            <section className="gm-collapsible-strip">
              <button
                type="button"
                className="gm-collapsible-toggle"
                onClick={() => setOrchestrationContextCollapsed((prev) => !prev)}
                aria-expanded={!orchestrationContextCollapsed}
                aria-controls="orchestration-context"
              >
                <span>Contexto da fila (atualização, métricas e filtros)</span>
                <strong>{orchestrationContextCollapsed ? "Abrir" : "Recolher"}</strong>
              </button>
            </section>
            {!orchestrationContextCollapsed ? (
              <div id="orchestration-context" className="gm-operational-context">
                <div className="gm-inline-row">
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
                  <button type="button" className="gm-icon-action" onClick={() => { void pullQueueNow(); }} aria-label={queueLoading ? "Atualizando fila" : "Atualizar fila"} title={queueLoading ? "Atualizando fila" : "Atualizar fila"}>↻</button>
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
                <p className="gm-meta">
                  Última sincronização BR (São Paulo): {formatDateTime(queueUpdatedAt)}
                  {" · "}Agentes: {formatDateTime(agentsUpdatedAt)}
                </p>
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
                    className="gm-icon-action"
                    onClick={() => {
                      setQueueAssigneeFilter("all");
                      setQueuePriorityFilter("all");
                      setQueueMissionFilter("");
                    }}
                    aria-label="Limpar filtros"
                    title="Limpar filtros"
                  >
                    ⌫
                  </button>
                </div>
              </div>
            ) : (
              <p className="gm-meta">Contexto da fila recolhido. Clique em “Abrir” para exibir controles e filtros.</p>
            )}
            <div className="gm-kanban-board">
              {KANBAN_COLUMNS.filter((column) => column.status !== "done").map((column) => {
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
                      <div className="gm-kanban-column-head-actions">
                        <span>{rows.length}</span>
                        {column.status === "done" && rows.length > 0 ? (
                          <button type="button" className="gm-icon-action" onClick={() => void clearDoneQueueCards()} aria-label="Limpar concluídas" title="Limpar concluídas">
                            ⌫
                          </button>
                        ) : null}
                      </div>
                    </header>
                    <div className="gm-kanban-cards">
                      {rows.length === 0 ? (
                        <p className="gm-empty">Sem itens.</p>
                      ) : (
                        rows.map((row) => {
                          const queueId = String(row.queue_id || `${row.mission_id}-${row.title}`);
                          const missionTooltip = `Missão ${row.mission_id || "-"}`;
                          const eta = queueEtaById.get(queueId) || estimateQueueEta(row, Date.now());
                          const missionId = String(row.mission_id || "").trim().toUpperCase();
                          const executionSession = executionSessionByMission.get(missionId) || null;
                          const latestExecutionEvent = executionLatestEventByMission.get(missionId) || null;
                          const latestProgressEvent = executionLatestProgressEventByMission.get(missionId) || latestExecutionEvent || null;
                          const progressPercent = queueLiveProgressPercent(row, liveNowEpoch, latestProgressEvent);
                          const progressLabel =
                            String(latestProgressEvent?.message || latestExecutionEvent?.message || "").trim() ||
                            String(row.execution_progress_label || "").trim() ||
                            "Aguardando progresso do executor";
                          const statusValue = String(row.status || "").toLowerCase();
                          const statusLed = queueStatusLedMeta(statusValue);
                          const reasonLabel = queueTransitionReasonLabel(row);
                          const executorIdentity = String(
                            row.execution_agent_id ||
                            executionSession?.agent_id ||
                            row.assignee_agent_id ||
                            row.assignee ||
                            "-"
                          ).trim();
                          const executorLabel = formatChatIdentity(executorIdentity);
                          const agentRaw = String(row.assignee_agent_id || executionSession?.agent_id || "").trim();
                          const agentLabel = agentRaw ? formatChatIdentity(agentRaw) : formatRoleAlias(String(row.assignee || "-"));
                          const showAgentLine =
                            Boolean(agentRaw) &&
                            !sameIdentityLabel(executorLabel, agentLabel) &&
                            !sameIdentityLabel(executorLabel, formatRoleAlias(String(row.assignee || "-")));
                          const sessionLabel = executionSession
                            ? `Sessão: ${formatChatIdentity(String(executionSession.agent_id || "-"))} · ${String(executionSession.status || "online").toUpperCase()}`
                            : "";
                          const monitorLabel = formatExecutionMonitorLabel(executionSession, latestExecutionEvent);
                          const fallbackAgentSession = !executionSession && agentRaw
                            ? executionSessionByAgentId.get(agentRaw.toLowerCase()) || null
                            : null;
                          const resolvedMonitorLabel = !executionSession && fallbackAgentSession
                            ? (
                              sessionLooksOnline(String(fallbackAgentSession.status || ""))
                                ? `Monitor: executor online sem vínculo (READY_UNBOUND) · Último heartbeat: ${formatDateTime(String(fallbackAgentSession.last_heartbeat_at_utc || ""))}`
                                : "Monitor: executor sem sessão ativa vinculada (OFF)"
                            )
                            : monitorLabel;
                          const canReconnectBind =
                            (statusValue === "open" || statusValue === "staff_validation_gate") &&
                            (String(row.assignee || "").trim().toUpperCase() === "CPP" || String(row.assignee || "").trim().toUpperCase() === "CPP-IA") &&
                            (resolvedMonitorLabel.includes("READY_UNBOUND") || resolvedMonitorLabel.includes("(OFF)") || resolvedMonitorLabel.includes("sem sessão ativa"));
                          const priorityAccent = queuePriorityAccent(String(row.priority || ""));
                          return (
                            <article
                              key={queueId}
                              className={queueFocusedId && queueFocusedId === queueId ? "gm-kanban-card is-focused" : "gm-kanban-card"}
                              style={{ ["--gm-card-priority" as string]: priorityAccent }}
                              title={missionTooltip}
                              draggable
                              onDragStart={(event) => {
                                event.dataTransfer.setData("text/plain", queueId);
                                setQueueDragId(queueId);
                              }}
                              onDragEnd={() => setQueueDragId("")}
                            >
                              <div className="gm-kanban-row gm-kanban-row-1">
                                <strong className="gm-kanban-title" title={missionTooltip}>{row.title || "Sem título"}</strong>
                                <span
                                  className={`gm-card-state-led gm-card-state-led-${statusLed.tone}`}
                                  title={statusLed.label}
                                  aria-label={statusLed.label}
                                >
                                  <i aria-hidden="true">●</i>
                                </span>
                              </div>
                              <div className="gm-kanban-row gm-kanban-row-2">
                                <p className="gm-card-cell" title={missionTooltip}>Executor: {executorLabel}</p>
                                {showAgentLine ? <p className="gm-card-cell">Agente: {agentLabel}</p> : <span className="gm-card-cell gm-card-cell-empty" />}
                              </div>
                              <div className="gm-kanban-row gm-kanban-row-3">
                                <p className="gm-card-cell gm-card-cell-status">Status: {queueStatusLabel(String(row.status || ""))}</p>
                                <p className="gm-card-cell gm-card-cell-eta">ETA: {eta.label}</p>
                              </div>
                              {reasonLabel && queueReasonOpenId === queueId ? (
                                <div className="gm-reason-popover" role="status" aria-live="polite">
                                  <div>{reasonLabel}</div>
                                  <div className="gm-reason-monitor">{resolvedMonitorLabel}</div>
                                </div>
                              ) : null}
                              <div className="gm-kanban-row gm-kanban-row-4">
                                <small className="gm-kanban-updated-mini">
                                  Atualizado: {formatDateTime(String(row.updated_at_utc || ""))}
                                  {sessionLabel ? ` · ${sessionLabel}` : ""}
                                </small>
                              </div>
                              <div className="gm-kanban-row gm-kanban-row-5">
                                <div className="gm-kanban-actions">
                                <button type="button" className="gm-icon-action" onClick={() => openQueueDetails(row)} aria-label="Detalhes" title="Detalhes">⌕</button>
                                {statusValue === "open" ? (
                                  <button type="button" className="gm-icon-action" onClick={() => { void moveQueueCard(queueId, "in_progress"); }} aria-label="Iniciar" title="Iniciar">▶</button>
                                ) : null}
                                {canReconnectBind ? (
                                  <button
                                    type="button"
                                    className="gm-icon-action"
                                    onClick={() => { void reconnectQueueBinding(queueId); }}
                                    aria-label="Reconectar ou vincular CPP"
                                    title="Reconectar/Vincular CPP"
                                  >
                                    ↻
                                  </button>
                                ) : null}
                                {statusValue === "in_progress" ? (
                                  <>
                                    <button type="button" className="gm-icon-action" onClick={() => { void adjustQueueEta(queueId, 5); }} aria-label="Adicionar 5 min ETA" title="Adicionar 5 min ETA">+5</button>
                                    <button type="button" className="gm-icon-action" onClick={() => { void moveQueueCard(queueId, "paused_waiting_owner"); }} aria-label="Pausar" title="Pausar">⏸</button>
                                    {currentRole === "admin" ? (
                                      <button type="button" className="gm-icon-action" onClick={() => { void moveQueueCard(queueId, "done"); }} aria-label="Concluir" title="Concluir">✓</button>
                                    ) : null}
                                  </>
                                ) : null}
                                {statusValue === "paused_waiting_owner" ? (
                                  <button type="button" className="gm-icon-action" onClick={() => { void moveQueueCard(queueId, "in_progress"); }} aria-label="Retomar" title="Retomar">▶</button>
                                ) : null}
                                {statusValue === "done" ? (
                                  <>
                                    <button type="button" className="gm-icon-action" onClick={() => { void moveQueueCard(queueId, "open"); }} aria-label="Reabrir" title="Reabrir">↺</button>
                                    <button type="button" className="gm-icon-action" onClick={() => { void finalizeQueueCard(queueId); }} aria-label="Finalizar" title="Finalizar">⌫</button>
                                  </>
                                ) : null}
                                {reasonLabel ? (
                                  <button
                                    type="button"
                                    className="gm-icon-action gm-reason-toggle"
                                    onClick={() => setQueueReasonOpenId((current) => (current === queueId ? "" : queueId))}
                                    aria-label="Exibir motivo da transição"
                                    title="Exibir motivo da transição"
                                  >
                                    ℹ
                                  </button>
                                ) : null}
                                </div>
                              </div>
                              <div className="gm-kanban-row gm-kanban-row-6">
                                <div className="gm-kanban-progress" role="progressbar" aria-label={progressLabel} aria-valuemin={0} aria-valuemax={100} aria-valuenow={progressPercent}>
                                  <i style={{ width: `${progressPercent}%` }} />
                                </div>
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
            <section
              className="gm-kanban-column gm-kanban-column-done-row"
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                const dropped = String(event.dataTransfer.getData("text/plain") || queueDragId || "").trim();
                setQueueDragId("");
                if (dropped) void moveQueueCard(dropped, "done");
              }}
            >
              <header className="gm-kanban-column-head">
                <h3>Concluídas</h3>
                <div className="gm-kanban-column-head-actions">
                  <span>{(queueRowsByStatus.done || []).length}</span>
                  {(queueRowsByStatus.done || []).length > 0 ? (
                    <button type="button" className="gm-icon-action" onClick={() => void clearDoneQueueCards()} aria-label="Limpar concluídas" title="Limpar concluídas">
                      ⌫
                    </button>
                  ) : null}
                </div>
              </header>
              <div className="gm-kanban-cards">
                {(queueRowsByStatus.done || []).length === 0 ? (
                  <p className="gm-empty">Sem itens.</p>
                ) : (
                  (queueRowsByStatus.done || []).map((row) => {
                    const queueId = String(row.queue_id || `${row.mission_id}-${row.title}`);
                    const missionTooltip = `Missão ${row.mission_id || "-"}`;
                    const eta = queueEtaById.get(queueId) || estimateQueueEta(row, Date.now());
                    const missionId = String(row.mission_id || "").trim().toUpperCase();
                    const executionSession = executionSessionByMission.get(missionId) || null;
                    const latestExecutionEvent = executionLatestEventByMission.get(missionId) || null;
                    const latestProgressEvent = executionLatestProgressEventByMission.get(missionId) || latestExecutionEvent || null;
                    const progressPercent = queueLiveProgressPercent(row, liveNowEpoch, latestProgressEvent);
                    const progressLabel =
                      String(latestProgressEvent?.message || latestExecutionEvent?.message || "").trim() ||
                      String(row.execution_progress_label || "").trim() ||
                      "Aguardando progresso do executor";
                    const statusValue = String(row.status || "").toLowerCase();
                    const statusLed = queueStatusLedMeta(statusValue);
                    const reasonLabel = queueTransitionReasonLabel(row);
                    const executorIdentity = String(
                      row.execution_agent_id ||
                      executionSession?.agent_id ||
                      row.assignee_agent_id ||
                      row.assignee ||
                      "-"
                    ).trim();
                    const executorLabel = formatChatIdentity(executorIdentity);
                    const agentRaw = String(row.assignee_agent_id || executionSession?.agent_id || "").trim();
                    const agentLabel = agentRaw ? formatChatIdentity(agentRaw) : formatRoleAlias(String(row.assignee || "-"));
                    const showAgentLine =
                      Boolean(agentRaw) &&
                      !sameIdentityLabel(executorLabel, agentLabel) &&
                      !sameIdentityLabel(executorLabel, formatRoleAlias(String(row.assignee || "-")));
                    const sessionLabel = executionSession
                      ? `Sessão: ${formatChatIdentity(String(executionSession.agent_id || "-"))} · ${String(executionSession.status || "online").toUpperCase()}`
                      : "";
                    const monitorLabel = formatExecutionMonitorLabel(executionSession, latestExecutionEvent);
                    const fallbackAgentSession = !executionSession && agentRaw
                      ? executionSessionByAgentId.get(agentRaw.toLowerCase()) || null
                      : null;
                    const resolvedMonitorLabel = !executionSession && fallbackAgentSession
                      ? (
                        sessionLooksOnline(String(fallbackAgentSession.status || ""))
                          ? `Monitor: executor online sem vínculo (READY_UNBOUND) · Último heartbeat: ${formatDateTime(String(fallbackAgentSession.last_heartbeat_at_utc || ""))}`
                          : "Monitor: executor sem sessão ativa vinculada (OFF)"
                      )
                      : monitorLabel;
                    const canReconnectBind =
                      (statusValue === "open" || statusValue === "staff_validation_gate") &&
                      (String(row.assignee || "").trim().toUpperCase() === "CPP" || String(row.assignee || "").trim().toUpperCase() === "CPP-IA") &&
                      (resolvedMonitorLabel.includes("READY_UNBOUND") || resolvedMonitorLabel.includes("(OFF)") || resolvedMonitorLabel.includes("sem sessão ativa"));
                    const priorityAccent = queuePriorityAccent(String(row.priority || ""));
                    return (
                      <article
                        key={queueId}
                        className={queueFocusedId && queueFocusedId === queueId ? "gm-kanban-card is-focused" : "gm-kanban-card"}
                        style={{ ["--gm-card-priority" as string]: priorityAccent }}
                        title={missionTooltip}
                        draggable
                        onDragStart={(event) => {
                          event.dataTransfer.setData("text/plain", queueId);
                          setQueueDragId(queueId);
                        }}
                        onDragEnd={() => setQueueDragId("")}
                      >
                        <div className="gm-kanban-row gm-kanban-row-1">
                          <strong className="gm-kanban-title" title={missionTooltip}>{row.title || "Sem título"}</strong>
                          <span
                            className={`gm-card-state-led gm-card-state-led-${statusLed.tone}`}
                            title={statusLed.label}
                            aria-label={statusLed.label}
                          >
                            <i aria-hidden="true">●</i>
                          </span>
                        </div>
                        <div className="gm-kanban-row gm-kanban-row-2">
                          <p className="gm-card-cell" title={missionTooltip}>Executor: {executorLabel}</p>
                          {showAgentLine ? <p className="gm-card-cell">Agente: {agentLabel}</p> : <span className="gm-card-cell gm-card-cell-empty" />}
                        </div>
                        <div className="gm-kanban-row gm-kanban-row-3">
                          <p className="gm-card-cell gm-card-cell-status">Status: {queueStatusLabel(String(row.status || ""))}</p>
                          <p className="gm-card-cell gm-card-cell-eta">ETA: {eta.label}</p>
                        </div>
                        {reasonLabel && queueReasonOpenId === queueId ? (
                          <div className="gm-reason-popover" role="status" aria-live="polite">
                            <div>{reasonLabel}</div>
                            <div className="gm-reason-monitor">{resolvedMonitorLabel}</div>
                          </div>
                        ) : null}
                        <div className="gm-kanban-row gm-kanban-row-4">
                          <small className="gm-kanban-updated-mini">
                            Atualizado: {formatDateTime(String(row.updated_at_utc || ""))}
                            {sessionLabel ? ` · ${sessionLabel}` : ""}
                          </small>
                        </div>
                        <div className="gm-kanban-row gm-kanban-row-5">
                          <div className="gm-kanban-actions">
                          <button type="button" className="gm-icon-action" onClick={() => openQueueDetails(row)} aria-label="Detalhes" title="Detalhes">⌕</button>
                          {statusValue === "open" ? (
                            <button type="button" className="gm-icon-action" onClick={() => { void moveQueueCard(queueId, "in_progress"); }} aria-label="Iniciar" title="Iniciar">▶</button>
                          ) : null}
                          {canReconnectBind ? (
                            <button
                              type="button"
                              className="gm-icon-action"
                              onClick={() => { void reconnectQueueBinding(queueId); }}
                              aria-label="Reconectar ou vincular CPP"
                              title="Reconectar/Vincular CPP"
                            >
                              ↻
                            </button>
                          ) : null}
                          {statusValue === "in_progress" ? (
                            <>
                              <button type="button" className="gm-icon-action" onClick={() => { void adjustQueueEta(queueId, 5); }} aria-label="Adicionar 5 min ETA" title="Adicionar 5 min ETA">+5</button>
                              <button type="button" className="gm-icon-action" onClick={() => { void moveQueueCard(queueId, "paused_waiting_owner"); }} aria-label="Pausar" title="Pausar">⏸</button>
                              {currentRole === "admin" ? (
                                <button type="button" className="gm-icon-action" onClick={() => { void moveQueueCard(queueId, "done"); }} aria-label="Concluir" title="Concluir">✓</button>
                              ) : null}
                            </>
                          ) : null}
                          {statusValue === "paused_waiting_owner" ? (
                            <button type="button" className="gm-icon-action" onClick={() => { void moveQueueCard(queueId, "in_progress"); }} aria-label="Retomar" title="Retomar">▶</button>
                          ) : null}
                          {statusValue === "done" ? (
                            <>
                              <button type="button" className="gm-icon-action" onClick={() => { void moveQueueCard(queueId, "open"); }} aria-label="Reabrir" title="Reabrir">↺</button>
                              <button type="button" className="gm-icon-action" onClick={() => { void finalizeQueueCard(queueId); }} aria-label="Finalizar" title="Finalizar">⌫</button>
                            </>
                          ) : null}
                          {reasonLabel ? (
                            <button
                              type="button"
                              className="gm-icon-action gm-reason-toggle"
                              onClick={() => setQueueReasonOpenId((current) => (current === queueId ? "" : queueId))}
                              aria-label="Exibir motivo da transição"
                              title="Exibir motivo da transição"
                            >
                              ℹ
                            </button>
                          ) : null}
                          </div>
                        </div>
                        <div className="gm-kanban-row gm-kanban-row-6">
                          <div className="gm-kanban-progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progressPercent}>
                            <i style={{ width: `${progressPercent}%` }} />
                          </div>
                          <small>{progressLabel}</small>
                        </div>
                      </article>
                    );
                  })
                )}
              </div>
            </section>
            <details className="gm-debug">
              <summary>Fila detalhada (diagnóstico)</summary>
              <pre>{queueText || "Sem dados de fila no momento..."}</pre>
            </details>
          </section>
        ) : null}

        {section === "escritorio" ? (
          <section className="gm-card">
            <h2>Control Plane de Agentes</h2>
            <div className="gm-inline-row">
              <label>
                Atualização escritório (seg)
                <select value={queueRefreshSec} onChange={(e) => setQueueRefreshSec(Number(e.target.value || 30))}>
                  <option value={15}>15s</option>
                  <option value={30}>30s</option>
                  <option value={45}>45s</option>
                  <option value={60}>60s</option>
                  <option value={120}>120s</option>
                </select>
              </label>
              <button type="button" className="gm-icon-action" onClick={() => void loadOfficeHierarchy()} aria-label="Atualizar escritório" title="Atualizar escritório">↻</button>
            </div>
            {officeNotice ? <p className="gm-meta">{officeNotice}</p> : null}
            <section className="gm-collapsible-strip">
              <button
                type="button"
                className="gm-collapsible-toggle"
                onClick={() => setOfficeAuditCollapsed((prev) => !prev)}
                aria-expanded={!officeAuditCollapsed}
                aria-controls="office-audit-content"
              >
                <span>Trilha de Governança</span>
                <strong>{officeAuditCollapsed ? "Abrir" : "Recolher"}</strong>
              </button>
            </section>
            {officeAuditCollapsed ? (
              <p className="gm-meta">Trilha recolhida. Clique em “Abrir” para exibir os últimos eventos.</p>
            ) : (
              <section id="office-audit-content" className="gm-manage-block gm-office-audit">
                <p className="gm-meta">Última auditoria BR (São Paulo): {formatDateTime(officeAuditUpdatedAt)}</p>
                <div className="gm-office-audit-list">
                  {officeAuditRows.length === 0 ? (
                    <p className="gm-empty">Sem eventos de governança no momento.</p>
                  ) : (
                    officeAuditRows.map((row) => (
                      <article key={`office-audit-${row.event_id || `${row.action}-${row.created_at_utc}`}`} className="gm-office-audit-item">
                        <div className="gm-office-audit-head">
                          <strong>{row.action || "-"}</strong>
                          <small>{formatDateTime(String(row.created_at_utc || ""))}</small>
                        </div>
                        <p>Ator: {formatChatIdentity(String(row.actor || "-"))}</p>
                        <p>Alvo: {String(row.target || "-")}</p>
                        <p>Mudança: {formatAuditStatePreview(String(row.after_state || row.before_state || ""))}</p>
                      </article>
                    ))
                  )}
                </div>
              </section>
            )}
            <section className="gm-collapsible-strip">
              <button
                type="button"
                className="gm-collapsible-toggle"
                onClick={() => setOfficeInsightsCollapsed((prev) => !prev)}
                aria-expanded={!officeInsightsCollapsed}
                aria-controls="office-insights-content"
              >
                <span>Rank e Vitalidade Operacional</span>
                <strong>{officeInsightsCollapsed ? "Abrir" : "Recolher"}</strong>
              </button>
            </section>
            {officeInsightsCollapsed ? (
              <p className="gm-meta">Rank e Vitalidade recolhido. Clique em “Abrir” para exibir.</p>
            ) : (
              <section id="office-insights-content" className="gm-office-insights">
                <header className="gm-office-insights-head">
                  <div>
                    <h3>Rank e Vitalidade Operacional</h3>
                    <small>Skills impactam ambas as métricas (desempenho e vitalidade).</small>
                  </div>
                </header>
                <div className="gm-office-insights-content">
                  <div className="gm-office-insight-summary">
                    <article>
                      <span>Agentes avaliados</span>
                      <strong>{officeAgentInsights.summary.total.toLocaleString("pt-BR")}</strong>
                    </article>
                    <article>
                      <span>Rank médio</span>
                      <strong>{officeAgentInsights.summary.rankAvg}%</strong>
                    </article>
                    <article>
                      <span>Vitalidade média</span>
                      <strong>{officeAgentInsights.summary.vitalityAvg}%</strong>
                    </article>
                    <article>
                      <span>Participação média</span>
                      <strong>{officeAgentInsights.summary.participationAvg}%</strong>
                    </article>
                    <article>
                      <span>Em risco/perigo</span>
                      <strong>{officeAgentInsights.summary.riskCount.toLocaleString("pt-BR")}</strong>
                    </article>
                    <article>
                      <span>Saudáveis</span>
                      <strong>{officeAgentInsights.summary.healthyCount.toLocaleString("pt-BR")}</strong>
                    </article>
                  </div>
                  <div className="gm-office-by-office">
                    {officeSummaryByOffice.map((office) => (
                      <article key={`office-score-${office.office_id}`} className="gm-office-by-office-item">
                        <div className="gm-office-by-office-head">
                          <strong>{officeLabel(office.office_id)}</strong>
                          <small>{office.count} agente(s)</small>
                        </div>
                        <p>Rank médio: {office.rankAvg}%</p>
                        <div className="gm-score-bar"><i style={{ width: `${office.rankAvg}%` }} /></div>
                        <p>Participação média: {office.participationAvg}%</p>
                        <div className="gm-score-bar gm-participation">
                          <i style={{ width: `${office.participationAvg}%` }} />
                        </div>
                        <p>
                          Vitalidade média: {office.vitalityAvg}% ({vitalityLabel(office.vitalityLevel)})
                        </p>
                        <div className={`gm-score-bar gm-vitality-${office.vitalityLevel}`}>
                          <i style={{ width: `${office.vitalityAvg}%` }} />
                        </div>
                        <p>Risco/perigo: {office.riskCount.toLocaleString("pt-BR")}</p>
                      </article>
                    ))}
                  </div>
                  <div className="gm-office-insight-list">
                    {officeAgentInsights.rows.length === 0 ? (
                      <p className="gm-empty">Sem agentes para cálculo de métricas.</p>
                    ) : (
                      officeAgentInsights.rows.map((row) => (
                        <article key={`office-insight-${row.office_id}-${row.agent_id}`} className="gm-office-insight-item">
                          <div className="gm-office-insight-item-head">
                            <strong>{formatChatIdentity(row.agent_id)}</strong>
                            <small>{officeLabel(row.office_id)}</small>
                          </div>
                          <p>Cargo: {formatRoleAlias(row.role)}</p>
                          <p>Estado: {agentStateLabel(row.state)} | Health: {row.health === "up" ? "UP" : "DOWN"}</p>
                          <p>Load: {row.current_load}/{row.max_concurrency} | Idle: {formatMinutesAge(row.idle_min)}</p>
                          <p>Demanda: open {row.demand_open} | em progresso {row.demand_in_progress}</p>
                          <div className="gm-office-insight-bars">
                            <span>
                              Rank
                              <b>{row.rank_score}%</b>
                            </span>
                            <div className="gm-score-bar"><i style={{ width: `${row.rank_score}%` }} /></div>
                            <span>
                              Vitalidade
                              <b>{row.vitality_score}% ({vitalityLabel(row.vitality_level)})</b>
                            </span>
                            <div className={`gm-score-bar gm-vitality-${row.vitality_level}`}>
                              <i style={{ width: `${row.vitality_score}%` }} />
                            </div>
                            <span>
                              Participação
                              <b>{row.participation_score}%</b>
                            </span>
                            <div className="gm-score-bar gm-participation">
                              <i style={{ width: `${row.participation_score}%` }} />
                            </div>
                            <span>
                              Skills match
                              <b>{Math.round(row.skill_match_ratio * 100)}%</b>
                            </span>
                            <div className="gm-score-bar gm-skill-match">
                              <i style={{ width: `${Math.round(row.skill_match_ratio * 100)}%` }} />
                            </div>
                          </div>
                        </article>
                      ))
                    )}
                  </div>
                </div>
              </section>
            )}
            <section className="gm-collapsible-strip">
              <button
                type="button"
                className="gm-collapsible-toggle"
                onClick={() => setOfficeCatalogCollapsed((prev) => !prev)}
                aria-expanded={!officeCatalogCollapsed}
                aria-controls="office-catalog-content"
              >
                <span>Catálogo de Agentes Operacionais</span>
                <strong>{officeCatalogCollapsed ? "Abrir" : "Recolher"}</strong>
              </button>
            </section>
            {officeCatalogCollapsed ? (
              <p className="gm-meta">Catálogo recolhido. Clique em “Abrir” para exibir os agentes disponíveis.</p>
            ) : (
              <section id="office-catalog-content" className="gm-office-insights">
                <header className="gm-office-insights-head">
                  <div>
                    <h3>Catálogo de Agentes Operacionais</h3>
                    <small>Identidade real, skills, executor pai e modo de consumo por agente.</small>
                  </div>
                </header>
                <div className="gm-office-insights-content">
                  <div className="gm-office-insight-summary">
                    <article>
                      <span>Total</span>
                      <strong>{officeCatalogRows.length.toLocaleString("pt-BR")}</strong>
                    </article>
                    <article>
                      <span>Ativos</span>
                      <strong>{officeCatalogRows.filter((row) => row.health === "up" && row.state !== "down").length.toLocaleString("pt-BR")}</strong>
                    </article>
                    <article>
                      <span>Sem token</span>
                      <strong>{officeCatalogRows.filter((row) => row.token_mode === "no-token").length.toLocaleString("pt-BR")}</strong>
                    </article>
                    <article>
                      <span>Híbridos</span>
                      <strong>{officeCatalogRows.filter((row) => row.token_mode === "hybrid").length.toLocaleString("pt-BR")}</strong>
                    </article>
                    <article>
                      <span>Com token</span>
                      <strong>{officeCatalogRows.filter((row) => row.token_mode === "token").length.toLocaleString("pt-BR")}</strong>
                    </article>
                  </div>
                  <div className="gm-office-insight-list">
                    {officeCatalogRows.length === 0 ? (
                      <p className="gm-empty">Sem agentes disponíveis no catálogo.</p>
                    ) : (
                      officeCatalogRows.map((row) => (
                        <article key={`office-catalog-${row.agent_id}`} className="gm-office-insight-item">
                          <div className="gm-office-insight-item-head">
                            <strong>{row.alias}</strong>
                            <small>{row.office_label}</small>
                          </div>
                          <p>Tipo: {row.type_label}</p>
                          <p>Executor pai: {row.parent_executor}</p>
                          <p>Modo: {row.token_mode}</p>
                          <p>Estado: {agentStateLabel(row.state)} | Health: {row.health === "up" ? "UP" : "DOWN"}</p>
                          <p>Load: {row.current_load}/{row.max_concurrency} | Última atividade: {formatDateTime(row.last_activity_at)}</p>
                          <p>Rank: {row.rank_score}% | Vitalidade: {row.vitality_score}%</p>
                          <small className="gm-office-capabilities">Skills: {row.skills.length > 0 ? row.skills.join(", ") : "sem skills declaradas"}</small>
                        </article>
                      ))
                    )}
                  </div>
                </div>
              </section>
            )}
            <div className="gm-office-board">
              {officeRowsSorted.map((row, index) => {
                const officeId = String(row.office_id || "").trim().toUpperCase();
                const cards = officeCardsByOffice.get(officeId) || [];
                return (
                  <section
                    key={`office-col-${officeId}`}
                    className={index >= 3 ? "gm-office-column gm-office-column-row" : "gm-office-column"}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={(event) => {
                      event.preventDefault();
                      const draggedAgent = String(event.dataTransfer.getData("text/plain") || officeDragAgentId || "").trim().toLowerCase();
                      if (!draggedAgent) return;
                      void moveOfficeMember(draggedAgent, officeId);
                    }}
                  >
                    <header className="gm-office-column-head">
                      <h3>{officeLabel(officeId)}</h3>
                      <span>{cards.length}</span>
                    </header>
                    <div className="gm-office-cards">
                      {cards.length === 0 ? <p className="gm-empty">Sem agentes neste escritório.</p> : null}
                      {cards.map((card) => {
                        const cardKey = `${officeId}|${card.agent_id}`;
                        const metricsOpen = officeCardInsightsOpen[cardKey] === true;
                        const insight = officeInsightByCardKey.get(`${officeId}|${card.agent_id}`);
                        const identityPresence =
                          presenceByIdentity.get(String(card.agent_id || "").trim().toLowerCase()) ||
                          presenceByResolvedAgent.get(String(card.resolved_agent_id || "").trim().toLowerCase()) ||
                          null;
                        const online = identityPresence
                          ? identityPresence.online === true
                          : insight
                          ? insight.health === "up" && insight.state !== "down"
                          : card.health === "up" && card.state !== "down";
                        const stale = identityPresence
                          ? identityPresence.stale === true
                          : insight
                            ? insight.state === "stale"
                            : card.state === "stale";
                        const ledLabel = identityPresence
                          ? String(identityPresence.label || (stale ? "Instável" : online ? "On-line" : "Off-line"))
                          : stale
                            ? "Instável"
                            : online
                              ? "On-line"
                              : "Off-line";
                        const canDrag = currentRole === "admin";
                        const capabilities = card.capabilities.length > 0 ? card.capabilities.join(", ") : "sem capabilities declaradas";
                        const rankScore = insight?.rank_score ?? 0;
                        const vitalityScore = insight?.vitality_score ?? 0;
                        const participationScore = insight?.participation_score ?? 0;
                        const skillMatchPct = Math.round((insight?.skill_match_ratio ?? 0) * 100);
                        const vitality = insight?.vitality_level ?? vitalityLevel(vitalityScore);
                        const currentLoad = insight?.current_load ?? card.current_load;
                        const maxConcurrency = insight?.max_concurrency ?? card.max_concurrency;
                        const demandOpen = insight?.demand_open ?? 0;
                        const demandInProgress = insight?.demand_in_progress ?? 0;
                        const idleLabel = insight ? formatMinutesAge(insight.idle_min) : "-";
                        const healthLabel = String(identityPresence?.health || insight?.health || card.health || "").toLowerCase() === "up"
                          ? "UP"
                          : String(identityPresence?.health || insight?.health || card.health || "").toLowerCase() === "degraded"
                            ? "DEGRADED"
                            : "DOWN";
                        return (
                          <article
                            key={`office-card-${officeId}-${card.agent_id}`}
                            className={officeDragAgentId === card.agent_id ? "gm-office-card is-dragging" : "gm-office-card"}
                            draggable={canDrag}
                            onDragStart={(event) => {
                              if (!canDrag) return;
                              event.dataTransfer.setData("text/plain", card.agent_id);
                              setOfficeDragAgentId(card.agent_id);
                            }}
                            onDragEnd={() => setOfficeDragAgentId("")}
                          >
                            <div className="gm-office-card-head">
                              <div className="gm-office-card-identity">
                                <strong>{formatChatIdentity(card.agent_id)}</strong>
                                <small>{officeLabel(officeId)}</small>
                              </div>
                              <span
                                className={[
                                  "gm-agent-presence",
                                  "gm-agent-presence-dot",
                                  online ? "gm-agent-presence-online" : "gm-agent-presence-offline",
                                  stale ? "gm-agent-presence-stale" : ""
                                ]
                                  .filter(Boolean)
                                  .join(" ")}
                                title={ledLabel}
                                aria-label={ledLabel}
                              >
                                <i aria-hidden="true">●</i>
                              </span>
                            </div>
                            <p>Cargo: {formatRoleAlias(card.role)}</p>
                            <p className="gm-assignee-line">
                              <span>Health: {healthLabel}</span>
                              {identityPresence?.state ? <span>Estado: {String(identityPresence.state || "").toUpperCase()}</span> : null}
                              {card.status_source === "role_fallback" ? (
                                <span
                                  className="gm-role-fallback-chip"
                                  title={
                                    card.resolved_agent_id
                                      ? `Status por papel (fallback). Referência: ${formatChatIdentity(card.resolved_agent_id)}.`
                                      : "Status por papel (fallback)."
                                  }
                                >
                                  Status por papel
                                </span>
                              ) : null}
                              {card.is_leader ? <span>Papel: Líder</span> : null}
                            </p>
                            <p>Load: {currentLoad}/{maxConcurrency} | Idle: {idleLabel}</p>
                            <p>Demanda: open {demandOpen} | em progresso {demandInProgress}</p>
                            <button
                              type="button"
                              className="gm-icon-action gm-office-card-toggle"
                              onClick={() =>
                                setOfficeCardInsightsOpen((prev) => ({
                                  ...prev,
                                  [cardKey]: !metricsOpen
                                }))
                              }
                              aria-expanded={metricsOpen}
                              aria-label={metricsOpen ? "Recolher métricas" : "Expandir métricas"}
                              title={metricsOpen ? "Recolher métricas" : "Expandir métricas"}
                            >
                              {metricsOpen ? "▾ Métricas" : "▸ Métricas"}
                            </button>
                            {metricsOpen ? (
                              <div className="gm-office-insight-bars">
                                <span>
                                  Rank
                                  <b>{rankScore}%</b>
                                </span>
                                <div className="gm-score-bar"><i style={{ width: `${rankScore}%` }} /></div>
                                <span>
                                  Vitalidade
                                  <b>{vitalityScore}% ({vitalityLabel(vitality)})</b>
                                </span>
                                <div className={`gm-score-bar gm-vitality-${vitality}`}>
                                  <i style={{ width: `${vitalityScore}%` }} />
                                </div>
                                <span>
                                  Participação
                                  <b>{participationScore}%</b>
                                </span>
                                <div className="gm-score-bar gm-participation">
                                  <i style={{ width: `${participationScore}%` }} />
                                </div>
                                <span>
                                  Skills match
                                  <b>{skillMatchPct}%</b>
                                </span>
                                <div className="gm-score-bar gm-skill-match">
                                  <i style={{ width: `${skillMatchPct}%` }} />
                                </div>
                              </div>
                            ) : null}
                            <small>
                              Criado: {formatDateOnly(card.created_at_utc)} · Atualizado: {formatDateOnly(card.updated_at_utc)}
                            </small>
                            <small className="gm-office-capabilities">Skills: {capabilities}</small>
                          </article>
                        );
                      })}
                    </div>
                  </section>
                );
              })}
            </div>
            {currentRole === "admin" ? (
              <>
                <section className="gm-manage-block">
                  <h3>Adicionar Funcionário IA (gera missão de onboarding)</h3>
                  <div className="gm-row">
                    <label>
                      ID do agente
                      <input
                        value={officeOnboard.agent_id}
                        onChange={(e) => setOfficeOnboard((prev) => ({ ...prev, agent_id: String(e.target.value || "").trim().toLowerCase() }))}
                        placeholder="ex.: cpp-agent-01"
                      />
                    </label>
                    <label>
                      Cargo
                      <select
                        value={officeOnboard.role}
                        onChange={(e) => setOfficeOnboard((prev) => ({ ...prev, role: String(e.target.value || "CPP").toUpperCase() }))}
                      >
                        <option value="STAFF">STAFF</option>
                        <option value="CPP">CPP</option>
                        <option value="CPP-IA">CPP-IA</option>
                      </select>
                    </label>
                  </div>
                  <div className="gm-row">
                    <label>
                      Escritório de destino
                      <select
                        value={officeOnboard.office_id}
                        onChange={(e) => setOfficeOnboard((prev) => ({ ...prev, office_id: String(e.target.value || "CPP").toUpperCase() }))}
                      >
                        {officeRowsSorted.map((row) => {
                          const officeId = String(row.office_id || "").trim().toUpperCase();
                          return (
                            <option key={`onboard-office-${officeId}`} value={officeId}>
                              {officeLabel(officeId)}
                            </option>
                          );
                        })}
                      </select>
                    </label>
                    <label>
                      Prioridade onboarding
                      <select
                        value={officeOnboard.priority}
                        onChange={(e) => setOfficeOnboard((prev) => ({ ...prev, priority: String(e.target.value || "P1").toUpperCase() }))}
                      >
                        <option value="P0">P0</option>
                        <option value="P1">P1</option>
                        <option value="P2">P2</option>
                        <option value="P3">P3</option>
                      </select>
                    </label>
                  </div>
                  <label className="gm-inline-check">
                    <input
                      type="checkbox"
                      checked={officeOnboard.owner_ack_required === true}
                      onChange={(e) => setOfficeOnboard((prev) => ({ ...prev, owner_ack_required: e.target.checked }))}
                    />
                    <span>Exigir aprovação do Owner (entra em Pausadas aguardando aprovação)</span>
                  </label>
                  <label>
                    Notas de onboarding
                    <textarea
                      rows={3}
                      value={officeOnboard.notes}
                      onChange={(e) => setOfficeOnboard((prev) => ({ ...prev, notes: String(e.target.value || "").slice(0, 400) }))}
                      placeholder="Escopo inicial, restrições e objetivo da entrada."
                    />
                  </label>
                  <button
                    type="button"
                    className="gm-icon-action gm-icon-primary"
                    onClick={requestOfficeOnboarding}
                    disabled={officeOnboarding}
                    aria-label="Solicitar onboarding"
                    title="Solicitar onboarding"
                  >
                    {officeOnboarding ? "…" : "✚"}
                  </button>
                </section>

                <section className="gm-manage-block">
                  <h3>Editar Hierarquia</h3>
                  <div className="gm-row">
                    <label>
                      Escritório
                      <input
                        list="gm-office-options"
                        value={officeEdit.office_id}
                        onChange={(e) =>
                          setOfficeEdit((prev) => ({
                            ...prev,
                            office_id: String(e.target.value || "").trim().toUpperCase()
                          }))
                        }
                        placeholder="ex.: STAFF, CPP, QA, DATA"
                      />
                      <datalist id="gm-office-options">
                        {officeRowsSorted.map((row) => {
                          const officeId = String(row.office_id || "").trim().toUpperCase();
                          if (!officeId) return null;
                          return <option key={`office-option-${officeId}`} value={officeId} />;
                        })}
                      </datalist>
                    </label>
                    <label>
                      Líder
                      <select
                        value={officeEdit.leader_id}
                        onChange={(e) => setOfficeEdit((prev) => ({ ...prev, leader_id: String(e.target.value || "").trim().toLowerCase() }))}
                      >
                        <option value="">Selecione</option>
                        {officeIdentityOptions.map((identity) => (
                          <option key={`leader-${identity}`} value={identity}>
                            {formatChatIdentity(identity)}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <label>
                    Subordinados
                    <select
                      multiple
                      value={officeEdit.subordinate_ids}
                      onChange={(e) => {
                        const selectedValues = Array.from(e.target.selectedOptions).map((option) => option.value.trim().toLowerCase());
                        setOfficeEdit((prev) => ({
                          ...prev,
                          subordinate_ids: Array.from(new Set(selectedValues.filter((value) => value && value !== prev.leader_id)))
                        }));
                      }}
                    >
                      {officeIdentityOptions
                        .filter((identity) => identity !== officeEdit.leader_id)
                        .map((identity) => (
                          <option key={`sub-${identity}`} value={identity}>
                            {formatChatIdentity(identity)}
                          </option>
                        ))}
                    </select>
                  </label>
                  <p className="gm-meta">
                    Selecionado: {officeLabel(officeEdit.office_id)} · líder {formatChatIdentity(officeEdit.leader_id || "-")} · subordinados {officeEdit.subordinate_ids.length}
                  </p>
                  <div className="gm-action-row">
                    <button type="button" className="gm-icon-action" onClick={normalizeOfficeIdentities} aria-label="Normalizar identidades" title="Normalizar identidades">🧭</button>
                    <button type="button" className="gm-icon-action gm-icon-primary" onClick={saveOfficeNode} aria-label="Salvar escritório" title="Salvar escritório">💾</button>
                  </div>
                </section>
              </>
            ) : (
              <p className="gm-meta">Somente Admin pode editar hierarquia, mover membros ou solicitar onboarding.</p>
            )}
            <p className="gm-meta">
              Última sincronização BR (São Paulo): {formatDateTime(officeUpdatedAt)}
              {" · "}Presença: {formatDateTime(presenceUpdatedAt)}
              {" · "}Escritórios monitorados: {presenceOfficeRows.length.toLocaleString("pt-BR")}
            </p>
            <details className="gm-debug">
              <summary>Escritório detalhado (diagnóstico)</summary>
              <pre>{officeText || "Sem dados de escritório..."}</pre>
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
            <div className="gm-chat-composer-shell">
              <span className="gm-chat-composer-label">Mensagem</span>
              <div className="gm-chat-composer">
                <textarea
                  ref={chatMessageRef}
                  rows={1}
                  value={chatMessage}
                  onChange={(e) => setChatMessage(e.target.value)}
                  onKeyDown={handleChatMessageKeyDown}
                  className="gm-chat-composer-input"
                  placeholder={isAdminCommandAction(chatAction) ? "Digite um comando" : "Digite uma mensagem"}
                />
                <button
                  type="button"
                  className={`gm-chat-composer-mic ${chatTranscriptionState === "recording" ? "gm-chat-composer-mic-live" : ""}`}
                  onClick={toggleChatTranscriptionRecording}
                  aria-label={chatTranscriptionState === "recording" ? "Parar gravacao" : "Transcrever audio"}
                  title={chatTranscriptionState === "recording" ? "Parar gravacao" : "Transcrever audio"}
                >
                  {chatTranscriptionState === "recording" ? "■" : "🎤"}
                </button>
              </div>
              <div className="gm-chat-composer-actions">
                <button
                  type="button"
                  className="gm-chat-composer-side gm-chat-composer-plus"
                  onClick={() => setChatComposerToolsOpen((prev) => !prev)}
                  aria-label={chatComposerToolsOpen ? "Fechar opcoes da mensagem" : "Abrir opcoes da mensagem"}
                  title={chatComposerToolsOpen ? "Fechar opcoes da mensagem" : "Abrir opcoes da mensagem"}
                >
                  +
                </button>
                <button
                  type="button"
                  className="gm-chat-composer-side"
                  onClick={copyChatMessageToClipboard}
                  aria-label="Copiar mensagem"
                  title="Copiar mensagem"
                >
                  ☺
                </button>
                <button
                  type="button"
                  className={`gm-chat-composer-mic ${chatTranscriptionState === "recording" ? "gm-chat-composer-mic-live" : ""}`}
                  onClick={toggleChatTranscriptionRecording}
                  aria-label={chatTranscriptionState === "recording" ? "Parar gravacao" : "Transcrever audio"}
                  title={chatTranscriptionState === "recording" ? "Parar gravacao" : "Transcrever audio"}
                >
                  {chatTranscriptionState === "recording" ? "■" : "🎤"}
                </button>
              </div>
            </div>
            {chatAction === "MSG" ? (
              <div className={`gm-chat-transcribe-panel ${chatComposerToolsOpen ? "gm-chat-transcribe-panel-open" : ""}`}>
                <label>
                  Idioma da transcricao
                  <select value={chatTranscriptionLanguage} onChange={(e) => setChatTranscriptionLanguage(e.target.value as ChatTranscriptionLanguageId)}>
                    {CHAT_TRANSCRIPTION_LANGUAGES.map((item) => (
                      <option key={item.id} value={item.id}>{item.label}</option>
                    ))}
                  </select>
                </label>
                <p className="gm-meta">
                  {chatTranscriptionState === "recording"
                    ? "Gravando audio."
                    : chatTranscriptionState === "uploading"
                      ? "Enviando audio efemero para transcricao."
                      : `Limites: ${CHAT_TRANSCRIPTION_MAX_DURATION_SEC}s · ${formatBytes(CHAT_TRANSCRIPTION_MAX_BYTES)} · sem persistencia de audio.`}
                </p>
                {chatTranscriptionDurationSec > 0 && chatTranscriptionState !== "recording" ? (
                  <p className="gm-meta">Ultima captura: {chatTranscriptionDurationSec}s.</p>
                ) : null}
                {chatCopyNotice ? <p className="gm-chat-notice" role="status" aria-live="polite">{chatCopyNotice}</p> : null}
              </div>
            ) : null}
            {chatNotice ? <p className="gm-chat-notice" role="status" aria-live="polite">{chatNotice}</p> : null}
            {currentRole !== "admin" ? (
              <p className="gm-meta">Perfil atual: {currentRole}. Você pode conversar via chat. Comandos operacionais são exclusivos do Admin.</p>
            ) : null}
            <div className="gm-action-row">
              <button type="button" className="gm-icon-action" onClick={() => setChatRefreshNonce((prev) => prev + 1)} aria-label="Atualizar chat" title="Atualizar chat">↻</button>
              <button
                type="button"
                className="gm-icon-action gm-icon-primary"
                onClick={sendOpsCommand}
                aria-label={chatSendLabel}
                title={chatSendLabel}
                disabled={!chatMessage.trim()}
              >
                ➤
              </button>
            </div>
            {chatUnread > 0 ? (
              <div className="gm-chat-alert" role="status" aria-live="polite">
                <span>Vc tem {chatUnread} nova(s) msg.</span>
                <button type="button" className="gm-icon-action" onClick={() => setChatUnread(0)} aria-label="Marcar lidas" title="Marcar lidas">✓</button>
              </div>
            ) : null}
            <div className="gm-action-row">
              <button type="button" className="gm-icon-action" onClick={() => { setChatAction("MSG"); setChatMessage("Recebido. Seguimos no fluxo normal."); }} aria-label="Preset conversa" title="Preset conversa">💬</button>
              {currentRole === "admin" ? <button type="button" className="gm-icon-action" onClick={() => { setChatAction("OK"); setChatMessage("OK. Prosseguir com a execução."); }} aria-label="Preset OK" title="Preset OK">✓</button> : null}
              {currentRole === "admin" ? <button type="button" className="gm-icon-action" onClick={() => { setChatAction("PAUSAR"); setChatMessage("Pausar execução e aguardar owner."); }} aria-label="Preset pausar" title="Preset pausar">⏸</button> : null}
              {currentRole === "admin" ? <button type="button" className="gm-icon-action" onClick={() => { void deleteAllChatMessages(); }} aria-label="Excluir todas as mensagens" title="Excluir todas as mensagens">🗑</button> : null}
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
                      <div className="gm-chat-item-actions">
                        <button
                          type="button"
                          className="gm-chat-action-button"
                          onClick={() => {
                            void deleteChatMessage(rowId);
                          }}
                          aria-label="Excluir mensagem"
                          title="Excluir mensagem"
                        >
                          Excluir
                        </button>
                      </div>
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
                            {opened ? "✕" : `↴ ${replyCount}`}
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
                                    <div className="gm-chat-item-actions">
                                      <button
                                        type="button"
                                        className="gm-chat-action-button"
                                        onClick={() => {
                                          void deleteChatMessage(replyId);
                                        }}
                                        aria-label="Excluir resposta"
                                        title="Excluir resposta"
                                      >
                                        Excluir
                                      </button>
                                    </div>
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
            <div className="gm-inline-row">
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
              <button type="button" className="gm-icon-action" onClick={() => setMonitorRefreshNonce((prev) => prev + 1)} aria-label="Atualizar monitor" title="Atualizar monitor">↻</button>
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
                <div className="gm-action-row">
                  <button type="button" className="gm-icon-action" onClick={() => ownerAck("approve")} aria-label="Aprovar" title="Aprovar">✓</button>
                  <button type="button" className="gm-icon-action" onClick={() => ownerAck("deny")} aria-label="Negar" title="Negar">✕</button>
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
            <div className="gm-action-row">
              <button type="button" className="gm-icon-action" onClick={() => goToSection("missoes")} aria-label="Abrir Missões" title="Abrir Missões">☰</button>
              <button type="button" className="gm-icon-action" onClick={() => goToSection("execucoes")} aria-label="Abrir Execuções" title="Abrir Execuções">▤</button>
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
              <button className="gm-icon-action gm-icon-primary" type="button" onClick={savePrompt} aria-label="Salvar prompt" title="Salvar prompt">💾</button>
            </section>

            <section className="gm-card">
              <h2>Biblioteca</h2>
              <div className="gm-prompt-list">
                {promptLibrary.map((prompt) => (
                  <article key={prompt.prompt_id} className={`gm-prompt-item ${selectedPromptId === prompt.prompt_id ? "active" : ""}`}>
                    <button type="button" className="gm-icon-action" onClick={() => setSelectedPromptId(prompt.prompt_id)} aria-label={`Selecionar ${prompt.prompt_id}`} title={`${prompt.prompt_id} - ${prompt.title}`}>☑</button>
                    <small>{prompt.description || prompt.purpose || "Sem descrição"}</small>
                    <div className="gm-tag-list">
                      {prompt.tags.map((tag) => (
                        <span key={`${prompt.prompt_id}-${tag}`}>{tag}</span>
                      ))}
                    </div>
                    <div className="gm-action-row">
                      <button type="button" className="gm-icon-action" onClick={() => {
                        setSelectedPromptId(prompt.prompt_id);
                        goToSection("missoes");
                      }} aria-label="Usar na missão" title="Usar na missão">↗</button>
                      <button type="button" className="gm-icon-action" onClick={() => deletePrompt(prompt.prompt_id)} aria-label="Excluir prompt" title="Excluir prompt">⌫</button>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          </div>
        ) : null}

        {section === "memoria" ? (
          <div className="gm-grid">
            <section className="gm-card">
              <h2>Consulta Operacional</h2>
              <div className="gm-inline-row">
                <label>
                  Atualização memória (seg)
                  <select value={memoryRefreshSec} onChange={(e) => setMemoryRefreshSec(Number(e.target.value || 60))}>
                    <option value={30}>30s</option>
                    <option value={60}>60s</option>
                    <option value={120}>120s</option>
                    <option value={300}>300s</option>
                  </select>
                </label>
                <button type="button" className="gm-icon-action" onClick={() => setMemoryRefreshNonce((prev) => prev + 1)} aria-label="Atualizar memória" title="Atualizar memória">↻</button>
              </div>
              <div className="gm-row">
                <label>
                  Namespace
                  <input value={memoryNamespace} onChange={(e) => setMemoryNamespace(e.target.value)} placeholder="gov_principal_architect" />
                </label>
                <label>
                  Missão
                  <input value={memoryMissionId} onChange={(e) => setMemoryMissionId(e.target.value.toUpperCase())} placeholder="GOV-MANAGER-V1-00032" />
                </label>
              </div>
              <div className="gm-row">
                <label>
                  Consulta
                  <input value={memoryQuery} onChange={(e) => setMemoryQuery(e.target.value)} placeholder="Principal Architect do GOV" />
                </label>
                <label>
                  Role
                  <input value={memoryRole} onChange={(e) => setMemoryRole(e.target.value.toUpperCase())} placeholder="PRINCIPAL_ARCHITECT" />
                </label>
              </div>
              <label>
                Tags
                <input value={memoryTags} onChange={(e) => setMemoryTags(e.target.value)} placeholder="gov,udn,operating_model" />
              </label>
              <div className="gm-action-row">
                <button type="button" className="gm-icon-action" onClick={() => void loadMemory()} aria-label="Consultar memória" title="Consultar memória">⌕</button>
                <button type="button" className="gm-icon-action" onClick={() => void loadMemory({ starter: true })} aria-label="Gerar starter" title="Gerar starter">⌘</button>
                <button type="button" className="gm-icon-action" onClick={() => void downloadMemorySnapshot("backup")} aria-label="Gerar backup" title="Gerar backup">⛁</button>
                <button type="button" className="gm-icon-action" onClick={() => void downloadMemorySnapshot("export")} aria-label="Download exportação" title="Download exportação">⇩</button>
              </div>
              <p className="gm-meta">{memoryNotice || "Consulte, gere starter, faça backup ou baixe o snapshot da memória."}</p>
              <p className="gm-meta">Última atualização BR (São Paulo): {formatDateTime(memoryUpdatedAt)}</p>
            </section>

            <section className="gm-card">
              <h2>Salvar Contexto</h2>
              <label>
                Tópico
                <input value={memoryStoreTopic} onChange={(e) => setMemoryStoreTopic(e.target.value)} placeholder="identidade-operacional-principal-architect" />
              </label>
              <label>
                Resumo
                <textarea rows={4} value={memoryStoreSummary} onChange={(e) => setMemoryStoreSummary(e.target.value)} placeholder="Resumo UDN ultra-enxuto do contexto." />
              </label>
              <label>
                Conteúdo
                <textarea rows={10} value={memoryStoreContent} onChange={(e) => setMemoryStoreContent(e.target.value)} placeholder="Contexto operacional a ser persistido no RAG do GOV." />
              </label>
              <button className="gm-icon-action gm-icon-primary" type="button" onClick={storeMemory} aria-label="Salvar memória" title="Salvar memória">💾</button>
            </section>

            <section className="gm-card">
              <h2>Resumo do Snapshot</h2>
              <div className="gm-mini-metrics">
                <article>
                  <span>Total de chunks</span>
                  <strong>{Math.round(readNumber(memoryPayload?.total_rows || memoryRows.length)).toLocaleString("pt-BR")}</strong>
                </article>
                <article>
                  <span>Retornados</span>
                  <strong>{Math.round(readNumber(memoryPayload?.count || memoryRows.length)).toLocaleString("pt-BR")}</strong>
                </article>
                <article>
                  <span>Snapshot</span>
                  <strong>{String(memoryPayload?.snapshot_type || "gov_manager_context_memory_v1")}</strong>
                </article>
                <article>
                  <span>Atualizado</span>
                  <strong>{formatDateTime(String(memoryPayload?.updated_at_utc || memoryUpdatedAt))}</strong>
                </article>
              </div>
              <div className="gm-usage-list">
                {memoryRows.length === 0 ? (
                  <p className="gm-empty">Sem resultados de memória para os filtros atuais.</p>
                ) : (
                  memoryRows.map((row) => (
                    <article key={String(row.chunk_id || row.memory_id || Math.random())}>
                      <strong>{String(row.topic || "-")}</strong>
                      <span>{String(row.namespace || "-")}</span>
                      <span>{String(row.mission_id || "-")}</span>
                      <span>{String(row.role || "-")}</span>
                      <span>{Array.isArray(row.tags) && row.tags.length > 0 ? row.tags.join(", ") : "-"}</span>
                      <small>{String(row.summary || row.content || "").slice(0, 260)}</small>
                    </article>
                  ))
                )}
              </div>
            </section>

            <section className="gm-card">
              <h2>Starter / Diagnóstico</h2>
              <details className="gm-debug" open>
                <summary>Payload memória</summary>
                <pre>{memoryText || "Sem dados de memória no momento..."}</pre>
              </details>
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
              <div className="gm-action-row">
                <button
                  type="button"
                  className="gm-icon-action"
                  onClick={() => setPolicy({ ...policy, auto_pause_on_limit: !policy.auto_pause_on_limit })}
                  aria-label={`Auto pause ${policy.auto_pause_on_limit ? "ON" : "OFF"}`}
                  title={`Auto pause ${policy.auto_pause_on_limit ? "ON" : "OFF"}`}
                >
                  {policy.auto_pause_on_limit ? "🟢" : "⚪"}
                </button>
                <button
                  type="button"
                  className="gm-icon-action"
                  onClick={() => setPolicy({ ...policy, hard_stop: !policy.hard_stop })}
                  aria-label={`Hard stop ${policy.hard_stop ? "ON" : "OFF"}`}
                  title={`Hard stop ${policy.hard_stop ? "ON" : "OFF"}`}
                >
                  {policy.hard_stop ? "⛔" : "⭕"}
                </button>
              </div>
              <button className="gm-icon-action gm-icon-primary" type="button" onClick={savePolicy} aria-label="Salvar política" title="Salvar política">💾</button>
            </section>

            <section className="gm-card">
              <h2>Uso em Tempo Real</h2>
              <div className="gm-inline-row">
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
                <button type="button" className="gm-icon-action" onClick={() => setUsageRefreshNonce((prev) => prev + 1)} aria-label="Atualizar uso" title="Atualizar uso">↻</button>
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
              <button type="button" className="gm-icon-action" onClick={() => goToSection("missoes")} aria-label="Revisar parâmetros da missão" title="Revisar parâmetros da missão">↗</button>
            </section>
          </div>
        ) : null}
      </section>

      {queueDetailsOpen && queueDetailsRow ? (
        <div className="gm-modal-backdrop" onClick={() => setQueueDetailsOpen(false)}>
          <section className="gm-modal" onClick={(event) => event.stopPropagation()}>
            <header>
              <h2>Detalhes da Missão</h2>
              <button type="button" className="gm-icon-action" onClick={() => setQueueDetailsOpen(false)} aria-label="Fechar" title="Fechar">✕</button>
            </header>
            {(() => {
              const row = queueDetailsRow;
              const queueId = String(row.queue_id || "").trim();
              const statusValue = String(row.status || "").toLowerCase() as QueueWorkflowStatus;
              const eta = estimateQueueEta(row, Date.now());
              const missionId = String(row.mission_id || "").trim().toUpperCase();
              const boardRow = managedMissionRows.find(
                (item) => String(item.mission_id || "").trim().toUpperCase() === missionId
              );
              const contextUdnText = String(missionUdnById[missionId] || "").trim();
              const notesText = String(boardRow?.notes || "").trim();
              const parsedBoardNotes = parseRequestAndNotes(notesText);
              const descriptionText = String(row.description || "").trim();
              const titleText = String(row.title || "").trim();
              const missionQueueDescriptions = queueRows
                .filter((item) => String(item.mission_id || "").trim().toUpperCase() === missionId)
                .map((item) => String(item.description || "").trim())
                .filter(Boolean);
              const missionChatTexts = chatRows
                .filter((msg) => String(msg.mission_id || "").trim().toUpperCase() === missionId)
                .map((msg) => String(msg.message || "").trim())
                .filter(Boolean)
                .filter((text) => !/^recebido[,.\s]/i.test(text))
                .filter((text) => !/leitura inicial/i.test(text))
                .filter((text) => !/proximo passo recomendado/i.test(text));
              const missionUdnText =
                contextUdnText ||
                extractMissionUdnBlock(notesText) ||
                missionChatTexts.map((value) => extractMissionUdnBlock(value)).find(Boolean) ||
                extractMissionUdnBlock(descriptionText) ||
                missionQueueDescriptions.map((value) => extractMissionUdnBlock(value)).find(Boolean) ||
                "";
              const udnPrimaryRequest = buildPrimaryRequestFromUdn(missionUdnText);
              const muFromUdn = extractUdnMu(missionUdnText);
              const boardUdnPrimaryRequest = buildPrimaryRequestFromUdn(notesText);
              const packageIds = missionPackageMap.get(missionId) || [];
              const requestTextCandidates = [
                boardUdnPrimaryRequest,
                udnPrimaryRequest,
                parsedBoardNotes.requestText,
                parsedBoardNotes.notesText,
                ...missionChatTexts,
                ...missionQueueDescriptions,
                descriptionText,
                String(boardRow?.objective || "").trim(),
                titleText,
                muFromUdn
              ]
                .map((value) => stripMissionUdnBlock(value))
                .map((value) => value.replace(/^Solicitação:\s*/i, "").trim())
                .filter(Boolean);
              const highSignal = requestTextCandidates.find((value) => !isLowSignalRequest(value)) || "";
              const requestText = highSignal || requestTextCandidates[0] || "";
              const requestDisplay = isLowSignalRequest(requestText)
                ? "Solicitação principal não registrada nesta missão."
                : requestText;
              const missionUdnDisplay = missionUdnText || "UDN da missão não registrado.";
              const notesDisplay = notesText || parsedBoardNotes.notesText || "Notas não registradas.";
              const completionNote = String(row.completion_note || "").trim();
              const completionReportBy = String(row.completion_report_by || "").trim();
              const completionReportAt = String(row.completion_report_at_utc || "").trim();
              return (
                <>
                  <div className="gm-detail-grid">
                    <article>
                      <span>Executor</span>
                      <strong>{formatChatIdentity(String(row.assignee || "-"))}</strong>
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
                    <article>
                      <span>Motivo da última transição</span>
                      <strong>{queueTransitionReasonLabel(row) || "-"}</strong>
                    </article>
                    <article>
                      <span>Transição em</span>
                      <strong>{formatDateTime(String(row.last_transition_at_utc || ""))}</strong>
                    </article>
                    <article>
                      <span>Pacote(s)</span>
                      <strong>{packageIds.length > 0 ? packageIds.join(", ") : "-"}</strong>
                    </article>
                  </div>
                  <article className="gm-manage-block">
                    <h3>Solicitação principal da missão</h3>
                    <p className="gm-detail-request">{requestDisplay}</p>
                  </article>
                  <article className="gm-manage-block">
                    <h3>Missão / UDN completo</h3>
                    <p className="gm-detail-request gm-detail-udn">{missionUdnDisplay}</p>
                  </article>
                  <article className="gm-manage-block">
                    <h3>Notas</h3>
                    <p className="gm-detail-request">{notesDisplay}</p>
                  </article>
                  {String(boardRow?.notes || "").trim() ? (
                    <article className="gm-manage-block">
                      <h3>Última edição em Gestão</h3>
                      <p className="gm-detail-request">{String(boardRow?.notes || "").trim()}</p>
                    </article>
                  ) : null}
                  {statusValue === "done" ? (
                    <article className="gm-manage-block">
                      <h3>Nota de conclusão (Padrão GOV)</h3>
                      <p className="gm-detail-request">
                        {completionNote || "Relatório básico não registrado pelo executor."}
                      </p>
                      <p className="gm-meta">
                        Executor reportou: {completionReportBy ? formatChatIdentity(completionReportBy) : "-"} | Em: {completionReportAt ? formatDateTime(completionReportAt) : "-"}
                      </p>
                    </article>
                  ) : null}
                  <div className="gm-detail-actions">
                    <button type="button" className="gm-icon-action" onClick={() => openMissionManageFromQueue(row)} aria-label="Abrir em Missões/Gestão" title="Abrir em Missões/Gestão">↗</button>
                    {queueId && statusValue === "open" ? (
                      <button type="button" className="gm-icon-action" onClick={() => { void moveQueueCard(queueId, "in_progress"); setQueueDetailsOpen(false); }} aria-label="Iniciar" title="Iniciar">▶</button>
                    ) : null}
                    {queueId && statusValue === "in_progress" ? (
                      <>
                        <button type="button" className="gm-icon-action" onClick={() => { void adjustQueueEta(queueId, 5); }} aria-label="Adicionar 5 min ETA" title="Adicionar 5 min ETA">+5</button>
                        <button type="button" className="gm-icon-action" onClick={() => { void moveQueueCard(queueId, "paused_waiting_owner"); setQueueDetailsOpen(false); }} aria-label="Pausar" title="Pausar">⏸</button>
                        {currentRole === "admin" ? (
                          <button type="button" className="gm-icon-action" onClick={() => { void moveQueueCard(queueId, "done"); setQueueDetailsOpen(false); }} aria-label="Concluir" title="Concluir">✓</button>
                        ) : null}
                      </>
                    ) : null}
                    {queueId && statusValue === "paused_waiting_owner" ? (
                      <button type="button" className="gm-icon-action" onClick={() => { void moveQueueCard(queueId, "in_progress"); setQueueDetailsOpen(false); }} aria-label="Retomar" title="Retomar">▶</button>
                    ) : null}
                    {queueId && statusValue === "done" ? (
                      <>
                        <button type="button" className="gm-icon-action" onClick={() => { void moveQueueCard(queueId, "open"); setQueueDetailsOpen(false); }} aria-label="Reabrir" title="Reabrir">↺</button>
                        <button type="button" className="gm-icon-action" onClick={() => { void finalizeQueueCard(queueId); setQueueDetailsOpen(false); }} aria-label="Finalizar" title="Finalizar">⌫</button>
                      </>
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
              <button type="button" className="gm-icon-action" onClick={() => setUsersOpen(false)} aria-label="Fechar" title="Fechar">✕</button>
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
              <button className="gm-icon-action gm-icon-primary" type="button" onClick={createUser} aria-label={selectedUser ? "Atualizar usuário" : "Cadastrar usuário"} title={selectedUser ? "Atualizar usuário" : "Cadastrar usuário"}>💾</button>
              <button
                type="button"
                className="gm-icon-action"
                onClick={async () => {
                  await loadUsers();
                  setUserStatus("Lista atualizada.");
                }}
                aria-label="Atualizar lista"
                title="Atualizar lista"
              >
                ↻
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
                      className="gm-icon-action"
                      onClick={() => selectUserForEdit(String(row.username || ""))}
                      aria-label="Editar usuário"
                      title="Editar usuário"
                    >
                      ✎
                    </button>
                  </article>
                ))
              )}
            </div>
          </section>
        </div>
      ) : null}

      {missionAssetsOpen ? (
        <div className="gm-modal-backdrop" onClick={() => setMissionAssetsOpen(false)}>
          <section className="gm-modal" onClick={(event) => event.stopPropagation()}>
            <header>
              <h2>Imagens e Arquivos</h2>
              <button
                type="button"
                className="gm-icon-action"
                onClick={() => setMissionAssetsOpen(false)}
                aria-label="Fechar"
                title="Fechar"
              >
                ✕
              </button>
            </header>
            <article className="gm-manage-block">
              <p className="gm-meta">Anexos vinculados à missão atual e disponíveis como contexto para execução dos agentes.</p>
              <label>
                Upload de anexos
                <input
                  type="file"
                  multiple
                  onChange={(e) => {
                    void uploadMissionFiles(e.target.files);
                    e.currentTarget.value = "";
                  }}
                  disabled={!missionAssetMissionId || missionAssetBusy}
                />
              </label>
              {missionAssetNotice ? <p className="gm-meta">{missionAssetNotice}</p> : null}
              <div className="gm-mission-assets-list">
                {missionAssets.length === 0 ? (
                  <p className="gm-empty">Sem arquivos anexados.</p>
                ) : (
                  missionAssets.map((asset) => (
                    <article key={asset.asset_id} className={`gm-asset-item ${missionAssetPreviewId === asset.asset_id ? "is-active" : ""}`}>
                      <div>
                        <strong>{asset.file_name}</strong>
                        <small>{asset.mime_type} • {formatAssetBytes(asset.size_bytes)}</small>
                      </div>
                      <div className="gm-action-row">
                        <button
                          type="button"
                          className="gm-icon-action"
                          onClick={() => setMissionAssetPreviewId(asset.asset_id)}
                          aria-label="Abrir anexo"
                          title="Abrir anexo"
                        >
                          ⌕
                        </button>
                        <button
                          type="button"
                          className="gm-icon-action"
                          onClick={() => { void removeMissionAsset(asset.asset_id); }}
                          aria-label="Excluir anexo"
                          title="Excluir anexo"
                        >
                          ⌫
                        </button>
                      </div>
                    </article>
                  ))
                )}
              </div>
              <div className="gm-mission-assets-preview">
                {missionAssetPreview ? (
                  <>
                    <p><strong>Visualização:</strong> {missionAssetPreview.file_name}</p>
                    {missionAssetPreview.mime_type.startsWith("image/") ? (
                      <img
                        src={`/api/govhub/missions/assets?mission_id=${encodeURIComponent(missionAssetPreview.mission_id)}&asset_id=${encodeURIComponent(missionAssetPreview.asset_id)}&download=1`}
                        alt={missionAssetPreview.file_name}
                      />
                    ) : (
                      <a
                        href={`/api/govhub/missions/assets?mission_id=${encodeURIComponent(missionAssetPreview.mission_id)}&asset_id=${encodeURIComponent(missionAssetPreview.asset_id)}&download=1`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Abrir arquivo
                      </a>
                    )}
                  </>
                ) : (
                  <p className="gm-empty">Selecione um anexo para visualizar.</p>
                )}
              </div>
            </article>
          </section>
        </div>
      ) : null}

      {missionManageConfirm ? (
        <div className="gm-modal-backdrop" onClick={() => setMissionManageConfirm(null)}>
          <section className="gm-modal" onClick={(event) => event.stopPropagation()}>
            <header>
              <h2>{missionManageConfirm.title}</h2>
              <button
                type="button"
                className="gm-icon-action"
                onClick={() => setMissionManageConfirm(null)}
                aria-label="Fechar"
                title="Fechar"
              >
                ✕
              </button>
            </header>
            <article className="gm-manage-block">
              <p className="gm-detail-request">{missionManageConfirm.summary}</p>
            </article>
            <div className="gm-detail-actions">
              <button
                type="button"
                className="gm-icon-action"
                onClick={() => setMissionManageConfirm(null)}
                aria-label="Fechar confirmação"
                title="Fechar confirmação"
              >
                ✕
              </button>
              <button
                type="button"
                className="gm-icon-action gm-icon-primary"
                onClick={() => void confirmMissionManageAction()}
                aria-label="Confirmar ação"
                title="Confirmar ação"
              >
                ✓
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </main>
  );
}
