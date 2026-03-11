#!/usr/bin/env bash
set -euo pipefail

CONTAINER="${GOVHUB_DB_CONTAINER:-govhub-db}"
DB_NAME="${GOVHUB_DB_NAME:-govhub_n8n}"
DB_USER="${GOVHUB_DB_USER:-postgres}"
BACKUP_DIR="${GOVHUB_BACKUP_DIR:-/opt/proforma/backups/govhub}"

require_bin() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "ERROR: missing binary '$1'" >&2
    exit 1
  }
}

require_bin docker
require_bin sha256sum
require_bin mkdir
require_bin date

if [[ "$(docker inspect -f '{{.State.Status}}' "$CONTAINER" 2>/dev/null || true)" != "running" ]]; then
  echo "ERROR: container '$CONTAINER' is not running" >&2
  exit 1
fi

mkdir -p "$BACKUP_DIR"
ts="$(date -u +%Y%m%dT%H%M%SZ)"
out="$BACKUP_DIR/govhub_n8n_${ts}.sql"

echo "Creating backup: $out"
docker exec "$CONTAINER" pg_dump -U "$DB_USER" -d "$DB_NAME" > "$out"
sha="$(sha256sum "$out" | awk '{print $1}')"
bytes="$(wc -c < "$out" | tr -d ' ')"

echo "Backup completed"
echo "file=$out"
echo "sha256=$sha"
echo "bytes=$bytes"
