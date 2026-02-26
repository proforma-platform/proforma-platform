# submit-report client (Governance Hub)

## Purpose
Canonical CLI clients for CODEX agents to submit mission reports to Governance Hub `report-ingest` using a reproducible contract.

## Required environment variables
- `GOVHUB_REPORT_INGEST_URL`
- `GOVHUB_TOKEN`
- `GOVHUB_AGENT_ID` (optional if passed as argument)

## Usage examples
Bash:
```bash
export GOVHUB_REPORT_INGEST_URL="http://localhost:5678/webhook/govhub/report-ingest"
export GOVHUB_TOKEN="<token>"
export GOVHUB_AGENT_ID="codex-agent"

bash docs/governance/hub/clients/submit-report/submit-report.sh \
  --mission-key "GOV-0071" \
  --repo-key "proforma-platform" \
  --report-file "./REPORT.md"
```

PowerShell:
```powershell
$env:GOVHUB_REPORT_INGEST_URL = "http://localhost:5678/webhook/govhub/report-ingest"
$env:GOVHUB_TOKEN = "<token>"
$env:GOVHUB_AGENT_ID = "codex-agent"

pwsh docs/governance/hub/clients/submit-report/submit-report.ps1 `
  -MissionKey "GOV-0071" `
  -RepoKey "proforma-platform" `
  -ReportFile "./REPORT.md"
```

## End-of-run hook integration (generic)
1. Generate final report markdown file.
2. Call the appropriate script (`.sh` or `.ps1`).
3. Persist output summary in execution logs.

## Validations implemented
- Must run inside a git repository.
- Auto-detects branch and head SHA.
- Report file must exist, be non-empty, and <= 512KB.
- Fails fast on high-risk secret patterns:
  - `PRIVATE KEY`
  - `AWS_ACCESS_KEY_ID`
  - `AWS_SECRET_ACCESS_KEY`
  - `ghp_`
  - `github_pat_`
  - `xoxb-`
  - `token=`
  - `password=`
  - `secret=`
- Fails on non-2xx HTTP response.

## Troubleshooting
- `401/403`: invalid token or unauthorized token scope.
- `400`: payload validation failure.
- DNS/network errors: verify endpoint availability and outbound connectivity.

## Safety note
Do not include secrets in report files. If secrets are detected, scripts abort before sending.
