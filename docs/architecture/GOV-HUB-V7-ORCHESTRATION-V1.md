# GOV HUB V7 Orchestration V1

## Scope
Deterministic mission lifecycle with UDN/TDV-first contracts and hash-bound state persistence.

## Data Model
Database schema:
- `gov.missions`
- `gov.mission_runs`
- `gov.artifacts`

Migration:
- `docs/governance/hub/schema/0004_govhub_v7_orchestration.sql`

Integrity model:
- `integrity_hash = sha256(bytes(canonical_udn))`
- UDN canonicalization: CRLF->LF, trim line edges, remove empty lines, join with `\n`.

## Endpoints
### POST `/webhook/govhub/missions/register`
- Auth: `X-GOVHUB-TOKEN`
- Scope required: `s:w` or `snapshots:write`
- Input: `mission_id`, `udn_mission`, `tdv_version`, `created_by`
- Output: mission registered + queued run created/ensured

### GET `/webhook/govhub/missions/next?repo_key&agent_id`
- Auth: `X-GOVHUB-TOKEN`
- Scope required: `m:p` or `missions:pull`
- Behavior: assign oldest queued run for agent
- Output: `assigned` or `no_work`

### POST `/webhook/govhub/snapshot-update`
- Auth: `X-GOVHUB-TOKEN`
- Scope required: `s:w` or `snapshots:write`
- Upsert by `run_id` in `gov.mission_runs`
- Canonicalize `udn_state`, compute/verify `integrity_hash`
- Regenerates active `mission_runs_v1` UBIN snapshot

### GET `/webhook/govhub/snapshots/latest?snapshot_type=mission_runs_v1`
- Returns UBIN envelope from latest active snapshot.

## n8n Workflows
- `docs/governance/hub/n8n/exports/missions-register.json`
- `docs/governance/hub/n8n/exports/missions-next-get.json`
- `docs/governance/hub/n8n/exports/snapshot-update.json`
- `docs/governance/hub/n8n/exports/orchestration-monitor.json`

## CPP Pull Loop
Client:
- `docs/governance/hub/clients/cpp-pull-loop/cpp-pull-loop.sh`

Behavior:
- Poll `/missions/next`
- Send per-phase updates to `/snapshot-update`
- Deterministic UDN run-state lines:
  - `!RUN|<run_id>|<mission_id>|<status>|<phase>|<nn>/<total>;`

## UDN Formats
- Mission: `!MIS|<mission_id>|<tdv_ver>|<scope>|<goal>|<tau>;`
- Run state: `!RUN|<run_id>|<mission_id>|<status>|<phase>|<nn>/<total>;`
