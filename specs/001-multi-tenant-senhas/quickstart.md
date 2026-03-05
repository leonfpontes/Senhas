# Developer Quickstart Guide

**Version**: 1.0  
**Last Updated**: 2026-03-05  
**Estimated Setup Time**: 30-45 minutes

---

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Clone & Install](#clone--install)
3. [Environment Setup](#environment-setup)
4. [Backend Setup (FastAPI)](#backend-setup-fastapi)
5. [Frontend Setup (Next.js)](#frontend-setup-nextjs)
6. [Database Setup](#database-setup)
7. [Running Tests](#running-tests)
8. [Common Issues](#common-issues)
9. [Project Structure](#project-structure)

---

## Prerequisites

### System Requirements

- **OS**: macOS 11+, Linux (Ubuntu 20.04+), or Windows 10+ (WSL2 recommended)
- **Disk**: 10 GB free space (node_modules, venv, PostgreSQL)

### Required Software

| Tool | Version | Purpose | Install |
|------|---------|---------|---------|
| Python | 3.11+ | Backend runtime | [python.org](https://www.python.org/downloads/) |
| Node.js | 18 LTS+ | Frontend/tooling | [nodejs.org](https://nodejs.org/) |
| PostgreSQL | 14+ | Database | [postgresql.org](https://www.postgresql.org/) or Docker |
| Docker | 20.10+ | Optional: containerized PostgreSQL | [docker.com](https://www.docker.com/) |
| Git | 2.30+ | Version control | [git-scm.com](https://git-scm.com/) |

### Verify Installation

```bash
# Python
python --version
# Expected: Python 3.11.x or higher

# Node
node --version
# Expected: v18.x.x or higher

npm --version
# Expected: 9.x.x or higher

# PostgreSQL​ (if installed native)
psql --version
# Expected: psql (PostgreSQL) 14.x or higher

# Git
git --version
# Expected: git version 2.x.x or higher
```

---

## Clone & Install

### 1. Clone Repository

```bash
git clone https://github.com/your-org/senhas-saas.git
cd senhas-saas
```

### 2. Fork & Clone (for contributors)

```bash
# Fork on GitHub, then:
git clone https://github.com/{YOUR_USERNAME}/senhas-saas.git
cd senhas-saas
git remote add upstream https://github.com/your-org/senhas-saas.git
```

### 3. Directory Structure

```
senhas-saas/
├── backend/                  # FastAPI application
│   ├── app/
│   │   ├── main.py
│   │   ├── api/
│   │   │   ├── v1/
│   │   │   │   ├── public.py      # POST /api/v1/public/tenants/{slug}/tickets
│   │   │   │   ├── admin.py       # GET /api/v1/admin/{slug}/giras
│   │   │   │   └── auth.py        # POST /api/v1/auth/login
│   │   │   └── dependencies.py    # JWT validation, tenant extraction
│   │   ├── models/                # SQLAlchemy ORM models
│   │   │   ├── tenant.py
│   │   │   ├── user.py
│   │   │   ├── gira.py
│   │   │   ├── ticket.py
│   │   │   ├── consulente.py
│   │   │   └── audit_log.py
│   │   ├── schemas/               # Pydantic request/response models
│   │   ├── services/              # Business logic
│   │   │   ├── ticket_service.py
│   │   │   ├── gira_service.py
│   │   │   └── email_service.py
│   │   ├── utils/
│   │   │   ├── security.py        # JWT, password hashing
│   │   │   └── decorators.py      # @require_role, @rate_limit
│   │   └── config.py              # Settings, env vars
│   ├── migrations/                # Alembic SQL migrations
│   │   └── versions/
│   │       └── 001_initial_schema.sql
│   ├── tests/                     # pytest test suite
│   ├── requirements.txt           # Python dependencies
│   ├── pyproject.toml            # Poetry config
│   ├── .env.example              # Environment template
│   └── Dockerfile               # Production image
│
├── frontend/                  # Next.js React application
│   ├── src/
│   │   ├── pages/
│   │   │   ├── api/               # API routes (optional)
│   │   │   ├── admin/
│   │   │   │   ├── giras/
│   │   │   │   ├── tickets/
│   │   │   │   └── consulentes/
│   │   │   ├── login.tsx
│   │   │   └── [tenant]/
│   │   │       └── new-ticket.tsx # Public ticket form
│   │   ├── components/
│   │   ├── hooks/
│   │   ├── lib/
│   │   │   └── api-client.ts      # Axios instance
│   │   ├── styles/
│   │   └── types/
│   ├── .env.local.example        # Environment template
│   ├── package.json
│   ├── tsconfig.json
│   ├── next.config.js
│   └── Dockerfile
│
├── specs/
│   └── 001-multi-tenant-senhas/
│       ├── data-model.md
│       ├── contracts/
│       │   ├── public.md
│       │   └── admin.md
│       └── quickstart.md (this file)
│
├── docker-compose.yml         # Local dev environment
├── .gitignore
├── README.md
└── CONTRIBUTING.md
```

---

## Environment Setup

### 1. Backend Environment (.env)

Create `backend/.env` from template:

```bash
cd backend
cp .env.example .env
```

Edit `backend/.env`:

```dotenv
# Database
DATABASE_URL=postgresql://senhas_user:senhas_pass@localhost:5432/senhas_db
DATABASE_POOL_SIZE=20
DATABASE_MAX_OVERFLOW=40

# JWT & Security
JWT_SECRET=your-super-secret-key-change-in-production-min-32-chars-123abc
JWT_ALGORITHM=HS256
JWT_ACCESS_TOKEN_EXPIRE_MINUTES=1440
JWT_REFRESH_TOKEN_EXPIRE_DAYS=30

# Email
EMAIL_PROVIDER=sendgrid  # or: smtp, aws_ses
SENDGRID_API_KEY=SG.xxxxxxxxxxxxx
EMAIL_FROM=noreply@senhas.app
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASSWORD=your-app-password

# Environment
ENVIRONMENT=development  # or: staging, production
DEBUG=True
LOG_LEVEL=INFO
CORS_ORIGINS=["http://localhost:3000", "http://localhost:8000"]

# Rate Limiting (Redis optional)
REDIS_URL=redis://localhost:6379
RATE_LIMIT_ENABLED=True

# AWS (optional, for S3 logo uploads)
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
AWS_S3_BUCKET=senhas-uploads

# Observability
SENTRY_DSN=
DATADOG_API_KEY=
```

**Security Notes:**
- Generate a strong JWT_SECRET: `openssl rand -hex 32`
- Never commit `.env` (in `.gitignore`)
- In production: use AWS Secrets Manager, HashiCorp Vault, or similar
- Rotate JWT_SECRET and EMAIL credentials regularly

### 2. Frontend Environment (.env.local)

Create `frontend/.env.local` from template:

```bash
cd frontend
cp .env.local.example .env.local
```

Edit `frontend/.env.local`:

```dotenv
# API
NEXT_PUBLIC_API_BASE_URL=http://localhost:8000/api/v1
NEXT_PUBLIC_UPLOAD_MAX_SIZE_MB=5

# Feature Flags
NEXT_PUBLIC_FEATURE_ANALYTICS=true
NEXT_PUBLIC_FEATURE_WEBHOOKS=true

# Environment
NODE_ENV=development
```

**Notes:**
- `NEXT_PUBLIC_*` variables are exposed to browser
- `NODE_ENV=development`: Fast reload, source maps, verbose logs
- Never put secrets in NEXT_PUBLIC variables

---

## Backend Setup (FastAPI)

### 1. Python Virtual Environment

```bash
cd backend

# Create venv
python3.11 -m venv venv

# Activate venv
# macOS/Linux:
source venv/bin/activate

# Windows CMD:
venv\Scripts\activate.bat

# Windows PowerShell:
venv\Scripts\Activate.ps1
```

Verify activation:
```bash
which python
# Should show: /path/to/backend/venv/bin/python

python --version
# Should show: Python 3.11.x
```

### 2. Install Dependencies

```bash
# Using pip
pip install --upgrade pip setuptools
pip install -r requirements.txt

# Or using Poetry (if available)
poetry install
```

**Key dependencies:**
- `fastapi==0.104.1` - Web framework
- `sqlalchemy==2.0.23` - ORM
- `psycopg2-binary==2.9.9` - PostgreSQL driver
- `pydantic==2.5.0` - Validation
- `python-jose[cryptography]==3.3.0` - JWT
- `passlib[bcrypt]==1.7.4` - Password hashing
- `sendgrid==6.10.0` - Email service
- `pytest==7.4.3` - Testing
- `pytest-asyncio==0.21.1` - Async testing

### 3. Verify Installation

```bash
python -c "import fastapi; print(f'FastAPI {fastapi.__version__}')"
python -c "import sqlalchemy; print(f'SQLAlchemy {sqlalchemy.__version__}')"
```

---

## Frontend Setup (Next.js)

### 1. Install Dependencies

```bash
cd frontend

npm install
# or using yarn/pnpm
yarn install
```

**Key dependencies:**
- `next==14.0.3` - React framework
- `react==18.2.0`
- `typescript==5.3.3`
- `axios==1.6.2` - HTTP client
- `tailwindcss==3.3.6` - Styling
- `react-hook-form==7.48.0` - Form handling
- `zustand==4.4.1` - State management

### 2. Verify Installation

```bash
npx next --version
# Should show: 14.0.3 (or similar)

npm list react
# Should show: react@18.2.0 (or similar)
```

---

## Database Setup

### Option A: PostgreSQL with Docker (Recommended)

```bash
# Start PostgreSQL container
docker-compose up -d postgres

# Verify it's running
docker ps
# Should show: postgres image running, port 5432 exposed

# Wait 10 seconds for startup, then test connection
psql postgresql://senhas_user:senhas_pass@localhost:5432/senhas_db -c "SELECT NOW();"
# Should return current timestamp
```

**docker-compose.yml snippet:**
```yaml
services:
  postgres:
    image: postgres:15-alpine
    environment:
      POSTGRES_USER: senhas_user
      POSTGRES_PASSWORD: senhas_pass
      POSTGRES_DB: senhas_db
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U senhas_user"]
      interval: 10s
      timeout: 5s
      retries: 5

volumes:
  postgres_data:
```

### Option B: PostgreSQL Native Installation

```bash
# macOS (using Homebrew)
brew install postgresql@15
brew services start postgresql@15

# Linux (Ubuntu/Debian)
sudo apt-get install postgresql postgresql-contrib
sudo systemctl start postgresql

# Windows (use installer from postgresql.org)
# Then start "PostgreSQL" service from Services panel
```

Create database and user:

```bash
# Create database
psql -U postgres -c "CREATE DATABASE senhas_db;"

# Create user
psql -U postgres -c "CREATE USER senhas_user WITH PASSWORD 'senhas_pass';"

# Grant privileges
psql -U postgres -c "GRANT ALL PRIVILEGES ON DATABASE senhas_db TO senhas_user;"

# Verify connection
psql -U senhas_user -d senhas_db -c "SELECT NOW();"
```

### Database Migrations

**Using Alembic** (recommended):

```bash
cd backend

# View migration status
alembic current
# Should show: No alembic_version table found

# Create initial migration (if not already versioned)
alembic revision --autogenerate -m "initial schema"

# Apply migrations
alembic upgrade head

# Verify tables created
psql postgresql://senhas_user:senhas_pass@localhost:5432/senhas_db \
  -c "SELECT table_name FROM information_schema.tables WHERE table_schema='public';"
# Should show: tenants, users, giras, tickets, consulentes, senha_controls, audit_logs
```

**Using raw SQL** (alternative):

```bash
# From backend directory
psql postgresql://senhas_user:senhas_pass@localhost:5432/senhas_db \
  < migrations/001_initial_schema.sql

# Verify
psql postgresql://senhas_user:senhas_pass@localhost:5432/senhas_db \
  -c "\dt"  # List all tables
```

Check migrations status:

```bash
# List migrations
ls -la backend/migrations/versions/

# View specific migration
cat backend/migrations/versions/001_initial_schema.sql
```

---

## Running Locally

### 1. Start Backend (FastAPI)

```bash
cd backend

# Ensure venv is activated
source venv/bin/activate  # macOS/Linux
# or
venv\Scripts\activate     # Windows

# Start server
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

# Output should show:
# INFO:     Uvicorn running on http://0.0.0.0:8000
# INFO:     Application startup complete
```

#### Verify Backend

```bash
# In another terminal:
curl http://localhost:8000/health
# Expected: {"status": "ok"}

curl -X GET http://localhost:8000/api/v1/public/tenants/test/next-gira
# Expected: 404 or list of giras (per API spec)
```

#### OpenAPI Documentation

Open browser: `http://localhost:8000/docs`  
Should show interactive Swagger UI with all endpoints

### 2. Start Frontend (Next.js)

```bash
cd frontend

# Development mode (fast reload)
npm run dev

# Output should show:
# ▲ Next.js 14.0.3
# - Local:        http://localhost:3000
# - Environments: .env.local
```

#### Verify Frontend

Open browser: `http://localhost:3000`  
Should show landing page

### 3. (Optional) Start all with Docker Compose

```bash
# From root directory
docker-compose up

# Services will be available at:
# Backend: http://localhost:8000
# Frontend: http://localhost:3000
# PostgreSQL: localhost:5432 (internal only)
```

---

## Running Tests

### Backend Tests (pytest)

```bash
cd backend

# Run all tests
pytest

# Run with verbose output
pytest -v

# Run specific test file
pytest tests/api/test_tickets.py

# Run specific test function
pytest tests/api/test_tickets.py::test_emit_ticket_success

# Run with coverage
pytest --cov=app --cov-report=html
# View report: open htmlcov/index.html
```

**Example test structure:**

```python
# backend/tests/api/test_tickets.py
import pytest
from httpx import AsyncClient
from app.main import app

@pytest.mark.asyncio
async def test_emit_ticket_success(_client: AsyncClient):
    """Test successful ticket emission"""
    response = await _client.post(
        "/api/v1/public/tenants/test-temple/tickets",
        json={
            "consulente_name": "João Silva",
            "consulente_email": "joao@example.com",
            "consulente_subscription": "monthly"
        }
    )
    assert response.status_code == 201
    assert response.json()["success"] is True
    assert "ticket" in response.json()["data"]

@pytest.mark.asyncio
async def test_emit_ticket_validation_error(_client: AsyncClient):
    """Test validation error for invalid email"""
    response = await _client.post(
        "/api/v1/public/tenants/test-temple/tickets",
        json={
            "consulente_name": "João",
            "consulente_email": "invalid-email",  # Invalid format
        }
    )
    assert response.status_code == 400
    assert response.json()["success"] is False
```

### Frontend Tests (Jest + React Testing Library)

```bash
cd frontend

# Run all tests
npm test

# Run watch mode (re-run on file change)
npm test -- --watch

# Run specific test
npm test -- tickets.test.tsx

# Generate coverage report
npm test -- --coverage
```

**Integration Test Example:**

```typescript
// frontend/src/__tests__/pages/new-ticket.test.tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import NewTicketPage from '@/pages/[tenant]/new-ticket';

describe('NewTicketPage', () => {
  it('should submit ticket form', async () => {
    render(<NewTicketPage />);
    
    fireEvent.change(screen.getByLabelText('Nome'), {
      target: { value: 'João Silva' }
    });
    fireEvent.change(screen.getByLabelText('Email'), {
      target: { value: 'joao@example.com' }
    });
    
    fireEvent.click(screen.getByRole('button', { name: /enviar/i }));
    
    await waitFor(() => {
      expect(screen.getByText(/sucesso/i)).toBeInTheDocument();
    });
  });
});
```

### End-to-End Tests (Playwright/Cypress - Optional)

```bash
# Install
npm install --save-dev @playwright/test

# Run
npx playwright test

# Run in debug mode
npx playwright test --debug
```

---

## Common Issues

### Issue 1: PostgreSQL Connection Error

**Error**: `psycopg2.OperationalError: could not connect to server`

**Solution**:
```bash
# Check if PostgreSQL is running
# macOS:
brew services list | grep postgresql

# Linux:
sudo systemctl status postgresql

# Windows:
# Services > PostgreSQL > check status

# Try connecting manually
psql postgresql://senhas_user:senhas_pass@localhost:5432/senhas_db

# If fails, check port 5432 is not in use
# macOS/Linux:
lsof -i :5432

# Windows:
netstat -ano | findstr :5432
```

### Issue 2: Python Module Not Found

**Error**: `ModuleNotFoundError: No module named 'fastapi'`

**Solution**:
```bash
# Ensure venv is activated
which python  # Should show venv path
# NOT activated? Activate it:
source backend/venv/bin/activate

# Reinstall requirements
pip install -r requirements.txt
```

### Issue 3: Port Already in Use

**Error**: `Address already in use: ('0.0.0.0', 8000)`

**Solution**:
```bash
# Find process using port
lsof -i :8000  # macOS/Linux
netstat -ano | findstr :8000  # Windows

# Kill process
kill -9 <PID>  # macOS/Linux
taskkill /PID <PID> /F  # Windows

# Or use different port
uvicorn app.main:app --port 8001
```

### Issue 4: Node Dependencies Version Conflict

**Error**: `npm ERR! peer dep missing: ...`

**Solution**:
```bash
# Clear cache and reinstall
npm cache clean --force
rm -rf node_modules package-lock.json
npm install

# Or use legacy peer deps flag
npm install --legacy-peer-deps
```

### Issue 5: JWT Secret Not Set

**Error**: `ValueError: JWT_SECRET is not set`

**Solution**:
```bash
# Generate strong secret
openssl rand -hex 32
# Copy output to backend/.env
# JWT_SECRET=abc123def456...

# Verify
cd backend && python -c "from app.config import settings; print(settings.jwt_secret[:10])"
```

---

## Development Workflow

### Branch Strategy

```bash
# Create feature branch
git checkout -b feature/ticket-emission-optimization

# Make changes, commit
git add .
git commit -m "feat: optimize ticket numbering with indexes"

# Push and create PR
git push origin feature/ticket-emission-optimization

# After merge, delete branch
git branch -d feature/ticket-emission-optimization
```

### Code Style & Linting

**Backend**:
```bash
cd backend

# Format with Black
black .

# Lint with Flake8
flake8 .

# Type check with Mypy
mypy app/
```

**Frontend**:
```bash
cd frontend

# Format with Prettier
npm run format

# Lint with ESLint
npm run lint
```

### Pre-commit Hooks

```bash
# Install pre-commit
pip install pre-commit

# Configure
cat > .pre-commit-config.yaml << EOF
repos:
  - repo: https://github.com/psf/black
    rev: 23.12.0
    hooks:
      - id: black
  - repo: https://github.com/PyCQA/flake8
    rev: 6.1.0
    hooks:
      - id: flake8
EOF

# Install hooks
pre-commit install

# Test
pre-commit run --all-files
```

---

## Project Structure Details

### Backend API Routes

```
├── /health (GET)                           # Service health check
├── /api/v1/auth
│   ├── /login (POST)                      # User authentication
│   ├── /refresh (POST)                    # Refresh JWT token
│   └── /logout (POST)                     # Invalidate token
├── /api/v1/public/tenants/{slug}
│   ├── /tickets (POST)                    # Emit ticket (core)
│   ├── /next-gira (GET)                   # Get next event
│   └── /tickets/{id}/resend-email (POST)  # Resend ticket email
├── /api/v1/admin/{slug}
│   ├── /giras (GET, POST)                 # List/create giras
│   ├── /giras/{id} (GET, PUT, DELETE)     # Manage gira
│   ├── /tickets (GET, POST)               # List/emit tickets
│   ├── /tickets/{id} (GET, PUT)           # Manage ticket
│   ├── /consulentes (GET)                 # List visitors
│   ├── /consulentes/{id} (GET, PUT, DELETE) # Manage consulente
│   ├── /branding (GET, PUT)               # Branding config
│   ├── /analytics/overview (GET)          # Dashboard metrics
│   └── /reports/tickets (GET)             # Export tickets
└── /docs (GET)                            # OpenAPI/Swagger UI
```

### Frontend Pages

```
├── index.tsx                    # Landing page
├── /login                       # Admin login
├── /admin/dashboard            # Home dashboard
├── /admin/giras               # Gira management
├── /admin/giras/[id]/edit     # Edit specific gira
├── /admin/tickets             # Ticket management
├── /admin/consulentes         # Visitor management
├── /admin/branding            # Branding config
├── /admin/reports             # Reports & analytics
├── /[tenant]/new-ticket       # Public ticket form (public-facing)
└── /404, /500                 # Error pages
```

---

## Next Steps

1. **Run local environment**: `docker-compose up && npm run dev`
2. **Explore API**: Open `http://localhost:8000/docs`
3. **Review spec**: Read [data-model.md](data-model.md), [contracts/public.md](../contracts/public.md)
4. **Create first issue**: Pick a low-complexity item from GitHub Issues
5. **Submit PR**: Follow contribution guide in CONTRIBUTING.md

---

## Useful Commands

```bash
# Backend
cd backend && source venv/bin/activate  # Activate venv
pip install -r requirements.txt         # Install deps
uvicorn app.main:app --reload           # Start server
pytest                                  # Run tests
black . && flake8 .                     # Format & lint
alembic upgrade head                    # Run migrations
alembic downgrade -1                    # Rollback migration

# Frontend
cd frontend
npm install                              # Install deps
npm run dev                              # Dev server
npm test                                 # Run tests
npm run build                            # Production build
npm run lint                             # Lint code

# Database
psql postgresql://senhas_user:senhas_pass@localhost:5432/senhas_db
\dt                                      # List all tables
SELECT COUNT(*) FROM tickets;            # Count tickets

# Docker
docker-compose up -d                     # Start services
docker-compose down                      # Stop services
docker-compose logs -f postgres          # View logs
docker-compose ps                        # List running services
```

---

## Documentation References

- [FastAPI Docs](https://fastapi.tiangolo.com/)
- [SQLAlchemy 2.0](https://docs.sqlalchemy.org/en/20/)
- [Pydantic Docs](https://docs.pydantic.dev/)
- [Next.js Docs](https://nextjs.org/docs)
- [React Docs](https://react.dev/)
- [PostgreSQL Docs](https://www.postgresql.org/docs/15/index.html)

---

## Support

- **Issues**: Post on GitHub Issues with `[SETUP]` prefix
- **Discussions**: GitHub Discussions for questions
- **Slack**: Ask in `#developer-setup` channel

