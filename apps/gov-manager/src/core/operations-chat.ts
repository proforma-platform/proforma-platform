export type ChatAction = "MSG" | "OK" | "PAUSAR" | "NEGAR" | "OWNER_CALL" | "NOVA_MISSAO" | "STATUS";
export type DeliveryStatus = "queued" | "dispatched" | "failed";
export type ChatDirection = "outbound" | "inbound";

export interface ChatMessage {
  message_id: string;
  mission_id: string;
  actor: string;
  target: string;
  action: ChatAction;
  message: string;
  udn_block: string;
  direction: ChatDirection;
  in_reply_to: string;
  source: string;
  delivery_status: DeliveryStatus;
  dispatch_http: number | null;
  dispatch_error_code: string;
  created_at_utc: string;
}

export interface ChatState {
  version: "1.0";
  updated_at_utc: string;
  rows: ChatMessage[];
}

export const ALLOWED_CHAT_ACTIONS = new Set<ChatAction>(["MSG", "OK", "PAUSAR", "NEGAR", "OWNER_CALL", "NOVA_MISSAO", "STATUS"]);

export function nowUtc(): string {
  return new Date().toISOString();
}

export function clampChatText(value: unknown, max: number): string {
  return String(value || "").trim().slice(0, max);
}

export function sanitizeChatState(input: unknown): ChatState {
  if (!input || typeof input !== "object") {
    return { version: "1.0", updated_at_utc: nowUtc(), rows: [] };
  }
  const obj = input as Record<string, unknown>;
  const rows = Array.isArray(obj.rows) ? obj.rows : [];
  const out = rows
    .map((row) => {
      if (!row || typeof row !== "object") return null;
      const r = row as Record<string, unknown>;
      const messageId = clampChatText(r.message_id, 120);
      const missionId = clampChatText(r.mission_id, 120);
      const action = clampChatText(r.action, 20) as ChatAction;
      if (!messageId || !missionId || !ALLOWED_CHAT_ACTIONS.has(action)) return null;
      const created = new Date(clampChatText(r.created_at_utc, 64));
      const createdAt = Number.isNaN(created.getTime()) ? nowUtc() : created.toISOString();
      const delivery = clampChatText(r.delivery_status, 20).toLowerCase();
      const deliveryStatus: DeliveryStatus = delivery === "dispatched" || delivery === "failed" ? (delivery as DeliveryStatus) : "queued";
      const directionRaw = clampChatText(r.direction, 20).toLowerCase();
      const direction: ChatDirection = directionRaw === "inbound" ? "inbound" : "outbound";
      return {
        message_id: messageId,
        mission_id: missionId,
        actor: clampChatText(r.actor, 80),
        target: clampChatText(r.target, 80),
        action,
        message: clampChatText(r.message, 2000),
        udn_block: clampChatText(r.udn_block, 3000),
        direction,
        in_reply_to: clampChatText(r.in_reply_to, 120),
        source: clampChatText(r.source, 80),
        delivery_status: deliveryStatus,
        dispatch_http: Number.isFinite(Number(r.dispatch_http)) ? Number(r.dispatch_http) : null,
        dispatch_error_code: clampChatText(r.dispatch_error_code, 80),
        created_at_utc: createdAt
      } satisfies ChatMessage;
    })
    .filter((row): row is ChatMessage => Boolean(row))
    .sort((a, b) => b.created_at_utc.localeCompare(a.created_at_utc))
    .slice(0, 500);

  return {
    version: "1.0",
    updated_at_utc: nowUtc(),
    rows: out
  };
}

export function toOpsUdn(input: { missionId: string; action: ChatAction; actor: string; target: string; message: string }): string {
  const safe = (text: string) => text.replace(/\r?\n/g, " ").replace(/[;|]/g, ",").trim();
  const kind = input.action === "MSG" ? "CHAT_MSG" : "CHAT_CMD";
  return [
    `!OPS|${safe(input.missionId)}|${input.action}|${kind}`,
    `#actor:${safe(input.actor)};target=${safe(input.target)}`,
    `#msg:${safe(input.message)}`,
    input.action === "MSG" ? "#tau:notify_inbox;persist_audit" : "#tau:dispatch_to_worker;update_queue;persist_audit",
    "!OUT:JSON_ONLY.NO_MD.NO_TXT."
  ].join("\n");
}
