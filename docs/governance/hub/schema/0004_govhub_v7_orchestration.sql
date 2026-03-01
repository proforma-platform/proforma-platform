-- GOV HUB V7 Orchestration Foundation
-- Mission: GOV-HUB-V7-N8N-ORCHESTRATION-V1

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE SCHEMA IF NOT EXISTS gov;

CREATE TABLE IF NOT EXISTS gov.missions (
  mission_id text PRIMARY KEY,
  udn_mission text NOT NULL,
  tdv_version text NOT NULL,
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  integrity_hash text NOT NULL
);

CREATE TABLE IF NOT EXISTS gov.mission_runs (
  run_id text PRIMARY KEY,
  mission_id text NOT NULL REFERENCES gov.missions(mission_id) ON DELETE CASCADE,
  branch text NOT NULL,
  agent_id text NOT NULL,
  status text NOT NULL,
  phase text NOT NULL,
  nn integer NOT NULL DEFAULT 0,
  total integer NOT NULL DEFAULT 0,
  udn_state text NOT NULL,
  integrity_hash text NOT NULL,
  report_ref text,
  last_error_code text,
  last_error_excerpt_256 text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS gov.artifacts (
  artifact_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ref text NOT NULL,
  sha256 text NOT NULL,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_gov_mission_runs_status_updated
  ON gov.mission_runs (status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_gov_mission_runs_mission_id
  ON gov.mission_runs (mission_id);

CREATE INDEX IF NOT EXISTS idx_gov_missions_created_at
  ON gov.missions (created_at DESC);
