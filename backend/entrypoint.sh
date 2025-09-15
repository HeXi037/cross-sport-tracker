# backend/entrypoint.sh
#!/usr/bin/env bash
set -euo pipefail

# Defaults (compose provides these; falling back for safety)
: "${DB_HOST:=postgresql16}"
: "${DB_PORT:=5432}"

echo "Waiting for Postgres at ${DB_HOST}:${DB_PORT}..."
for i in {1..60}; do
  if (echo > /dev/tcp/${DB_HOST}/${DB_PORT}) >/dev/null 2>&1; then
    echo "Postgres is up."
    break
  fi
  echo "Postgres not ready yet... (${i}/60)"; sleep 2
done

# Run Alembic migrations to heads using the container-stable ini
alembic -c /app/alembic.ini upgrade heads

# Start the API
exec uvicorn backend.app.main:app --host 0.0.0.0 --port 8000
