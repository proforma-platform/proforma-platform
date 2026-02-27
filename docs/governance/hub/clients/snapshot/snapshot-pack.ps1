param(
  [Parameter(Mandatory = $true)][string]$SnapshotType,
  [Parameter(Mandatory = $true)][string]$InputJson,
  [Parameter(Mandatory = $false)][string]$SourceRepo = 'platform',
  [Parameter(Mandatory = $false)][string]$SourceRef = ''
)

$ErrorActionPreference = 'Stop'

if (-not (Test-Path -LiteralPath $InputJson)) {
  Write-Error "pack: file not found: $InputJson"
  exit 2
}

$createdBy = if ($env:GOVHUB_CREATED_BY) { $env:GOVHUB_CREATED_BY } else { 'cpp' }

$raw = Get-Content -LiteralPath $InputJson -Raw -Encoding UTF8
$obj = $raw | ConvertFrom-Json -Depth 200
$canonical = $obj | ConvertTo-Json -Depth 200 -Compress

$secretPattern = '(?i)(PRIVATE KEY|AWS_ACCESS_KEY_ID|AWS_SECRET_ACCESS_KEY|ghp_|github_pat_|xoxb-|token=|password=|secret=|"(token|password|secret|api_key)"\s*:)' 
if ($canonical -match $secretPattern) {
  Write-Error 'pack: secret scan failed'
  exit 1
}

$rawBytes = [System.Text.Encoding]::UTF8.GetBytes($canonical)
if ($rawBytes.Length -gt 262144) {
  Write-Error 'pack: payload exceeds 256KB decompressed limit'
  exit 1
}

$ms = New-Object System.IO.MemoryStream
$gzip = New-Object System.IO.Compression.GZipStream($ms, [System.IO.Compression.CompressionMode]::Compress)
$gzip.Write($rawBytes, 0, $rawBytes.Length)
$gzip.Close()
$gzipBytes = $ms.ToArray()
$payloadB64 = [System.Convert]::ToBase64String($gzipBytes)

$sha = [System.Security.Cryptography.SHA256]::Create()
$hashBytes = $sha.ComputeHash($gzipBytes)
$payloadSha = -join ($hashBytes | ForEach-Object { $_.ToString('x2') })

if ([string]::IsNullOrWhiteSpace($SourceRef)) {
  $out = [ordered]@{
    snapshot_type = $SnapshotType
    protocol = 'UBIN'
    version = '1.0'
    encoding = 'json'
    compression = 'gzip'
    payload_b64 = $payloadB64
    payload_sha256 = $payloadSha
    payload_size_bytes = $rawBytes.Length
    created_by = $createdBy
    source_repo = $SourceRepo
  }
} else {
  $out = [ordered]@{
    snapshot_type = $SnapshotType
    protocol = 'UBIN'
    version = '1.0'
    encoding = 'json'
    compression = 'gzip'
    payload_b64 = $payloadB64
    payload_sha256 = $payloadSha
    payload_size_bytes = $rawBytes.Length
    created_by = $createdBy
    source_repo = $SourceRepo
    source_ref = $SourceRef
  }
}

$out | ConvertTo-Json -Compress -Depth 10
