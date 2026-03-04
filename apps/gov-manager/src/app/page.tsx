'use client';

import { useEffect, useMemo, useRef, useState } from "react";

type Theme = "dark" | "light";
type Section = "visao" | "missoes" | "orquestracao" | "chat" | "execucoes" | "pendencias" | "prompts" | "governanca";
type PartExecutor = "STAFF" | "CPP" | "CPP-IA";
type PartPriority = "P0" | "P1" | "P2";
type ChatUiAction = "MSG" | "STATUS" | "OK" | "PAUSAR" | "NEGAR" | "OWNER_CALL" | "NOVA_MISSAO";

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
  daily_tokens?: number;
  daily_usd?: number;
  monthly_usd?: number;
  daily_count?: number;
  monthly_count?: number;
}

interface UsageRow {
  mission_id?: string;
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
  updated_at_utc?: string;
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

const ADMIN_COMMAND_ACTIONS = new Set<ChatUiAction>(["OK", "PAUSAR", "NEGAR", "OWNER_CALL", "NOVA_MISSAO"]);
const PRINCIPAL_ARCHITECT_TARGET = "PRINCIPAL_ARCHITECT";

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
    timeZone: "UTC"
  }).format(date);
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
  const [isMobile, setIsMobile] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const [mission, setMission] = useState({ id: "", target: "", branch: "main", agent_id: "CPP" });
  const [createdBy, setCreatedBy] = useState("staff@gov-manager");
  const [currentRole, setCurrentRole] = useState("viewer");
  const [isPrimaryAdmin, setIsPrimaryAdmin] = useState(false);
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
  const [queueRefreshSec, setQueueRefreshSec] = useState(30);
  const [queueRefreshNonce, setQueueRefreshNonce] = useState(0);
  const [chatText, setChatText] = useState("");
  const [chatUpdatedAt, setChatUpdatedAt] = useState("");
  const [chatRefreshSec, setChatRefreshSec] = useState(5);
  const [chatRefreshNonce, setChatRefreshNonce] = useState(0);
  const [chatAction, setChatAction] = useState<ChatUiAction>("MSG");
  const [chatTarget, setChatTarget] = useState("CPP");
  const [chatMessage, setChatMessage] = useState("");
  const [chatNotice, setChatNotice] = useState("");
  const [chatUnread, setChatUnread] = useState(0);
  const [chatPollState, setChatPollState] = useState<"online" | "offline">("online");
  const [chatPingAt, setChatPingAt] = useState("");
  const [projectMissionCount, setProjectMissionCount] = useState(8);
  const [usersOpen, setUsersOpen] = useState(false);
  const [usersText, setUsersText] = useState("");
  const [usersUpdatedAt, setUsersUpdatedAt] = useState("");
  const [userForm, setUserForm] = useState({ username: "", password: "", role: "engineer" });
  const [userStatus, setUserStatus] = useState("");
  const chatSeenMessageIdRef = useRef("");
  const chatInitRef = useRef(false);

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
    const media = window.matchMedia("(max-width: 1100px)");
    const apply = () => {
      const mobile = media.matches;
      setIsMobile(mobile);
      setMobileMenuOpen(!mobile);
    };
    apply();
    if (typeof media.addEventListener === "function") {
      media.addEventListener("change", apply);
      return () => media.removeEventListener("change", apply);
    }
    media.addListener(apply);
    return () => media.removeListener(apply);
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
        const response = await fetch(`/api/govhub/token/usage?owner_id=${encodeURIComponent(createdBy)}`, {
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

  useEffect(() => {
    let active = true;
    const pullQueue = async () => {
      try {
        const response = await fetch("/api/govhub/operations/queue?status=open", { cache: "no-store" });
        const payload = await response.json();
        if (active) {
          setQueueText(JSON.stringify(payload, null, 2));
          setQueueUpdatedAt(new Date().toISOString());
        }
      } catch {
        if (active) {
          setQueueText(JSON.stringify({ status: "error", error_code: "QUEUE_FETCH_FAILED" }, null, 2));
          setQueueUpdatedAt(new Date().toISOString());
        }
      }
    };

    pullQueue();
    const interval = window.setInterval(pullQueue, Math.max(15, queueRefreshSec) * 1000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [queueRefreshNonce, queueRefreshSec]);

  useEffect(() => {
    let active = true;
    const pullChat = async () => {
      try {
        const missionId = mission.id.trim();
        const qs = missionId ? `?mission_id=${encodeURIComponent(missionId)}` : "";
        const response = await fetch(`/api/govhub/operations/chat${qs}`, { cache: "no-store" });
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
              if (unseenInbound > 0 && section !== "chat") {
                setChatUnread((prev) => prev + unseenInbound);
                setChatNotice(`TIM! Você tem ${unseenInbound} nova(s) mensagem(ns).`);
                playTimSound();
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
    setChatUnread(0);
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
    if (isMobile) setMobileMenuOpen(false);
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
    await loadUsers();
  }

  async function createUser() {
    setUserStatus("salvando");
    try {
      const response = await fetch("/api/auth/users", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          username: userForm.username,
          password: userForm.password,
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
      setUserStatus(mode === "updated" ? "ok (senha atualizada)" : "ok (usuário criado)");
      setUserForm({ username: "", password: "", role: "engineer" });
      await loadUsers();
    } catch {
      setUserStatus("erro: USER_CREATE_NETWORK_FAILED");
    }
  }

  function compileUdn() {
    const safe = (value: string) =>
      String(value || "")
        .replace(/\r?\n/g, " ")
        .replace(/[;|]/g, ",")
        .trim();

    const promptRefLine = selectedPrompt
      ? `#ctx_prompt_ref:id=${selectedPrompt.prompt_id};hash=${selectedPrompt.prompt_hash}`
      : "#ctx_prompt_ref:none";

    const lines = [
      `!MIS|${mission.id || "SEM_ID"}|PLAN|REGISTRAR`,
      `#mu:${mission.target || "Registrar missao no GOV-HUB."}`,
      promptRefLine,
      "#staff:classificar;particionar;distribuir",
      ...parts.map(
        (part, index) =>
          `#part:${safe(part.part_id || `P${index + 1}`)};exec=${part.executor};prio=${part.priority};goal=${safe(
            part.goal || "definir entrega"
          )}`
      ),
      "#tau:registrar_missao;monitorar_execucao",
      "#sigma:READY",
      "!OUT:JSON_ONLY.NO_MD.NO_TXT."
    ];
    setUdn(lines.join("\n"));
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

  async function registerMission() {
    setStatus("sending");
    try {
      const response = await fetch("/api/govhub/missions/register", {
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
      setResponseText(JSON.stringify(payload, null, 2));
      setAckRequired(resolveOwnerAckRequired(payload));
      setStatus(response.ok ? "success" : "error");
      goToSection("execucoes");
    } catch {
      setStatus("error");
      setResponseText(JSON.stringify({ status: "error", error_code: "NETWORK_ERROR" }, null, 2));
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
        setChatNotice("Falha no envio. Verifique o retorno técnico abaixo.");
      }
      setChatRefreshNonce((prev) => prev + 1);
      goToSection("chat");
    } catch {
      setStatus("error");
      setChatNotice("Falha de rede ao enviar mensagem/comando.");
      setResponseText(JSON.stringify({ status: "error", error_code: "CHAT_DISPATCH_FAILED" }, null, 2));
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

  const metrics = useMemo(
    () => [
      { label: "Missoes", value: mission.id ? "1 ativa" : "0" },
      { label: "Status", value: status.toUpperCase() },
      { label: "Partes", value: String(parts.length) },
      { label: "Prompt", value: selectedPrompt ? selectedPrompt.prompt_id : "-" },
      { label: "Agente", value: mission.agent_id },
      { label: "Token Ctrl", value: tokenControl.enabled ? "ON" : "OFF" }
    ],
    [mission.agent_id, mission.id, parts.length, selectedPrompt, status, tokenControl.enabled]
  );

  const pendingItems = useMemo(() => {
    const list: string[] = [];
    if (!udn.trim()) list.push("Gerar UDN antes de registrar.");
    if (!mission.id.trim()) list.push("Definir Mission ID.");
    if (ackRequired) list.push("Missao aguardando aprovacao do owner.");
    if (status === "error") list.push("Existe erro operacional pendente no ultimo ciclo.");
    if (list.length === 0) list.push("Sem pendencias criticas neste momento.");
    return list;
  }, [ackRequired, mission.id, status, udn]);

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
    if (section === "missoes") return "Cadastro de missão, particionamento e envio ao HUB.";
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

  const queueSummary = useMemo(() => {
    const fromApi = queuePayload?.summary;
    if (fromApi && typeof fromApi === "object") return fromApi as Record<string, unknown>;
    return {};
  }, [queuePayload]);

  const chatRows = useMemo(() => {
    const rows = chatPayload?.rows;
    return Array.isArray(rows) ? (rows as ChatRow[]) : [];
  }, [chatPayload]);

  const chatSummary = useMemo(() => {
    let queued = 0;
    let dispatched = 0;
    let failed = 0;
    let inbound = 0;
    let outbound = 0;
    for (const row of chatRows) {
      const status = String(row.delivery_status || "").toLowerCase();
      const direction = String(row.direction || "").toLowerCase();
      if (direction === "inbound") inbound += 1;
      else outbound += 1;
      if (status === "dispatched") dispatched += 1;
      else if (status === "failed") failed += 1;
      else queued += 1;
    }
    return { total: chatRows.length, queued, dispatched, failed, inbound, outbound };
  }, [chatRows]);

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

  const topMissionUsage = useMemo(() => {
    const map = new Map<string, { mission_id: string; usd: number; tokens: number; count: number; last_at: string }>();
    for (const row of usageRows) {
      const missionId = String(row.mission_id || "").trim();
      if (!missionId) continue;
      const current = map.get(missionId) || { mission_id: missionId, usd: 0, tokens: 0, count: 0, last_at: "" };
      current.usd += readNumber(row.projected_cost_usd);
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
      <aside className={`gm-sidebar ${isMobile ? "gm-sidebar-mobile" : ""} ${isMobile && !mobileMenuOpen ? "gm-sidebar-collapsed" : ""}`}>
        <div className="gm-brand">
          <div className="gm-brand-seal-wrap">
            <img className="gm-brand-seal" src="/selo-govhub.png" alt="Selo Gov-Hub" />
          </div>
        </div>

        <nav>
          <button className={section === "visao" ? "active" : ""} onClick={() => goToSection("visao")}>Visão geral</button>
          <button className={section === "missoes" ? "active" : ""} onClick={() => goToSection("missoes")}>Missões</button>
          <button className={section === "orquestracao" ? "active" : ""} onClick={() => goToSection("orquestracao")}>Orquestração</button>
          <button className={section === "chat" ? "active" : ""} onClick={() => goToSection("chat")}>
            Chat HUB
            {chatUnread > 0 ? <span className="gm-badge">{chatUnread}</span> : null}
          </button>
          <button className={section === "execucoes" ? "active" : ""} onClick={() => goToSection("execucoes")}>Execuções</button>
          <button className={section === "pendencias" ? "active" : ""} onClick={() => goToSection("pendencias")}>Pendências</button>
          <button className={section === "prompts" ? "active" : ""} onClick={() => goToSection("prompts")}>Prompts</button>
          <button className={section === "governanca" ? "active" : ""} onClick={() => goToSection("governanca")}>Governança</button>
        </nav>

        <div className="gm-sidebar-bottom">
          {isPrimaryAdmin ? <button onClick={openUsersModal}>⚙ Usuários</button> : null}
          <button onClick={() => updateTheme(theme === "dark" ? "light" : "dark")}>Tema: {theme === "dark" ? "Escuro" : "Claro"}</button>
          <button onClick={logout}>Sair</button>
        </div>
      </aside>

      <section className="gm-main">
        {isMobile && !mobileMenuOpen ? (
          <button className="gm-back-menu" type="button" onClick={() => setMobileMenuOpen(true)}>
            ☰ Voltar ao menu
          </button>
        ) : null}
        <header className="gm-header">
          <div>
            <h1>{pageTitle}</h1>
            <p>{pageSubtitle}</p>
          </div>
          <button className="gm-primary" onClick={compileUdn}>Gerar UDN</button>
        </header>

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
              <p className="gm-meta">Último status UTC: {formatDateTime(botStatusUpdatedAt)}</p>
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
            <h2>Criar Missão</h2>
            <label>
              Mission ID
              <input value={mission.id} onChange={(e) => setMission({ ...mission, id: e.target.value })} />
            </label>
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
                  <option value="CPP">CPP</option>
                  <option value="CPP-IA">CPP-IA</option>
                </select>
              </label>
            </div>
            <label>
              Criado por
              <input value={createdBy} onChange={(e) => setCreatedBy(e.target.value)} />
            </label>

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
              <button className="gm-primary" onClick={registerMission} disabled={!udn}>Registrar no HUB</button>
            </div>
            <div className="gm-row">
              <button onClick={createExecutionPlan}>Gerar Fila Staff/CPP/CPP-IA</button>
              <button onClick={() => goToSection("orquestracao")}>Abrir Orquestração</button>
            </div>
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
              <button type="button" onClick={() => setQueueRefreshNonce((prev) => prev + 1)}>
                Atualizar agora
              </button>
            </div>
            <div className="gm-mini-metrics">
              <article>
                <span>Total aberto</span>
                <strong>{Math.round(readNumber(queueSummary.total)).toLocaleString("pt-BR")}</strong>
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
            <p className="gm-meta">Última sincronização UTC: {formatDateTime(queueUpdatedAt)}</p>
            <div className="gm-queue-list">
              {queueRows.length === 0 ? (
                <p className="gm-empty">Sem itens em aberto na fila.</p>
              ) : (
                queueRows.map((row) => (
                  <article key={row.queue_id || `${row.mission_id}-${row.title}`}>
                    <strong>{row.title || "Sem título"}</strong>
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
                  {chatTargetOptions.map((target) => (
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
                    <option key={action} value={action}>{action}</option>
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
            <div className="gm-row">
              <button onClick={() => { setChatAction("MSG"); setChatMessage("Recebido. Seguimos no fluxo normal."); }}>Preset: MSG</button>
              {currentRole === "admin" ? <button onClick={() => { setChatAction("OK"); setChatMessage("OK. Prosseguir com a execução."); }}>Preset: OK</button> : null}
              {currentRole === "admin" ? <button onClick={() => { setChatAction("PAUSAR"); setChatMessage("Pausar execução e aguardar owner."); }}>Preset: PAUSAR</button> : null}
            </div>
            <div className="gm-mini-metrics">
              <article>
                <span>Total</span>
                <strong>{chatSummary.total}</strong>
              </article>
              <article>
                <span>Dispatched</span>
                <strong>{chatSummary.dispatched}</strong>
              </article>
              <article>
                <span>Inbound</span>
                <strong>{chatSummary.inbound}</strong>
              </article>
              <article>
                <span>Queued/Failed</span>
                <strong>{chatSummary.queued + chatSummary.failed}</strong>
              </article>
            </div>
            <p className="gm-meta">Última sincronização UTC: {formatDateTime(chatUpdatedAt)}</p>
            <div className="gm-queue-list">
              {chatRows.length === 0 ? (
                <p className="gm-empty">Sem mensagens no chat operacional.</p>
              ) : (
                chatRows.slice(0, 20).map((row) => (
                  <article key={row.message_id || `${row.mission_id}-${row.created_at_utc}`}>
                    <strong>{row.action || "ACTION"}</strong>
                    <span>Missão: {row.mission_id || "-"}</span>
                    <span>Direção: {row.direction || "outbound"}</span>
                    <span>Ator: {formatChatIdentity(String(row.actor || "-"))}</span>
                    <span>Destino: {formatChatIdentity(String(row.target || "-"))}</span>
                    <span>Status: {row.delivery_status || "-"}</span>
                    <span>HTTP: {row.dispatch_http ?? "-"}</span>
                    <span>Fonte: {row.source || "-"}</span>
                    <small>UTC: {formatDateTime(String(row.created_at_utc || ""))}</small>
                    <small>{row.message || "-"}</small>
                  </article>
                ))
              )}
            </div>
            <details className="gm-debug">
              <summary>Chat detalhado (diagnóstico)</summary>
              <pre>{chatText || "Sem dados do chat no momento..."}</pre>
            </details>
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
            <p className="gm-meta">Último monitor UTC: {formatDateTime(monitorUpdatedAt)}</p>
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
                  <span>USD hoje</span>
                  <strong>{formatUsd(readNumber(usageSummary.daily_usd))}</strong>
                </article>
                <article>
                  <span>USD mês</span>
                  <strong>{formatUsd(readNumber(usageSummary.monthly_usd))}</strong>
                </article>
                <article>
                  <span>Missões hoje</span>
                  <strong>{Math.round(readNumber(usageSummary.daily_count)).toLocaleString("pt-BR")}</strong>
                </article>
              </div>
              <p className="gm-meta">Último uso UTC: {formatDateTime(usageUpdatedAt)}</p>
              <div className="gm-usage-list">
                {topMissionUsage.length === 0 ? (
                  <p className="gm-empty">Sem missões consumindo tokens no momento.</p>
                ) : (
                  topMissionUsage.map((item) => (
                    <article key={item.mission_id}>
                      <strong>{item.mission_id}</strong>
                      <span>{item.tokens.toLocaleString("pt-BR")} tokens</span>
                      <span>{formatUsd(item.usd)}</span>
                      <span>{item.count} lançamentos</span>
                      <span>UTC {formatDateTime(item.last_at)}</span>
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

      {usersOpen ? (
        <div className="gm-modal-backdrop" onClick={() => setUsersOpen(false)}>
          <section className="gm-modal" onClick={(event) => event.stopPropagation()}>
            <header>
              <h2>Cadastro de Usuários</h2>
              <button type="button" onClick={() => setUsersOpen(false)}>Fechar</button>
            </header>
            <div className="gm-row">
              <label>
                Usuário
                <input
                  value={userForm.username}
                  onChange={(e) => setUserForm({ ...userForm, username: e.target.value })}
                  placeholder="engenheiro.01"
                />
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
              <button className="gm-primary" type="button" onClick={createUser}>Cadastrar usuário</button>
              <button type="button" onClick={loadUsers}>Atualizar lista</button>
            </div>
            <p className="gm-meta">Última sincronização UTC: {formatDateTime(usersUpdatedAt)}</p>
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
