/**
 * PlanComparison — comparativo dos planos. No desktop é uma tabela; no celular (< 640px)
 * vira abas, uma por plano, com o que entra e o que não entra. Tudo de `constants/plans.ts`.
 */
import React from 'react';
import { Check, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import {
  BASE_FEATURES,
  PLAN_TEXT_CLASS,
  FEATURE_CATALOG,
  FEATURE_GROUPS,
  PLAN_LIST,
  PLAN_ORDER,
  PLANS,
  formatLimit,
  formatPricePerMonth,
  planIncludes,
  type PlanKey,
} from '@/constants/plans';

export interface PlanComparisonProps {
  currentPlan: PlanKey;
  highlightPlan?: PlanKey | null;
  className?: string;
}

type Cell = boolean | string;

interface RowDef {
  label: string;
  cells: Record<PlanKey, Cell>;
}

interface GroupDef {
  group: string;
  rows: RowDef[];
}

function buildGroups(): GroupDef[] {
  const base: GroupDef = {
    group: 'Base',
    rows: BASE_FEATURES.map((label) => ({
      label,
      cells: { free: true, basic: true, pro: true, premium: true },
    })),
  };
  const cap: GroupDef = {
    group: 'Capacidade',
    rows: [
      { label: 'Usuários no painel', cells: mapPlans((p) => formatLimit(PLANS[p].limits.users)) },
      { label: 'Giras por mês', cells: mapPlans((p) => formatLimit(PLANS[p].limits.girasPerMonth)) },
      { label: 'Médiuns cadastrados', cells: mapPlans((p) => (PLANS[p].limits.mediuns === 0 ? '—' : formatLimit(PLANS[p].limits.mediuns))) },
    ],
  };
  const features: GroupDef[] = FEATURE_GROUPS.map((group) => ({
    group,
    rows: FEATURE_CATALOG.filter((f) => f.group === group).map((f) => ({
      label: f.label,
      cells: mapPlans((p) => planIncludes(p, f.key)),
    })),
  }));
  return [base, cap, ...features];
}

function mapPlans<T>(fn: (p: PlanKey) => T): Record<PlanKey, T> {
  return Object.fromEntries(PLAN_ORDER.map((p) => [p, fn(p)])) as Record<PlanKey, T>;
}

function CellValue({ value, emphasized }: { value: Cell; emphasized: boolean }) {
  if (typeof value === 'string') {
    return <span className={cn('text-sm', emphasized ? 'font-bold text-brand' : 'text-foreground')}>{value}</span>;
  }
  return value ? (
    <Check className={cn('mx-auto size-4', emphasized ? 'text-brand' : 'text-success')} aria-label="Incluído" />
  ) : (
    <X className="mx-auto size-4 text-ghost" aria-label="Não incluído" />
  );
}

const GROUPS = buildGroups();

export function PlanComparison({ currentPlan, highlightPlan, className }: PlanComparisonProps) {
  const isMobile = useMediaQuery('(max-width: 639px)');

  if (isMobile) {
    return (
      <Tabs defaultValue={highlightPlan ?? currentPlan} className={cn('w-full', className)}>
        <TabsList className="grid w-full grid-cols-4">
          {PLAN_LIST.map((p) => (
            <TabsTrigger key={p.key} value={p.key} className="text-xs">
              {p.label}
            </TabsTrigger>
          ))}
        </TabsList>
        {PLAN_LIST.map((p) => (
          <TabsContent key={p.key} value={p.key} className="rounded-xl border bg-card p-4">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <p className={cn('text-base font-extrabold', PLAN_TEXT_CLASS[p.key])}>
                  {p.label}
                </p>
                <p className="text-sm text-muted-foreground">{formatPricePerMonth(p.price)}</p>
              </div>
              {p.key === currentPlan && <Badge variant="outline">Atual</Badge>}
            </div>
            {GROUPS.map((g) => (
              <div key={g.group} className="mb-3 last:mb-0">
                <p className="mb-1 text-[0.68rem] font-bold uppercase tracking-[0.08em] text-muted-foreground">{g.group}</p>
                <ul className="flex flex-col gap-1">
                  {g.rows.map((r) => {
                    const v = r.cells[p.key];
                    const included = typeof v === 'string' ? v !== '—' : v;
                    return (
                      <li key={r.label} className={cn('flex items-center justify-between gap-2 text-sm', !included && 'text-muted-foreground line-through')}>
                        <span className="flex items-center gap-2">
                          {typeof v === 'boolean' ? (
                            v ? <Check className="size-4 text-success" aria-hidden /> : <X className="size-4" aria-hidden />
                          ) : null}
                          {r.label}
                        </span>
                        {typeof v === 'string' && <span className="font-mono text-xs font-semibold">{v}</span>}
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </TabsContent>
        ))}
      </Tabs>
    );
  }

  return (
    <div className={cn('overflow-x-auto rounded-xl border bg-card', className)}>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="min-w-44 text-[0.72rem] font-bold uppercase tracking-[0.06em]">Recurso</TableHead>
            {PLAN_LIST.map((p) => {
              const isCurrent = p.key === currentPlan;
              return (
                <TableHead
                  key={p.key}
                  className={cn('min-w-24 text-center align-bottom', isCurrent && 'border-t-2')}
                  style={isCurrent ? { borderTopColor: p.color } : undefined}
                >
                  <span className={cn('block text-sm font-extrabold', PLAN_TEXT_CLASS[p.key])}>
                    {p.label}
                  </span>
                  <span className="block text-xs font-normal text-muted-foreground">{formatPricePerMonth(p.price)}</span>
                  {isCurrent && (
                    <Badge variant="outline" className="mt-1">
                      Atual
                    </Badge>
                  )}
                </TableHead>
              );
            })}
          </TableRow>
        </TableHeader>
        <TableBody>
          {GROUPS.map((g) => (
            <React.Fragment key={g.group}>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableCell colSpan={PLAN_LIST.length + 1} className="py-1.5 text-[0.68rem] font-bold uppercase tracking-[0.08em] text-muted-foreground">
                  {g.group}
                </TableCell>
              </TableRow>
              {g.rows.map((r) => (
                <TableRow key={r.label}>
                  <TableCell className="text-sm text-muted-foreground">{r.label}</TableCell>
                  {PLAN_LIST.map((p) => {
                    const isCurrent = p.key === currentPlan;
                    const isHighlight = p.key === highlightPlan;
                    return (
                      <TableCell
                        key={p.key}
                        className={cn('text-center', (isCurrent || isHighlight) && 'bg-primary/5')}
                      >
                        <CellValue value={r.cells[p.key]} emphasized={isCurrent} />
                      </TableCell>
                    );
                  })}
                </TableRow>
              ))}
            </React.Fragment>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

export default PlanComparison;
