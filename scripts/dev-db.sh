#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PG_BIN="${PG_BIN:-/opt/homebrew/opt/postgresql@18/bin}"
if [[ ! -x "$PG_BIN/pg_ctl" ]]; then
  PG_BIN="$(pg_config --bindir)"
fi
DATA="$ROOT/.runtime/postgres"
PORT="${PERSONA_DB_PORT:-55432}"
case "${1:-start}" in
  start)
    mkdir -p "$ROOT/.runtime"
    if [[ ! -f "$DATA/PG_VERSION" ]]; then
      "$PG_BIN/initdb" -D "$DATA" -U persona_lens -A trust --encoding=UTF8 --locale=C
    fi
    if ! "$PG_BIN/pg_ctl" -D "$DATA" status >/dev/null 2>&1; then
      "$PG_BIN/pg_ctl" -D "$DATA" -l "$ROOT/.runtime/postgres.log" -o "-h 127.0.0.1 -p $PORT -k $ROOT/.runtime" -w start
    fi
    if ! "$PG_BIN/psql" -h 127.0.0.1 -p "$PORT" -U persona_lens -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='persona_lens'" | grep -q 1; then
      "$PG_BIN/createdb" -h 127.0.0.1 -p "$PORT" -U persona_lens persona_lens
    fi
    ;;
  stop) "$PG_BIN/pg_ctl" -D "$DATA" -m fast -w stop ;;
  status) "$PG_BIN/pg_ctl" -D "$DATA" status ;;
  *) printf 'Usage: bash scripts/dev-db.sh [start|stop|status]\n' >&2; exit 2 ;;
esac
