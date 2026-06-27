# UX/UI Roadmap — GiraHub

Auditoria realizada em: 2026-06-27  
Nota geral: **7,8 / 10**

---

## Notas por Área

| Área | Nota | Status |
|---|---|---|
| Sidebar / Navegação | 9,0 | ✅ Excelente |
| Topbar & User Menu | 8,5 | ✅ Bom |
| Dashboard | 8,5 | ✅ Bom |
| Login / Autenticação | 8,0 | ✅ Bom |
| Gestão de Giras | 8,0 | ✅ Bom |
| Porta (real-time) | 8,0 | ✅ Bom |
| Componentes Reutilizáveis | 8,5 | ✅ Bom |
| Tickets | 7,5 | ⚠ Atenção |
| Financeiro / Mensalidades | 7,0 | ⚠ Atenção |
| Acessibilidade / Mobile | 7,0 | ⚠ Atenção |

---

## Melhorias Prioritárias

### Alta Prioridade

#### 1. Busca por número de ticket
- **Problema:** Operador não consegue buscar "Ticket #0042" diretamente — precisa filtrar por gira inteira.
- **Solução:** Campo de busca livre em `pages/admin/tickets/index.tsx` que pesquisa por número, nome ou email.
- **Impacto:** Operador de porta ganha autonomia no atendimento.

#### 2. Email e telefone visíveis em mobile na Porta
- **Problema:** Coluna `email` usa `sx={{ display: { xs: 'none', md: 'table-cell' } }}` — some em celular.
- **Solução:** Incluir email e telefone na linha expandível do ticket em mobile (accordion row ou bottom sheet).
- **Impacto:** Operador consegue contatar consulente sem sair da tela.

#### 3. Notificação sonora/visual na Porta
- **Problema:** Polling silencioso a cada 8s — operador perde chamadas se não estiver olhando a tela.
- **Solução:** `new Audio('/sounds/notification.mp3').play()` quando a fila muda; badge de count no título da aba (`document.title`).
- **Impacto:** Operador pode fazer outras tarefas sem perder atendimento.

#### 4. Bulk payment no módulo financeiro
- **Problema:** Responsável financeiro marca pagamentos um por um — lento para terreiros com 30+ médiuns.
- **Solução:** Checkbox + BulkActionsBar (padrão já existente em tickets) com ação "Marcar como Pago".
- **Impacto:** Reduz de 30 cliques para 2 para marcar todos como pagos.

#### 5. "Lembrar-me" no login
- **Problema:** Refresh token existe mas não há "Lembrar-me" — usuários móveis refazem login a cada sessão após fechar o browser.
- **Solução:** Checkbox no login que, quando desmarcado, define `refresh_token` como `session cookie` (sem `max_age`).
- **Impacto:** Melhora UX mobile significativamente — hoje a sessão dura apenas enquanto o browser está aberto.

---

### Média Prioridade

#### 6. Input masking global (telefone, CPF, moeda)
- **Problema:** Campos de telefone e CPF sem máscara causam dados inconsistentes no banco ("11999998888" vs "(11) 99999-8888").
- **Solução:** Componente `MaskedInput` wrapper sobre `react-imask` ou `react-input-mask`; aplicar nos formulários de Médium e Associado.

#### 7. Dark mode persistente
- **Problema:** Toggle dark/light existe na topbar mas não persiste — perde ao fechar o browser.
- **Solução:** `localStorage.setItem('colorMode', mode)` no toggle; ler no `AdminThemeProvider` na inicialização.

#### 8. Breadcrumb na topbar
- **Problema:** Admin novo se perde em "Financeiro > Contas a Receber" sem indicação contextual.
- **Solução:** `<Breadcrumbs>` do MUI na `AdminTopbar` lendo a rota atual via `useRouter()`.

#### 9. Filtros no módulo financeiro
- **Problema:** Sem filtros por status (PAGO/PENDENTE) ou grupo de médiuns.
- **Solução:** Row de filtros igual ao padrão de Tickets — status chip + select de grupo.

---

### Baixa Prioridade

#### 10. Modo kiosk na Porta (fullscreen para TV)
- **Problema:** Terreiros com TV na porta não têm como exibir a fila sem expor a interface de admin.
- **Solução:** Rota pública `/porta/[giraid]` com autenticação por token de sessão — exibe apenas a fila em fullscreen.

#### 11. Exportação de gráficos do dashboard
- **Problema:** Admin não consegue exportar gráficos para reuniões ou relatórios.
- **Solução:** `html2canvas` + botão de download em `<BarChart>` e `<LineChart>` do dashboard.

#### 12. Snackbar/toast provider global
- **Problema:** Cada página implementa `<Snackbar>` próprio — duplicação de código e comportamento inconsistente.
- **Solução:** `SnackbarProvider` no `_app.tsx` exposto via `useSnackbar()` hook; remover implementações locais gradualmente.

---

## Pontos Fortes (não tocar)

- **RBAC + feature flags:** `usePermissions()` + `useSubscription()` — implementação limpa e consistente.
- **CrudDrawer:** padrão estabelecido, responsivo, com unsaved-changes guard. Não criar modais para CRUD.
- **Multitenancy visual:** `brandPrimary` / `brandSecondary` injetados pelo `AdminThemeProvider` — funciona bem.
- **Empty states e loading states:** consistentes em toda a aplicação.
- **BulkActionsBar com dry-run:** excelente padrão de segurança para operações em massa.

---

## Padrões de UI — Regras para Novos Features

- Formulários CRUD → `CrudDrawer` (obrigatório, nunca modal)
- Confirmação de exclusão → `ConfirmDialog` com `destructive={true}`
- Ações em massa → `BulkActionsBar` com dry-run
- Feedback de sucesso/erro → `useSnackbar()` (quando global provider existir) ou `<Alert>` inline
- Tabelas com muitas colunas → ocultar via `sx={{ display: { xs: 'none', sm: 'table-cell' } }}` em mobile, nunca esconder dado crítico
- Botões de ação → renderizar condicionalmente via `canGroup()`, nunca apenas `disabled`
