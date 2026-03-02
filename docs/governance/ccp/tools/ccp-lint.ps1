param(
  [Parameter(Mandatory = $true)][ValidateSet('mission','report','error')][string]$Type,
  [Parameter(Mandatory = $true)][string]$File
)

if (-not (Test-Path -LiteralPath $File)) {
  Write-Error "lint: file not found: $File"
  exit 2
}

$maxBytes = 131072
$size = (Get-Item -LiteralPath $File).Length
if ($size -gt $maxBytes) {
  Write-Error "lint: FAIL payload exceeds 128KB ($size bytes)"
  exit 1
}

$scanScript = Join-Path $PSScriptRoot 'ccp-secret-scan.ps1'
& $scanScript -File $File
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

try {
  $obj = (Get-Content -LiteralPath $File -Raw -Encoding UTF8) | ConvertFrom-Json -Depth 100
} catch {
  Write-Error "lint: FAIL invalid JSON: $($_.Exception.Message)"
  exit 1
}

function Require-String([object]$Value, [string]$Label) {
  if ($null -eq $Value -or $Value -isnot [string] -or [string]::IsNullOrWhiteSpace($Value)) {
    throw "missing/invalid $Label"
  }
}

try {
  Require-String $obj.ccp_ver 'ccp_ver'
  Require-String $obj.id 'id'
  Require-String $obj.ts 'ts'

  switch ($Type) {
    'mission' {
      Require-String $obj.repo_key 'mission.repo_key'
      Require-String $obj.agent_id 'mission.agent_id'
    }
    'report' {
      Require-String $obj.head_sha 'report.head_sha'
      if ($obj.head_sha.Length -lt 7) { throw 'report.head_sha too short' }
      if ($null -eq $obj.files_modified -or $obj.files_modified -isnot [array]) { throw 'report.files_modified' }
      if ($null -eq $obj.security -or $obj.security -isnot [pscustomobject]) { throw 'report.security' }
    }
    'error' {
      Require-String $obj.status 'error.status'
      Require-String $obj.error_code 'error.error_code'
      Require-String $obj.message 'error.message'
    }
  }

  Write-Output 'lint: PASS'
  Write-Output 'lint: NOTE full schema validation is optional via tools/node/validate.mjs'
} catch {
  Write-Error "lint: FAIL $($_.Exception.Message)"
  exit 1
}
