# GOVHUB Auto-Approval Policy

## Purpose
This policy defines controlled pull request auto-approval for early-stage governance automation. The objective is to reduce operational latency while preserving enforceable controls defined by GOV-0070.

## Scope
This policy applies only to pull requests in this repository.

## Approval Model
Repository governance for auto-approved pull requests MUST follow these rules:
- Pull request workflow is mandatory.
- Required status checks MUST pass before merge.
- One approval is required and MAY be provided by `governance-bot` when all criteria are met.
- Auto-merge MAY be enabled only after criteria validation.
- Squash merge MUST be the merge strategy for bot-enabled auto-merge.

## Mandatory Criteria for Bot Approval

### Security Constraints
Auto-approval MUST NOT occur when the pull request modifies restricted paths or files, including:
- `infra/**`
- `docker-compose*`
- `nginx/**`
- `cloudflare/**`
- `*.pem`
- `*.key`
- `secrets*`
- `.env*`

Pull requests MUST NOT contain hardcoded secret patterns. Suspected secret exposure MUST be treated as security violation.

### Quality Constraints
- All required status checks MUST pass.
- The branch MUST be up-to-date with base branch requirements.
- No CI job may be in failed state.

### Governance Constraints
- Pull request title MUST use one of these prefixes: `docs:`, `chore:`, `fix:`, `feat:`.
- File-change size SHOULD remain under 1000 lines (soft limit). Exceeding this limit SHOULD prevent bot approval and require human review.

## Mandatory Human Review Cases
Bot approval MUST NOT be used for:
- Database migrations
- Authentication or security behavior changes
- Infrastructure changes
- Production configuration changes

## Audit Trail
All bot auto-approvals MUST be:
- Performed by `governance-bot`
- Logged in GitHub pull request history
- Traceable in repository audit trail

## Risk Mitigation
- The bot MUST NOT bypass branch protection rules.
- Direct push to `main` remains prohibited.
- CI remains the authoritative technical gate.
