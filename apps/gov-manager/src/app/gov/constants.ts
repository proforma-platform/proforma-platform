import type { ChatUiAction, QueueWorkflowStatus, Section, TokenPolicy } from "./types";

export const ADMIN_COMMAND_ACTIONS = new Set<ChatUiAction>(["OK", "PAUSAR", "NEGAR", "OWNER_CALL", "NOVA_MISSAO"]);
export const PRINCIPAL_ARCHITECT_TARGET = "PRINCIPAL_ARCHITECT";
export const MISSION_INTAKE_AGENT = PRINCIPAL_ARCHITECT_TARGET;
export const MISSION_ID_PREFIX = "GOV-MANAGER-V1-";
export const MISSION_ID_DIGITS = 5;
export const SUPPORT_REPORTED_SUFFIX = " (falha/erro reportado ao time de suporte).";

export const SECTION_ITEMS: Array<{ id: Section; label: string; icon: string }> = [
  { id: "visao", label: "Visão geral", icon: "⌂" },
  { id: "missoes", label: "Missões", icon: "◫" },
  { id: "orquestracao", label: "Orquestração", icon: "◎" },
  { id: "escritorio", label: "Control Plane", icon: "⌬" },
  { id: "chat", label: "Chat HUB", icon: "✉" },
  { id: "execucoes", label: "Execuções", icon: "▤" },
  { id: "pendencias", label: "Pendências", icon: "⎋" },
  { id: "prompts", label: "Prompts", icon: "⌘" },
  { id: "governanca", label: "Governança", icon: "◉" },
  { id: "memoria", label: "Memória", icon: "⧉" }
];

export const KANBAN_COLUMNS: Array<{ status: QueueWorkflowStatus; label: string }> = [
  { status: "staff_validation_gate", label: "Gate Staff" },
  { status: "open", label: "A fazer" },
  { status: "in_progress", label: "Em progresso" },
  { status: "paused_waiting_owner", label: "Pausadas" },
  { status: "done", label: "Concluídas" }
];

export const defaultPolicy: TokenPolicy = {
  daily_token_limit: 60000,
  daily_usd_limit: 12,
  monthly_usd_limit: 240,
  warn_threshold_pct: 80,
  auto_pause_on_limit: true,
  hard_stop: true
};
