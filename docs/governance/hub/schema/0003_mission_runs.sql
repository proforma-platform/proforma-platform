-- Governance Hub Phase 1 - Mission Runs Snapshot Layer
-- Mission: IMPLEMENT-SNAPSHOT-UPDATE-V1

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE SCHEMA IF NOT EXISTS governance;

CREATE TABLE IF NOT EXISTS governance.mission_runs (
  run_id text PRIMARY KEY,
  mission_id text NOT NULL,
  branch text NOT NULL,
  status text NOT NULL,
  phase text NOT NULL,
  nn integer NOT NULL DEFAULT 0,
  total integer NOT NULL DEFAULT 0,
  last_event_ts timestamptz,
  last_error_code text,
  last_error_excerpt_256 text,
  report_ref text,
  udn_state text NOT NULL,
  integrity_hash text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE governance.mission_runs IS 'Current mission execution runs used to build mission_runs_v1 snapshots.';
COMMENT ON COLUMN governance.mission_runs.integrity_hash IS 'SHA256 of canonicalized UDN state bytes.';

CREATE INDEX IF NOT EXISTS idx_mission_runs_updated_at_desc
  ON governance.mission_runs (updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_mission_runs_mission_status
  ON governance.mission_runs (mission_id, status, updated_at DESC);
