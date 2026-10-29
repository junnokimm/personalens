#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
MODE="${1:-local}"
if [[ $# -gt 0 ]]; then shift; fi
case "$MODE" in
  local)
    ENV_FILE=".env.compose"
    FILES=(-f compose.yaml -f compose.local.yaml)
    ;;
  openai)
    ENV_FILE=".env.compose"
    FILES=(-f compose.yaml -f compose.openai.yaml)
    ;;
  inference-test)
    ENV_FILE=".env.compose"
    FILES=(-f compose.yaml -f compose.local.yaml -f compose.inference-test.yaml)
    ;;
  production)
    ENV_FILE=".env.production"
    FILES=(-f compose.yaml)
    ;;
  *) echo 'Usage: bash scripts/compose.sh {local|openai|inference-test|production} [docker compose arguments]' >&2; exit 2 ;;
esac
if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing $ENV_FILE. See the Docker section in backend/README.md for setup." >&2
  exit 1
fi
if [[ $# -eq 0 ]]; then set -- ps; fi
exec docker compose --env-file "$ENV_FILE" "${FILES[@]}" "$@"
