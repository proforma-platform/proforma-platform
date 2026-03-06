#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage:
  govhub-db-restore.sh --file /path/backup.sql [--yes]
  govhub-db-restore.sh --file /path/backup.sql.gz [--yes]

Options:
  --file   SQL backup file to restore (required)
  --yes    required safety flag
EOF
}

SQL_FILE=""
CONFIRM="false"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --file)
      SQL_FILE="${2:-}"
      shift 2
      ;;
    --yes)
      CONFIRM="true"
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "ERROR: unknown argument '$1'" >&2
      usage
      exit 1
      ;;
  esac
done

if [[ -z "$SQL_FILE" ]]; then
  echo "ERROR: --file is required" >&2
  usage
  exit 1
fi

if [[ "$CONFIRM" != "true" ]]; then
  echo "ERROR: use --yes to confirm restore" >&2
  exit 1
fi

if [[ ! -f "$SQL_FILE" ]]; then
  echo "ERROR: file not found '$SQL_FILE'" >&2
  exit 1
fi

CONTAINER="${GOVHUB_DB_CONTAINER:-govhub-db}"
DB_NAME="${GOVHUB_DB_NAME:-govhub_n8n}"
DB_USER="${GOVHUB_DB_USER:-postgres}"

require_bin() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "ERROR: missing binary '$1'" >&2
    exit 1
  }
}

require_bin docker
require_bin cat
require_bin gzip

if [[ "$(docker inspect -f '{{.State.Status}}' "$CONTAINER" 2>/dev/null || true)" != "running" ]]; then
  echo "ERROR: container '$CONTAINER' is not running" >&2
  exit 1
fi

echo "Restoring '$SQL_FILE' into $DB_NAME on $CONTAINER ..."
if [[ "$SQL_FILE" == *.gz ]]; then
  gzip -dc "$SQL_FILE" | docker exec -i "$CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" -v ON_ERROR_STOP=1
else
  cat "$SQL_FILE" | docker exec -i "$CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" -v ON_ERROR_STOP=1
fi

echo "Restore completed"
