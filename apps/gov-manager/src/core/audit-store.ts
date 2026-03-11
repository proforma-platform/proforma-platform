import { loadSnapshotPayload, saveSnapshotPayload, type GovhubSnapshotConfig } from "./govhub-snapshots";
import { appendAuditRows, createAuditEventId, sanitizeAuditLogState, type AuditEventRow } from "./audit-log";

export const AUDIT_SNAPSHOT_TYPE = String(process.env.GOVHUB_AUDIT_LOG_SNAPSHOT_TYPE || "gov_manager_audit_log_v1").trim();

export async function recordAuditEvent(
  config: GovhubSnapshotConfig,
  input: {
    actor: string;
    role: string;
    action: string;
    target: string;
    before_state?: string;
    after_state?: string;
    correlation_id?: string;
    source?: string;
    createdBy?: string;
  }
): Promise<void> {
  if (!config.baseUrl || !config.token) return;
  const loaded = await loadSnapshotPayload(config, AUDIT_SNAPSHOT_TYPE);
  const state = loaded.found && loaded.payload ? sanitizeAuditLogState(loaded.payload) : sanitizeAuditLogState(null);
  const row: AuditEventRow = {
    event_id: createAuditEventId(),
    actor: String(input.actor || "system").trim() || "system",
    role: String(input.role || "system").trim() || "system",
    action: String(input.action || "unknown").trim().slice(0, 120),
    target: String(input.target || "-").trim().slice(0, 180),
    before_state: String(input.before_state || "").slice(0, 2000),
    after_state: String(input.after_state || "").slice(0, 2000),
    correlation_id: String(input.correlation_id || "").trim().slice(0, 160),
    source: String(input.source || "gov-manager").trim().slice(0, 120) || "gov-manager",
    created_at_utc: new Date().toISOString()
  };

  const next = appendAuditRows(state, [row]);
  await saveSnapshotPayload(config, {
    snapshotType: AUDIT_SNAPSHOT_TYPE,
    payload: next,
    createdBy: String(input.createdBy || input.actor || "system").trim() || "system",
    sourceRepo: "gov-manager",
    sourceRef: "audit"
  });
}
