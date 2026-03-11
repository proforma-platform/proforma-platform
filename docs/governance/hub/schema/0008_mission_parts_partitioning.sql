-- GOV HUB V7 Mission Partitioning
-- Mission: GOV-MANAGER-V1-PARTITION-QUEUE

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE SCHEMA IF NOT EXISTS gov;

CREATE TABLE IF NOT EXISTS gov.mission_parts (
  part_uuid uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_id text NOT NULL REFERENCES gov.missions(mission_id) ON DELETE CASCADE,
  part_id text NOT NULL,
  goal text NOT NULL,
  executor_id text NOT NULL CHECK (executor_id IN ('STAFF', 'CPP', 'CPP-IA')),
  priority text NOT NULL CHECK (priority IN ('P0', 'P1', 'P2')),
  order_index integer NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'in_progress', 'completed', 'blocked', 'paused')),
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (mission_id, part_id)
);

CREATE INDEX IF NOT EXISTS idx_gov_mission_parts_mission_order
  ON gov.mission_parts (mission_id, order_index ASC);

CREATE INDEX IF NOT EXISTS idx_gov_mission_parts_executor_status
  ON gov.mission_parts (executor_id, status, priority, created_at DESC);
