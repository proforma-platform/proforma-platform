param(
  [Parameter(Mandatory = $true)][string]$PayloadB64,
  [Parameter(Mandatory = $true)][string]$ExpectedSha256,
  [Parameter(Mandatory = $false)][string]$OutputPath = ''
)

$ErrorActionPreference = 'Stop'

$zipBytes = [Convert]::FromBase64String($PayloadB64)

$sha = [System.Security.Cryptography.SHA256]::Create()
$hashBytes = $sha.ComputeHash($zipBytes)
$actualSha = -join ($hashBytes | ForEach-Object { $_.ToString('x2') })

if ($actualSha -ne $ExpectedSha256) {
  Write-Error 'unpack: sha256 mismatch'
  exit 1
}

$inMs = New-Object System.IO.MemoryStream(,$zipBytes)
$gzip = New-Object System.IO.Compression.GZipStream($inMs, [System.IO.Compression.CompressionMode]::Decompress)
$outMs = New-Object System.IO.MemoryStream
$gzip.CopyTo($outMs)
$gzip.Close()
$jsonBytes = $outMs.ToArray()
$jsonText = [System.Text.Encoding]::UTF8.GetString($jsonBytes)

if ([string]::IsNullOrWhiteSpace($OutputPath)) {
  [Console]::Out.Write($jsonText)
} else {
  Set-Content -LiteralPath $OutputPath -Value $jsonText -Encoding UTF8 -NoNewline
}
