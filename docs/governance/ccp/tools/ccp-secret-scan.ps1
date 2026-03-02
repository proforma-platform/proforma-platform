param(
  [Parameter(Mandatory = $true)][string]$File
)

if (-not (Test-Path -LiteralPath $File)) {
  Write-Error "secret-scan: file not found: $File"
  exit 2
}

$content = Get-Content -LiteralPath $File -Raw -Encoding UTF8
$patterns = @(
  'PRIVATE KEY',
  'AWS_ACCESS_KEY_ID',
  'AWS_SECRET_ACCESS_KEY',
  'ghp_',
  'github_pat_',
  'xoxb-',
  'token=',
  'password=',
  'secret='
)

foreach ($p in $patterns) {
  if ($content -match [regex]::Escape($p)) {
    Write-Error "secret-scan: FAIL pattern detected: $p"
    exit 1
  }
}

$keyPattern = '"(token|password|secret|api_key)"\s*:'
if ($content -match $keyPattern) {
  Write-Error 'secret-scan: FAIL sensitive key detected'
  exit 1
}

Write-Output 'secret-scan: PASS'
