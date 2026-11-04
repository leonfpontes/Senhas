/**
 * Comparativo completo dos planos para a página pública /planos ($-03). Mesmas linhas do painel
 * (`buildComparisonGroups`, gerado de constants/plans.ts), no visual de marketing e sem cores do
 * terreiro (applyBrand). Sem JS de tamanho de tela: tabela a partir de md, lista por plano no
 * celular — nada "pula" depois de carregar.
 */
import React from 'react';
import { Check, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { buildComparisonGroups, type Cell, type GroupDef } from '@/components/billing/PlanComparison';
import {
  FEATURE_CATALOG,
  PLAN_LIST,
  PLAN_ORDER,
  formatPricePerMonth,
  planIncludes,
  type PlanKey,
} from '@/constants/plans';
import { AREA_MEDIUM_DIVULGADA } from '@/constants/areaMedium';

export const AREA_MEDIUM_ROW_LABEL = 'Área do Médium: agenda, avisos e mensalidade no celular do médium';

/**
 * Linhas do comparativo público. A Área do Médium está em `UNSOLD_FEATURES` (fora do quadro do
 * painel) e só entra aqui com a chave de lançamento (AM-24), logo depois da mensalidade dos
 * médiuns; o plano mínimo sai de `FEATURE_MIN_PLAN.area_medium` (constants/plans.ts).
 */
export function publicComparisonGroups(divulgarArea: boolean = AREA_MEDIUM_DIVULGADA): GroupDef[] {
  const groups = buildComparisonGroups();
  if (!divulgarArea) return groups;
  const anchor = FEATURE_CATALOG.find((f) => f.key === 'mensalidade_mediun');
  if (!anchor) return groups;
  const row = {
    label: AREA_MEDIUM_ROW_LABEL,
    cells: Object.fromEntries(PLAN_ORDER.map((p) => [p, planIncludes(p, 'area_medium')])) as Record<PlanKey, Cell>,
  };
  return groups.map((g) => {
    if (g.group !== anchor.group) return g;
    const at = g.rows.findIndex((r) => r.label === anchor.label);
    const rows = [...g.rows];
    rows.splice(at < 0 ? rows.length : at + 1, 0, row);
    return { ...g, rows };
  });
}

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
  const groups = publicComparisonGroups();
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
          {groups.map((g) => (
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
              {groups.flatMap((g) =>
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
