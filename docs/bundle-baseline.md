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
