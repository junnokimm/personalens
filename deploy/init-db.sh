#!/usr/bin/env bash
set -euo pipefail

# Executed only for a NEW PostgreSQL volume. Application/migrations use the
# database owner, not the cluster superuser. Passwords are never printed.
psql --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" --set=ON_ERROR_STOP=1 \
  --set=app_password="$PERSONA_DB_PASSWORD" <<'SQL'
SELECT format('CREATE ROLE persona_lens LOGIN PASSWORD %L', :'app_password') \gexec
ALTER DATABASE persona_lens OWNER TO persona_lens;
SQL
