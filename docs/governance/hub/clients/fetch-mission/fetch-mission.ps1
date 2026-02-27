param(
  [Parameter(Mandatory = $true)][string]$RepoKey,
  [Parameter(Mandatory = $true)][string]$AgentId,
  [string]$OutputFile,
  [string]$MissionType
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Trim-String([string]$Value) {
  if ($null -eq $Value) { return '' }
  return $Value.Trim()
}

function Load-GovhubToken {
  $secretsFile = Join-Path $HOME '.config/proforma/secrets.env'

  if (Test-Path -LiteralPath $secretsFile -PathType Leaf) {
    $perm = (& stat -c '%a' $secretsFile 2>$null)
    if ([string]::IsNullOrWhiteSpace($perm)) {
      throw "cannot determine permissions for $secretsFile"
    }

    $permDec = [Convert]::ToInt32($perm, 8)
    if (($permDec -band 63) -ne 0) {
      throw "$secretsFile permissions must be <= 0600 (current: $perm)"
    }

    $line = Get-Content -LiteralPath $secretsFile -Encoding UTF8 | Where-Object { $_ -match '^GOVHUB_TOKEN=' } | Select-Object -First 1
    if ([string]::IsNullOrWhiteSpace($line)) {
      throw "GOVHUB_TOKEN not found in $secretsFile"
    }

    $token = $line.Split('=', 2)[1]
    $token = $token.Replace("`r", '')
    $token = Trim-String $token

    if (($token.StartsWith('"') -and $token.EndsWith('"')) -or ($token.StartsWith("'") -and $token.EndsWith("'"))) {
      if ($token.Length -ge 2) {
        $token = $token.Substring(1, $token.Length - 2)
      }
    }
    $token = Trim-String $token
    return $token
  }

  return Trim-String ($env:GOVHUB_TOKEN)
}

$token = Load-GovhubToken
if ([string]::IsNullOrWhiteSpace($token)) {
  throw 'GOVHUB_TOKEN not available (file missing or empty fallback env).'
}
if ($token.Length -lt 20) {
  throw 'GOVHUB_TOKEN failed sanity check (length < 20).'
}

$endpoint = 'https://govhub.proforma.net.br/webhook/govhub/missions/next'
$payload = @{
  repo_key = $RepoKey
  agent_id = $AgentId
}
if (-not [string]::IsNullOrWhiteSpace($MissionType)) {
  $payload['mission_type'] = $MissionType
}
$payloadJson = $payload | ConvertTo-Json -Compress -Depth 10

$headers = @{
  'X-GOVHUB-TOKEN' = $token
  'Content-Type'   = 'application/json'
}

try {
  $resp = Invoke-RestMethod -Method Post -Uri $endpoint -Headers $headers -Body $payloadJson -ContentType 'application/json' -StatusCodeVariable statusCode
  $compact = $resp | ConvertTo-Json -Compress -Depth 20

  if (-not [string]::IsNullOrWhiteSpace($OutputFile)) {
    Set-Content -LiteralPath $OutputFile -Value $compact -Encoding UTF8 -NoNewline
  }

  $statusValue = $resp.status
  $missionKey = $resp.mission_key
  $lockValue = $resp.lock_expires_at_utc
  [Console]::Error.WriteLine("fetch-mission: success repo_key=$RepoKey agent_id=$AgentId http_status=$statusCode status=$statusValue mission_key=$missionKey lock_expires_at_utc=$lockValue")
  Write-Output $compact
}
catch {
  $httpStatus = $null
  $preview = ''

  if ($_.Exception.Response -and $_.Exception.Response.StatusCode) {
    $httpStatus = [int]$_.Exception.Response.StatusCode
  }

  if ($_.ErrorDetails -and $_.ErrorDetails.Message) {
    $preview = $_.ErrorDetails.Message
  }
  elseif ($_.Exception.Message) {
    $preview = $_.Exception.Message
  }

  if (-not [string]::IsNullOrWhiteSpace($preview) -and $preview.Length -gt 1200) {
    $preview = $preview.Substring(0, 1200)
  }

  if ($null -ne $httpStatus) {
    [Console]::Error.WriteLine("fetch-mission failed: http_status=$httpStatus")
  }
  else {
    [Console]::Error.WriteLine('fetch-mission failed')
  }

  if (-not [string]::IsNullOrWhiteSpace($preview)) {
    [Console]::Error.WriteLine("error_preview=$preview")
  }

  exit 1
}
