# ADR-GOV-HUB-2026 — Governance Hub (n8n + Postgres + GitHub App)
## Status
Accepted (Phase 1 MVP foundation)

## Context
Proforma Platform governance is documented and policy-driven under GOV-0070, but execution evidence is still fragmented across chats, local terminals, and pull requests. Governance quality depends on manual consolidation and implicit operator memory.

The platform already has the baseline runtime components required for operational governance:
- n8n running in Docker
- PostgreSQL already provisioned
- GitHub App `governance-bot` approved for automation scope

## Problem Statement
Narrative governance is not sufficient for enterprise auditability. We need operational governance with deterministic mission lifecycle, evidence contracts, and immutable audit records that can be independently verified.

Without a hub contract and audit model:
- Mission state is hard to reconcile across repositories.
- Decision provenance is weak.
- Re-execution and independent verification are costly.
- Governance scales poorly as the number of repositories grows.

## Decision
Adopt a Governance Hub model backed by n8n + PostgreSQL + GitHub App, with GOV-0070 remaining the authority for repository governance rules.

The hub MUST operate as orchestration and evidence consolidation layer, not as policy override.

The hub MUST enforce PR-only delivery posture:
- direct pushes to `main` are forbidden by policy;
- governance workflows MUST produce evidence via branch/PR artifacts;
- decisions MUST reference immutable evidence hashes.

## Architecture Overview
Phase 1 architecture:
- Ingress: mission-intake and report-ingest webhooks
- Orchestration: n8n workflows (mission state machine)
- Persistence: PostgreSQL (missions, artifacts, decisions, hashes)
- Publication: GitHub App bot opens/updates evidence PRs

Core bounded capabilities:
- Mission intake and normalization
- Prompt pack distribution metadata
- Report ingestion and contract validation
- Consolidation and GO/NO-GO decision emission
- Evidence publication to repository

## Data & Audit Trail Strategy
All governance artifacts MUST be hash-addressed.

For each mission, the hub stores:
- normalized mission payload
- prompt pack payload
- CODEX report payload(s)
- final decision payload
- SHA256 hash per artifact
- linkage metadata (repo, branch, head SHA, mission key, timestamps)

Audit records MUST be append-only. Updates MAY add superseding entries but MUST NOT mutate prior hashes.

## Security Model
Authentication and integrity controls:
- webhook authentication via shared token header (defined in contracts)
- strict payload validation and schema versioning
- secret redaction and rejection rules for unsafe payloads
- least-privilege GitHub App permissions

Governance authority boundary:
- GOV-0070 remains policy authority
- Hub automation MUST NOT bypass branch protections
- Hub bot actions MUST remain PR-based and auditable

## Operational Model
Operational posture:
- workflows are mission-scoped and idempotent
- mission key + repo key + head SHA define execution identity
- failed steps MUST be retry-safe
- consolidation is deterministic from stored artifacts

Mission progress MUST be traceable from intake to decision with explicit state transitions.

## Alternatives Considered
1. Keep governance manual only
- Rejected: low scalability, weak auditability, high operator dependence.

2. GitHub-only automation without orchestration DB
- Rejected: limited lifecycle state modeling, weaker evidence normalization.

3. Build custom governance service now
- Rejected for Phase 1: higher lead time and maintenance cost versus n8n MVP.

## Risks and Mitigations
SPOF risk (n8n instance)
- Mitigation: persistent mission state in PostgreSQL, idempotent workflows, restart-safe execution.

Latency risk (webhook-to-decision time)
- Mitigation: async ingestion, queue-style retries, SLA targets per phase.

Workflow maintainability risk (n8n complexity)
- Mitigation: modular workflow boundaries, contract-first payloads, versioned docs and ADR controls.

Evidence tampering risk
- Mitigation: SHA256 artifact hashing, append-only audit model, PR-based publication history.

## Rollout Plan (Phase 1–3)
Phase 1 (MVP)
- Contracts + operating model + ADR
- mission-intake and report-ingest
- immutable artifact hashes
- evidence PR publication baseline

Phase 2 (Hardening)
- decision-publish endpoint
- stronger validation, redaction policies, dashboards
- multi-repo mission correlation

Phase 3 (Scale)
- N-repository onboarding model
- expanded policy packs and quality gates
- advanced analytics for governance lead time and drift

## Success Criteria
- Every governance mission produces traceable intake, report, decision artifacts.
- Each artifact has verifiable SHA256 hash stored in audit trail.
- Governance decisions are reproducible from stored records.
- Hub automation operates without violating GOV-0070 controls.
- Evidence publication is PR-based and reviewable.

## Appendix: Glossary
Governance Hub
: Operational orchestration layer for governance missions.

Mission Key
: Unique mission identifier across intake, execution, and consolidation.

Artifact Hash
: SHA256 digest of immutable mission artifact payload.

Consolidation
: Deterministic process combining reports into GO/NO-GO decision.

Evidence PR
: Pull request containing governance evidence, not policy bypass.
