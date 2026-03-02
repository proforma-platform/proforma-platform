param(
  [Parameter(Mandatory = $true)][string]$MissionKey,
  [Parameter(Mandatory = $true)][string]$RepoKey,
  [Parameter(Mandatory = $true)][string]$ReportFile,
  [string]$AgentId = $env:GOVHUB_AGENT_ID,
  [string]$ReportIngestUrl = $env:GOVHUB_REPORT_INGEST_URL,
  [string]$InternalBaseUrl = $env:GOVHUB_INTERNAL_BASE_URL,
  [string]$Token = $env:GOVHUB_TOKEN
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
$maxSizeBytes = 512KB

if ([string]::IsNullOrWhiteSpace($AgentId)) {
  throw "Missing agent_id. Use -AgentId or GOVHUB_AGENT_ID."
}

if (-not [string]::IsNullOrWhiteSpace($InternalBaseUrl)) {
  $ReportIngestUrl = ($InternalBaseUrl.TrimEnd('/') + "/webhook/govhub/report-ingest")
}
elseif ([string]::IsNullOrWhiteSpace($ReportIngestUrl)) {
  $ReportIngestUrl = "https://govhub.proforma.net.br/webhook/govhub/report-ingest"
}

if ([string]::IsNullOrWhiteSpace($Token)) {
  throw "GOVHUB_TOKEN is required."
}

if (-not (Test-Path -LiteralPath $ReportFile -PathType Leaf)) {
  throw "Report file does not exist: $ReportFile"
}

$fileInfo = Get-Item -LiteralPath $ReportFile
if ($fileInfo.Length -le 0) {
  throw "Report file is empty: $ReportFile"
}

if ($fileInfo.Length -gt $maxSizeBytes) {
  throw "Report file exceeds 512KB ($($fileInfo.Length) bytes)."
}

$null = git rev-parse --is-inside-work-tree 2>$null
if ($LASTEXITCODE -ne 0) {
  throw "Current directory is not inside a git repository."
}

$branch = (git rev-parse --abbrev-ref HEAD).Trim()
$headSha = (git rev-parse HEAD).Trim()
$reportMd = Get-Content -LiteralPath $ReportFile -Raw -Encoding UTF8

if ($reportMd -match "PRIVATE KEY|AWS_ACCESS_KEY_ID|AWS_SECRET_ACCESS_KEY|ghp_|github_pat_|xoxb-|token=|password=|secret=") {
  throw "High-risk secret pattern detected in report. Submission aborted."
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
  $response = Invoke-WebRequest -Method POST -Uri $ReportIngestUrl -Headers $headers -Body $payload
  $statusCode = [int]$response.StatusCode
  if ($statusCode -lt 200 -or $statusCode -ge 300) {
    throw "Submission failed (HTTP $statusCode)."
  }

  Write-Host "submit-report: success"
  Write-Host "repo_key=$RepoKey mission_key=$MissionKey agent_id=$AgentId branch=$branch head_sha=$headSha file_size_bytes=$($fileInfo.Length) http_status=$statusCode"
}
catch {
  $statusCode = "N/A"
  $errorPreview = $null
  if ($_.Exception.Response -and $_.Exception.Response.StatusCode) {
    $statusCode = $_.Exception.Response.StatusCode.value__
  }
  if ($_.Exception.Response -and $_.Exception.Response.GetResponseStream) {
    try {
      $stream = $_.Exception.Response.GetResponseStream()
      if ($stream) {
        $reader = New-Object System.IO.StreamReader($stream)
        $rawError = $reader.ReadToEnd()
        if ($rawError) {
          $maxLen = [Math]::Min(1200, $rawError.Length)
          $errorPreview = $rawError.Substring(0, $maxLen)
        }
      }
    }
    catch {
      $errorPreview = $null
    }
  }
  Write-Error "Submission failed (HTTP $statusCode)."
  if ($errorPreview) {
    Write-Error ("error_preview=" + $errorPreview)
  }
  elseif ($_.ErrorDetails -and $_.ErrorDetails.Message) {
    $rawDetails = $_.ErrorDetails.Message
    $maxLen = [Math]::Min(1200, $rawDetails.Length)
    Write-Error ("error_preview=" + $rawDetails.Substring(0, $maxLen))
  }
  throw
}
