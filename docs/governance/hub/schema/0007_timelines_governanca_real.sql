-- Governance Hub V7 - Timelines Governanca Real
-- Mission: GOV-HUB-V7-TIMELINES-GOVERNANCA-REAL

CREATE SCHEMA IF NOT EXISTS gov;

CREATE TABLE IF NOT EXISTS gov.timeline_dev (
  timeline_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_id text NOT NULL,
  run_id text,
  executor_id text NOT NULL DEFAULT 'unknown',
  performed_by text NOT NULL DEFAULT 'unknown',
  occurred_at timestamptz NOT NULL DEFAULT now(),
  phase text NOT NULL,
  duration_ref text NOT NULL,
  milestone text NOT NULL,
  prompt_executor text NOT NULL,
  quality_gate text NOT NULL,
  context_summary text,
  context_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  udn_line text NOT NULL,
  artifact_ref text,
  event_hash text NOT NULL UNIQUE,
  source text NOT NULL DEFAULT 'timeline-writer',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS gov.timeline_evl (
  timeline_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_id text NOT NULL,
  run_id text,
  executor_id text NOT NULL DEFAULT 'unknown',
  performed_by text NOT NULL DEFAULT 'unknown',
  occurred_at timestamptz NOT NULL DEFAULT now(),
  timeline_ref text NOT NULL,
  event_name text NOT NULL,
  staff_action text NOT NULL,
  context_summary text,
  context_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  artifact_ref text,
  udn_line text NOT NULL,
  event_hash text NOT NULL UNIQUE,
  source text NOT NULL DEFAULT 'timeline-writer',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_timeline_dev_mission_created
  ON gov.timeline_dev (mission_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_timeline_evl_mission_created
  ON gov.timeline_evl (mission_id, created_at DESC);

ALTER TABLE gov.timeline_dev
  ADD COLUMN IF NOT EXISTS executor_id text NOT NULL DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS performed_by text NOT NULL DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS occurred_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS context_summary text,
  ADD COLUMN IF NOT EXISTS context_payload jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE gov.timeline_evl
  ADD COLUMN IF NOT EXISTS executor_id text NOT NULL DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS performed_by text NOT NULL DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS occurred_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS context_summary text,
  ADD COLUMN IF NOT EXISTS context_payload jsonb NOT NULL DEFAULT '{}'::jsonb;
