param(
  [Parameter(Mandatory = $true)][string]$InputFile,
  [Parameter(Mandatory = $false)][string]$OutputFile
)

if (-not (Test-Path -LiteralPath $InputFile)) {
  Write-Error "minify: file not found: $InputFile"
  exit 2
}

try {
  $raw = Get-Content -LiteralPath $InputFile -Raw -Encoding UTF8
  $obj = $raw | ConvertFrom-Json -Depth 100
  $min = $obj | ConvertTo-Json -Depth 100 -Compress

  if ([string]::IsNullOrWhiteSpace($OutputFile)) {
    Write-Output $min
  } else {
    Set-Content -LiteralPath $OutputFile -Value $min -Encoding UTF8 -NoNewline
  }

  Write-Output 'minify: OK'
} catch {
  Write-Error "minify: FAIL $($_.Exception.Message)"
  exit 1
}
