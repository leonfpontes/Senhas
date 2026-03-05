<!--
==============================================================================
SYNC IMPACT REPORT - Constitution Creation
==============================================================================
Version Change: [NOT SET] → 1.0.0
Type: MAJOR - Initial constitution establishment
Date: 2026-03-05

Principles Defined:
  - I. Multi-Tenancy e Isolamento de Dados (NEW)
  - II. Acessibilidade e Simplicidade (NEW)
  - III. Confiabilidade e Integridade (NON-NEGOTIABLE) (NEW)
  - IV. Segurança e Privacidade (NEW)
  - V. Profissionalismo Operacional (NEW)

Sections Added:
  - Core Principles (5 principles)
  - Technical Stack & Architecture
  - Development Standards & Quality Gates
  - Governance

Templates Requiring Updates:
  ✅ constitution.md - Created with all principles
  ⚠ plan-template.md - Review "Constitution Check" section alignment
  ⚠ spec-template.md - Review acceptance criteria requirements
  ⚠ tasks-template.md - Review audit/security task categories

Follow-up TODOs:
  - None - All critical fields defined
==============================================================================
-->

# Sistema de Gestão de Senhas de Giras - Constitution

## Core Principles

### I. Multi-Tenancy e Isolamento de Dados

**Regra**: Cada terreiro DEVE operar como tenant completamente isolado, identificado exclusivamente por slug único.

- Todo dado (giras, senhas, usuários, configurações) DEVE estar vinculado a um tenant
- Nenhuma query ou operação PODE cruzar fronteiras de tenant sem permissão explícita de Super Admin
- Cada tenant DEVE ter: slug único (imutável), identidade visual própria (logo + paleta de cores), calendário independente, histórico operacional isolado
- A arquitetura DEVE ser projetada para escalabilidade horizontal (múltiplos terreiros sem retrabalho)

**Rationale**: O sistema é um produto multi-tenant comercial. O isolamento garante privacidade, segurança e clareza operacional, permitindo que cada terreiro opere com autonomia total sem interferência de outros.

### II. Acessibilidade e Simplicidade

**Regra**: A camada pública (retirada de senhas) DEVE ser acessível sem autenticação e desenhada para máxima simplicidade.

- Interface pública DEVE ser intuitiva, acolhedora e mobile-first
- Formulário de retirada DEVE solicitar apenas: nome, telefone, e-mail (todos obrigatórios)
- Feedback DEVE ser imediato: contador regressivo, indicador de progresso, confirmação visual
- Validações DEVEM ser não-intrusivas: normalização automática de telefone/e-mail, mensagens claras de erro
- Confirmação por e-mail DEVE usar template HTML inline profissional, compatível com provedores populares

**Rationale**: O usuário final (consulente) não tem familiaridade técnica ou paciência para processos complexos. A experiência deve ser direta, sem fricção, mas robusta nos bastidores.

### III. Confiabilidade e Integridade (NON-NEGOTIABLE)

**Regra**: O sistema DEVE garantir integridade absoluta na emissão de senhas e prevenção de duplicidades.

- Uma pessoa (identificada por telefone OU e-mail) DEVE ter no máximo UMA senha por gira
- Números de senha DEVEM ser sequenciais, únicos e gerados de forma atômica (sem race conditions)
- Emissões simultâneas (concorrência) DEVEM ser tratadas com transações de banco de dados
- Reemissão de senha DEVE sempre gerar novo número no final da fila (preservando ordem original)
- Cancelamento de senha NÃO DEVE liberar o número para reutilização (auditoria e clareza)
- Rate limiting DEVE estar ativo para prevenir abuso e ataques de negação de serviço

**Rationale**: A confiança no sistema depende de que cada senha seja única, rastreável e que o processo seja justo e transparente. Duplicidades ou inconsistências destroem a credibilidade operacional.

### IV. Segurança e Privacidade

**Regra**: Áreas administrativas e dados sensíveis DEVEM ser protegidos por autenticação forte e controle de acesso baseado em perfis.

- Acesso administrativo DEVE exigir autenticação via JWT com refresh token seguro
- Perfis de usuário DEVEM ter permissões granulares: Admin Terreiro (CRUD giras/senhas), Super Admin (gestão plataforma)
- Dados pessoais (nome, telefone, e-mail) DEVEM ser tratados conforme LGPD: criptografia em trânsito (HTTPS), acesso restrito, retenção limitada
- APIs públicas DEVEM ter rate limiting e validação de origem (proteção contra scrapers)
- Senhas de usuários administrativos DEVEM ser hasheadas com algoritmo moderno (bcrypt/argon2)

**Rationale**: O sistema lida com dados pessoais sensíveis e controla acesso a recursos críticos. Segurança não é opcional e deve estar embutida na arquitetura desde o início.

### V. Profissionalismo Operacional

**Regra**: O sistema DEVE fornecer ferramentas administrativas claras, auditoria completa e experiência consistente em todos os tenants.

- Todas as ações críticas DEVEM registrar auditoria: quem fez, o que fez, quando (timestamp UTC), IP de origem
- Dashboard administrativo DEVE prover: visão de senhas em tempo real, filtros, exportação CSV, ações em massa
- E-mails transacionais DEVEM ter rastreabilidade: logs de envio, falhas, tentativas de reenvio
- Branding por tenant DEVE ser aplicado consistentemente: logo no e-mail, paleta de cores na UI, nome personalizado
- Documentação operacional DEVE estar disponível: guia de uso, FAQs, procedimentos de suporte

**Rationale**: O sistema transforma um processo manual em fluxo profissional. A governança operacional e a transparência são essenciais para que os administradores tenham controle total e confiança no sistema.

## Technical Stack & Architecture

**MANDATÓRIO**: A stack técnica é definida para garantir manutenibilidade, custo-efetividade e performance adequada ao contexto.

### Frontend
- **Framework**: Next.js (React) com TypeScript
- **UI Library**: Material UI (MUI) v6+
- **Tema**: Neutro padronizado com override de branding por tenant via props/context
- **Componentes Padrão**: AppBar, Drawer, menus de perfil, footer, layout responsivo
- **Hospedagem**: Vercel ou VPS com Nginx (mesma infraestrutura do backend)

### Backend
- **Framework**: FastAPI (Python 3.11+)
- **Validação**: Pydantic v2 para contratos de entrada/saída
- **Autenticação**: JWT via PyJWT ou python-jose, refresh token em HTTP-only cookie
- **E-mail**: Integração com Brevo, Resend ou similar (plano gratuito inicial)
- **APIs**: Separação clara entre rotas públicas (`/public`), admin (`/admin`), super admin (`/platform`)

### Database
- **RDBMS**: PostgreSQL 15+ hospedado na mesma VPS
- **ORM**: SQLAlchemy 2.0+ (async)
- **Migrações**: Alembic
- **Constraints**: Foreign keys, unique constraints, check constraints para garantir integridade
- **Índices**: Criados em tenant_id, slug, email, telefone para performance
- **Transações**: Uso obrigatório para emissão de senhas (isolamento SERIALIZABLE ou REPEATABLE READ)

### Infrastructure
- **Hosting**: VPS Linux (Ubuntu 22.04 LTS ou similar)
- **Reverse Proxy**: Nginx com HTTPS (Let's Encrypt)
- **CI/CD**: GitHub Actions para linting, testes, deploy automatizado
- **Monitoramento**: Logs estruturados (JSON), ferramentas simples (tail, grep, ou SaaS gratuito inicial)

**Rationale**: Stack moderna, madura e bem documentada. Hospedagem na VPS própria reduz custos recorrentes. Escolhas pragmáticas priorizando manutenibilidade sobre hype.

## Development Standards & Quality Gates

### Code Standards
- **Linting**: ESLint + Prettier (frontend), Black + Ruff (backend)
- **Type Safety**: TypeScript strict mode (frontend), Type hints + mypy (backend)
- **Estrutura de Código**: Modular, separação clara de responsabilidades (controllers, services, repositories)
- **Commits**: Conventional Commits (feat, fix, docs, refactor, test, chore)

### Testing Requirements
- **Backend**: Testes unitários (pytest) para lógica de negócio, fixtures para isolamento
- **Frontend**: Testes de componentes críticos (Jest + React Testing Library)
- **API Contracts**: Testes de integração para endpoints críticos (emissão senha, autenticação)
- **E2E**: Testes de fluxo completo (opcional inicial, obrigatório antes de produção)

### Acceptance Criteria Gates
TODO feature DEVE ter critérios de aceite explícitos validando:
1. **Contador e Progresso**: Indicador reflete estado real, atualiza corretamente
2. **Duplicidade**: Impossível emitir duas senhas para mesma pessoa/gira
3. **Concorrência**: Emissões simultâneas não causam números duplicados ou perdidos
4. **Branding**: Logo e cores do tenant aplicados corretamente (e-mail + UI)
5. **E-mail**: Template HTML inline entregue corretamente, links funcionais
6. **Auditoria**: Ações críticas registradas com todos os campos obrigatórios
7. **Rate Limiting**: Proteção ativa contra abuso (verificar em testes de carga)

### Code Review Process
- Pull requests DEVEM ter descrição clara do problema + solução
- Revisão DEVE verificar aderência à constituição (checklist gerado por spec-kit)
- Mudanças em contratos de API ou modelos de dados REQUEREM aprovação explícita
- Quebras de princípios DEVEM ser justificadas e documentadas como exceção temporária

## Governance

### Constitution Authority
Esta constituição DEFINE os princípios não-negociáveis do Sistema de Gestão de Senhas de Giras. Toda decisão técnica, arquitetural ou de produto DEVE estar alinhada a estes princípios. Desvios REQUEREM emenda formal via processo de amendment.

### Amendment Process
1. Proposta documentada em issue com racional completo
2. Discussão e aprovação pelo time/stakeholders
3. Atualização da constituição com bump de versão semântico:
   - **MAJOR**: Remoção ou redefinição incompatível de princípio
   - **MINOR**: Adição de novo princípio ou expansão material de seção
   - **PATCH**: Clarificações, correções, refinamentos semânticos
4. Propagação de mudanças para templates dependentes (plan, spec, tasks)
5. Migração de código/processos existentes se necessário

### Compliance Review
- Specs DEVEM referenciar princípios atendidos explicitamente
- Plans DEVEM incluir seção "Constitution Check" validando gates
- Tasks DEVEM incluir categorização refletindo princípios (segurança, auditoria, testes)
- Retrospectivas DEVEM avaliar aderência e propor ajustes se necessário

### Development Guidance
Para orientações específicas de runtime (comandos, ferramentas, fluxos operacionais), consulte `.specify/README.md` e documentação de templates em `.specify/templates/`.

**Version**: 1.0.0 | **Ratified**: 2026-03-05 | **Last Amended**: 2026-03-05
