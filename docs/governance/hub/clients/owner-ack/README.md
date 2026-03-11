# owner-ack client (Governance Hub)

## Purpose
CLI client for the single Owner gate (`approve|deny`) without manual payload copy/paste.

## Script
- `owner-ack.sh`

## Required environment variables
- `GOVHUB_TOKEN`

Optional:
- `GOVHUB_BASE_URL` (default: `https://govhub.proforma.net.br`)

## Usage
```bash
bash docs/governance/hub/clients/owner-ack/owner-ack.sh \
  --mission-id GOV-MANAGER-V1-FOUNDATION \
  --decision approve \
  --owner-id owner-user \
  --note "Aprovado para execucao automatica"
```

## Endpoint behavior
- First try: canonical route
  - `/webhook/govhub/missions/owner-ack`
- On `404`: compatibility route fallback (runtime-safe)
  - `/webhook/govhub-v7-missions-owner-ack/webhook%2520missao%2520owner%2520ack/govhub/missions/owner-ack`

## Output policy
- Success: compact one-line status.
- Error: HTTP code + truncated response preview.
- No token or secret is printed.
