-- Governance Hub V7 - Auto-fix limited controller
-- Mission: GOV-MANAGER-V1-FOUNDATION / AUTO_FIX_LIMITED

CREATE SCHEMA IF NOT EXISTS gov;

ALTER TABLE gov.missions
  ADD COLUMN IF NOT EXISTS autofix_attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS autofix_state text NOT NULL DEFAULT 'idle'
    CHECK (autofix_state IN ('idle', 'round_1', 'round_2', 'resolved', 'paused_waiting_owner')),
  ADD COLUMN IF NOT EXISTS autofix_last_error_code text,
  ADD COLUMN IF NOT EXISTS autofix_last_error_excerpt_256 text,
  ADD COLUMN IF NOT EXISTS owner_call_required boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS paused_reason text;

CREATE INDEX IF NOT EXISTS idx_gov_missions_autofix_state_created_at
  ON gov.missions (autofix_state, created_at DESC);
