/**
 * Comparativo completo dos planos para a página pública /planos ($-03). Mesmas linhas do painel
 * (`buildComparisonGroups`, gerado de constants/plans.ts), no visual de marketing e sem cores do
 * terreiro (applyBrand). Sem JS de tamanho de tela: tabela a partir de md, lista por plano no
 * celular — nada "pula" depois de carregar.
 */
import React from 'react';
import { Check, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { buildComparisonGroups, type Cell } from '@/components/billing/PlanComparison';
import { PLAN_LIST, PLAN_ORDER, formatPricePerMonth, type PlanKey } from '@/constants/plans';

const GROUPS = buildComparisonGroups();

function CellValue({ value, highlight }: { value: Cell; highlight: boolean }) {
  if (typeof value === 'string') {
    return <span className={cn('text-sm font-semibold', highlight ? 'text-barro-700' : 'text-tinta')}>{value}</span>;
  }
  return value ? (
    <Check className="mx-auto size-5 text-folha-600" aria-label="Incluído" />
  ) : (
    <Minus className="mx-auto size-4 text-areia-300" aria-label="Não incluído" />
  );
}

export function PlanComparisonTable() {
  const popular = PLAN_LIST.find((p) => p.popular)?.key;
  return (
    <>
      {/* Desktop/tablet: tabela */}
      <div className="hidden overflow-hidden rounded-3xl border border-areia-200 bg-white shadow-sm md:block">
        <table className="w-full border-collapse text-left">
          <caption className="sr-only">Comparativo dos planos do GiraHub</caption>
          <thead>
            <tr className="bg-areia-100">
              <th scope="col" className="w-[40%] px-6 py-5 text-sm font-semibold text-tinta-suave">
                Recurso
              </th>
              {PLAN_LIST.map((p) => (
                <th
                  key={p.key}
                  scope="col"
                  className={cn('px-4 py-5 text-center', p.key === popular && 'bg-cafe-900 text-white')}
                >
                  <span className="block font-display text-lg font-bold">{p.label}</span>
                  <span className={cn('text-sm font-normal', p.key === popular ? 'text-areia-200' : 'text-tinta-suave')}>
                    {formatPricePerMonth(p.price)}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          {GROUPS.map((g) => (
            <tbody key={g.group}>
              <tr>
                <th
                  scope="colgroup"
                  colSpan={PLAN_ORDER.length + 1}
                  className="border-t border-areia-200 bg-areia-50 px-6 pt-5 pb-2 text-xs font-bold tracking-widest text-barro-700 uppercase"
                >
                  {g.group}
                </th>
              </tr>
              {g.rows.map((r) => (
                <tr key={r.label} className="border-t border-areia-100">
                  <th scope="row" className="px-6 py-3 text-sm font-medium text-tinta">
                    {r.label}
                  </th>
                  {PLAN_ORDER.map((k) => (
                    <td key={k} className={cn('px-4 py-3 text-center', k === popular && 'bg-areia-50')}>
                      <CellValue value={r.cells[k]} highlight={k === popular} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          ))}
        </table>
      </div>

      {/* Celular: um bloco por plano, com o que entra */}
      <div className="grid gap-4 md:hidden">
        {PLAN_LIST.map((p) => (
          <details
            key={p.key}
            open={p.key === popular}
            className="group rounded-3xl border border-areia-200 bg-white p-5 shadow-sm open:shadow-md"
          >
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 [&::-webkit-details-marker]:hidden">
              <span>
                <span className="block font-display text-xl font-bold text-tinta">{p.label}</span>
                <span className="text-sm text-tinta-suave">{formatPricePerMonth(p.price)}</span>
              </span>
              <span className="rounded-full bg-areia-100 px-3 py-1 text-xs font-semibold text-barro-700 group-open:hidden">
                Ver o que inclui
              </span>
            </summary>
            <ul className="mt-4 grid gap-2 text-sm">
              {GROUPS.flatMap((g) =>
                g.rows
                  .filter((r) => r.cells[p.key as PlanKey] !== false)
                  .map((r) => (
                    <li key={`${g.group}-${r.label}`} className="flex items-start gap-2 text-tinta">
                      <Check className="mt-0.5 size-4 shrink-0 text-folha-600" aria-hidden />
                      <span>
                        {r.label}
                        {typeof r.cells[p.key as PlanKey] === 'string' && (
                          <strong className="text-barro-700">: {String(r.cells[p.key as PlanKey])}</strong>
                        )}
                      </span>
                    </li>
                  )),
              )}
            </ul>
          </details>
        ))}
      </div>
    </>
  );
}

export default PlanComparisonTable;
