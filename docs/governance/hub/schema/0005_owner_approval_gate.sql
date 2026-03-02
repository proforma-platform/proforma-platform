-- Governance Hub V7 - Single owner approval gate
-- Mission: GOV-MANAGER-V1-FOUNDATION / PHASE_2_RUNTIME_ADAPTERS

CREATE SCHEMA IF NOT EXISTS gov;

ALTER TABLE gov.missions
  ADD COLUMN IF NOT EXISTS approval_state text NOT NULL DEFAULT 'awaiting_owner_ack'
    CHECK (approval_state IN ('awaiting_owner_ack', 'approved', 'denied')),
  ADD COLUMN IF NOT EXISTS approved_by text,
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS approval_note text;

UPDATE gov.missions
SET approval_state = CASE
  WHEN approval_state IS NULL OR approval_state = '' THEN 'awaiting_owner_ack'
  ELSE approval_state
END;

CREATE INDEX IF NOT EXISTS idx_gov_missions_approval_state_created_at
  ON gov.missions (approval_state, created_at DESC);
