param(
  [Parameter(Mandatory = $true)][string]$MissionKey,
  [Parameter(Mandatory = $true)][string]$RepoKey,
  [Parameter(Mandatory = $true)][string]$ReportFile,
  [string]$AgentId = $env:GOVHUB_AGENT_ID,
  [string]$HubUrl = $env:GOVHUB_URL,
  [string]$ReportIngestUrl = $env:GOVHUB_REPORT_INGEST_URL,
  [string]$Token = $env:GOVHUB_TOKEN
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($AgentId)) {
  throw "agent_id missing. Use -AgentId or GOVHUB_AGENT_ID."
}

if ([string]::IsNullOrWhiteSpace($Token)) {
  throw "GOVHUB_TOKEN is required."
}

if (-not (Test-Path -LiteralPath $ReportFile -PathType Leaf)) {
  throw "Report file does not exist: $ReportFile"
}

$reportMd = Get-Content -LiteralPath $ReportFile -Raw -Encoding UTF8
if ([string]::IsNullOrWhiteSpace($reportMd)) {
  throw "Report file is empty: $ReportFile"
}

if ($reportMd -match "BEGIN PRIVATE KEY|AWS_SECRET_ACCESS_KEY|password=|ConnectionStrings.*Password") {
  throw "High-risk secret pattern detected in report. Submission aborted."
}

$null = git rev-parse --is-inside-work-tree 2>$null
if ($LASTEXITCODE -ne 0) {
  throw "Current directory is not inside a git repository."
}

$branch = (git rev-parse --abbrev-ref HEAD).Trim()
$headSha = (git rev-parse HEAD).Trim()

if ([string]::IsNullOrWhiteSpace($ReportIngestUrl)) {
  if ([string]::IsNullOrWhiteSpace($HubUrl)) {
    throw "Set GOVHUB_REPORT_INGEST_URL or GOVHUB_URL (or pass -HubUrl)."
  }
  $ReportIngestUrl = ($HubUrl.TrimEnd('/')) + "/webhook/govhub/report-ingest"
}

$payload = @{
  mission_key = $MissionKey
  repo_key    = $RepoKey
  agent_id    = $AgentId
  branch      = $branch
  head_sha    = $headSha
  report_md   = $reportMd
} | ConvertTo-Json -Depth 10 -Compress

$headers = @{
  "Content-Type"   = "application/json"
  "X-GOVHUB-TOKEN" = $Token
}

try {
  $response = Invoke-RestMethod -Method POST -Uri $ReportIngestUrl -Headers $headers -Body $payload
  Write-Host "submit-report: success"
  Write-Host "mission_key=$MissionKey repo_key=$RepoKey head_sha=$headSha http_status=200"
  $response | ConvertTo-Json -Depth 10
}
catch {
  $statusCode = $_.Exception.Response.StatusCode.value__
  if (-not $statusCode) { $statusCode = "N/A" }
  Write-Error "Submission failed (HTTP $statusCode)."
  if ($_.ErrorDetails.Message) {
    Write-Error $_.ErrorDetails.Message
  }
  throw
}
