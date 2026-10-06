/**
 * ChartCard — Card com título/subtítulo, slot de ações e estados de carregamento/vazio para um
 * gráfico Recharts (filho). Define a altura (`height`, padrão 280px) para o ResponsiveContainer.
 *
 *   <ChartCard title="Senhas por gira" subtitle="Últimos 30 dias" loading={loading} empty={!data.length}>
 *     <ResponsiveContainer width="100%" height="100%">
 *       <BarChart data={data}>…</BarChart>
 *     </ResponsiveContainer>
 *   </ChartCard>
 */
import React from 'react';
import { BarChart3 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/EmptyState';

export interface ChartCardProps {
  title: string;
  subtitle?: string;
  /** Botões/filtros no canto superior direito. */
  actions?: React.ReactNode;
  loading?: boolean;
  /** Sem dados: mostra o EmptyState no lugar do gráfico. */
  empty?: boolean;
  emptyMessage?: string;
  emptyDescription?: React.ReactNode;
  /** Altura da área do gráfico em px (padrão 280). */
  height?: number;
  children: React.ReactNode;
  className?: string;
  /** Rodapé opcional (legenda customizada, notas). */
  footer?: React.ReactNode;
}

export function ChartCard({
  title,
  subtitle,
  actions,
  loading = false,
  empty = false,
  emptyMessage = 'Sem dados para o período.',
  emptyDescription,
  height = 280,
  children,
  className,
  footer,
}: ChartCardProps) {
  return (
    <Card data-slot="chart-card" className={cn('h-full gap-4', className)}>
      <CardHeader>
        <CardTitle className="text-base font-bold tracking-tight">{title}</CardTitle>
        {subtitle && <CardDescription>{subtitle}</CardDescription>}
        {actions && <CardAction>{actions}</CardAction>}
      </CardHeader>
      <CardContent>
        <div style={{ height }} className="w-full" aria-busy={loading || undefined}>
          {loading ? (
            <div className="flex h-full flex-col justify-end gap-2" data-testid="chart-card-loading">
              <Skeleton className="h-full w-full rounded-lg" />
            </div>
          ) : empty ? (
            <EmptyState
              compact
              className="h-full"
              icon={<BarChart3 />}
              title={emptyMessage}
              description={emptyDescription}
            />
          ) : (
            children
          )}
        </div>
        {footer && <div className="mt-3 text-xs text-muted-foreground">{footer}</div>}
      </CardContent>
    </Card>
  );
}

export default ChartCard;
