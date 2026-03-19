#!/bin/bash
# =============================================================
# Create superadmin user in the Senhas database
# Run from VPS: bash /opt/senhas/scripts/create_superadmin.sh
# =============================================================

set -e

# Load env vars from .env if available
if [ -f /opt/senhas/.env ]; then
  export $(grep -E '^(DB_USER|DB_PASSWORD|DB_NAME)=' /opt/senhas/.env | xargs)
fi

DB_USER="${DB_USER:-postgres}"
DB_PASSWORD="${DB_PASSWORD}"
DB_NAME="${DB_NAME:-senhas_prod}"
CONTAINER="senhas-postgres"

echo "Creating superadmin user..."

docker exec -i "$CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" <<'SQL'
DO $$
DECLARE
  pw_hash TEXT;
BEGIN
  -- bcrypt hash for the password (12 rounds, generated offline)
  pw_hash := '$2b$12$YBeNEz0iRDsrM.eQQuIIO.jRXk6qT0nBgWizbPMMV6IcY0gk6pL.q';

  -- Insert only if not exists
  IF NOT EXISTS (SELECT 1 FROM users WHERE email = 'superadmin@senhas.app') THEN
    INSERT INTO users (id, tenant_id, email, username, password_hash, role, is_active, created_at, updated_at)
    VALUES (
      gen_random_uuid(),
      NULL,
      'superadmin@senhas.app',
      'superadmin',
      pw_hash,
      'super_admin',
      TRUE,
      NOW(),
      NOW()
    );
    RAISE NOTICE 'Superadmin created successfully.';
  ELSE
    RAISE NOTICE 'Superadmin already exists, skipping.';
  END IF;
END $$;
SQL

echo "Done."
