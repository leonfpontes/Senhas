# Kit de componentes — frontend

Última atualização: 2026-10-06 (migração MUI → shadcn/ui concluída, interface v2.1.0 com regras de contraste; ver AGENTS.md §11.16 e
`docs/plano-execucao.md` M-01).

Este é o kit que **todas as telas** usam. O MUI não existe mais no projeto. Regras:

- Toda tela usa shadcn/Tailwind; **nunca reintroduzir MUI nem `sx`**.
- Primitivas em `src/components/ui/*` (shadcn, estilo `new-york`, `data-slot`). Mudança numa primitiva
  afeta o produto inteiro: faça num PR próprio, com teste.
- Tokens novos entram em `src/styles/globals.css` (`:root` e `.dark`), nunca cor literal nas telas.
- Ícones: `lucide-react`, pelos nomes semânticos de `src/lib/icons.ts` quando existirem.
- **Overlays** (Sheet, Dialog, AlertDialog, Select, Popover, DropdownMenu) usam o z-index padrão do
  Radix; quem abre por último fica por cima. Não usar `z-[1300]`/`z-[1400]`. Barras fixas: `z-30`/`z-40`.
- `Tooltip` exige um `TooltipProvider` montado pela tela (não é global). `TabsContent` com `flex`
  precisa de `data-[state=inactive]:hidden`.

## O que **não** usar mais

| Antes (MUI)                                     | Agora                                                        |
|-------------------------------------------------|--------------------------------------------------------------|
| `TextField` do MUI                              | `TextField` de `@/components/fields`                         |
| `Snackbar`/`Alert` locais para feedback          | `useSnackbar()` (fachada) ou `toast()` de `sonner`           |
| `Dialog` do MUI para formulário CRUD             | `CrudDrawer` (Sheet). Modais só para confirmação: `ConfirmDialog` |
| `Grid`/`Box`/`Stack` com `sx`                    | `div` + classes Tailwind (`grid`, `flex`, `gap-*`)           |
| `sx={{ ... }}`                                   | `className` Tailwind                                         |
| `CurrencyInput` (apagado)                        | `MoneyInput` de `@/components/fields`                        |
| `components/PasswordField.tsx` (apagado)         | `PasswordField` de `@/components/fields`                     |
| `shared/MaskedInput.tsx` (apagado)               | `MaskedInput`, `maskTelefone`, `maskCpf`, `unmask` de `@/components/fields` |
| `useCrudDrawer`, `useFetch`, `usePaginatedFetch` | apagados (0 usos, regra R-03)                                |
| `components/platform/KpiCard.tsx` próprio        | reexporta o `KpiCard` único de `components/admin/KpiCard`    |
| `ResponsiveTable`, `ResponsiveFilterBar`         | apagados (0 usos) — use `DataTable`                          |
| `tokens.chartGrid` / `tokens.chartTick`          | `chartTokens.grid` / `chartTokens.tick` (`src/lib/chartTokens.ts`) |
| `@mui/icons-material`                            | `lucide-react` via `src/lib/icons.ts`                        |

## Regras de UI que valem para todo mundo

- **Permissão de grupo** (CLAUDE.md): toda tela admin faz o gate `canGroup(feature, 'view')` e
  renderiza `<PermissionDenied />` quando falha; botões de criar/editar/excluir são renderizados
  condicionalmente (`{canInsert && <Button>}`), nunca só `disabled`.
- **Gate de plano**: `<PlanLocked feature="…" minPlan={minPlanFor('<feature>').label} />` (envolve o `UpgradePrompt`; nunca o nome do plano fixo — `constants/plans.ts` é a fonte).
- **Select do Radix**: um `SelectItem` com `value=""` é **proibido** (o Radix usa a string vazia para
  "sem valor" e lança erro). Filtros "Todos" usam a sentinela **`"all"`**:
  ```tsx
  <Select value={status ?? 'all'} onValueChange={(v) => setStatus(v === 'all' ? null : v)}>
    <SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger>
    <SelectContent>
      <SelectItem value="all">Todos</SelectItem>
      <SelectItem value="ativo">Ativo</SelectItem>
    </SelectContent>
  </Select>
  ```
- **48px nas telas públicas e na Porta**: botões de ação em `/public/*`, `/[tenantSlug]` e
  `/admin/porta*` usam `size="touch"` (altura 48px) ou `size="icon-touch"` — alvo de toque mínimo
  para quem opera no celular, em pé, na fila.
- **Toasts**: um `<Toaster />` global em `_app.tsx`. Não montar outro.
- **PWA (P-01)**: `shared/ServiceWorkerRegistrar` (já montado no `_app.tsx` — não montar outro) registra
  `public/sw.js`; helpers em `src/lib/pwa.ts`, `useOnlineStatus()` em `src/hooks`. Na Porta,
  `admin/PortaOfflineNotice` (aviso "Sem conexão") e `admin/InstallPortaHint`. O SW nunca cacheia `/api/*`.
  Notificação no celular da Área (AM-16): o SW trata `push`/`notificationclick`; helpers do navegador em
  `src/lib/webPush.ts` e a tela em `medium/perfil/NotificacoesNoCelular`.
- **Formulários**: `react-hook-form` + `zod` com os componentes de `ui/form.tsx` quando houver
  validação de verdade; para formulários de 2–3 campos, `useState` + `TextField` com `error` basta.
- **Modo escuro**: classe `dark` em `<html>` (os providers já fazem). Use só tokens (`bg-card`,
  `text-muted-foreground`, `border`), nunca cor literal.
- **Contraste**: texto na cor da marca = `text-brand` (nunca `text-primary`); em fundo suave
  (`bg-warning/15`) use `text-warning-strong`; `text-*-foreground` só sobre o fundo sólido. Ver
  AGENTS.md §11.16 e `__tests__/styles/`.
- **Breakpoints**: `sm` 600 / `md` 900 / `lg` 1200 / `xl` 1536 (mantidos do MUI). O modo cartão da
  `DataTable` e o `CrudDrawer` em tela cheia usam 640px (`min-[640px]:`).

## Primitivas (`src/components/ui/`)

accordion, alert (variantes `default | destructive | success | warning | info`), alert-dialog,
avatar, badge, breadcrumb, button (tamanhos extras `touch`, `icon-touch`), calendar (pt-BR por
padrão), card, chart (wrapper do Recharts **2.x**), checkbox, collapsible, command, dialog,
dropdown-menu, form (react-hook-form + zod), input, label, pagination, popover, progress,
radio-group, scroll-area, select, separator, sheet, sidebar (bloco completo: `SidebarProvider`,
`Sidebar`, `SidebarGroup`, `SidebarMenu*`, `SidebarTrigger`, `useSidebar`; breakpoint mobile 900 =
`md`), skeleton, slider, sonner (`<Toaster />`), switch, table, tabs, textarea, toggle,
toggle-group, tooltip.

Ajustes locais sobre o que o CLI gera (React 18): `forwardRef` em `Button`, `Input`, `Textarea`,
`DialogOverlay`, `SheetOverlay`, `AlertDialogOverlay`; `Skeleton` usa `bg-muted`; textos em pt-BR;
`sonner.tsx` lê a classe `dark` (não usa `next-themes`); `chart.tsx` tipado para o Recharts 2.

## Compostos

### `CrudDrawer` — `src/components/CrudDrawer.tsx`
Sheet à direita (480px; tela cheia < 640px) com cabeçalho, corpo rolável, rodapé fixo e guarda de
alteração não salva (`AlertDialog`). **Mesma API** de antes. `className` (opcional) vai para o painel e
para a confirmação de descarte, que saem por portal: a Área do Médium passa `cn(fraunces.variable, 'medium-terra')`.
```tsx
<CrudDrawer open={crud.open} onClose={crud.close} title="Novo médium" icon={<IconMedium />}
            onSave={crud.handleSave} saving={crud.saving} isDirty={dirty} error={crud.saveError}>
  <TextField label="Nome" value={crud.formData.nome} onChange={(e) => crud.setField('nome', e.target.value)} />
</CrudDrawer>
```

### `ConfirmDialog` — `src/components/admin/ConfirmDialog.tsx`
`AlertDialog`; `destructive` usa `buttonVariants({ variant: 'destructive' })`. Mesma API.
`className` vai para o conteúdo (portado para o `<body>`): na Área do Médium, `cn(fraunces.variable, 'medium-terra')`.
```tsx
<ConfirmDialog open={!!alvo} title="Excluir médium" message={<>Excluir <strong>{alvo?.nome}</strong>?</>}
               destructive confirmText="Excluir" loading={deleting} onConfirm={del} onCancel={() => setAlvo(null)} />
```

### `UpgradePrompt` / gates — `src/components/UpgradePrompt.tsx`, `src/components/gates/`
```tsx
if (!can('estoque_controle')) return <PlanLocked feature="Estoque" minPlan={minPlanFor('estoque_controle').label} />;   // → /admin/billing?plan=premium
if (!canGroup('estoque', 'view')) return <PermissionDenied />;
{!canEdit && <ReadOnlyNotice />}
```

### `PageHeader`, `KpiCard`, `EmptyState` — `src/components/admin/PageHeader.tsx`, `admin/KpiCard.tsx`, `src/components/EmptyState.tsx`
```tsx
<PageHeader title="Giras" subtitle="Agenda do terreiro" actions={canInsert && <Button onClick={openCreate}><IconNovo /> Nova gira</Button>} />
<KpiCard label="Senhas emitidas" value={120} icon={<IconSenha />} color="#10b981" subtitle="+12% vs. mês anterior" loading={loading} />
<EmptyState icon={<IconGira />} title="Nenhuma gira" description="Crie a primeira gira." action={<Button>Nova gira</Button>} />
```

### `DataTable` — `src/components/admin/DataTable.tsx` (TanStack Table v8)
Colunas `ColumnDef<T>`, ordenação (clique no cabeçalho), paginação cliente (`pageSize`) ou servidor
(`manualPagination` + `pagination`/`onPaginationChange` + `rowCount`), seleção (`enableRowSelection`),
`Skeleton` no `loading`, `EmptyState` vazio e **modo cartão < 640px** (`renderCard(row)` ou colunas
com `meta: { mobile: true }`).
```tsx
const columns: ColumnDef<Medium>[] = [
  { accessorKey: 'nome', header: 'Nome', meta: { mobile: true } },
  { accessorKey: 'telefone', header: 'Telefone', enableSorting: false },
  { id: 'acoes', header: '', enableSorting: false, meta: { align: 'right' },
    cell: ({ row }) => (<>{canEdit && <Button size="icon-sm" variant="ghost" onClick={() => openEdit(row.original)}><IconEditar /></Button>}</>) },
];
<DataTable columns={columns} data={mediuns} getRowId={(m) => m.id} loading={loading} pageSize={20}
           renderCard={(m) => <MediumCard medium={m} />} />
```

### Campos — `src/components/fields/`
Todos aceitam `label`, `helperText`, `error` (bool ou string), `required`, `disabled`, `id`, `className`.
```tsx
<TextField label="E-mail" type="email" value={v} onChange={(e) => setV(e.target.value)} error={erro && 'E-mail inválido'} />
<TextField label="Observações" multiline rows={4} value={obs} onChange={...} />
<PasswordField label="Senha" value={senha} onChange={...} autoComplete="current-password" />
<MoneyInput label="Valor" value={valor} onChange={setValor} />                 // number em reais; cola "1.234,56"
<MaskedInput mask="telefone" label="WhatsApp" value={tel} onChange={setTel} />  // onChange recebe o texto mascarado; unmask() dá os dígitos
<DateField label="Data" value={data} onChange={setData} min="2026-01-01" />     // ISO "YYYY-MM-DD"; digita dd/mm/aaaa ou abre o calendário
<DateTimeField label="Início" value={inicio} onChange={setInicio} />            // ISO local "YYYY-MM-DDTHH:mm"
<Combobox label="Médium" options={opts} value={id} onChange={setId} clearable />// Popover + Command com busca
<MultiCombobox label="Médiuns" options={opts} value={ids} onChange={setIds} />  // vários itens; etiquetas removíveis; `dot` = bolinha de cor
```

### `Stepper` — `src/components/Stepper.tsx`
```tsx
<Stepper steps={[{ label: 'Dados' }, { label: 'Endereço', optional: true }, { label: 'Confirmação' }]} active={1} onStepClick={setStep} />
```

### `BulkActionsBar` — `src/components/admin/BulkActionsBar.tsx`
Barra fixa inferior (flutuante) + `AlertDialog` + toast. Mesma API e mesmas chamadas de API
(`/validate-bulk`, `/giras/{id}/tickets/bulk-*`). A tela deve reservar ~5rem no rodapé
(`pb-20`) quando houver seleção, para a barra não cobrir a última linha.

### `SubscriptionWarningBanner` — `src/components/admin/SubscriptionWarningBanner.tsx`
`Alert` `warning`/`info` com link para `/admin/billing`. Mesma API (sem props).

### Toasts — `src/contexts/SnackbarContext.tsx` + `src/components/ui/sonner.tsx`
`useSnackbar()` continua: `showSuccess/showError/showInfo/showWarning` e `showSnackbar(msg, severity)`,
todos viram `toast.*` do Sonner. Código novo pode usar `toast` de `'sonner'` direto.

### Gráficos — `src/components/charts/ChartCard.tsx` + `src/lib/chartTokens.ts`
```tsx
<ChartCard title="Senhas por gira" subtitle="30 dias" loading={loading} empty={!data.length} height={260}>
  <ResponsiveContainer width="100%" height="100%">
    <BarChart data={data}>
      <CartesianGrid stroke={chartTokens.grid} vertical={false} />
      <XAxis dataKey="dia" tick={{ fill: chartTokens.tick, fontSize: 12 }} />
      <Tooltip contentStyle={chartTooltipStyle} />
      <Bar dataKey="total" fill={chartTokens.primary} radius={[6, 6, 0, 0]} />
    </BarChart>
  </ResponsiveContainer>
</ChartCard>
```
Para gráficos com `ChartConfig`/legenda do shadcn, use `ui/chart.tsx` (`ChartContainer`, `ChartTooltipContent`).

### Ícones — `src/lib/icons.ts`
`MUI_TO_LUCIDE` (de-para dos ~80 ícones MUI mais usados) e nomes semânticos: `IconGira`, `IconPorta`,
`IconSenha`, `IconMedium`, `IconAssociado`, `IconEstoque`, `IconFinanceiro`, `IconNovo`, `IconEditar`,
`IconExcluir`, `IconSalvar`, `IconAtualizar`, `IconBuscar`, `IconSucesso`, `IconErro`, `IconAviso`…

## Testes
Testar por **papel/texto** (`getByRole`, `getByLabelText`, `getByText`), nunca por classe
(`.Mui*`, classes Tailwind). `jest.setup.js` já tem os polyfills do Radix (`hasPointerCapture`,
`scrollIntoView`, `ResizeObserver`, `matchMedia`). Para o modo cartão da `DataTable`, sobrescreva
`window.matchMedia` devolvendo `matches: true` (exemplo em `__tests__/components/admin/DataTable.test.tsx`).
