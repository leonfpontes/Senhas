# AGENTS.md - Guia Operacional para Agentes de IA

Last Updated: 2026-03-18
Project: Senhas - Multi-Tenant SaaS Password Management
Repository: leonfpontes/Senhas
Default Branch: master
Working Branch (atual): 001-multi-tenant-senhas

Este arquivo define como agentes de IA devem entender o sistema e como agir ao implementar mudanças com seguranca, qualidade e consistencia arquitetural.

---

## 1) Objetivo do Produto

Senhas e um SaaS multi-tenant para emissao e gestao de tickets (senhas) para atendimento em giras.

Principais modulos:
- API publica de emissao e reenvio de senha.
- Painel admin do tenant (giras, porta, tickets, analytics, config, auditoria).
- Painel platform (super admin) para gestao de tenants, usuarios globais, billing e feature flags.

---

## 2) Mapa Rapido do Monorepo

- backend/: FastAPI + SQLAlchemy async + Alembic + testes Pytest.
- frontend/: Next.js + TypeScript + Material UI + Jest/RTL.
- packages/shared-types: contratos tipados compartilhados.
- packages/shared-ui: componentes e tema compartilhado.
- docs/: arquitetura, API, auth, multi-tenancy, deploy e testes.
- e2e/: cenarios E2E.
- load_tests/: testes de carga.
- security/: scripts/checklist de seguranca.

---

## 3) Arquitetura e Regras Nao Negociaveis

### 3.1 Multi-tenancy (obrigatorio)

Toda operacao sensivel deve respeitar isolamento por tenant em 3 camadas:
1. JWT carrega tenant_id no payload.
2. Middleware coloca tenant_id em request.state.
3. Repository filtra por tenant_id em query.

Regra critica:
- Nenhuma leitura/escrita de entidade de tenant sem filtro explicito de tenant_id.
- Evite bypass de repository para logica de negocio, exceto quando realmente necessario e com filtro de tenant preservado.

### 3.2 Auth e autorizacao

- Roles principais: SUPER_ADMIN, ADMIN, OPERATOR.
- Endpoints admin so para escopo do tenant atual.
- Endpoints platform so para super admin (escopo global).

### 3.3 Integridade de emissao de senha

- Emissao deve permanecer atomica/confiavel sob concorrencia.
- Em contadores de senha, use padroes com lock transacional (ex.: SELECT FOR UPDATE) ja adotados no projeto.

---

## 4) Convencoes de Implementacao

### 4.1 Backend

- Stack alvo: Python 3.11+, FastAPI, SQLAlchemy 2 async, Pydantic v2.
- Fluxo padrao:
	- Modelo ORM em backend/src/models.
	- Regra de acesso em backend/src/repositories.
	- Endpoint em backend/src/api/v1/{public|admin|platform|auth}.
	- Migracao Alembic em backend/alembic/versions.
	- Testes em backend/tests.
- Nao quebrar contratos de resposta sem atualizar frontend, shared-types e docs.
- Erros HTTP devem ser claros, consistentes e com status code adequado.

### 4.2 Frontend

- Stack alvo: Next.js + TypeScript + MUI.
- Preferir componentes reutilizaveis e hooks existentes.
- Evitar duplicacao de chamadas API; centralizar em services/client.
- Garantir estado de loading, erro e sucesso em telas administrativas.
- Responsividade obrigatoria (desktop e mobile).

### 4.3 Banco e migracoes

- Toda mudanca de schema exige migracao Alembic.
- Migracoes devem ser reversiveis (downgrade coerente sempre que possivel).
- Nomes de colunas/indices/constraints devem ser claros e estaveis.

---

## 5) Politica de Seguranca (OBRIGATORIA)

### 5.1 Proibido commitar segredos

Nunca subir no repositorio:
- Senhas reais.
- JWTs reais.
- API keys reais (Brevo, Resend, etc.).
- Connection strings reais com credenciais.
- Arquivos .env com valores reais.

Permitido:
- Placeholders explicitos (ex.: your_api_key_here).
- Dados de teste claramente nao produtivos.

### 5.2 Redacao segura em codigo/docs

- Ao documentar, use exemplos anonimizados/placeholders.
- Nunca logar credenciais, tokens ou payloads sensiveis completos.
- Se detectar segredo no historico da branch em trabalho, interrompa fluxo de push/PR e sanitize antes.

---

## 6) Qualidade, Testes e Validacao

Antes de concluir implementacao, executar validacoes proporcionais ao impacto:

Backend:
- Testes unitarios/integracao afetados.
- Verificacao de imports, tipagem e lint (quando configurado).

Frontend:
- Testes de componentes/paginas afetadas.
- Build/typecheck quando mudancas forem amplas.

Fluxo minimo recomendado por mudanca:
1. Implementar.
2. Rodar testes alvo.
3. Revisar diff para regressao e segredos.
4. Atualizar docs quando contrato/comportamento mudar.

---

## 7) Boas Praticas de Desenvolvimento para Agentes

- Fazer mudancas pequenas e focadas por commit sempre que possivel.
- Preservar padroes existentes do repositorio.
- Evitar refactors amplos sem necessidade funcional clara.
- Manter compatibilidade retroativa quando viavel.
- Explicar no PR o que mudou, risco e como validar.
- Se encontrar alteracoes inesperadas nao relacionadas durante a tarefa, pausar e alinhar com o usuario.

---

## 8) Checklist de Implementacao (Use Sempre)

Antes de abrir PR, confirme:
- [ ] Isolamento multi-tenant preservado.
- [ ] Nao ha segredo hardcoded nos arquivos alterados.
- [ ] Migracao criada/aplicavel para mudanca de schema.
- [ ] Testes relevantes executados e passando.
- [ ] Docs atualizadas (API, comportamento ou operacao).
- [ ] Frontend funciona em desktop/mobile para a funcionalidade alterada.
- [ ] Logs/erros sem vazamento de dados sensiveis.

---

## 9) Convencoes de PR e Commit

### Commit

- Mensagens claras no estilo conventional commits (ex.: feat:, fix:, refactor:, docs:, test:, chore:).

### PR

Incluir obrigatoriamente:
- Contexto do problema.
- Escopo da solucao.
- Arquivos/areas impactadas.
- Evidencias de teste.
- Riscos e mitigacoes.
- Passo a passo rapido para validacao manual.

---

## 10) Referencias de Documentacao do Projeto

- docs/architecture.md
- docs/api.md
- docs/database.md
- docs/authentication.md
- docs/multi-tenancy.md
- docs/email.md
- docs/testing.md
- docs/deployment.md
- RELEASE.md

---

## 11) Diretriz Final

Ao agir como agente de IA neste repositorio:
- Priorize seguranca e isolamento de tenant acima de velocidade.
- Nao suba segredos em nenhuma hipotese.
- Entregue mudancas testaveis, rastreaveis e bem documentadas.

---

## 12) Fluxo Operacional Padrao (SOP para Agentes)

Use este fluxo em toda implementacao, do inicio ao PR:

1. Entender o pedido e mapear impacto:
- Quais modulos serao tocados (backend, frontend, docs, migracoes)?
- Ha mudanca de contrato de API ou schema?

2. Levantar contexto minimo necessario:
- Ler arquivos diretamente relacionados.
- Identificar padroes existentes para manter consistencia.

3. Implementar em fatias pequenas:
- Aplicar mudancas objetivas e evitar refactor amplo sem necessidade.
- Preservar estilo e convencoes do repositorio.

4. Validar funcionalmente:
- Executar testes afetados (unitarios/integracao/componentes).
- Se mudanca ampla, rodar validacao adicional (build/typecheck/lint quando aplicavel).

5. Revisar seguranca e multi-tenancy:
- Conferir filtros de tenant_id em todas operacoes sensiveis.
- Verificar ausencia de segredos em codigo, docs e scripts.

6. Revisar diff final:
- Confirmar que nao ha alteracoes acidentais fora do escopo.
- Garantir mensagens de erro e logs sem dados sensiveis.

7. Preparar PR com contexto claro:
- Problema, solucao, impacto, testes, riscos, mitigacoes e passos de validacao.

### 12.1 Gate obrigatorio antes de push/PR

Antes de qualquer push:
- Confirmar que nao existem valores reais de senha, token, API key ou credenciais.
- Se houver qualquer suspeita de segredo no historico da branch, parar e sanitizar antes.

---

## 13) Template de PR para Agentes

Use este modelo ao abrir PR:

Titulo sugerido:
- tipo(escopo): resumo curto

Descricao:

### Contexto
- Problema de negocio/tecnico:
- Impacto atual:

### Solucao aplicada
- O que foi alterado:
- Decisoes tecnicas principais:
- Alternativas consideradas (se houver):

### Arquivos/areas impactadas
- Backend:
- Frontend:
- Banco/migracoes:
- Documentacao:

### Seguranca e multi-tenant
- Como tenant isolation foi preservado:
- Confirmacao de ausencia de segredos no diff/historico da branch:

### Evidencias de teste
- Testes executados:
- Resultado:
- Evidencias (logs/prints/saidas relevantes):

### Riscos e mitigacoes
- Riscos conhecidos:
- Mitigacoes aplicadas:

### Validacao manual rapida
1. Passo 1
2. Passo 2
3. Resultado esperado

### Checklist final
- [ ] Isolamento multi-tenant validado
- [ ] Sem segredos no repositorio
- [ ] Migracoes criadas (quando necessario)
- [ ] Testes relevantes passando
- [ ] Docs atualizadas (quando necessario)
