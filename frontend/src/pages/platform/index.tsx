/**
 * /platform — "Hoje": o que o fundador precisa fazer agora.
 *
 * Três colunas (empilham no celular):
 *   Contatar      — trials acabando (≤ 7 dias), ativação travada e risco de churn, por urgência e MRR
 *   Venceu ou mudou — cancelamentos, suspensões, trials vencidos e bônus
 *   Quebrou       — saúde real (/health), erros por terreiro (com nome) e suporte não lido
 *
 * Fontes: GET /api/v1/platform/dashboard, /tenant-observatory, /health, /billing/subscriptions e
 * /support-chat/conversations. Absorveu o antigo Observatório (que virou redirecionamento).
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Activity,
  AlertTriangle,
  ChevronDown,
  Database,
  FlaskConical,
  LogIn,
  MessageCircle,
  MessageSquare,
  Rocket,
  Users,
  Wallet,
  Wifi,
} from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip as RechartsTooltip, XAxis, YAxis } from 'recharts';
import { toast } from 'sonner';
import { apiClient, extractApiErrorMessage } from '@/services/api_client';
import { chartTokens } from '@/lib/chartTokens';
import { cn } from '@/lib/utils';
import PlatformLayout from './layout';
import { KpiCard } from '@/components/admin/KpiCard';
import { PageHeader } from '@/components/admin/PageHeader';
import { ChartCard } from '@/components/charts/ChartCard';
import { EmptyState } from '@/components/EmptyState';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  ActivationSection,
  ChartTooltip,
  STAGE_META,
  STAGE_ORDER,
  StatusDot,
  ToneBadge,
  PLAN_META,
  PLAN_ORDER,
  planLabel,
  daysUntil,
  fmtDate,
  fmtMoney,
  plural,
  whatsappLink,
  impersonateTenantAdmin,
  type ActivationData,
  type ActivationTenant,
  type Tone,
} from '@/components/platform';
import { STUCK_STAGES } from '@/components/platform/ActivationSection';

// ─── Polling ─────────────────────────────────────────────────────────────────

const POLL_DATA_MS = 60_000;
const POLL_HEALTH_MS = 30_000;

// ─── Tipos (contratos do backend) ────────────────────────────────────────────

interface HealthData {
  database: { status: string; latency_ms: number };
  api: { status: string; generated_at: string };
}

interface DashboardData {
  tenants: { total: number; active: number; inactive: number; trial: number; new_30d: number };
  user_count: number;
  tickets: { total: number; last_30d: number; last_7d: number };
  mrr: number;
  mrr_prev_month: number;
  alerts: { inactive_tenants: number; no_activity_30d: number };
  plans_distribution: { plan: string; count: number }[];
  daily_tickets: { date: string; count: number }[];
  tenant_growth: { date: string; count: number }[];
  top_tenants: { id: string; name: string; plan: string | null; tickets_30d: number }[];
}

interface RetentionTenant {
  tenant_id: string;
  tenant_name: string;
  tenant_slug: string;
  plan: string | null;
  mrr: number;
  last_ticket_at: string | null;
  never_emitted: boolean;
  days_inactive: number;
  tickets_30d: number;
  tickets_prev_30d: number;
  severity: 'atencao' | 'risco' | 'critico';
}

interface TenantErrors {
  tenant_id: string | null;
  total_erros: number;
  top_endpoints: { endpoint: string; count: number }[];
}

interface ObservatoryData {
  retention: RetentionTenant[];
  retention_summary: { total_at_risk: number; mrr_at_risk: number; critico: number; risco: number; atencao: number };
  activation: ActivationData;
  errors_by_tenant: TenantErrors[];
  error_window_minutes: number;
  generated_at: string;
}

interface SubscriptionItem {
  tenant_id: string;
  tenant_name: string;
  tenant_slug: string;
  plan: string;
  status: string;
  monthly_price: number;
  current_users: number;
  max_users: number;
  is_trial: boolean;
  is_bonus: boolean;
  cancel_at_period_end: boolean;
  current_period_end: string | null;
  trial_ends_at: string | null;
  stripe_customer_id: string | null;
}

interface ConversationSummary {
  id: string;
  tenant_id: string;
  tenant_name: string;
  owner_name_snapshot: string;
  status: 'open' | 'resolved';
  last_message_at: string | null;
  last_message_preview: string | null;
  unread: boolean;
}

// ─── Derivações ──────────────────────────────────────────────────────────────

export interface ContactItem {
  tenantId: string;
  name: string;
  reasons: { label: string; tone: Tone }[];
  urgency: number;
  mrr: number;
  phone: string | null;
}

const SEVERITY_META: Record<RetentionTenant['severity'], { label: string; tone: Tone; urgency: number }> = {
  atencao: { label: 'Atenção', tone: 'warning', urgency: 50 },
  risco: { label: 'Risco', tone: 'warning', urgency: 70 },
  critico: { label: 'Crítico', tone: 'destructive', urgency: 90 },
};

/** Lista "Contatar": trials ≤ 7 dias, ativação travada e risco de churn, por urgência e MRR. */
export function buildContactList(
  activation: ActivationTenant[],
  retention: RetentionTenant[],
  mrrByTenant: Record<string, number>,
): ContactItem[] {
  const map = new Map<string, ContactItem>();
  const add = (tenantId: string, name: string, reason: { label: string; tone: Tone }, urgency: number, mrr: number, phone: string | null) => {
    const existing = map.get(tenantId);
    if (existing) {
      existing.reasons.push(reason);
      existing.urgency = Math.max(existing.urgency, urgency);
      existing.phone = existing.phone ?? phone;
      existing.mrr = Math.max(existing.mrr, mrr);
      return;
    }
    map.set(tenantId, { tenantId, name, reasons: [reason], urgency, mrr, phone });
  };

  for (const t of activation) {
    if (t.inactive) continue;
    const mrr = mrrByTenant[t.tenant_id] ?? 0;
    const phone = t.contact?.phone ?? null;
    if (t.is_trial && !t.paying && t.trial_days_left !== null && t.trial_days_left <= 7) {
      const label = t.trial_days_left <= 0 ? 'Trial termina hoje' : `Trial termina em ${plural(t.trial_days_left, 'dia')}`;
      add(t.tenant_id, t.tenant_name, { label, tone: t.trial_days_left <= 2 ? 'destructive' : 'warning' }, 100 - t.trial_days_left * 5, mrr, phone);
    }
    if (STUCK_STAGES.includes(t.stage) && (t.days_since_signup ?? 0) >= 1) {
      const stage = STAGE_META[t.stage];
      add(t.tenant_id, t.tenant_name, { label: `Travado: ${stage.label.toLowerCase()}`, tone: stage.tone }, 60 + Math.min(t.days_since_signup ?? 0, 20), mrr, phone);
    }
  }

  for (const r of retention) {
    const sev = SEVERITY_META[r.severity];
    const label = r.never_emitted ? 'Nunca emitiu senhas' : `${r.days_inactive} dias sem emitir senhas`;
    add(r.tenant_id, r.tenant_name, { label: `${sev.label}: ${label}`, tone: sev.tone }, sev.urgency, r.mrr || (mrrByTenant[r.tenant_id] ?? 0), null);
  }

  return [...map.values()].sort((a, b) => b.urgency - a.urgency || b.mrr - a.mrr || a.name.localeCompare(b.name));
}

export interface ChangeItem {
  tenantId: string;
  name: string;
  label: string;
  tone: Tone;
  date: string | null;
  mrr: number;
}

/** Lista "Venceu ou mudou": cancelamentos, suspensões, trials vencidos, cancelamento agendado e bônus. */
export function buildChangeList(subs: SubscriptionItem[], now: Date = new Date()): ChangeItem[] {
  const items: ChangeItem[] = [];
  for (const s of subs) {
    const base = { tenantId: s.tenant_id, name: s.tenant_name, mrr: s.monthly_price };
    if (s.status === 'cancelled' || s.status === 'expired') {
      items.push({ ...base, label: s.status === 'cancelled' ? 'Assinatura cancelada' : 'Assinatura expirada', tone: 'destructive', date: s.current_period_end });
    } else if (s.status === 'suspended') {
      items.push({ ...base, label: 'Assinatura suspensa', tone: 'warning', date: s.current_period_end });
    } else if (s.cancel_at_period_end) {
      items.push({ ...base, label: `Cancela em ${fmtDate(s.current_period_end)}`, tone: 'warning', date: s.current_period_end });
    }
    if (s.is_trial && s.trial_ends_at && (daysUntil(s.trial_ends_at, now) ?? 0) < 0) {
      items.push({ ...base, label: `Trial venceu em ${fmtDate(s.trial_ends_at)}`, tone: 'warning', date: s.trial_ends_at });
    }
    if (s.is_bonus) {
      items.push({ ...base, label: `Bônus · ${planLabel(s.plan)}`, tone: 'info', date: null });
    }
  }
  return items.sort((a, b) => {
    if (a.date && b.date) return b.date.localeCompare(a.date);
    if (a.date) return -1;
    if (b.date) return 1;
    return a.name.localeCompare(b.name);
  });
}

// ─── Linha de ação (Contatar / Venceu ou mudou) ──────────────────────────────

function EnterAsAdminButton({ tenantId, name }: { tenantId: string; name: string }) {
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    try {
      await impersonateTenantAdmin(tenantId);
    } catch (err) {
      toast.error(extractApiErrorMessage(err, err instanceof Error ? err.message : 'Erro ao entrar como admin'));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="ghost" size="icon-sm" onClick={run} disabled={busy} aria-label={`Entrar como admin de ${name}`}>
          <LogIn />
        </Button>
      </TooltipTrigger>
      <TooltipContent>Entrar como admin</TooltipContent>
    </Tooltip>
  );
}

function RowActions({ tenantId, name, phone }: { tenantId: string; name: string; phone: string | null }) {
  const wa = whatsappLink(phone);
  return (
    <div className="flex shrink-0 items-center">
      {wa ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button asChild variant="ghost" size="icon-sm" className="text-success">
              <a href={wa} target="_blank" rel="noopener noreferrer" aria-label={`WhatsApp de ${name}`}>
                <MessageCircle />
              </a>
            </Button>
          </TooltipTrigger>
          <TooltipContent>WhatsApp {phone}</TooltipContent>
        </Tooltip>
      ) : (
        <Tooltip>
          <TooltipTrigger asChild>
            <span>
              <Button variant="ghost" size="icon-sm" disabled aria-label={`WhatsApp de ${name} indisponível`}>
                <MessageCircle />
              </Button>
            </span>
          </TooltipTrigger>
          <TooltipContent>Sem telefone cadastrado</TooltipContent>
        </Tooltip>
      )}
      <Tooltip>
        <TooltipTrigger asChild>
          <Button asChild variant="ghost" size="icon-sm">
            <Link href={`/platform/suporte?tenant=${tenantId}`} aria-label={`Mensagem para ${name}`}>
              <MessageSquare />
            </Link>
          </Button>
        </TooltipTrigger>
        <TooltipContent>Mensagem (conversa de suporte)</TooltipContent>
      </Tooltip>
      <EnterAsAdminButton tenantId={tenantId} name={name} />
    </div>
  );
}

function ActionRow({
  tenantId,
  name,
  badges,
  meta,
  phone,
  testId,
}: {
  tenantId: string;
  name: string;
  badges: { label: string; tone: Tone }[];
  meta?: React.ReactNode;
  phone: string | null;
  testId?: string;
}) {
  return (
    <li className="flex items-start gap-2 py-2.5" data-testid={testId}>
      <div className="min-w-0 flex-1">
        <Link href={`/platform/tenants/${tenantId}`} className="block truncate text-sm font-semibold text-foreground underline-offset-4 hover:underline">
          {name}
        </Link>
        <div className="mt-1 flex flex-wrap items-center gap-1">
          {badges.map((b, i) => (
            <ToneBadge key={`${b.label}-${i}`} tone={b.tone}>{b.label}</ToneBadge>
          ))}
          {meta && <span className="text-xs text-muted-foreground">{meta}</span>}
        </div>
      </div>
      <RowActions tenantId={tenantId} name={name} phone={phone} />
    </li>
  );
}

function ColumnCard({
  title,
  description,
  count,
  icon,
  loading,
  empty,
  emptyText,
  children,
  id,
}: {
  title: string;
  description: string;
  count: number;
  icon: React.ReactNode;
  loading: boolean;
  empty: boolean;
  emptyText: string;
  children: React.ReactNode;
  id?: string;
}) {
  return (
    <Card id={id} className="gap-2 py-4" data-testid={id}>
      <CardHeader className="px-4">
        <CardTitle className="flex items-center gap-2 text-base">
          <span aria-hidden className="text-muted-foreground [&_svg]:size-4">{icon}</span>
          {title}
          {!loading && <span className="ml-auto text-xs font-semibold text-muted-foreground tabular-nums">{count}</span>}
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="px-4">
        {loading ? (
          <div className="flex flex-col gap-3" aria-busy="true">
            {[0, 1, 2].map((i) => <Skeleton key={i} className="h-12 w-full" />)}
          </div>
        ) : empty ? (
          <EmptyState compact title={emptyText} />
        ) : (
          <ul className="m-0 max-h-[32rem] list-none divide-y overflow-y-auto p-0">{children}</ul>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Página ──────────────────────────────────────────────────────────────────

const PlatformHoje: React.FC = () => {
  const [health, setHealth] = useState<HealthData | null | undefined>(undefined);
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [observatory, setObservatory] = useState<ObservatoryData | null>(null);
  const [subs, setSubs] = useState<SubscriptionItem[]>([]);
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activationOpen, setActivationOpen] = useState(false);

  const fetchHealth = useCallback(async () => {
    try {
      const res = await apiClient.get<HealthData>('/api/v1/platform/health');
      setHealth(res.data);
    } catch {
      setHealth(null);
    }
  }, []);

  const fetchData = useCallback(async () => {
    const results = await Promise.allSettled([
      apiClient.get<DashboardData>('/api/v1/platform/dashboard'),
      apiClient.get<ObservatoryData>('/api/v1/platform/tenant-observatory'),
      apiClient.get<SubscriptionItem[]>('/api/v1/platform/billing/subscriptions', { params: { limit: 1000 } }),
      apiClient.get<ConversationSummary[]>('/api/v1/platform/support-chat/conversations', { params: { status: 'open', limit: 200 } }),
    ]);
    const [d, o, s, c] = results;
    if (d.status === 'fulfilled') {
      setDashboard(d.value.data);
      setError(null);
    } else {
      setError(extractApiErrorMessage(d.reason, 'Erro ao carregar o painel'));
    }
    if (o.status === 'fulfilled') setObservatory(o.value.data);
    if (s.status === 'fulfilled') setSubs(Array.isArray(s.value.data) ? s.value.data : []);
    if (c.status === 'fulfilled') setConversations(Array.isArray(c.value.data) ? c.value.data : []);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await Promise.all([fetchHealth(), fetchData()]);
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [fetchHealth, fetchData]);

  useEffect(() => {
    const t = setInterval(() => {
      if (document.visibilityState === 'visible') fetchData();
    }, POLL_DATA_MS);
    return () => clearInterval(t);
  }, [fetchData]);

  useEffect(() => {
    const t = setInterval(() => {
      if (document.visibilityState === 'visible') fetchHealth();
    }, POLL_HEALTH_MS);
    return () => clearInterval(t);
  }, [fetchHealth]);

  // Nome e MRR por terreiro (erros do observatório só trazem o id).
  const nameById = useMemo(() => {
    const map: Record<string, string> = {};
    subs.forEach((s) => { map[s.tenant_id] = s.tenant_name; });
    observatory?.activation.tenants.forEach((t) => { map[t.tenant_id] = t.tenant_name; });
    observatory?.retention.forEach((t) => { map[t.tenant_id] = t.tenant_name; });
    conversations.forEach((c) => { map[c.tenant_id] = c.tenant_name; });
    return map;
  }, [subs, observatory, conversations]);

  const mrrById = useMemo(() => {
    const map: Record<string, number> = {};
    subs.forEach((s) => { map[s.tenant_id] = s.status === 'active' ? s.monthly_price : 0; });
    return map;
  }, [subs]);

  const contactList = useMemo(
    () => buildContactList(observatory?.activation.tenants ?? [], observatory?.retention ?? [], mrrById),
    [observatory, mrrById],
  );
  const changeList = useMemo(() => buildChangeList(subs), [subs]);
  const unreadConversations = useMemo(() => conversations.filter((c) => c.unread), [conversations]);
  const errors = observatory?.errors_by_tenant ?? [];

  const paying = useMemo(
    () => subs.filter((s) => s.status === 'active' && !s.is_trial && !s.is_bonus && s.monthly_price > 0).length,
    [subs],
  );
  const activatedThisMonth = useMemo(
    () => (observatory?.activation.tenants ?? []).filter((t) => t.stage === 'ativado' && (t.days_since_signup ?? 99) <= 30).length,
    [observatory],
  );

  const mrr = dashboard?.mrr ?? 0;
  const mrrPrev = dashboard?.mrr_prev_month ?? 0;
  const mrrDelta = mrrPrev > 0 ? ((mrr - mrrPrev) / mrrPrev) * 100 : null;
  const mrrDeltaLabel =
    mrrDelta === null ? 'Sem base do mês anterior' : `${mrrDelta >= 0 ? '+' : ''}${mrrDelta.toFixed(1)}% vs. mês anterior`;

  const mrrByPlan = useMemo(
    () =>
      PLAN_ORDER.map((key) => ({
        key,
        plan: PLAN_META[key].label,
        mrr: subs.filter((s) => s.status === 'active' && s.plan === key).reduce((acc, s) => acc + s.monthly_price, 0),
        color: PLAN_META[key].chartColor,
      })),
    [subs],
  );

  const funnel = useMemo(
    () =>
      STAGE_ORDER.map((stage) => ({
        stage,
        label: STAGE_META[stage].label,
        total: observatory?.activation.by_stage[stage] ?? 0,
        color: STAGE_META[stage].color,
      })),
    [observatory],
  );

  const alerts = dashboard?.alerts;
  const dbOk = health?.database.status === 'ok';
  const quebrouCount = (health === null ? 1 : health && !dbOk ? 1 : 0) + errors.length + unreadConversations.length;
  const tick = { fill: chartTokens.tick, fontSize: 11 } as const;

  return (
    <PlatformLayout title="Hoje">
      <PageHeader title="Hoje" subtitle="O que precisa da sua atenção agora: quem contatar, o que mudou e o que quebrou." />

      {error && (
        <Alert variant="destructive" className="mb-4">
          <AlertTriangle aria-hidden />
          <AlertTitle>Não foi possível carregar o painel</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {alerts && (alerts.inactive_tenants > 0 || alerts.no_activity_30d > 0) && (
        <div className="mb-4 grid gap-2 sm:grid-cols-2">
          {alerts.inactive_tenants > 0 && (
            <Alert variant="warning">
              <AlertTriangle aria-hidden />
              <AlertTitle>{plural(alerts.inactive_tenants, 'terreiro desativado', 'terreiros desativados')}</AlertTitle>
              <AlertDescription>
                Conta existe, acesso bloqueado.{' '}
                <Link href="/platform/tenants?status=inativo" className="font-semibold underline underline-offset-4">Ver terreiros</Link>
              </AlertDescription>
            </Alert>
          )}
          {alerts.no_activity_30d > 0 && (
            <Alert variant="warning">
              <Activity aria-hidden />
              <AlertTitle>{plural(alerts.no_activity_30d, 'terreiro', 'terreiros')} sem emitir senhas há 30 dias</AlertTitle>
              <AlertDescription>
                Risco de churn.{' '}
                <a href="#contatar" className="font-semibold underline underline-offset-4">Ver em Contatar</a>
              </AlertDescription>
            </Alert>
          )}
        </div>
      )}

      {/* KPIs */}
      <div data-tour="platform-kpis" className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard label="MRR" value={fmtMoney(mrr)} subtitle={mrrDeltaLabel} icon={<Wallet />} color="var(--primary)" loading={loading} />
        <KpiCard label="Pagantes" value={paying} subtitle="Assinaturas ativas pagas" icon={<Users />} color="var(--success)" loading={loading} />
        <KpiCard label="Em teste" value={dashboard?.tenants.trial ?? 0} subtitle="Trials ativos" icon={<FlaskConical />} color="var(--warning)" loading={loading} />
        <KpiCard label="Ativados no mês" value={activatedThisMonth} subtitle="Cadastros de 30 dias com 20+ senhas" icon={<Rocket />} color="var(--info)" loading={loading} />
      </div>

      {/* Três colunas */}
      <div className="mb-6 grid gap-4 lg:grid-cols-3">
        <ColumnCard
          id="contatar"
          title="Contatar"
          description="Trials acabando, ativação travada e risco de churn — por urgência e MRR."
          count={contactList.length}
          icon={<MessageCircle />}
          loading={loading}
          empty={contactList.length === 0}
          emptyText="Ninguém para contatar agora."
        >
          {contactList.map((item) => (
            <ActionRow
              key={item.tenantId}
              tenantId={item.tenantId}
              name={item.name}
              badges={item.reasons}
              meta={item.mrr > 0 ? `${fmtMoney(item.mrr)}/mês` : undefined}
              phone={item.phone}
              testId={`contatar-${item.tenantId}`}
            />
          ))}
        </ColumnCard>

        <ColumnCard
          id="mudou"
          title="Venceu ou mudou"
          description="Cancelamentos, suspensões, trials vencidos e bônus."
          count={changeList.length}
          icon={<Wallet />}
          loading={loading}
          empty={changeList.length === 0}
          emptyText="Nenhuma mudança de assinatura."
        >
          {changeList.map((item, i) => (
            <ActionRow
              key={`${item.tenantId}-${item.label}-${i}`}
              tenantId={item.tenantId}
              name={item.name}
              badges={[{ label: item.label, tone: item.tone }]}
              meta={item.mrr > 0 ? `${fmtMoney(item.mrr)}/mês` : undefined}
              phone={null}
            />
          ))}
        </ColumnCard>

        <Card id="quebrou" className="gap-2 py-4" data-testid="quebrou">
          <CardHeader className="px-4">
            <CardTitle className="flex items-center gap-2 text-base">
              <AlertTriangle aria-hidden className="size-4 text-muted-foreground" />
              Quebrou
              {!loading && <span className="ml-auto text-xs font-semibold text-muted-foreground tabular-nums">{quebrouCount}</span>}
            </CardTitle>
            <CardDescription>Saúde dos serviços, erros por terreiro e suporte não lido.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4 px-4">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border bg-muted/40 px-3 py-2" aria-label="Saúde dos serviços">
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                <Database className="size-3.5" aria-hidden /> Banco
              </span>
              {health === undefined ? (
                <Skeleton className="h-4 w-16" />
              ) : health === null ? (
                <StatusDot ok={false} label="Sem resposta" />
              ) : (
                <>
                  <StatusDot ok={dbOk} label={dbOk ? 'OK' : 'Erro'} />
                  <span className="font-mono text-xs text-muted-foreground">{health.database.latency_ms} ms</span>
                </>
              )}
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                <Wifi className="size-3.5" aria-hidden /> API
              </span>
              {health === undefined ? <Skeleton className="h-4 w-16" /> : <StatusDot ok={health !== null} label={health ? 'Online' : 'Fora do ar'} />}
            </div>

            <section aria-labelledby="erros-title">
              <h3 id="erros-title" className="mb-1.5 text-xs font-bold tracking-wide text-muted-foreground uppercase">
                Erros (últimos {observatory?.error_window_minutes ?? 60} min)
              </h3>
              {loading ? (
                <Skeleton className="h-10 w-full" />
              ) : errors.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhum erro na janela.</p>
              ) : (
                <ul className="m-0 list-none divide-y p-0">
                  {errors.map((e) => {
                    const name = e.tenant_id ? (nameById[e.tenant_id] ?? `Terreiro ${e.tenant_id.slice(0, 8)}…`) : 'Público (sem terreiro)';
                    const top = e.top_endpoints[0];
                    return (
                      <li key={e.tenant_id ?? 'anon'} className="flex items-start gap-2 py-2">
                        <div className="min-w-0 flex-1">
                          {e.tenant_id ? (
                            <Link href={`/platform/tenants/${e.tenant_id}`} className="block truncate text-sm font-semibold underline-offset-4 hover:underline">{name}</Link>
                          ) : (
                            <span className="block truncate text-sm font-semibold">{name}</span>
                          )}
                          {top && <span className="block truncate font-mono text-xs text-muted-foreground">{top.endpoint} ×{top.count}</span>}
                        </div>
                        <ToneBadge tone="destructive">{plural(e.total_erros, 'erro')}</ToneBadge>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>

            <section aria-labelledby="suporte-title">
              <h3 id="suporte-title" className="mb-1.5 text-xs font-bold tracking-wide text-muted-foreground uppercase">Suporte não lido</h3>
              {loading ? (
                <Skeleton className="h-10 w-full" />
              ) : unreadConversations.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhuma mensagem aguardando resposta.</p>
              ) : (
                <ul className="m-0 list-none divide-y p-0">
                  {unreadConversations.map((c) => (
                    <li key={c.id} className="py-2">
                      <Link href={`/platform/suporte?conversation=${c.id}`} className="block rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring/50">
                        <span className="block truncate text-sm font-semibold">{c.tenant_name}</span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {c.owner_name_snapshot}{c.last_message_preview ? ` — ${c.last_message_preview}` : ''}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </CardContent>
        </Card>
      </div>

      {/* Gráficos */}
      <div className="mb-6 grid gap-4 lg:grid-cols-2">
        <ChartCard
          title="MRR por plano"
          subtitle={`${fmtMoney(mrr)} · ${mrrDeltaLabel}`}
          loading={loading}
          empty={!subs.length}
          height={220}
          actions={
            mrrDelta !== null ? (
              <ToneBadge tone={mrrDelta >= 0 ? 'success' : 'destructive'}>{mrrDelta >= 0 ? '▲' : '▼'} {Math.abs(mrrDelta).toFixed(1)}%</ToneBadge>
            ) : undefined
          }
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={mrrByPlan} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
              <CartesianGrid stroke={chartTokens.grid} vertical={false} />
              <XAxis dataKey="plan" tick={tick} axisLine={false} tickLine={false} />
              <YAxis tick={tick} axisLine={false} tickLine={false} tickFormatter={(v: number) => `R$${Math.round(v)}`} />
              <RechartsTooltip content={<ChartTooltip formatter={(v) => fmtMoney(Number(v))} />} cursor={{ fill: 'var(--accent)' }} />
              <Bar dataKey="mrr" name="MRR" radius={[6, 6, 0, 0]}>
                {mrrByPlan.map((d) => <Cell key={d.key} fill={d.color} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard
          title="Funil de ativação"
          subtitle={`Cadastros dos últimos ${observatory?.activation.window_days ?? 60} dias por estágio`}
          loading={loading}
          empty={!observatory || observatory.activation.total === 0}
          height={220}
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={funnel} layout="vertical" margin={{ top: 0, right: 16, left: 8, bottom: 0 }}>
              <CartesianGrid stroke={chartTokens.grid} horizontal={false} />
              <XAxis type="number" allowDecimals={false} tick={tick} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="label" width={130} tick={tick} axisLine={false} tickLine={false} />
              <RechartsTooltip content={<ChartTooltip />} cursor={{ fill: 'var(--accent)' }} />
              <Bar dataKey="total" name="Terreiros" radius={[0, 6, 6, 0]}>
                {funnel.map((d) => <Cell key={d.stage} fill={d.color} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* Ativação detalhada */}
      <Collapsible open={activationOpen} onOpenChange={setActivationOpen}>
        <Card className="gap-2 py-4">
          <CardHeader className="px-4">
            <CollapsibleTrigger asChild>
              <button type="button" className="flex w-full items-center gap-2 rounded-md text-left outline-none focus-visible:ring-2 focus-visible:ring-ring/50" aria-expanded={activationOpen}>
                <CardTitle className="text-base">Ativação dos cadastros recentes</CardTitle>
                <span className="text-xs text-muted-foreground">
                  {observatory ? `${plural(observatory.activation.total, 'cadastro')} em ${observatory.activation.window_days} dias` : ''}
                </span>
                <ChevronDown aria-hidden className={cn('ml-auto size-4 text-muted-foreground transition-transform', activationOpen && 'rotate-180')} />
              </button>
            </CollapsibleTrigger>
            <CardDescription>Estágio de cada terreiro novo, trial, e-mails de onboarding e contato do responsável.</CardDescription>
          </CardHeader>
          <CollapsibleContent>
            <CardContent className="px-4">
              {observatory ? <ActivationSection data={observatory.activation} /> : <Skeleton className="h-24 w-full" />}
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>
    </PlatformLayout>
  );
};

export default PlatformHoje;
