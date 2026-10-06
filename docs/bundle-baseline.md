# Linha de base do bundle — frontend

Saída de `npm run build` (Next.js 15.5, Pages Router) **antes** da Fase 0 da migração MUI → shadcn/ui.
Serve de comparação para as fases seguintes (item M-01 do `docs/plano-execucao.md`).

- Data: 2026-10-05
- Commit: `910f3eb` (origin/master)
- Comando: `NEXT_PUBLIC_API_URL="" NEXT_PUBLIC_SENTRY_DSN="" npm run build` em `frontend/`
- Tempos de pré-renderização `(N ms)` removidos da tabela; só tamanhos.

```
Route (pages)                                                  Size  First Load JS
┌ ○ /                                              63.7 kB         340 kB
├   /_app                                                       0 B         254 kB
├ ƒ /[tenantSlug]                                           12.9 kB         278 kB
├ ○ /404                                          2.98 kB         264 kB
├ ○ /admin/admin_layout                                       406 B         343 kB
├ ○ /admin/analytics                                        8.17 kB         468 kB
├ ○ /admin/associados                                       6.13 kB         354 kB
├ ○ /admin/audit-trail                                      6.42 kB         358 kB
├ ○ /admin/billing                                6.68 kB         355 kB
├ ○ /admin/config                                           10.9 kB         368 kB
├ ○ /admin/cursos-presenciais                     9.63 kB         358 kB
├ ○ /admin/cursos-presenciais/[id]/participantes  17.2 kB         483 kB
├ ○ /admin/dashboard                                        18.8 kB         471 kB
├ ○ /admin/estoque/grupos                         5.52 kB         354 kB
├ ○ /admin/estoque/itens                          7.11 kB         355 kB
├ ○ /admin/estoque/movimentacoes                  6.54 kB         358 kB
├ ○ /admin/estoque/relatorio                      4.61 kB         353 kB
├ ○ /admin/financeiro/config                      9.53 kB         364 kB
├ ○ /admin/financeiro/contas-pagar                7.74 kB         466 kB
├ ○ /admin/financeiro/contas-receber              7.73 kB         466 kB
├ ○ /admin/financeiro/fluxo-de-caixa              58.4 kB         515 kB
├ ○ /admin/financeiro/mensalidades                8.19 kB         469 kB
├ ○ /admin/giras                                            16.9 kB         368 kB
├ ○ /admin/impersonate                                      3.17 kB         257 kB
├ ○ /admin/mediuns                                13.6 kB         365 kB
├ ○ /admin/meu-site                                         29.7 kB         384 kB
├ ○ /admin/permission-groups                                5.99 kB         354 kB
├ ○ /admin/permission-groups/[id]                           8.01 kB         374 kB
├ ○ /admin/plano                                            6.87 kB         355 kB
├ ○ /admin/porta                                            11.2 kB         372 kB
├ ○ /admin/porta/kiosk                                      3.73 kB         258 kB
├ ○ /admin/profile                                          8.26 kB         359 kB
├ ○ /admin/relatorio-gira                         10.6 kB         472 kB
├ ○ /admin/suporte                                3.17 kB         349 kB
├ ○ /admin/tickets                                11.4 kB         366 kB
├ ○ /admin/tickets/[ticketId]/email               4.39 kB         347 kB
├ ○ /admin/users                                            8.94 kB         364 kB
├ ○ /cadastro                                     12.5 kB         307 kB
├ ○ /forgot-password                                        3.88 kB         289 kB
├ ○ /login                                                  8.34 kB         296 kB
├ ○ /platform                                                8.2 kB         421 kB
├ ○ /platform/audit_consolidated                  10.4 kB         346 kB
├ ○ /platform/billing                                       9.15 kB         333 kB
├ ○ /platform/layout                                        4.74 kB         305 kB
├ ○ /platform/observatory                         13.3 kB         322 kB
├ ○ /platform/profile                                       5.81 kB         324 kB
├ ○ /platform/settings                             9.25 kB         344 kB
├ ○ /platform/suporte                                       6.89 kB         328 kB
├ ○ /platform/tenants                                       8.99 kB         345 kB
├ ○ /platform/tenants/[id]                                  8.82 kB         333 kB
├ ○ /platform/users_global                        8.28 kB         336 kB
├ ○ /privacidade                                               8 kB         285 kB
├ ○ /public/[tenant]                                1.5 kB         263 kB
├ ○ /public/[tenant]/associado                     1.5 kB         263 kB
├ ○ /public/[tenant]/senha                         1.5 kB         263 kB
├ ○ /public/cursos/[id]/inscricao                  10.3 kB         264 kB
├   └ css/fe74c778abc8fccc.css                              3.41 kB
├ ○ /public/gira/[id]                              9.7 kB         303 kB
├ ○ /public/ticket/[ticketId]/cancelar             7.19 kB         265 kB
├ ○ /public/waitlist/[ticketId]/confirm           6.58 kB         261 kB
├ ○ /reactivate-account                            5.31 kB         290 kB
├ ○ /reset-password                               5.45 kB         290 kB
├ ○ /status                                        7.79 kB         281 kB
└ ○ /termos                                        8.33 kB         285 kB
+ First Load JS shared by all                                254 kB
  ├ chunks/framework-31f4af2fe74fe015.js                      45 kB
  ├ chunks/main-2d2c48b51e8fa729.js                          135 kB
  ├ chunks/pages/_app-4133dfd700a6b387.js                   71.9 kB
  └ other shared chunks (total)                             2.08 kB

○  (Static)   prerendered as static content
ƒ  (Dynamic)  server-rendered on demand
```

## Após a fase 0 (2026-10-05, branch `feat/shadcn-fase0`)

Mesmo comando. Diferença: shared **254 → 263 kB** (+9 kB: `_app` 71,9 → 74,7 kB com o `CacheProvider`/plugin stylis e
`other shared` 2,08 → 7,86 kB), todas as páginas **+2–3 kB**; a tela piloto `/admin/estoque/grupos` **5,52 → 31,2 kB**
(primeira página a pagar o Radix AlertDialog/Slot + lucide + cva; as próximas telas compartilham esses chunks).
CSS global novo (Tailwind): 29,2 kB bruto / **5,8 kB gzip**, não contabilizado em "First Load JS".

```
Route (pages)                                        Size  First Load JS
┌ ○ /                                    63.7 kB         343 kB
├   /_app                                             0 B         257 kB
├ ƒ /[tenantSlug]                                 12.9 kB         281 kB
├ ○ /404                                2.98 kB         267 kB
├ ○ /admin/admin_layout                   406 B         346 kB
├ ○ /admin/analytics                    8.17 kB         471 kB
├ ○ /admin/associados                   6.13 kB         357 kB
├ ○ /admin/audit-trail                            6.42 kB         361 kB
├ ○ /admin/billing                                6.68 kB         357 kB
├ ○ /admin/config                                 10.9 kB         371 kB
├ ○ /admin/cursos-presenciais           9.63 kB         361 kB
├ ○ /admin/cursos-presenciais/[id]/participantes  17.2 kB         486 kB
├ ○ /admin/dashboard                              18.8 kB         474 kB
├ ○ /admin/estoque/grupos               31.2 kB         380 kB
├ ○ /admin/estoque/itens                7.11 kB         358 kB
├ ○ /admin/estoque/movimentacoes        6.54 kB         361 kB
├ ○ /admin/estoque/relatorio            4.61 kB         356 kB
├ ○ /admin/financeiro/config            9.53 kB         367 kB
├ ○ /admin/financeiro/contas-pagar                7.74 kB         469 kB
├ ○ /admin/financeiro/contas-receber    7.73 kB         469 kB
├ ○ /admin/financeiro/fluxo-de-caixa    58.4 kB         517 kB
├ ○ /admin/financeiro/mensalidades      8.19 kB         472 kB
├ ○ /admin/giras                                  16.9 kB         371 kB
├ ○ /admin/impersonate                            3.17 kB         260 kB
├ ○ /admin/mediuns                                13.6 kB         368 kB
├ ○ /admin/meu-site                               29.7 kB         387 kB
├ ○ /admin/permission-groups                      5.99 kB         357 kB
├ ○ /admin/permission-groups/[id]                 8.01 kB         377 kB
├ ○ /admin/plano                                  6.86 kB         358 kB
├ ○ /admin/porta                                  11.2 kB         374 kB
├ ○ /admin/porta/kiosk                            3.73 kB         261 kB
├ ○ /admin/profile                                8.26 kB         362 kB
├ ○ /admin/relatorio-gira                10.6 kB         475 kB
├ ○ /admin/suporte                      3.17 kB         352 kB
├ ○ /admin/tickets                      11.4 kB         369 kB
├ ○ /admin/tickets/[ticketId]/email      4.4 kB         350 kB
├ ○ /admin/users                        8.94 kB         367 kB
├ ○ /cadastro                           12.5 kB         309 kB
├ ○ /forgot-password                    3.88 kB         292 kB
├ ○ /login                              8.34 kB         299 kB
├ ○ /platform                                      8.2 kB         424 kB
├ ○ /platform/audit_consolidated        10.4 kB         349 kB
├ ○ /platform/billing                             9.15 kB         336 kB
├ ○ /platform/layout                              4.74 kB         308 kB
├ ○ /platform/observatory                         13.3 kB         325 kB
├ ○ /platform/profile                             5.81 kB         327 kB
├ ○ /platform/settings                            9.25 kB         347 kB
├ ○ /platform/suporte                              6.9 kB         331 kB
├ ○ /platform/tenants                             8.99 kB         348 kB
├ ○ /platform/tenants/[id]                        8.82 kB         336 kB
├ ○ /platform/users_global              8.28 kB         338 kB
├ ○ /privacidade                                     8 kB         288 kB
├ ○ /public/[tenant]                     1.5 kB         265 kB
├ ○ /public/[tenant]/associado           1.5 kB         265 kB
├ ○ /public/[tenant]/senha               1.5 kB         265 kB
├ ○ /public/cursos/[id]/inscricao       10.3 kB         267 kB
├   └ css/fe74c778abc8fccc.css                    3.41 kB
├ ○ /public/gira/[id]                     9.7 kB         306 kB
├ ○ /public/ticket/[ticketId]/cancelar   7.19 kB         268 kB
├ ○ /public/waitlist/[ticketId]/confirm  6.58 kB         264 kB
├ ○ /reactivate-account                  5.31 kB         293 kB
├ ○ /reset-password                     5.45 kB         293 kB
├ ○ /status                              7.79 kB         284 kB
└ ○ /termos                              8.33 kB         288 kB
+ First Load JS shared by all                      263 kB
  ├ chunks/framework-c405bddfa792a253.js            45 kB
  ├ chunks/main-57cb8d123426fa53.js                135 kB
  ├ chunks/pages/_app-8cc786b676218f1e.js         74.7 kB
  └ other shared chunks (total)                   7.86 kB
```

## Após a fase 1 (2026-10-05, branch `feat/shadcn-migracao`)

Mesmo comando. Diferença em relação à fase 0: shared **263 → 266 kB** (`_app` 74,7 → 69 kB; o CSS global
agora aparece no shared, **14,5 kB**, porque o Tailwind passou a ser usado em todas as páginas via `_app`
— Toaster/Sonner). As páginas admin sobem **+30 a +45 kB** cada (ex.: `/admin/estoque/itens` 358 → 399,
`/admin/associados` 357 → 398, `/admin/dashboard` 474 → 512): `CrudDrawer`, `ConfirmDialog`,
`UpgradePrompt`, `KpiCard`, `PageHeader` e `SubscriptionWarningBanner` agora trazem Radix Dialog/AlertDialog,
Sonner, lucide e TanStack **ao lado** do MUI que essas telas ainda carregam — é o custo esperado da
convivência até as fases 2–9 removerem o MUI tela a tela (a comparação que importa é a da fase 9 contra a
linha de base). Páginas públicas e de conta variam de **−3 a +15 kB** (`/` 343 → 352; `/public/gira/[id]`
306 → 321; `/login` 299 → 312; `/cadastro` 309 → 322; `/public/cursos/[id]/inscricao` 267 → 262).
`recharts` continua no **2.x** (o CLI do shadcn tentou subir para o 3; revertido).

```
Route (pages)                                         Size  First Load JS
┌ ○ /                                      64 kB         352 kB
├   /_app                                              0 B         251 kB
├ ƒ /[tenantSlug]                                  13.2 kB         288 kB
├ ○ /404                                  4.8 kB         271 kB
├ ○ /admin/admin_layout                    419 B         366 kB
├ ○ /admin/analytics                               10.2 kB         509 kB
├ ○ /admin/associados                    5.91 kB         398 kB
├ ○ /admin/audit-trail                   10.6 kB         385 kB
├ ○ /admin/billing                       8.86 kB         379 kB
├ ○ /admin/config                        10.9 kB         395 kB
├ ○ /admin/cursos-presenciais            9.51 kB         401 kB
├ ○ /admin/cursos-presenciais/[id]/participantes   23.6 kB         526 kB
├ ○ /admin/dashboard                     21.2 kB         512 kB
├ ○ /admin/estoque/grupos                6.95 kB         389 kB
├ ○ /admin/estoque/itens                           6.88 kB         399 kB
├ ○ /admin/estoque/movimentacoes                   5.88 kB         400 kB
├ ○ /admin/estoque/relatorio                       6.75 kB         382 kB
├ ○ /admin/financeiro/config                       10.5 kB         409 kB
├ ○ /admin/financeiro/contas-pagar                 12.1 kB         510 kB
├ ○ /admin/financeiro/contas-receber     12.1 kB         510 kB
├ ○ /admin/financeiro/fluxo-de-caixa     62.5 kB         555 kB
├ ○ /admin/financeiro/mensalidades                 11.3 kB         510 kB
├ ○ /admin/giras                                   16.9 kB         412 kB
├ ○ /admin/impersonate                             4.99 kB         269 kB
├ ○ /admin/mediuns                                 13.6 kB         408 kB
├ ○ /admin/meu-site                                29.7 kB         411 kB
├ ○ /admin/permission-groups                       7.37 kB         395 kB
├ ○ /admin/permission-groups/[id]                  9.77 kB         398 kB
├ ○ /admin/plano                                   9.07 kB         380 kB
├ ○ /admin/porta                                   11.2 kB         399 kB
├ ○ /admin/porta/kiosk                   2.73 kB         259 kB
├ ○ /admin/profile                       7.24 kB         384 kB
├ ○ /admin/relatorio-gira                          10.6 kB         497 kB
├ ○ /admin/suporte                                 7.61 kB         389 kB
├ ○ /admin/tickets                       14.4 kB         410 kB
├ ○ /admin/tickets/[ticketId]/email                4.42 kB         375 kB
├ ○ /admin/users                         9.52 kB         404 kB
├ ○ /cadastro                            11.6 kB         322 kB
├ ○ /forgot-password                               5.68 kB         304 kB
├ ○ /login                               7.27 kB         312 kB
├ ○ /platform                                      8.29 kB         445 kB
├ ○ /platform/audit_consolidated         10.5 kB         370 kB
├ ○ /platform/billing                    10.9 kB         356 kB
├ ○ /platform/layout                               4.53 kB         327 kB
├ ○ /platform/observatory                            13 kB         346 kB
├ ○ /platform/profile                              4.64 kB         349 kB
├ ○ /platform/settings                   10.9 kB         382 kB
├ ○ /platform/suporte                               9.1 kB         352 kB
├ ○ /platform/tenants                              9.19 kB         386 kB
├ ○ /platform/tenants/[id]                         7.76 kB         374 kB
├ ○ /platform/users_global                         6.88 kB         374 kB
├ ○ /privacidade                         8.81 kB         296 kB
├ ○ /public/[tenant]                      1.5 kB         269 kB
├ ○ /public/[tenant]/associado            1.5 kB         269 kB
├ ○ /public/[tenant]/senha                         1.51 kB         269 kB
├ ○ /public/cursos/[id]/inscricao        10.3 kB         262 kB
├   └ css/e43396cbdbfb1cd2.css                     3.36 kB
├ ○ /public/gira/[id]                    9.03 kB         321 kB
├ ○ /public/ticket/[ticketId]/cancelar             8.67 kB         272 kB
├ ○ /public/waitlist/[ticketId]/confirm  5.89 kB         264 kB
├ ○ /reactivate-account                            4.19 kB         306 kB
├ ○ /reset-password                                4.33 kB         306 kB
├ ○ /status                                         6.9 kB         293 kB
└ ○ /termos                                        9.14 kB         296 kB
+ First Load JS shared by all                       266 kB
  ├ chunks/framework-c405bddfa792a253.js             45 kB
  ├ chunks/main-c7712143c6adccef.js                 135 kB
  ├ chunks/pages/_app-cb1295064953d719.js            69 kB
  ├ css/4902a1491f35b4ab.css                       14.5 kB
  └ other shared chunks (total)                    2.08 kB
○  (Static)   prerendered as static content
ƒ  (Dynamic)  server-rendered on demand
```

## Depois da fase 9 — migração concluída (2026-10-06, branch `feat/shadcn-migracao`)

Mesmo comando, sem nenhum `@mui/*` ou `@emotion/*` no bundle. Resultado misto:

| Rota | Antes (MUI) | Depois | Diferença |
|---|---|---|---|
| Comum a todas | 254 kB | 251 kB | −3 kB (agora inclui 25 kB de CSS do Tailwind; `_app` 71,9 → 43,9 kB) |
| `/platform` | 421 kB | 403 kB | −18 kB |
| `/admin/financeiro/fluxo-de-caixa` | 515 kB | 509 kB | −6 kB (sai o DatePicker do MUI X) |
| `/admin/dashboard` | 471 kB | 470 kB | −1 kB |
| `/[tenantSlug]` | 278 kB | 280 kB | +2 kB |
| `/admin/porta` | 372 kB | 378 kB | +6 kB |
| `/admin/meu-site` | 384 kB | 407 kB | +23 kB |
| `/login` | 296 kB | 321 kB | +25 kB |
| `/admin/giras` | 368 kB | 405 kB | +37 kB |
| `/cadastro` | 307 kB | 345 kB | +38 kB |
| `/public/gira/[id]` | 303 kB | 362 kB | +59 kB |

A estimativa de 60–120 kB a menos não se confirmou. O runtime do Emotion saiu do comum, mas cada página com
formulário passou a carregar Radix + react-hook-form + zod + lucide, e as telas ganharam funções novas (Bilhete,
.ics, máscaras, Stepper). A emissão pública é a mais afetada e é o próximo alvo de corte: carregar zod/RHF só
no formulário, importar ícones por caminho e adiar o Bilhete com `next/dynamic`.

```
Route (pages)                                                 Size  First Load JS
┌ ○ / (328 ms)                                             53.8 kB         307 kB
├   /_app                                                      0 B         226 kB
├ ƒ /[tenantSlug]                                          7.25 kB         280 kB
├ ○ /404 (5937 ms)                                         3.53 kB         243 kB
├ ○ /admin/admin_layout (5932 ms)                            408 B         335 kB
├ ○ /admin/analytics                                       9.19 kB         488 kB
├ ○ /admin/associados                                      5.23 kB         389 kB
├ ○ /admin/audit-trail (6062 ms)                           7.62 kB         392 kB
├ ○ /admin/billing (5931 ms)                               10.9 kB         364 kB
├ ○ /admin/config (5931 ms)                                15.6 kB         400 kB
├ ○ /admin/cursos-presenciais                              9.24 kB         396 kB
├ ○ /admin/cursos-presenciais/[id]/participantes (328 ms)  14.4 kB         511 kB
├ ○ /admin/dashboard                                       10.7 kB         470 kB
├ ○ /admin/estoque/grupos                                  4.84 kB         370 kB
├ ○ /admin/estoque/itens (5931 ms)                         6.53 kB         398 kB
├ ○ /admin/estoque/movimentacoes (6062 ms)                 3.86 kB         395 kB
├ ○ /admin/estoque/relatorio (5932 ms)                     1.66 kB         336 kB
├ ○ /admin/financeiro/config                               10.4 kB         376 kB
├ ○ /admin/financeiro/contas-pagar (5931 ms)               1.65 kB         336 kB
├ ○ /admin/financeiro/contas-receber (5931 ms)             1.66 kB         336 kB
├ ○ /admin/financeiro/fluxo-de-caixa (6383 ms)             18.8 kB         509 kB
├ ○ /admin/financeiro/lancamentos                            11 kB         395 kB
├ ○ /admin/financeiro/mensalidades                         3.92 kB         498 kB
├ ○ /admin/giras                                           16.5 kB         405 kB
├ ○ /admin/impersonate                                     2.27 kB         237 kB
├ ○ /admin/mediuns                                         14.8 kB         399 kB
├ ○ /admin/meu-site                                        29.5 kB         407 kB
├ ○ /admin/permission-groups                               4.43 kB         392 kB
├ ○ /admin/permission-groups/[id]                          5.54 kB         393 kB
├ ○ /admin/plano                                             851 B         236 kB
├ ○ /admin/porta                                           12.7 kB         378 kB
├ ○ /admin/porta/kiosk                                     2.03 kB         228 kB
├ ○ /admin/profile                                         9.69 kB         407 kB
├ ○ /admin/relatorio-gira (6382 ms)                        11.6 kB         511 kB
├ ○ /admin/suporte                                         4.69 kB         358 kB
├ ○ /admin/tickets (6061 ms)                               11.6 kB         399 kB
├ ○ /admin/tickets/[ticketId]/email (6066 ms)              1.07 kB         339 kB
├ ○ /admin/users (6061 ms)                                 11.5 kB         409 kB
├ ○ /cadastro (6061 ms)                                    11.6 kB         345 kB
├ ○ /forgot-password (6062 ms)                             2.72 kB         318 kB
├ ○ /login (6061 ms)                                        5.5 kB         321 kB
├ ○ /platform (331 ms)                                     13.1 kB         403 kB
├ ○ /platform/audit_consolidated                           7.45 kB         367 kB
├ ○ /platform/billing                                        758 B         227 kB
├ ○ /platform/layout                                       3.56 kB         289 kB
├ ○ /platform/observatory                                    784 B         227 kB
├ ○ /platform/profile                                        765 B         227 kB
├ ○ /platform/settings                                     13.2 kB         361 kB
├ ○ /platform/suporte                                      10.3 kB         336 kB
├ ○ /platform/tenants (6384 ms)                            7.71 kB         374 kB
├ ○ /platform/tenants/[id]                                 8.22 kB         374 kB
├ ○ /platform/users_global                                   774 B         227 kB
├ ○ /privacidade                                           3.07 kB         259 kB
├ ○ /public/[tenant]                                         459 B         248 kB
├ ○ /public/[tenant]/associado                               463 B         248 kB
├ ○ /public/[tenant]/senha                                   465 B         248 kB
├ ○ /public/[tenant]/ticket/[ticketId]                     3.45 kB         248 kB
├ ○ /public/cursos/[id]/inscricao                          20.5 kB         367 kB
├ ○ /public/gira/[id]                                      15.1 kB         362 kB
├ ○ /public/ticket/[ticketId]/cancelar (6387 ms)            4.7 kB         249 kB
├ ○ /public/waitlist/[ticketId]/confirm (6384 ms)          5.05 kB         249 kB
├ ○ /reactivate-account (6383 ms)                          3.02 kB         318 kB
├ ○ /reset-password (6383 ms)                              3.32 kB         318 kB
├ ○ /status (6383 ms)                                      7.57 kB         268 kB
└ ○ /termos                                                3.42 kB         260 kB
+ First Load JS shared by all                               251 kB
  ├ chunks/framework-24d07d5ca7069da8.js                     45 kB
  ├ chunks/main-d0c16b46c0f34f97.js                         135 kB
  ├ chunks/pages/_app-9c2918a16c5a9bcf.js                  43.9 kB
  ├ css/27d7c56f27fd8d5c.css                                 25 kB
  └ other shared chunks (total)                            2.08 kB
```

