-- Governance Hub Phase 1.1 - AUTH v1 + Mission Ledger
-- Mission: GOV-0088-GOVHUB-AUTH-AGENTS-LEDGER-V1

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE SCHEMA IF NOT EXISTS governance;

CREATE TABLE IF NOT EXISTS governance.hub_agents (
  agent_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_key text NOT NULL UNIQUE,
  display_name text,
  owner_repo text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at_utc timestamptz NOT NULL DEFAULT now(),
  updated_at_utc timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE governance.hub_agents IS 'Registered governance agents (CPP/CMED/CPFE...) for scoped authentication.';
COMMENT ON COLUMN governance.hub_agents.agent_key IS 'Stable public identifier for agent attribution in mission flows.';

CREATE TABLE IF NOT EXISTS governance.hub_agent_tokens (
  token_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid NOT NULL REFERENCES governance.hub_agents(agent_id) ON DELETE RESTRICT,
  token_hash text NOT NULL UNIQUE,
  scopes text[] NOT NULL DEFAULT ARRAY[]::text[],
  issued_at_utc timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  revoked_at timestamptz,
  created_at_utc timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE governance.hub_agent_tokens IS 'Token registry with hashed tokens, scope bindings, and revocation/expiry controls.';
COMMENT ON COLUMN governance.hub_agent_tokens.token_hash IS 'SHA256 hash of (token + pepper). Raw tokens MUST NOT be persisted.';

CREATE INDEX IF NOT EXISTS idx_hub_agent_tokens_agent ON governance.hub_agent_tokens(agent_id, created_at_utc DESC);
CREATE INDEX IF NOT EXISTS idx_hub_agent_tokens_active ON governance.hub_agent_tokens(revoked_at, expires_at);
CREATE INDEX IF NOT EXISTS idx_hub_agent_tokens_scopes ON governance.hub_agent_tokens USING gin (scopes);

CREATE TABLE IF NOT EXISTS governance.hub_mission_ledger (
  ledger_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_key text NOT NULL,
  repo_key text NOT NULL,
  stage text NOT NULL,
  actor_agent_key text,
  head_sha text,
  outcome text NOT NULL,
  evidence_json jsonb NOT NULL,
  created_at_utc timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE governance.hub_mission_ledger IS 'Mission timeline ledger for auditable governance events and CCP evidence payloads.';
COMMENT ON COLUMN governance.hub_mission_ledger.evidence_json IS 'Structured mission evidence payload (CCP mission_report and execution metadata).';

CREATE INDEX IF NOT EXISTS idx_hub_mission_ledger_mission_created ON governance.hub_mission_ledger(mission_key, created_at_utc DESC);
CREATE INDEX IF NOT EXISTS idx_hub_mission_ledger_repo_stage ON governance.hub_mission_ledger(repo_key, stage, created_at_utc DESC);
