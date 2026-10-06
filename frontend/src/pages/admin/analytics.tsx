/**
 * Admin — Analytics: métricas de emissão, uso e distribuição por período ou gira.
 *
 * Presets de período (ToggleGroup) + intervalo personalizado (DateField duplo), filtro de gira
 * (Combobox), KPIs em grade sem item solitário e gráficos em `ChartCard` com `chartTokens`
 * (Recharts 2.x). Erro de carregamento fica visível com "Tentar novamente".
 */
'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { CalendarClock, CheckCheck, Footprints, Send, TrendingUp, XCircle } from 'lucide-react';

import AdminLayout from './admin_layout';
import { useSubscription } from '../../hooks/useSubscription';
import { usePermissions } from '../../hooks/usePermissions';
import { apiClient } from '../../services/api_client';
import { KpiCard } from '@/components/admin/KpiCard';
import { PageHeader } from '@/components/admin/PageHeader';
import { ChartCard } from '@/components/charts/ChartCard';
import { PermissionDenied, PlanLocked } from '@/components/gates';
import { Combobox, DateField } from '@/components/fields';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { chartTokens, chartTooltipStyle } from '@/lib/chartTokens';
import { addDaysIso, formatDateBr, todayBr } from '@/lib/dateBr';

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface Gira {
  id: string;
  nome: string;
  data_inicio: string;
}

interface DailyDistributionItem {
  date: string;
  total: number;
  completed: number;
  common: number;
  sponsor: number;
  walk_in: number;
}

interface PeakHoursItem {
  hour: number;
  count: number;
}

interface AnalyticsData {
  total_emitted: number;
  total_used: number;
  total_cancelled: number;
  usage_rate: number;
  emitted_today: number;
  used_today: number;
  walk_in_total: number;
  daily_distribution: DailyDistributionItem[];
  peak_hours: PeakHoursItem[];
  category_breakdown: { common: number; sponsor: number; walk_in: number };
}

export type AnalyticsPreset = '7' | '30' | '90' | 'personalizado';

const PRESETS: { key: AnalyticsPreset; label: string }[] = [
  { key: '7', label: '7 dias' },
  { key: '30', label: '30 dias' },
  { key: '90', label: '90 dias' },
  { key: 'personalizado', label: 'Personalizado' },
];

/** Intervalo "últimos N dias" terminando hoje (Brasília), em ISO. */
export function analyticsPresetRange(dias: number, hoje: string = todayBr()): { from: string; to: string } {
  return { from: addDaysIso(hoje, -(dias - 1)), to: hoje };
}

function fmtChartDate(iso: string): string {
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
}

const CATEGORY_COLORS = {
  common: chartTokens.primary,
  sponsor: chartTokens.warning,
  walk_in: chartTokens.info,
} as const;

// ─── Página ───────────────────────────────────────────────────────────────────

export default function AdminAnalyticsPage() {
  return (
    <AdminLayout title="Analytics">
      <AdminAnalyticsContent />
    </AdminLayout>
  );
}

function AdminAnalyticsContent() {
  const { can, loading: subLoading } = useSubscription();
  const { can: canGroup } = usePermissions();
  const canView = canGroup('analytics', 'view');

  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [giras, setGiras] = useState<Gira[]>([]);
  const [giraId, setGiraId] = useState<string | null>(null);
  const [preset, setPreset] = useState<AnalyticsPreset>('30');
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');
  const [ready, setReady] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  // Datas inicializadas no cliente (evita divergência de hidratação); "hoje" em Brasília.
  useEffect(() => {
    const { from, to } = analyticsPresetRange(30);
    setDateFrom(from);
    setDateTo(to);
    setReady(true);
  }, []);

  const applyPreset = (value: string) => {
    if (!value) return; // ToggleGroup single: clique no item ativo devolve ''
    const p = value as AnalyticsPreset;
    setPreset(p);
    if (p !== 'personalizado') {
      const { from, to } = analyticsPresetRange(Number(p));
      setDateFrom(from);
      setDateTo(to);
    }
  };

  const loadGiras = useCallback(
    async (signal?: AbortSignal) => {
      if (!canView) return;
      try {
        const params = new URLSearchParams({ limit: '100' });
        if (dateFrom) params.append('date_from', dateFrom);
        if (dateTo) params.append('date_to', dateTo);
        const res = await apiClient.get(`/api/v1/admin/giras?${params.toString()}`, { signal });
        const list: Gira[] = Array.isArray(res.data) ? res.data : res.data.items ?? [];
        setGiras(list);
        setGiraId((current) => (current && !list.some((g) => g.id === current) ? null : current));
      } catch {
        /* lista de giras é auxiliar — o filtro só fica vazio */
      }
    },
    [dateFrom, dateTo, canView],
  );

  const loadAnalytics = useCallback(
    async (signal?: AbortSignal) => {
      if (!canView) {
        setLoading(false);
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams();
        if (dateFrom) params.append('date_from', dateFrom);
        if (dateTo) params.append('date_to', dateTo);
        if (giraId) params.append('gira_id', giraId);
        const res = await apiClient.get(`/api/v1/admin/analytics?${params.toString()}`, { signal });
        setAnalytics(res.data);
      } catch (err) {
        if ((err as { name?: string })?.name === 'CanceledError') return;
        setError('Não foi possível carregar as métricas do período.');
      } finally {
        setLoading(false);
      }
    },
    [dateFrom, dateTo, giraId, canView],
  );

  useEffect(() => {
    if (!ready) return;
    const c = new AbortController();
    loadGiras(c.signal);
    return () => c.abort();
  }, [ready, loadGiras]);

  useEffect(() => {
    if (!ready) return;
    const c = new AbortController();
    loadAnalytics(c.signal);
    return () => c.abort();
  }, [ready, loadAnalytics, reloadKey]);

  const giraOptions = useMemo(
    () =>
      giras.map((g) => ({
        value: g.id,
        label: g.data_inicio ? `${g.nome} (${formatDateBr(g.data_inicio)})` : g.nome,
      })),
    [giras],
  );

  if (subLoading) {
    return (
      <div className="flex flex-col gap-3">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-28 w-full" />
      </div>
    );
  }
  if (!can('analytics_basico')) return <PlanLocked feature="Analytics" minPlan="Basic" />;
  if (!canView) return <PermissionDenied message="Você não tem permissão para visualizar o analytics." />;

  const categoryData = analytics
    ? [
        { key: 'common', name: 'Comum', value: analytics.category_breakdown.common, color: CATEGORY_COLORS.common },
        { key: 'sponsor', name: 'Associado', value: analytics.category_breakdown.sponsor, color: CATEGORY_COLORS.sponsor },
        { key: 'walk_in', name: 'Sem senha', value: analytics.category_breakdown.walk_in, color: CATEGORY_COLORS.walk_in },
      ]
    : [];

  const statusData = analytics
    ? [
        { name: 'Utilizados', value: analytics.total_used, color: chartTokens.success },
        { name: 'Cancelados', value: analytics.total_cancelled, color: chartTokens.destructive },
        {
          name: 'Pendentes',
          value: Math.max(0, analytics.total_emitted - analytics.total_used - analytics.total_cancelled),
          color: chartTokens.muted,
        },
      ]
    : [];

  const peakMax = Math.max(1, ...(analytics?.peak_hours ?? []).map((p) => p.count));
  const dailyChartData = (analytics?.daily_distribution ?? []).map((d) => ({ ...d, date: fmtChartDate(d.date) }));
  const showSkeleton = loading && !analytics;

  const axisProps = {
    tick: { fontSize: 11, fill: chartTokens.tick },
    axisLine: false,
    tickLine: false,
  } as const;

  return (
    <div className="flex flex-col gap-6">
      <div data-tour="analytics-header">
        <PageHeader
          title="Analytics"
          subtitle="Métricas de emissão, uso e distribuição por período ou gira"
          className="mb-0"
        />
      </div>

      {/* Filtros */}
      <Card data-tour="analytics-filtros" className="gap-0 py-4">
        <CardContent className="flex flex-col gap-3 px-4">
          <ToggleGroup
            type="single"
            variant="outline"
            size="sm"
            value={preset}
            onValueChange={applyPreset}
            aria-label="Período"
            className="flex w-full flex-wrap sm:w-fit"
          >
            {PRESETS.map((p) => (
              <ToggleGroupItem key={p.key} value={p.key} className="flex-1 px-3 sm:flex-none">
                {p.label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-[repeat(2,minmax(0,11rem))_minmax(0,20rem)]">
            {preset === 'personalizado' && (
              <>
                <DateField
                  label="De"
                  size="small"
                  value={dateFrom}
                  max={dateTo || undefined}
                  onChange={(v) => v && setDateFrom(v)}
                />
                <DateField
                  label="Até"
                  size="small"
                  value={dateTo}
                  min={dateFrom || undefined}
                  onChange={(v) => v && setDateTo(v)}
                />
              </>
            )}
            <Combobox
              label="Gira"
              size="small"
              options={giraOptions}
              value={giraId}
              onChange={setGiraId}
              placeholder="Todas as giras"
              searchPlaceholder="Buscar gira..."
              emptyText="Nenhuma gira no período."
              clearable
              className="sm:col-span-2 lg:col-span-1"
            />
          </div>
        </CardContent>
      </Card>

      {error && (
        <Alert variant="destructive" role="alert">
          <XCircle aria-hidden />
          <AlertTitle>Erro ao carregar</AlertTitle>
          <AlertDescription className="flex flex-wrap items-center gap-3">
            <span>{error}</span>
            <Button size="sm" variant="outline" onClick={() => setReloadKey((k) => k + 1)}>
              Tentar novamente
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {/* KPIs — 2 / 3 / 6 colunas: nunca sobra um card sozinho na linha */}
      <div data-tour="analytics-kpis" className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        <KpiCard label="Total emitido" value={analytics?.total_emitted ?? '—'} icon={<Send />} color="var(--primary-text)" loading={showSkeleton} />
        <KpiCard label="Total utilizado" value={analytics?.total_used ?? '—'} icon={<CheckCheck />} color={chartTokens.success} loading={showSkeleton} />
        <KpiCard label="Taxa de uso" value={analytics ? `${analytics.usage_rate}%` : '—'} icon={<TrendingUp />} color={chartTokens.warning} loading={showSkeleton} />
        <KpiCard label="Cancelados" value={analytics?.total_cancelled ?? '—'} icon={<XCircle />} color={chartTokens.destructive} loading={showSkeleton} />
        <KpiCard label="Sem senha" value={analytics?.walk_in_total ?? '—'} icon={<Footprints />} color={chartTokens.info} loading={showSkeleton} subtitle="atendidos sem senha emitida" />
        <KpiCard
          label="Hoje"
          value={analytics?.emitted_today ?? '—'}
          icon={<CalendarClock />}
          color={chartTokens.secondary}
          loading={showSkeleton}
          subtitle={analytics ? `emitidas · ${analytics.used_today} utilizadas` : undefined}
        />
      </div>

      {(analytics || showSkeleton) && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <ChartCard
            title="Distribuição diária"
            subtitle="Senhas emitidas por dia e categoria"
            loading={loading}
            empty={dailyChartData.length === 0}
            className="lg:col-span-2"
          >
            <div data-tour="analytics-chart-line" className="h-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={dailyChartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={chartTokens.grid} vertical={false} />
                  <XAxis dataKey="date" {...axisProps} />
                  <YAxis allowDecimals={false} {...axisProps} />
                  <RechartsTooltip cursor={{ fill: chartTokens.grid, fillOpacity: 0.3 }} contentStyle={chartTooltipStyle} />
                  <Legend wrapperStyle={{ fontSize: 12, paddingTop: 12 }} iconSize={10} />
                  <Bar dataKey="common" stackId="a" fill={CATEGORY_COLORS.common} name="Comum" maxBarSize={32} />
                  <Bar dataKey="sponsor" stackId="a" fill={CATEGORY_COLORS.sponsor} name="Associado" maxBarSize={32} />
                  <Bar dataKey="walk_in" stackId="a" fill={CATEGORY_COLORS.walk_in} name="Sem senha" radius={[4, 4, 0, 0]} maxBarSize={32} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </ChartCard>

          <ChartCard
            title="Distribuição por categoria"
            loading={loading}
            empty={!categoryData.some((d) => d.value > 0)}
            height={260}
          >
            <div data-tour="analytics-chart-pie" className="h-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={categoryData} cx="50%" cy="45%" innerRadius={60} outerRadius={95} paddingAngle={3} dataKey="value">
                    {categoryData.map((entry) => (
                      <Cell key={entry.key} fill={entry.color} />
                    ))}
                  </Pie>
                  <RechartsTooltip contentStyle={chartTooltipStyle} />
                  <Legend wrapperStyle={{ fontSize: 12 }} iconSize={10} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </ChartCard>

          <ChartCard
            title="Status das senhas"
            loading={loading}
            empty={!statusData.some((d) => d.value > 0)}
            height={260}
          >
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={statusData} cx="50%" cy="45%" innerRadius={60} outerRadius={95} paddingAngle={3} dataKey="value">
                  {statusData.map((entry) => (
                    <Cell key={entry.name} fill={entry.color} />
                  ))}
                </Pie>
                <RechartsTooltip contentStyle={chartTooltipStyle} />
                <Legend wrapperStyle={{ fontSize: 12 }} iconSize={10} />
              </PieChart>
            </ResponsiveContainer>
          </ChartCard>

          <Card data-tour="analytics-peak" className="h-full gap-4">
            <CardHeader>
              <CardTitle className="text-base font-bold tracking-tight">Horários de pico</CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <Skeleton className="h-[220px] w-full rounded-lg" />
              ) : analytics && analytics.peak_hours.length > 0 ? (
                <ul className="m-0 flex list-none flex-col gap-2.5 p-0" aria-label="Emissões por hora">
                  {analytics.peak_hours.map((ph) => (
                    <li key={ph.hour} className="flex items-center gap-3">
                      <span className="w-8 shrink-0 font-mono text-xs font-semibold text-muted-foreground">
                        {String(ph.hour).padStart(2, '0')}h
                      </span>
                      <span className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                        <span
                          className="block h-full rounded-full bg-warning"
                          style={{ width: `${(ph.count / peakMax) * 100}%` }}
                        />
                      </span>
                      <span className="w-16 shrink-0 text-right text-xs text-muted-foreground">
                        {ph.count} emis.
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="py-10 text-center text-sm text-muted-foreground">Sem dados para o período.</p>
              )}
            </CardContent>
          </Card>

          <ChartCard
            title="Evolução de uso no período"
            loading={loading}
            empty={dailyChartData.length === 0}
            height={260}
          >
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={dailyChartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={chartTokens.grid} vertical={false} />
                <XAxis dataKey="date" {...axisProps} />
                <YAxis allowDecimals={false} {...axisProps} />
                <RechartsTooltip contentStyle={chartTooltipStyle} />
                <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} iconSize={10} />
                <Line type="monotone" dataKey="total" stroke={chartTokens.primary} name="Emitidas" dot={false} strokeWidth={2} />
                <Line type="monotone" dataKey="completed" stroke={chartTokens.success} name="Concluídas" dot={false} strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>
      )}
    </div>
  );
}
