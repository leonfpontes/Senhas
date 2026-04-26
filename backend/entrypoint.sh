#!/bin/sh
set -e

echo "=== Senhas Backend Starting ==="
echo "Python: $(python --version)"
echo "Working dir: $(pwd)"
echo "DB_HOST: ${DB_HOST:-postgres}"

# Wait for PostgreSQL to be ready
echo "Waiting for database..."
until pg_isready -h "${DB_HOST:-postgres}" -p "${DB_PORT:-5432}" -U "${DB_USER:-postgres}" -q 2>/dev/null; do
  echo "  Database not ready yet, retrying in 2s..."
  sleep 2
done
echo "Database is ready."

# Run Alembic migrations
echo "Running database migrations..."
cd /app
alembic upgrade heads 2>&1 || { echo "ERROR: Migration failed!"; exit 1; }
echo "Migrations complete."

# Execute the CMD (uvicorn)
echo "Starting application..."
exec "$@"
