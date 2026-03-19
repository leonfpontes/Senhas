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
if ! alembic upgrade head 2>&1; then
  echo "Migration upgrade failed. Checking if schema already exists..."
  # If the tenants table exists, the DB was likely set up outside Alembic — stamp to head
  TABLE_EXISTS=$(PGPASSWORD="${DB_PASSWORD}" psql -h "${DB_HOST:-postgres}" -U "${DB_USER:-postgres}" -d "${DB_NAME:-senhas_prod}" -tAc \
    "SELECT 1 FROM information_schema.tables WHERE table_name='tenants'" 2>/dev/null || true)
  if [ "$TABLE_EXISTS" = "1" ]; then
    echo "Schema exists. Stamping Alembic to head..."
    alembic stamp head
    echo "Stamped to head successfully."
  else
    echo "ERROR: Fresh database but migrations failed!"
    exit 1
  fi
fi
echo "Migrations complete."

# Execute the CMD (uvicorn)
echo "Starting application..."
exec "$@"
