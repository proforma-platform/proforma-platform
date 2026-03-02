-- Governance Hub Phase 1 - Initial schema
-- Mission: GOVHUB-F1-PASSO2-SCHEMA

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE SCHEMA IF NOT EXISTS governance;

COMMENT ON SCHEMA governance IS 'Governance Hub operational schema for mission intake, evidence, and decisions.';

CREATE TABLE IF NOT EXISTS governance.missions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_key text NOT NULL UNIQUE,
  title text,
  status text NOT NULL CHECK (
    status IN (
      'intake',
      'prompt_pack',
      'execution',
      'report_ingest',
      'consolidation',
      'decision',
      'evidence_pr',
      'closed',
      'failed'
    )
  ),
  scope text,
  started_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE governance.missions IS 'Mission registry and lifecycle state for Governance Hub.';
COMMENT ON COLUMN governance.missions.mission_key IS 'Stable mission identifier used across intake, reports, decisions, and evidence.';

CREATE TABLE IF NOT EXISTS governance.repositories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  repo_key text NOT NULL UNIQUE,
  repo_url text,
  default_branch text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE governance.repositories IS 'Repository registry used by governance missions.';
COMMENT ON COLUMN governance.repositories.repo_key IS 'Stable repository identifier for contract routing and evidence linkage.';

CREATE TABLE IF NOT EXISTS governance.mission_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_id uuid NOT NULL REFERENCES governance.missions(id) ON DELETE RESTRICT,
  repo_id uuid NOT NULL REFERENCES governance.repositories(id) ON DELETE RESTRICT,
  task_key text NOT NULL,
  status text NOT NULL CHECK (
    status IN ('pending', 'in_progress', 'completed', 'failed', 'blocked', 'skipped')
  ),
  assigned_agent text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (mission_id, repo_id, task_key)
);

COMMENT ON TABLE governance.mission_tasks IS 'Per-repository mission execution units and agent assignment.';

CREATE TABLE IF NOT EXISTS governance.prompt_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_id uuid NOT NULL REFERENCES governance.missions(id) ON DELETE RESTRICT,
  repo_id uuid NOT NULL REFERENCES governance.repositories(id) ON DELETE RESTRICT,
  version_label text,
  content_hash text NOT NULL,
  prompt_payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (mission_id, repo_id, content_hash)
);

COMMENT ON TABLE governance.prompt_versions IS 'Versioned prompt artifacts stored for reproducibility and audit.';
COMMENT ON COLUMN governance.prompt_versions.content_hash IS 'SHA256 hash of normalized prompt payload for immutability checks.';

CREATE TABLE IF NOT EXISTS governance.reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_task_id uuid NOT NULL REFERENCES governance.mission_tasks(id) ON DELETE RESTRICT,
  repo_id uuid NOT NULL REFERENCES governance.repositories(id) ON DELETE RESTRICT,
  head_sha text NOT NULL,
  report_hash text NOT NULL,
  report_payload jsonb NOT NULL,
  ingest_status text NOT NULL CHECK (
    ingest_status IN ('accepted', 'rejected', 'superseded')
  ) DEFAULT 'accepted',
  submitted_by text,
  source_env text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (mission_task_id, head_sha)
);

COMMENT ON TABLE governance.reports IS 'Ingested CODEX reports by mission task and repository state.';
COMMENT ON COLUMN governance.reports.head_sha IS 'Repository HEAD commit hash associated with report execution context.';

CREATE TABLE IF NOT EXISTS governance.decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_id uuid NOT NULL REFERENCES governance.missions(id) ON DELETE RESTRICT,
  decision text NOT NULL CHECK (decision IN ('GO', 'NO_GO', 'CONDITIONAL_GO')),
  decision_hash text NOT NULL,
  rationale text,
  decided_by text,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE governance.decisions IS 'Mission-level consolidation output and GO/NO-GO decision records.';
COMMENT ON COLUMN governance.decisions.decision_hash IS 'SHA256 hash of normalized decision payload for audit verification.';

CREATE TABLE IF NOT EXISTS governance.evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_id uuid NOT NULL REFERENCES governance.missions(id) ON DELETE RESTRICT,
  repo_id uuid NOT NULL REFERENCES governance.repositories(id) ON DELETE RESTRICT,
  evidence_type text NOT NULL CHECK (
    evidence_type IN ('prompt', 'report', 'decision', 'pr', 'build', 'lighthouse', 'other')
  ),
  ref text NOT NULL,
  content_hash text,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE governance.evidence IS 'Evidence registry linking mission artifacts, hashes, and publication references.';
COMMENT ON COLUMN governance.evidence.content_hash IS 'Optional immutable hash pointer for evidence payload verification.';

CREATE INDEX IF NOT EXISTS idx_missions_mission_key ON governance.missions (mission_key);
CREATE INDEX IF NOT EXISTS idx_repositories_repo_key ON governance.repositories (repo_key);
CREATE INDEX IF NOT EXISTS idx_mission_tasks_mission_repo ON governance.mission_tasks (mission_id, repo_id);
CREATE INDEX IF NOT EXISTS idx_reports_task_repo_head ON governance.reports (mission_task_id, repo_id, head_sha);
CREATE INDEX IF NOT EXISTS idx_prompt_versions_mission_repo_hash ON governance.prompt_versions (mission_id, repo_id, content_hash);
CREATE INDEX IF NOT EXISTS idx_decisions_mission_created_desc ON governance.decisions (mission_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_evidence_mission_repo_type ON governance.evidence (mission_id, repo_id, evidence_type);
