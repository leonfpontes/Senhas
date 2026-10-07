'use client';

/**
 * Início do painel.
 *
 * - Terreiro ainda não ativado (checklist de primeiros passos pendente): a tela é **só** o
 *   checklist, em destaque — sem números que ainda não dizem nada.
 * - Depois de ativado: cartão "Gira de hoje" (com Abrir Porta / Ver senhas / Compartilhar
 *   link), KpiCards, gráfico dos últimos 7 dias (ChartCard + chartTokens), horários de pico,
 *   próximas giras, aniversariantes e alertas de estoque.
 * - `?passos=1` (item "Primeiros passos" do menu / "Mostrar primeiros passos") reabre o
 *   checklist que tinha sido ocultado.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import {
  Cake,
  CalendarDays,
  Check,
  CircleAlert,
  DoorOpen,
  Download,
  Package,
  RefreshCw,
  Send,
  Share2,
  Ticket,
  TrendingUp,
  TriangleAlert,
  UserPlus,
} from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip as RechartsTooltip, XAxis, YAxis } from 'recharts';
import AdminLayout from './admin_layout';
import { KpiCard } from '@/components/admin';
import { ChartTooltip } from '@/components/admin/ChartTooltip';
import { ChartCard } from '@/components/charts/ChartCard';
import FirstGiraChecklist, {
  isTenantActivated,
  readChecklistDismissed,
  resetChecklistDismissed,
  type OnboardingStatus,
} from '@/components/admin/FirstGiraChecklist';
import { ShareLinkDialog, fetchUnifiedLinks, type UnifiedLinks } from '@/components/admin/ShareLinkDialog';
import { pickTodayGira, useGiraContext } from '@/components/admin/GiraContext';
import { whenLabel } from '@/components/admin/GiraCard';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardAction } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { chartTokens } from '@/lib/chartTokens';
import { cn } from '@/lib/utils';
import { useSubscription } from '@/hooks/useSubscription';
import { usePermissions } from '@/hooks/usePermissions';
import { useProfile } from '@/hooks/useProfile';
import { useWelcomeTour } from '@/tours/welcomeTour';
import { proximoPasso, resolveTrilha, trilhaDe, type TrilhaGates } from '@/components/admin/onboardingTrilhas';
import { isPrincipalDor } from '@/constants/onboarding';
import { setAnalyticsTag } from '@/services/analytics';
import { apiClient } from '@/services/api_client';

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface UpcomingGira {
  id: string;
  nome: string;
  data_inicio: string;
  max_tickets: number | null;
  current_count: number;
  sponsor_count: number;
  is_open: boolean;
}

interface TicketStats {
  total_emitted: number;
  total_used: number;
  total_cancelled: number;
  usage_rate: number;
  emitted_today: number;
  used_today: number;
  walk_in_total: number;
}

interface DailyDist {
  date: string;
  total: number;
  common: number;
  sponsor: number;
  walk_in: number;
}

interface PeakHour {
  hour: number;
  count: number;
}

interface EstoqueAlert {
  item_id: string;
  item_nome: string;
  grupo_nome: string | null;
  unidade_medida: string;
  saldo: number;
  estoque_minimo: number;
  status: string;
}

interface EstoqueSummary {
  total_itens: number;
  total_grupos: number;
  itens_ok: number;
  itens_atencao: number;
  itens_critico: number;
}

interface AniversarianteItem {
  id: string;
  nome: string;
  telefone: string | null;
  data_nascimento: string | null;
  dias_ate_aniversario: number;
}

interface DashboardData {
  upcoming_giras: UpcomingGira[];
  ticket_stats: TicketStats;
  daily_distribution: DailyDist[];
  peak_hours: PeakHour[];
  estoque_alerts: EstoqueAlert[];
  estoque_summary: EstoqueSummary | null;
  plan: { name: string; label: string; status: string };
  /** Ausente em backends anteriores ao checklist — tratar como opcional. */
  onboarding?: OnboardingStatus;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Bom dia';
  if (h < 18) return 'Boa tarde';
  return 'Boa noite';
}

/** "2026-03-09" → "09/03". Sem `new Date()`: a data pura vira meia-noite UTC e no Brasil caía no dia anterior. */
export function formatChartDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (m) return `${m[3]}/${m[2]}`;
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

function formatTodayLong(): string {
  return new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
}

function SectionCard({
  title,
  action,
  children,
  className,
  ...rest
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  'data-tour'?: string;
}) {
  return (
    <Card className={cn('gap-4', className)} {...rest}>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        {action && <CardAction>{action}</CardAction>}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function Empty({ label }: { label: string }) {
  return <p className="py-6 text-center text-sm text-muted-foreground">{label}</p>;
}

// ─── Gira de hoje ─────────────────────────────────────────────────────────────

function TodayGiraCard({
  gira,
  loading,
  canViewPorta,
  canViewTickets,
  canShare,
  onShare,
}: {
  gira: UpcomingGira | null;
  loading: boolean;
  canViewPorta: boolean;
  canViewTickets: boolean;
  canShare: boolean;
  onShare: () => void;
}) {
  if (loading) return <Skeleton className="mb-6 h-36 rounded-xl" />;
  if (!gira) {
    return (
      <Card className="mb-6 flex-row items-center gap-3 px-6 py-4" data-testid="gira-de-hoje">
        <CalendarDays className="size-5 text-muted-foreground" aria-hidden />
        <p className="flex-1 text-sm text-muted-foreground">Nenhuma gira marcada para hoje ou para os próximos dias.</p>
        <Button asChild size="sm" variant="outline">
          <Link href="/admin/giras">Ver giras</Link>
        </Button>
      </Card>
    );
  }
  const start = new Date(gira.data_inicio);
  const isToday = start.toDateString() === new Date().toDateString();
  const pct = gira.max_tickets ? Math.min(100, (gira.current_count / gira.max_tickets) * 100) : null;
  return (
    <Card className="mb-6 gap-4 border-primary/50 py-5" data-testid="gira-de-hoje">
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold tracking-wide text-brand uppercase">
              {isToday ? 'Gira de hoje' : 'Próxima gira'}
            </p>
            <h2 className="truncate text-xl font-bold">{gira.nome}</h2>
            <p className="text-sm text-muted-foreground first-letter:uppercase">{whenLabel(start)}</p>
          </div>
          <Badge
            variant="outline"
            className={gira.is_open ? 'border-success/30 bg-success/15 text-success-strong' : 'text-muted-foreground'}
          >
            {gira.is_open ? 'Senhas abertas no link' : 'Senhas fechadas'}
          </Badge>
        </div>
        <div className="flex flex-col gap-1.5">
          <p className="text-sm">
            <strong className="tabular-nums">{gira.current_count}</strong>
            {gira.max_tickets ? ` de ${gira.max_tickets} senhas` : ' senhas'}
            {gira.sponsor_count > 0 ? ` · ${gira.sponsor_count} de associados` : ''}
          </p>
          {pct !== null && <Progress value={pct} className="h-2" aria-label="Senhas emitidas" />}
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          {canViewPorta && (
            <Button asChild className="sm:flex-1" variant={isToday ? 'default' : 'outline'}>
              <Link href={`/admin/porta?gira=${encodeURIComponent(gira.id)}`}>
                <DoorOpen aria-hidden /> Abrir Porta
              </Link>
            </Button>
          )}
          {canViewTickets && (
            <Button asChild variant="outline" className="sm:flex-1">
              <Link href={`/admin/tickets?gira=${encodeURIComponent(gira.id)}`}>
                <Ticket aria-hidden /> Ver senhas
              </Link>
            </Button>
          )}
          {canShare && (
            <Button type="button" variant={isToday ? 'outline' : 'default'} className="sm:flex-1" onClick={onShare}>
              <Share2 aria-hidden /> Compartilhar link
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Página ───────────────────────────────────────────────────────────────────

export default function AdminDashboard() {
  return (
    <AdminLayout title="Início">
      <DashboardContent />
    </AdminLayout>
  );
}

function DashboardContent() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [aniversariantes, setAniversariantes] = useState<AniversarianteItem[]>([]);
  const [greeting, setGreeting] = useState('');
  const [todayLabel, setTodayLabel] = useState('');
  const [checklistDismissed, setChecklistDismissed] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [shareLinks, setShareLinks] = useState<UnifiedLinks | null>(null);
  const [shareLoading, setShareLoading] = useState(false);

  const { can, loading: subLoading } = useSubscription();
  const { can: canGroup } = usePermissions();
  // Plano E grupo; espera a assinatura carregar (num reload direto can() começa false).
  const canViewAniversariantes = !subLoading && can('mediuns') && canGroup('mediuns', 'view');
  const canViewPorta = canGroup('porta', 'view');
  const canViewTickets = canGroup('tickets', 'view');
  // Checklist e compartilhar link: só para quem pode agir sobre giras.
  const canViewGiras = canGroup('giras', 'view');
  const canCreateGira = canGroup('giras', 'insert');
  const { profile } = useProfile();
  const router = useRouter();
  const giraCtx = useGiraContext({ load: false });
  const tenantId = profile?.tenant_id;

  const chartRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setGreeting(getGreeting());
    setTodayLabel(formatTodayLong());
  }, []);

  useEffect(() => {
    setChecklistDismissed(readChecklistDismissed(tenantId));
  }, [tenantId]);

  // ?passos=1 reabre os primeiros passos.
  useEffect(() => {
    if (!router.isReady || router.query.passos !== '1') return;
    resetChecklistDismissed(tenantId);
    setChecklistDismissed(false);
    const { passos: _p, ...rest } = router.query;
    router.replace({ pathname: router.pathname, query: rest }, undefined, { shallow: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router.isReady, router.query.passos]);

  useEffect(() => {
    const controller = new AbortController();
    loadDashboard(controller.signal);
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!canViewAniversariantes) return;
    const controller = new AbortController();
    apiClient
      .get<AniversarianteItem[]>('/api/v1/admin/mediuns/aniversariantes?dias=7', { signal: controller.signal })
      .then((res) => setAniversariantes(Array.isArray(res?.data) ? res.data : []))
      .catch(() => {});
    return () => controller.abort();
  }, [canViewAniversariantes]);

  const loadDashboard = async (signal?: AbortSignal) => {
    try {
      setLoading(true);
      setError(null);
      const res = await apiClient.get('/api/v1/admin/dashboard-summary', { signal });
      setData(res?.data ?? null);
    } catch (err) {
      if (err instanceof Error && (err.name === 'CanceledError' || err.name === 'AbortError')) return;
      setError('Não foi possível carregar o resumo do terreiro.');
    } finally {
      setLoading(false);
    }
  };

  // Tour de boas-vindas: abre sozinho uma vez, só para o admin de terreiros que responderam
  // "o que você mais precisa resolver" no cadastro.
  const principalDor = isPrincipalDor(data?.onboarding?.principal_dor) ? data?.onboarding?.principal_dor : null;
  useEffect(() => {
    if (principalDor) setAnalyticsTag('principal_dor', principalDor);
  }, [principalDor]);

  // Travas do checklist por trilha: plano (enquanto a assinatura carrega, nada travado — senão
  // passos de módulo contariam como "fora do plano" e o checklist sumiria por um instante) e grupo.
  const trilhaGates: TrilhaGates = {
    canPlan: (feature) => subLoading || can(feature),
    canGroup,
  };
  const trilhaSteps = data?.onboarding ? resolveTrilha(data.onboarding, trilhaGates) : [];
  const nextStep = proximoPasso(trilhaSteps);

  useWelcomeTour({
    enabled: !loading && !!data && profile?.role === 'admin' && !subLoading,
    dor: principalDor,
    trilha: data?.onboarding ? trilhaDe(data.onboarding) : undefined,
    checklistTitles: trilhaSteps.map((s) => s.title),
    nextStep,
    userId: profile?.id,
    firstName: profile?.full_name?.split(' ')[0],
    can,
  });

  const handleExportChart = async () => {
    const today = new Date().toISOString().slice(0, 10);
    try {
      const html2canvas = (await import('html2canvas')).default;
      if (chartRef.current) {
        const bg = getComputedStyle(document.body).backgroundColor || '#ffffff';
        const canvas = await html2canvas(chartRef.current, { backgroundColor: bg, scale: 2 });
        const link = document.createElement('a');
        link.download = `inicio-${today}.png`;
        link.href = canvas.toDataURL('image/png');
        link.click();
        return;
      }
    } catch {
      /* fallback abaixo */
    }
    window.print();
  };

  const openShare = () => {
    setShareOpen(true);
    if (shareLinks) return;
    setShareLoading(true);
    fetchUnifiedLinks()
      .then((links) => setShareLinks(links))
      .finally(() => setShareLoading(false));
  };

  const onboarding = data?.onboarding;
  const onboardingOnly =
    !!onboarding && canViewGiras && !isTenantActivated(onboarding, trilhaGates) && !checklistDismissed;

  const upcomingGiras = useMemo(() => data?.upcoming_giras ?? [], [data]);
  const todayGira = useMemo(() => {
    if (upcomingGiras.length === 0) return null;
    const fromCtx = giraCtx.selectedGiraId ? upcomingGiras.find((g) => g.id === giraCtx.selectedGiraId) : null;
    if (fromCtx) return fromCtx;
    const picked = pickTodayGira(upcomingGiras.map((g) => ({ ...g, is_active: true })));
    return upcomingGiras.find((g) => g.id === picked?.id) ?? upcomingGiras[0];
  }, [upcomingGiras, giraCtx.selectedGiraId]);

  const stats = data?.ticket_stats;
  const chartData = (data?.daily_distribution ?? []).map((d) => ({
    date: formatChartDate(d.date),
    Comum: d.common,
    Associado: d.sponsor,
    'Sem senha': d.walk_in,
  }));
  const peakHours = data?.peak_hours ?? [];
  const maxPeak = peakHours[0]?.count || 1;
  const estoqueAlerts = data?.estoque_alerts ?? [];
  const estoqueOrdenado = [
    ...estoqueAlerts.filter((a) => a.status === 'critico'),
    ...estoqueAlerts.filter((a) => a.status !== 'critico'),
  ];
  const hasAniversariantes = canViewAniversariantes && aniversariantes.length > 0;

  const header = (
    <div data-tour="dashboard-greeting" className="mb-6 flex items-start justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{greeting || ' '}</h1>
        <p className="mt-0.5 text-sm text-muted-foreground first-letter:uppercase">{todayLabel || ' '}</p>
      </div>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={() => loadDashboard()}
        disabled={loading}
        aria-label="Atualizar"
        title="Atualizar"
      >
        <RefreshCw aria-hidden className={cn(loading && 'animate-spin')} />
      </Button>
    </div>
  );

  const errorAlert = error && (
    <Alert variant="destructive" className="mb-6">
      <CircleAlert aria-hidden />
      <AlertTitle>{error}</AlertTitle>
      <AlertDescription>
        <Button type="button" size="sm" variant="outline" className="mt-2" onClick={() => loadDashboard()}>
          Tentar novamente
        </Button>
      </AlertDescription>
    </Alert>
  );

  // ── Terreiro ainda não ativado: só os primeiros passos ──
  if (onboardingOnly && onboarding) {
    return (
      <>
        {header}
        {errorAlert}
        <FirstGiraChecklist
          status={onboarding}
          tenantId={tenantId}
          tenantName={profile?.tenant_name}
          canCreateGira={canCreateGira}
          canViewPorta={canViewPorta}
          canPlan={trilhaGates.canPlan}
          canGroup={canGroup}
          fullscreen
          onDismiss={() => setChecklistDismissed(true)}
        />
      </>
    );
  }

  return (
    <>
      {header}
      {errorAlert}

      <TodayGiraCard
        gira={todayGira}
        loading={loading}
        canViewPorta={canViewPorta}
        canViewTickets={canViewTickets}
        canShare={canViewGiras}
        onShare={openShare}
      />

      {/* ── KPIs ── */}
      <div data-tour="dashboard-kpis" className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <KpiCard
          label="Senhas emitidas"
          value={String(stats?.total_emitted ?? 0)}
          icon={<Send />}
          subtitle={stats?.emitted_today != null ? `${stats.emitted_today} hoje` : undefined}
          loading={loading}
        />
        <KpiCard
          label="Atendidas"
          value={String(stats?.total_used ?? 0)}
          icon={<Check />}
          color="var(--success)"
          subtitle={stats?.used_today != null ? `${stats.used_today} hoje` : undefined}
          loading={loading}
        />
        <KpiCard
          label="Comparecimento"
          value={`${Number(stats?.usage_rate ?? 0).toFixed(1).replace('.', ',')}%`}
          icon={<TrendingUp />}
          color="var(--warning)"
          loading={loading}
        />
        <KpiCard
          label="Chegaram sem senha"
          value={String(stats?.walk_in_total ?? 0)}
          icon={<UserPlus />}
          color="var(--info)"
          loading={loading}
        />
      </div>

      <div className="mb-6 grid gap-6 lg:grid-cols-12">
        {/* Coluna da esquerda */}
        <div className="flex flex-col gap-6 lg:col-span-7">
          <div ref={chartRef} data-tour="dashboard-chart">
            <ChartCard
              title="Senhas nos últimos 7 dias"
              loading={loading}
              empty={chartData.length === 0}
              emptyMessage="Nenhuma senha no período"
              height={240}
              actions={
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  onClick={handleExportChart}
                  aria-label="Baixar gráfico (PNG)"
                  title="Baixar gráfico (PNG)"
                  data-no-export
                >
                  <Download aria-hidden />
                </Button>
              }
            >
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={chartTokens.grid} vertical={false} />
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: chartTokens.tick }} axisLine={false} tickLine={false} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: chartTokens.tick }} axisLine={false} tickLine={false} />
                  <RechartsTooltip cursor={{ fill: 'var(--accent)' }} content={<ChartTooltip />} />
                  <Legend wrapperStyle={{ fontSize: 12, paddingTop: 12 }} iconSize={10} />
                  <Bar dataKey="Comum" stackId="a" fill={chartTokens.primary} maxBarSize={36} />
                  <Bar dataKey="Associado" stackId="a" fill={chartTokens.warning} maxBarSize={36} />
                  <Bar dataKey="Sem senha" stackId="a" fill={chartTokens.info} radius={[4, 4, 0, 0]} maxBarSize={36} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
          </div>

          <SectionCard title="Horários de pico" data-tour="dashboard-peak-hours">
            {loading ? (
              <div className="flex flex-col gap-3">
                {[0, 1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-5" />
                ))}
              </div>
            ) : peakHours.length > 0 ? (
              <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
                {peakHours.map((ph) => (
                  <li key={ph.hour} className="flex items-center gap-3">
                    <span className="w-9 shrink-0 font-mono text-xs font-semibold text-muted-foreground">
                      {String(ph.hour).padStart(2, '0')}h
                    </span>
                    <Progress value={(ph.count / maxPeak) * 100} className="h-2 flex-1" aria-label={`${ph.hour}h`} />
                    <span className="w-20 shrink-0 text-right text-xs text-muted-foreground">
                      {ph.count} {ph.count === 1 ? 'senha' : 'senhas'}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <Empty label="Ainda sem dados de horário." />
            )}
          </SectionCard>
        </div>

        {/* Coluna da direita */}
        <div className="flex flex-col gap-6 lg:col-span-5">
          <SectionCard
            title="Próximas giras"
            data-tour="dashboard-giras"
            action={
              <Button asChild size="sm" variant="ghost">
                <Link href="/admin/giras">Ver todas</Link>
              </Button>
            }
          >
            {loading ? (
              <div className="flex flex-col gap-2">
                {[0, 1, 2].map((i) => (
                  <Skeleton key={i} className="h-16" />
                ))}
              </div>
            ) : upcomingGiras.length > 0 ? (
              <ul className="m-0 flex list-none flex-col gap-2 p-0">
                {upcomingGiras.map((g) => {
                  const full = !!g.max_tickets && g.current_count >= g.max_tickets;
                  return (
                    <li key={g.id} className="flex items-center gap-3 rounded-lg border p-3">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold">{g.nome}</p>
                        <p className="text-xs text-muted-foreground first-letter:uppercase">
                          {whenLabel(new Date(g.data_inicio))} ·{' '}
                          {g.max_tickets ? `${g.current_count} de ${g.max_tickets} senhas` : `${g.current_count} senhas`}
                          {full ? ' · lotada' : ''}
                        </p>
                      </div>
                      <Badge
                        variant="outline"
                        className={g.is_open ? 'border-success/30 bg-success/15 text-success-strong' : 'text-muted-foreground'}
                      >
                        {g.is_open ? 'Abertas' : 'Fechadas'}
                      </Badge>
                      {canViewPorta && !!g.max_tickets && (
                        <Button asChild size="icon-sm" variant="ghost">
                          <Link href={`/admin/porta?gira=${encodeURIComponent(g.id)}`} aria-label={`Abrir Porta: ${g.nome}`}>
                            <DoorOpen aria-hidden />
                          </Link>
                        </Button>
                      )}
                    </li>
                  );
                })}
              </ul>
            ) : (
              <Empty label="Nenhuma gira marcada." />
            )}
          </SectionCard>

          {hasAniversariantes && (
            <SectionCard
              title="Aniversariantes da semana"
              action={
                <Button asChild size="sm" variant="ghost">
                  <Link href="/admin/mediuns">Ver médiuns</Link>
                </Button>
              }
            >
              <ul className="m-0 flex list-none flex-col p-0">
                {aniversariantes.slice(0, 7).map((m) => (
                  <li key={m.id} className="flex items-center justify-between gap-3 border-b py-2 last:border-b-0">
                    <span className="flex min-w-0 items-center gap-2">
                      <Cake
                        className={cn('size-4 shrink-0', m.dias_ate_aniversario === 0 ? 'text-destructive' : 'text-muted-foreground')}
                        aria-hidden
                      />
                      <span className={cn('truncate text-sm', m.dias_ate_aniversario === 0 && 'font-bold')}>{m.nome}</span>
                    </span>
                    <Badge variant={m.dias_ate_aniversario === 0 ? 'destructive' : 'outline'}>
                      {m.dias_ate_aniversario === 0
                        ? 'Hoje!'
                        : m.dias_ate_aniversario === 1
                          ? 'Amanhã'
                          : `Em ${m.dias_ate_aniversario} dias`}
                    </Badge>
                  </li>
                ))}
              </ul>
            </SectionCard>
          )}
        </div>
      </div>

      {/* ── Estoque ── */}
      {can('estoque_controle') && !loading && data && (
        estoqueAlerts.length > 0 ? (
          <SectionCard
            title="Alertas de estoque"
            data-tour="dashboard-estoque"
            className="border-warning/50"
            action={
              <Button asChild size="sm" variant="ghost">
                <Link href="/admin/estoque/relatorio">
                  <Package aria-hidden /> Ver relatório
                </Link>
              </Button>
            }
          >
            <div className="mb-3 flex flex-wrap gap-2">
              {!!data.estoque_summary?.itens_ok && (
                <Badge variant="outline" className="border-success/30 bg-success/15 text-success-strong">
                  <Check aria-hidden /> {data.estoque_summary.itens_ok} em dia
                </Badge>
              )}
              {!!data.estoque_summary?.itens_atencao && (
                <Badge variant="outline" className="border-warning/40 bg-warning/15 text-warning-strong">
                  <TriangleAlert aria-hidden /> {data.estoque_summary.itens_atencao} atenção
                </Badge>
              )}
              {!!data.estoque_summary?.itens_critico && (
                <Badge variant="outline" className="border-destructive/30 bg-destructive/10 text-destructive-strong">
                  <CircleAlert aria-hidden /> {data.estoque_summary.itens_critico} crítico
                </Badge>
              )}
            </div>
            <ul className="m-0 flex list-none flex-col p-0">
              {estoqueOrdenado.slice(0, 6).map((item) => (
                <li key={item.item_id} className="flex items-center gap-3 border-b py-2.5 last:border-b-0">
                  <span
                    aria-hidden
                    className={cn('size-1.5 shrink-0 rounded-full', item.status === 'critico' ? 'bg-destructive' : 'bg-warning')}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{item.item_nome}</p>
                    {item.grupo_nome && <p className="text-xs text-muted-foreground">{item.grupo_nome}</p>}
                  </div>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {item.saldo} / {item.estoque_minimo} {item.unidade_medida}
                  </span>
                  <Badge variant="outline" className={item.status === 'critico' ? 'text-destructive' : 'text-warning-strong'}>
                    {item.status === 'critico' ? 'Crítico' : 'Atenção'}
                  </Badge>
                </li>
              ))}
            </ul>
          </SectionCard>
        ) : (
          <Card className="flex-row items-center gap-3 px-6 py-3">
            <Check className="size-4 text-success" aria-hidden />
            <p className="flex-1 text-sm text-muted-foreground">Estoque em dia — nenhum item abaixo do mínimo.</p>
            <Button asChild size="sm" variant="ghost">
              <Link href="/admin/estoque/relatorio">Relatório</Link>
            </Button>
          </Card>
        )
      )}

      <ShareLinkDialog
        open={shareOpen}
        onOpenChange={setShareOpen}
        link={shareLinks?.public_link ?? onboarding?.public_link}
        sponsorLink={can('associados') ? shareLinks?.sponsor_public_link : null}
        tenantName={profile?.tenant_name}
        loading={shareLoading}
      />
    </>
  );
}
