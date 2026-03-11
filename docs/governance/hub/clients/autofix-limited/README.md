# autofix-limited client (Governance Hub)

## Purpose
Trigger `AUTO_FIX_LIMITED` rounds in a controlled way.

## Script
- `autofix-limited.sh`

## Usage
```bash
GOVHUB_BASE_URL="https://govhub.proforma.net.br" \
GOVHUB_TOKEN="<token>" \
bash docs/governance/hub/clients/autofix-limited/autofix-limited.sh \
  GOV-MANAGER-V1-FOUNDATION \
  REPORT_INGEST_INCONSISTENT_STATE \
  "runtime task progression mismatch"
```

## Policy
- max 2 rounds per mission
- after round 2 without resolution: mission goes to `paused_waiting_owner`
