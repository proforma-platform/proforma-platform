#!/usr/bin/env bash
set -euo pipefail

ACTION="${1:-}"
NAME="${WORKER_NAME:-govhub-cpp-ia-worker}"
IMAGE="${WORKER_IMAGE:-govhub-cpp-ia-worker:local}"
NETWORK="${WORKER_NETWORK:-tmp_govhub-network}"
HOST_PORT="${WORKER_HOST_PORT:-15710}"
CONTAINER_PORT="${WORKER_CONTAINER_PORT:-8080}"
WORKER_ID="${WORKER_ID:-CPP-IA}"
WORKER_ROLE="${WORKER_ROLE:-analysis}"
WORKER_SERVICE="${WORKER_SERVICE:-govhub-cpp-ia-worker}"
GITOPS_ENABLED="${GITOPS_ENABLED:-false}"
GITOPS_ALLOWED_BASE="${GITOPS_ALLOWED_BASE:-/workspace}"
GITOPS_DEFAULT_REMOTE="${GITOPS_DEFAULT_REMOTE:-origin}"
GITOPS_DEFAULT_BASE_BRANCH="${GITOPS_DEFAULT_BASE_BRANCH:-main}"
GITOPS_TIMEOUT_SECONDS="${GITOPS_TIMEOUT_SECONDS:-20}"
HOST_WORKSPACE_PATH="${HOST_WORKSPACE_PATH:-}"

case "$ACTION" in
  deploy)
    docker build -t "$IMAGE" .
    docker rm -f "$NAME" >/dev/null 2>&1 || true
    docker run -d \
      --name "$NAME" \
      --restart unless-stopped \
      --network "$NETWORK" \
      -p "${HOST_PORT}:${CONTAINER_PORT}" \
      -e WORKER_ID="$WORKER_ID" \
      -e WORKER_ROLE="$WORKER_ROLE" \
      -e WORKER_SERVICE="$WORKER_SERVICE" \
      -e GITOPS_ENABLED="$GITOPS_ENABLED" \
      -e GITOPS_ALLOWED_BASE="$GITOPS_ALLOWED_BASE" \
      -e GITOPS_DEFAULT_REMOTE="$GITOPS_DEFAULT_REMOTE" \
      -e GITOPS_DEFAULT_BASE_BRANCH="$GITOPS_DEFAULT_BASE_BRANCH" \
      -e GITOPS_TIMEOUT_SECONDS="$GITOPS_TIMEOUT_SECONDS" \
      ${HOST_WORKSPACE_PATH:+-v "${HOST_WORKSPACE_PATH}:${GITOPS_ALLOWED_BASE}"} \
      "$IMAGE"
    ;;
  restart)
    docker restart "$NAME"
    ;;
  status)
    docker ps --format '{{.Names}}|{{.Status}}|{{.Ports}}' | grep -E "^${NAME}\|" || true
    ;;
  test)
    curl -sS "http://127.0.0.1:${HOST_PORT}/health"; echo
    curl -sS -X POST "http://127.0.0.1:${HOST_PORT}/run" \
      -H 'content-type: application/json' \
      -d '{"mission_id":"GOV-TEST-SELF-HOSTED-01","task_id":"task-a","udn_block":"!MIS|GOV-TEST|P1|RUN"}'; echo
    curl -sS -X POST "http://127.0.0.1:${HOST_PORT}/run" \
      -H 'content-type: application/json' \
      -d '{"mission_id":"GOV-TEST-GITOPS-01","task_id":"task-gitops","git_ops":{"repo_path":"'"${GITOPS_ALLOWED_BASE}"'/proforma-platform","branch":"test/govhub-gitops","base_branch":"main","commit_message":"test: govhub gitops worker","push":false}}'; echo
    ;;
  *)
    echo "usage: $0 {deploy|restart|status|test}" >&2
    exit 1
    ;;
esac
