#!/bin/bash
# Phase 1 Verification Script
# Validates all Phase 1 infrastructure created

echo "==================================="
echo "Phase 1 Infrastructure Verification"
echo "==================================="
echo ""

# Check directories
echo "📁 Checking directories..."
declare -a dirs=(
  "backend"
  "backend/app"
  "backend/alembic"
  "backend/alembic/versions"
  "frontend"
  "frontend/src"
  "packages/shared-types"
  "packages/shared-types/src"
  "packages/shared-ui"
  "packages/shared-ui/src"
  ".husky"
)

for dir in "${dirs[@]}"; do
  if [ -d "$dir" ]; then
    echo "  ✅ $dir"
  else
    echo "  ❌ $dir (MISSING)"
  fi
done

echo ""
echo "📄 Checking key files..."
declare -a files=(
  "backend/pyproject.toml"
  "backend/app/main.py"
  "backend/alembic.ini"
  "backend/alembic/env.py"
  "backend/alembic/versions/001_init_schema.py"
  "backend/Dockerfile"
  "frontend/package.json"
  "frontend/tsconfig.json"
  "frontend/next.config.js"
  "frontend/Dockerfile"
  "packages/shared-types/package.json"
  "packages/shared-types/src/index.ts"
  "packages/shared-ui/package.json"
  "packages/shared-ui/src/theme.tsx"
  "docker-compose.yml"
  "package.json"
  ".env.example"
  ".prettierrc.json"
  ".lintstagedrc.json"
  ".husky/pre-commit"
  "README.md"
)

for file in "${files[@]}"; do
  if [ -f "$file" ]; then
    echo "  ✅ $file"
  else
    echo "  ❌ $file (MISSING)"
  fi
done

echo ""
echo "==================================="
echo "✨ Phase 1 Infrastructure Complete!"
echo "==================================="
echo ""
echo "Next steps:"
echo "1. cd backend && python -m venv venv"
echo "2. source venv/bin/activate  # or: venv\Scripts\activate on Windows"
echo "3. pip install -e '.[dev]'"
echo "4. npm install && npm run install:all"
echo "5. docker-compose up"
echo ""
echo "Frontend: http://localhost:3000"
echo "Backend:  http://localhost:8000"
echo ""
