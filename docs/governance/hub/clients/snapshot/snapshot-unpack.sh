#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -lt 2 ] || [ "$#" -gt 3 ]; then
  echo "usage: $0 <payload_b64> <expected_sha256> [output.json]" >&2
  exit 2
fi

PAYLOAD_B64="$1"
EXPECTED_SHA="$2"
OUT="${3:-}"

TMP_GZIP="$(mktemp)"
trap 'rm -f "$TMP_GZIP"' EXIT
printf "%s" "$PAYLOAD_B64" | base64 -d > "$TMP_GZIP"
ACTUAL_SHA="$(sha256sum "$TMP_GZIP" | awk '{print $1}')"

if [ "$ACTUAL_SHA" != "$EXPECTED_SHA" ]; then
  echo "unpack: sha256 mismatch" >&2
  exit 1
fi

RAW_JSON="$(gzip -dc "$TMP_GZIP")"

if [ -n "$OUT" ]; then
  printf "%s" "$RAW_JSON" > "$OUT"
else
  printf "%s" "$RAW_JSON"
fi
