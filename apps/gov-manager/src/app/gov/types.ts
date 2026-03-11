export type Theme = "dark" | "light";
export type Section = "visao" | "missoes" | "orquestracao" | "escritorio" | "chat" | "execucoes" | "pendencias" | "prompts" | "governanca" | "memoria";
export type MissionsTab = "cadastro" | "gestao";
export type PartExecutor = "STAFF" | "CPP" | "CPP-IA";
export type PartPriority = "P0" | "P1" | "P2";
export type ChatUiAction = "MSG" | "STATUS" | "OK" | "PAUSAR" | "NEGAR" | "OWNER_CALL" | "NOVA_MISSAO";
export type QueueWorkflowStatus = "staff_validation_gate" | "open" | "in_progress" | "done" | "paused_waiting_owner";

export interface MissionPart {
  part_id: string;
  goal: string;
  executor: PartExecutor;
  priority: PartPriority;
}

export interface PromptEntry {
  prompt_id: string;
  title: string;
  description: string;
  purpose: string;
  tags: string[];
  template: string;
  variables: string[];
  prompt_hash: string;
}

export interface TokenPolicy {
  daily_token_limit: number;
  daily_usd_limit: number;
  monthly_usd_limit: number;
  warn_threshold_pct: number;
  auto_pause_on_limit: boolean;
  hard_stop: boolean;
}

export interface UsageSummary {
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

export interface UsageRow {
  mission_id?: string;
  projected_input_tokens?: number;
  projected_output_tokens?: number;
  projected_total_tokens?: number;
  projected_cost_usd?: number;
  projected_cost_brl?: number;
  status?: string;
  created_at_utc?: string;
}

export interface BotStatusRow {
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

export interface QueueRow {
  queue_id?: string;
  mission_id?: string;
  title?: string;
  description?: string;
  kind?: string;
  priority?: string;
  assignee?: string;
  assignee_agent_id?: string;
  execution_session_id?: string;
  execution_agent_id?: string;
  execution_trace_id?: string;
  execution_run_id?: string;
  last_start_request_id?: string;
  last_start_attempt_at_utc?: string;
  last_start_ack_at_utc?: string;
  last_start_error_code?: string;
  last_start_error_message?: string;
  last_start_ack_source?: string;
  last_start_ack_http?: number;
  last_transition_reason_code?: string;
  last_transition_reason_message?: string;
  last_transition_source?: string;
  last_transition_actor?: string;
  last_transition_at_utc?: string;
  execution_progress_pct?: number;
  execution_progress_label?: string;
  eta_adjustment_min?: number;
  completion_note?: string;
  completion_report_by?: string;
  completion_report_at_utc?: string;
  status?: string;
  created_at_utc?: string;
  updated_at_utc?: string;
}

export interface AgentStatusRow {
  agent_id?: string;
  role?: string;
  group?: string;
  capabilities?: string[];
  created_at_utc?: string;
  max_concurrency?: number;
  current_load?: number;
  state?: string;
  health?: string;
  last_heartbeat_at_utc?: string;
  updated_at_utc?: string;
}

export interface OfficeHierarchyRow {
  office_id?: string;
  leader_id?: string;
  subordinate_ids?: string[];
  updated_at_utc?: string;
  updated_by?: string;
}

export interface ExecutionSessionRow {
  session_id?: string;
  agent_id?: string;
  role?: string;
  office_id?: string;
  host?: string;
  channel?: string;
  status?: string;
  current_mission_id?: string;
  current_trace_id?: string;
  current_run_id?: string;
  started_at_utc?: string;
  last_heartbeat_at_utc?: string;
  updated_at_utc?: string;
}

export interface ExecutionEventRow {
  session_id?: string;
  mission_id?: string;
  trace_id?: string;
  run_id?: string;
  event_type?: string;
  stage?: string;
  progress_pct?: number;
  message?: string;
  completion_proof?: string;
  created_at_utc?: string;
}

export type QueueEtaConfidence = "alta" | "media" | "baixa";

export interface QueueEtaEstimate {
  label: string;
  confidence: QueueEtaConfidence;
  deviation_min: number;
}

export interface OfficeAgentCard {
  agent_id: string;
  resolved_agent_id: string;
  role: string;
  office_id: string;
  is_leader: boolean;
  status_source: "exact" | "role_fallback" | "unknown";
  state: string;
  health: string;
  current_load: number;
  max_concurrency: number;
  created_at_utc: string;
  updated_at_utc: string;
  capabilities: string[];
}

export type AgentVitalityLevel = "saudavel" | "atencao" | "risco" | "perigo";

export interface PresenceAssigneeRow {
  assignee?: string;
  role?: string;
  state?: string;
  source?: string;
  label?: string;
  online?: boolean;
  stale?: boolean;
  health?: string;
  open_count?: number;
  in_progress_count?: number;
  paused_count?: number;
  done_count?: number;
  demand_total?: number;
  last_activity_at_utc?: string;
  updated_at_utc?: string;
}

export interface PresenceIdentityRow {
  office_id?: string;
  identity?: string;
  resolved_agent_id?: string;
  role?: string;
  state?: string;
  source?: string;
  label?: string;
  online?: boolean;
  stale?: boolean;
  health?: string;
  last_activity_at_utc?: string;
  updated_at_utc?: string;
}

export interface PresenceOfficeRow {
  office_id?: string;
  state?: string;
  source?: string;
  label?: string;
  online?: boolean;
  stale?: boolean;
  health?: string;
  members_total?: number;
  demand_total?: number;
}

export interface MissionBoardPackage {
  package_id?: string;
  mission_ids?: string[];
  note?: string;
  status?: string;
  created_by?: string;
  created_at_utc?: string;
  updated_at_utc?: string;
}

export interface MissionBoardMission {
  mission_id?: string;
  objective?: string;
  assignee?: string;
  priority?: string;
  status?: string;
  notes?: string;
  updated_at_utc?: string;
  updated_by?: string;
}

export interface MissionAssetRow {
  asset_id: string;
  mission_id: string;
  file_name: string;
  mime_type: string;
  size_bytes: number;
  created_at_utc: string;
  created_by: string;
  download_url?: string;
}

export interface ChatRow {
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

export interface GovUserRow {
  username?: string;
  role?: string;
  active?: boolean;
  created_at_utc?: string;
  updated_at_utc?: string;
}

export interface AuditEventRow {
  event_id?: string;
  actor?: string;
  role?: string;
  action?: string;
  target?: string;
  before_state?: string;
  after_state?: string;
  source?: string;
  created_at_utc?: string;
}

export interface MemoryChunkRow {
  memory_id?: string;
  chunk_id?: string;
  namespace?: string;
  topic?: string;
  content?: string;
  summary?: string;
  tags?: string[];
  mission_id?: string;
  role?: string;
  actor?: string;
  source_type?: string;
  created_at_utc?: string;
  updated_at_utc?: string;
}

export interface SessionInfo {
  actor?: string;
  role?: string;
  is_primary_admin?: boolean;
}

export interface QueueUpdateExtras {
  reviewerGuard?: ReviewerGuardApproval;
  etaDeltaMin?: number;
  etaReason?: string;
  completionNote?: string;
  validationDecision?: "bind_cpp" | "reassign_cpp" | "staff_fallback";
  assignee?: "STAFF" | "CPP" | "CPP-IA";
}

export interface TopNotice {
  message: string;
  variant: "success" | "error" | "info";
}

export type MissionManageConfirmAction = "group" | "edit";

export interface SupportErrorReportInput {
  source: string;
  missionId?: string;
  queueId?: string;
  action?: string;
  errorCode?: string;
  message: string;
  payload?: unknown;
}

export interface ReviewerGuardApproval {
  reviewer_guard_approved: true;
  reviewer_guard_by: string;
  reviewer_guard_note: string;
}
