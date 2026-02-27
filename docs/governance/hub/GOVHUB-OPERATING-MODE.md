# GOVHUB Operating Mode
## Scope and Principles
GOVHUB defines the operational mode for governance missions across multiple repositories.

Principles:
- Governance evidence MUST be reproducible and auditable.
- Mission execution MUST be contract-driven.
- GOV-0070 remains the governing policy authority for repository controls.
- Hub automation MUST use PR-based publication and MUST NOT bypass protections.

## Roles and Responsibilities
Owner
- Defines business intent and mission scope.
- Approves final governance decisions.

Architect
- Defines mission design, acceptance criteria, and GO/NO-GO thresholds.
- Validates cross-repo architectural coherence.

CODEX Agents (per repo)
- Execute mission prompts in repository scope.
- Produce structured technical reports and evidence references.

Hub (n8n)
- Orchestrates mission lifecycle.
- Validates payload contracts.
- Stores immutable audit artifacts and hashes.

GitHub App bot
- Publishes evidence artifacts via branch/PR flow.
- MUST operate under least privilege.

## Mission Lifecycle
1. Intake
- Mission registered with mission key, scope, and target repositories.

2. Prompt Pack
- Architect-approved instruction pack is issued with explicit constraints.

3. Execution
- CODEX agent executes per repository and emits structured report.

4. Report Ingest
- Hub validates schema, idempotency, and safety rules.

5. Consolidation
- Hub composes technical evidence into mission-level decision payload.

6. Decision
- Architect/Owner reviews GO/NO-GO determination.

7. Evidence PR
- Governance evidence is published in repository via PR.

## Required Artifacts per Mission
Each mission MUST include:
- mission metadata (mission key, scope, repo key, branch, head SHA)
- prompt pack payload hash
- execution report payload hash
- consolidation/decision payload hash
- timestamps and actor metadata

Working tree quality gate:
- Execution evidence SHOULD be produced from clean working tree.
- If not clean, report MUST explicitly declare contamination risk.

## Go / No-Go Rules
Mission GO requires all:
- required artifacts present and schema-valid
- critical policy gates satisfied
- unresolved critical findings = none
- evidence hashes stored and linked

Mission NO-GO if any:
- missing mandatory artifact
- unverifiable or conflicting evidence
- governance gate failure at critical severity
- unresolved critical risk

## Failure Modes and Recovery
Failure modes:
- webhook rejection
- schema incompatibility
- idempotency collision
- upstream GitHub publication failure

Recovery:
- idempotent retry by mission identity
- dead-letter capture for invalid payloads
- manual re-drive with preserved audit linkage
- explicit status transitions for partial failure

## Versioning and Evidence Publication
- Contracts MUST be versioned.
- Mission evidence MUST reference fixed commit SHAs.
- Evidence publication MUST occur via PR.
- Release-facing governance missions SHOULD include quality evidence references.

CCP operational guidance:
- Staff SHOULD issue mission payloads using CCP envelope format.
- Agents SHOULD submit CCP report payloads for ingest.
- CCP checks MUST run before submit:
  - `bash docs/governance/ccp/tools/ccp-secret-scan.sh <file>`
  - `bash docs/governance/ccp/tools/ccp-lint.sh mission|report|error <file>`
  - `bash docs/governance/ccp/tools/ccp-minify.sh <in> <out>`

CCP failure modes:
- lint fail: payload missing required keys or invalid basic types
- secret-scan fail: sensitive pattern detected
- invalid_ccp: hub rejects malformed CCP envelope

## Expansion to New Products (N repositories)
GOVHUB is repository-agnostic.

To onboard a new product repository:
- register repo key and metadata in hub configuration
- bind mission routing to repo key
- apply same payload contracts and gates
- avoid hardcoded product-specific workflow logic

## Chat Bootstrap via Snapshot
- Staff/Agent MUST retrieve the latest `state_inventory_v1` snapshot before starting a new governance mission.
- Snapshot MUST be decoded locally and SHA256-verified.
- Prompt execution MUST reference snapshot metadata (`snapshot_type`, `created_at_utc`, `payload_sha256`).
- If no snapshot exists, operator MUST generate inventory, ingest a new snapshot, then proceed.
