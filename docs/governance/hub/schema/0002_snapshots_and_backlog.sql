-- Governance Hub Phase 1 - Snapshots + Backlog
-- Mission: GOV-0086-GOVHUB-ULTRA-BINARY-SNAPSHOTS

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE SCHEMA IF NOT EXISTS governance;

CREATE TABLE IF NOT EXISTS governance.hub_snapshots (
  snapshot_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_type text NOT NULL,
  protocol text NOT NULL,
  version text NOT NULL,
  encoding text NOT NULL,
  compression text NOT NULL,
  payload_b64 text NOT NULL,
  payload_sha256 text NOT NULL,
  payload_size_bytes integer NOT NULL CHECK (payload_size_bytes >= 0),
  created_at_utc timestamptz NOT NULL DEFAULT now(),
  created_by text NOT NULL,
  source_repo text,
  source_ref text,
  is_active boolean NOT NULL DEFAULT false
);

COMMENT ON TABLE governance.hub_snapshots IS 'Ultra-Binary snapshots for deterministic chat bootstrap.';
COMMENT ON COLUMN governance.hub_snapshots.payload_sha256 IS 'SHA256 of gzip-compressed payload bytes (decoded from payload_b64).';

CREATE INDEX IF NOT EXISTS idx_hub_snapshots_type_created_desc
  ON governance.hub_snapshots (snapshot_type, created_at_utc DESC);

CREATE UNIQUE INDEX IF NOT EXISTS uq_hub_snapshots_active_per_type
  ON governance.hub_snapshots (snapshot_type)
  WHERE is_active = true;

CREATE TABLE IF NOT EXISTS governance.hub_backlog_items (
  backlog_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_key text NOT NULL UNIQUE,
  title text NOT NULL,
  status text NOT NULL CHECK (status IN ('queued', 'in_progress', 'blocked', 'done')),
  priority integer NOT NULL DEFAULT 0,
  owner_repo text NOT NULL,
  notes text,
  created_at_utc timestamptz NOT NULL DEFAULT now(),
  updated_at_utc timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE governance.hub_backlog_items IS 'Formal backlog to preserve paused/incomplete governance missions.';

CREATE INDEX IF NOT EXISTS idx_hub_backlog_status_priority_created
  ON governance.hub_backlog_items (status, priority DESC, created_at_utc ASC);

INSERT INTO governance.hub_backlog_items (mission_key, title, status, priority, owner_repo, notes)
VALUES
  (
    'GOV-0084',
    'Fetch-mission client implementation and CCP hardening completion',
    'queued',
    100,
    'platform',
    'Seeded by GOV-0086. Append additional pending missions through DB + BACKLOG.md mirror process.'
  )
ON CONFLICT (mission_key) DO NOTHING;
