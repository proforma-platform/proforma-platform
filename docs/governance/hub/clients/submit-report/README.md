# GOVHUB Submit-Report Clients

## Purpose
This folder contains canonical client scripts for CODEX agents to submit mission reports to Governance Hub `report-ingest` without manual copy/paste.

## Required environment variables
- `GOVHUB_REPORT_INGEST_URL` (preferred) or `GOVHUB_URL`
- `GOVHUB_TOKEN`
- `GOVHUB_AGENT_ID`

Endpoint resolution:
- If `GOVHUB_REPORT_INGEST_URL` is set, scripts use it directly.
- Otherwise scripts use `${GOVHUB_URL}/webhook/govhub/report-ingest`.

## Usage examples
Bash:
```bash
export GOVHUB_URL="http://localhost:5678"
export GOVHUB_TOKEN="<token>"
export GOVHUB_AGENT_ID="codex-agent"

bash docs/governance/hub/clients/submit-report/submit-report.sh \
  --mission-key "AEI-0.6.2" \
  --repo-key "proforma-platform" \
  --report-file "./REPORT.md"
```

PowerShell:
```powershell
$env:GOVHUB_URL = "http://localhost:5678"
$env:GOVHUB_TOKEN = "<token>"
$env:GOVHUB_AGENT_ID = "codex-agent"

pwsh docs/governance/hub/clients/submit-report/submit-report.ps1 `
  -MissionKey "AEI-0.6.2" `
  -RepoKey "proforma-platform" `
  -ReportFile "./REPORT.md"
```

## Integration with CODEX end-of-run hooks
Generic pattern:
1. Generate report markdown artifact at end of execution.
2. Call `submit-report.sh` (Linux/macOS) or `submit-report.ps1` (Windows).
3. Capture success output (`mission_key`, `repo_key`, `head_sha`, HTTP status) in CI or run logs.

## Troubleshooting
- `401/403`: token invalid, missing, or not authorized by hub token list.
- `400 validation`: missing required fields, invalid payload, or empty report.
- DNS/network failures: verify `GOVHUB_REPORT_INGEST_URL` or `GOVHUB_URL`, n8n availability, and firewall routing.

## Safety note
Do not include secrets in reports. Scripts fail fast on high-risk patterns such as:
- `BEGIN PRIVATE KEY`
- `AWS_SECRET_ACCESS_KEY`
- `password=`
- `ConnectionStrings` containing `Password`
