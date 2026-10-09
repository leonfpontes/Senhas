<div align="center">

<img src="frontend/public/icons/icon-192.png" alt="GiraHub" width="96" height="96" />

# GiraHub

**A gira organizada, do primeiro consulente ao último atendimento.**

Plataforma para terreiros de Umbanda e casas de axé: senha online para os consulentes, porta e chamada no dia da
gira, corrente de médiuns, mensalidade por PIX e uma área própria para cada médium — tudo no celular.

[![Testes](https://github.com/leonfpontes/Senhas/actions/workflows/tests.yml/badge.svg)](https://github.com/leonfpontes/Senhas/actions/workflows/tests.yml)
[![Deploy](https://github.com/leonfpontes/Senhas/actions/workflows/deploy.yml/badge.svg)](https://github.com/leonfpontes/Senhas/actions/workflows/deploy.yml)
![Versão](https://img.shields.io/badge/vers%C3%A3o-2.6-7c3aed)
![Next.js](https://img.shields.io/badge/Next.js-15-000000?logo=nextdotjs)
![FastAPI](https://img.shields.io/badge/FastAPI-0.142-009688?logo=fastapi&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-15-4169E1?logo=postgresql&logoColor=white)

[**girahub.com.br**](https://girahub.com.br) · [Planos](https://girahub.com.br/planos) · [Documentação](#documentação)

</div>

---

<p align="center">
  <img src="frontend/public/landing/telas/porta.webp" alt="Porta: a fila do dia com chamada da próxima senha" width="49%" />
  <img src="frontend/public/landing/telas/senhas.webp" alt="Senhas da gira com filtros e ações" width="49%" />
</p>

## O que o GiraHub resolve

Dia de gira tem fila na calçada, papelzinho com número, caderno de nomes e planilha de mensalidade. O GiraHub
troca isso por um fluxo simples, pensado para quem cuida da casa — e não para quem entende de tecnologia:

| Antes | Com o GiraHub |
|---|---|
| Consulente chega cedo para pegar senha | Pega a senha pelo celular, no link ou QR da casa |
| Porteiro grita nomes de uma lista | Porta com fila, preferenciais, "chegou" e chamada na TV |
| Ninguém sabe quantos foram atendidos | Relatório da gira em PDF, com médium e cambone |
| Mensalidade anotada no caderno | PIX da casa, comprovante pela Área ou baixa automática |
| Aviso para a corrente perdido no grupo | Avisos, agenda e escalas na Área do Médium |

## Recursos

### No dia da gira
- **Senha online** — o consulente escolhe a gira, informa nome e contato e recebe a senha por e-mail; preferenciais
  (idosos, gestantes, PcD/TEA) e associados entram na frente, com limite de vagas por gira.
- **Porta** — fila em tempo real, "chegou", "não veio", sem senha (walk-in) e chamada da próxima com som.
- **Modo TV** — a chamada aparece na tela do terreiro, sem expor dados pessoais.
- **Relatório da gira** — atendimentos por médium e cambone, filtros e exportação em PDF.

<p align="center">
  <img src="frontend/public/landing/telas/emissao.webp" alt="Pedido de senha pelo celular" width="23%" />
  <img src="frontend/public/landing/telas/bilhete.webp" alt="Senha emitida" width="23%" />
  <img src="frontend/public/landing/telas/relatorio.webp" alt="Relatório da gira" width="50%" />
</p>

### A corrente
- **Médiuns e grupos da corrente**, com atividades da casa (faxina, rituais, reuniões, desenvolvimento).
- **Presença** com "Vou / Não vou", "Cheguei" pelo QR do dia e chamada; **relatório de assiduidade**.
- **Escalas** — de gira por função (cambone, ogã, porteiro…) e de faxina por grupos; rodízio e **troca entre
  médiuns** com aprovação da direção.
- **Ficha espiritual** com autorização do médium e linha do tempo da caminhada (dado sensível, permissão própria).

### Área do Médium
Um app no celular de cada médium (PWA, sem loja), na identidade do site e com a cor e a logo da casa:
Início, agenda, avisos, mensalidade com PIX, presença, escalas, estudos e documentos, "Minha caminhada",
notificações no celular e "Meus dados" (LGPD).

<p align="center">
  <img src="docs/prototipos/cores-claras/depois-inicio-mobile.png" alt="Área do Médium: Início" width="23%" />
  <img src="docs/prototipos/cores-claras/depois-agenda-mobile.png" alt="Área do Médium: Agenda" width="23%" />
  <img src="docs/prototipos/cores-claras/depois-mensalidade-pix-mobile.png" alt="Área do Médium: PIX da mensalidade" width="23%" />
  <img src="docs/prototipos/cores-claras/depois-presencas-mobile.png" alt="Área do Médium: presenças" width="23%" />
</p>

### A casa
- **Financeiro** — mensalidades com PIX da casa, comprovante enviado pelo médium, **pagamento parcial** e **baixa
  automática** pelo Mercado Pago ou Stripe (o dinheiro cai direto na conta do terreiro); contas a pagar e a receber.
- **Estoque** de velas, ervas e materiais; **cursos presenciais** com inscrição online.
- **Site do terreiro** com agenda pública, link e QR para a senha.
- **Permissões por grupo** — cada operador vê e faz só o que a casa liberou.

<p align="center">
  <img src="frontend/public/landing/telas/mensalidades.webp" alt="Mensalidades da corrente" width="49%" />
  <img src="frontend/public/landing/telas/site.webp" alt="Site do terreiro" width="49%" />
</p>

### Planos
Gratuito para começar, e planos Basic, Pro e Premium conforme o tamanho da casa — assinatura por cartão, boleto ou
PIX mês a mês. Detalhes e preços em [girahub.com.br/planos](https://girahub.com.br/planos).

## Arquitetura

```mermaid
flowchart LR
  subgraph Clientes
    C[Consulente<br/>celular]
    M[Médium<br/>Área do Médium · PWA]
    D[Direção e porteiro<br/>painel]
  end
  C & M & D --> N[Nginx<br/>TLS · limites]
  N --> F[Next.js 15<br/>Pages Router]
  N --> A[FastAPI<br/>API /api/v1]
  A --> P[(PostgreSQL 15)]
  A --> E[E-mail<br/>Resend · Brevo]
  A --> S[Stripe<br/>assinatura · Connect]
  A --> MP[Mercado Pago<br/>mensalidade · OAuth]
  A --> W[Web Push<br/>VAPID]
  A -.-> SE[Sentry]
  P -.-> B[(Backup cifrado<br/>fora da VPS)]
```

- **Multi-tenant de verdade** — toda consulta filtra pelo terreiro; um auditor estático (`audit_tenant_isolation.py`)
  roda no CI e bloqueia o PR que esquecer o filtro.
- **Três áreas, três portas** — rotas públicas (`/public`), painel da casa (`/admin`, com grupo de permissão por
  ação) e Área do Médium (`/medium`, só os dados do próprio médium); a plataforma (`/platform`) é do super admin.
- **Sessão segura** — tokens em cookie HttpOnly, JWT tipado, sessões revogáveis e impersonação de suporte isolada.
- **LGPD por padrão** — consentimentos versionados, dado religioso com autorização separada, exportação e
  encerramento de acesso pelo próprio médium, auditoria só com ids.
- **Dinheiro fora do caminho** — pagamentos vão direto para a conta do terreiro; credenciais de terceiros ficam
  criptografadas.

## Stack

| Camada | Tecnologia |
|---|---|
| Frontend | Next.js 15 (Pages Router), React 18, TypeScript 5, Tailwind CSS v4, shadcn/ui, Recharts |
| Backend | Python 3.11, FastAPI 0.142, SQLAlchemy 2 (async), Pydantic v2, Alembic |
| Banco | PostgreSQL 15 |
| Pagamentos | Stripe (assinatura, boleto, PIX avulso, Connect) e Mercado Pago (OAuth) |
| Mensagens | Resend (principal) e Brevo (reserva), Web Push (VAPID) |
| Infra | Docker Compose, Nginx, Let's Encrypt, VPS; backup cifrado (gpg) em Cloudflare R2 |
| Qualidade | pytest (unitário e integração com Postgres real), Jest + Testing Library, ESLint, Sentry |
| CI/CD | GitHub Actions — testes em todo PR; deploy automático a cada merge no `master` |

## Qualidade

Cada PR passa por testes unitários do backend, **integração com Postgres real** (migrações + app inteiro via HTTP),
testes de frontend, lint sem avisos, checagem de tipos, auditoria de isolamento por terreiro e auditoria de
permissões nas rotas e telas. O merge no `master` dispara o deploy: backup, build sem derrubar o site, migrações e
verificação de saúde.

## Rodando localmente

**Pré-requisitos:** Docker e Docker Compose (ou Python 3.11 + Node.js 20 para rodar sem containers).

```bash
git clone https://github.com/leonfpontes/Senhas.git
cd Senhas
cp .env.example .env        # ajuste as variáveis (veja os comentários no arquivo)
docker compose up
```

- Frontend: http://localhost:3000
- API: http://localhost:8000 (documentação interativa em `/docs`)

<details>
<summary>Sem Docker</summary>

```bash
# Backend
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -e ".[dev]"
alembic upgrade head
uvicorn src.main:app --reload --port 8000

# Frontend (em outro terminal, na raiz do repositório)
npm install
npm run dev --workspace frontend
```
</details>

<details>
<summary>Testes</summary>

```bash
# Backend — unitários
cd backend && DEBUG=true python -m pytest tests/unit -q

# Backend — integração com Postgres real (suba um Postgres de teste antes)
INTEGRATION_PG=1 DEBUG=true DATABASE_URL=postgresql+asyncpg://user:senha@localhost:5432/teste \
  python -m pytest tests/integration_pg -q

# Auditorias que o CI exige
python scripts/audit_tenant_isolation.py && python scripts/audit_permission_guards.py

# Frontend
cd frontend && npm run lint && npx tsc --noEmit -p . && npx jest && node scripts/audit-permission-guards.js
```
</details>

## Estrutura

```
backend/            API FastAPI — src/api/v1/{public,admin,medium,platform,auth}, models, services, alembic, tests
frontend/           Next.js — páginas públicas, painel (/admin), Área do Médium (/medium), plataforma
packages/           tipos compartilhados
nginx/              configuração do proxy (TLS, limites de requisição)
devops/             provisionamento da VPS e backup
docs/               arquitetura, API, banco, deploy, planos e estudos de produto
.github/workflows/  testes e deploy
```

## Documentação

| Documento | Conteúdo |
|---|---|
| [`docs/architecture.md`](docs/architecture.md) | Visão geral da arquitetura |
| [`docs/api.md`](docs/api.md) | Referência da API |
| [`docs/database.md`](docs/database.md) | Tabelas e migrações |
| [`docs/authentication.md`](docs/authentication.md) | Sessão, papéis e segurança |
| [`docs/multi-tenancy.md`](docs/multi-tenancy.md) | Isolamento por terreiro |
| [`docs/email.md`](docs/email.md) | E-mails e provedores |
| [`docs/testing.md`](docs/testing.md) | Estratégia de testes |
| [`docs/deployment.md`](docs/deployment.md) | Deploy, backup e configuração de terceiros |
| [`docs/plano-area-do-medium.md`](docs/plano-area-do-medium.md) | Plano e status da Área do Médium |
| [`AGENTS.md`](AGENTS.md) | Regras do projeto e estado atual (referência para quem desenvolve) |

## Licença

Software proprietário — © 2026 Leon F. Pontes. Todos os direitos reservados.
