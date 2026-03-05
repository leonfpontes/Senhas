# Senhas - Sistema Multi-Tenant de Gestão de Senhas

Sistema especializado para gestão segura de senhas para Terreiros de Umbanda, com suporte completo a multi-tenancy, auditoria e em conformidade com LGPD.

## 📋 Estrutura do Projeto

```
senhas/
├── backend/                    # FastAPI Backend
│   ├── app/                   # Aplicação principal
│   │   ├── __init__.py
│   │   └── main.py           # Entry point
│   ├── alembic/              # Database migrations
│   │   ├── versions/
│   │   ├── env.py
│   │   └── script.py.mako
│   ├── Dockerfile
│   ├── pyproject.toml        # Python dependencies
│   └── .gitignore
│
├── frontend/                   # Next.js Frontend
│   ├── src/                   # Source code
│   ├── Dockerfile
│   ├── package.json
│   ├── tsconfig.json
│   ├── next.config.js
│   ├── jest.config.js
│   ├── .eslintrc.json
│   └── .gitignore
│
├── packages/                   # Shared packages (monorepo)
│   ├── shared-types/          # TypeScript interfaces
│   │   ├── src/index.ts      # API contracts
│   │   └── tsconfig.json
│   └── shared-ui/             # Material-UI components
│       ├── src/theme.tsx     # Customized theme
│       ├── src/index.ts      # Component exports
│       └── tsconfig.json
│
├── docker-compose.yml         # Docker orchestration
├── package.json              # Root package config
├── .env.example              # Environment template
├── .gitignore                # Git ignore rules
├── .prettierrc.json          # Code formatter config
└── .lintstagedrc.json        # Pre-commit lint config
```

## 🚀 Quick Start

### Pré-requisitos
- Docker & Docker Compose
- Node.js 18+
- Python 3.11+

### Setup

1. **Clone o repositório e configure variáveis de ambiente:**
```bash
cp .env.example .env
# Edite .env com seus valores
```

2. **Inicie os serviços com Docker:**
```bash
docker-compose up
```

Isto iniciará:
- **PostgreSQL**: localhost:5432
- **Backend (FastAPI)**: http://localhost:8000
- **Frontend (Next.js)**: http://localhost:3000

3. **Em outro terminal, instale dependências locais:**
```bash
npm install
npm run install:all
```

### Desenvolvimento Local (sem Docker)

**Backend:**
```bash
cd backend
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -e ".[dev]"
uvicorn app.main:app --reload
```

**Frontend:**
```bash
cd frontend
npm install
npm run dev
```

## 📦 Packages

### `shared-types`
Interfaces TypeScript para contratos de API:
- Tenant, User, PasswordEntry
- CreateXxxRequest, UpdateXxxRequest
- API Response patterns

### `shared-ui`
Componentes Material-UI customizados:
- Tema customizado (cores Umbanda)
- Componentes reutilizáveis
- Design system consistente

## 🔧 Desenvolvimento

### Lint & Format
```bash
# Após commits (automático via husky)
npm run lint
npm run format
```

### Build
```bash
npm run build
```

### Testes
```bash
npm run test
```

## 🗄️ Database

Migrações Alembic no diretório `backend/alembic/versions/`:
- `001_init_schema.py`: Schema inicial com Tenants, Users, Passwords, AuditLogs

Para criar nova migração:
```bash
alembic revision --autogenerate -m "Description"
```

## 📝 Variáveis de Ambiente

Veja `.env.example` para todas as configurações disponíveis:
- Database (PostgreSQL)
- JWT & Security
- CORS & Hosts
- Rate Limiting
- Email Service

## 🤝 Git Hooks

Configurado com Husky + lint-staged:
- **pre-commit**: Executa lint automático antes de commits
  - Backend: black, ruff
  - Frontend: eslint, prettier

## 📚 Próximos Passos

- **Phase 2**: Backend Foundation (Database, Models, Auth)
- **Phase 3**: Public Ticket API
- **Phase 4**: Admin Dashboard

Veja `IMPLEMENTATION_READINESS.md` para roadmap completo.
