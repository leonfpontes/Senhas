/**
 * /platform/tenants — Terreiros + Assinaturas (antigo /platform/billing) em abas.
 *
 * Aba Terreiros: `DataTable` com paginação no servidor (`GET /api/v1/platform/tenants?skip&limit
 * &is_active`), enriquecida com a assinatura (`GET /billing/subscriptions`) para MRR, fim do trial e
 * bônus. Busca e facetas de plano/trial/bônus não existem no servidor (o `/tenants/search` fica à
 * sombra de `/tenants/{tenant_id}`), então, com qualquer uma delas ativa, a lista completa é
 * carregada uma vez (limit=1000) e filtrada/paginada no cliente.
 *
 * Aba Assinaturas: KPIs de `GET /billing/statistics/summary` e tabela ordenável por "Trial termina"
 * e "Renova em".
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import { Building2, CreditCard, FlaskConical, LogIn, MoreHorizontal, Plus, RefreshCw, Search, Trash2, TrendingUp, Users, Wallet } from 'lucide-react';
import { toast } from 'sonner';
import { apiClient, extractApiErrorMessage } from '@/services/api_client';
import PlatformLayout from './layout';
import CrudDrawer from '@/components/CrudDrawer';
import { DataTable, type ColumnDef, type PaginationState, type SortingState } from '@/components/admin/DataTable';
import { KpiCard } from '@/components/admin/KpiCard';
import { PageHeader } from '@/components/admin/PageHeader';
import { TextField } from '@/components/fields';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button, buttonVariants } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  PlanBadge,
  SubscriptionStatusBadge,
  TenantActiveBadge,
  ToneBadge,
  PLAN_META,
  PLAN_ORDER,
  planLabel,
  daysUntil,
  fmtDate,
  fmtMoney,
  impersonateTenantAdmin,
} from '@/components/platform';
import { SubscriptionDrawer, type SubscriptionDrawerTenant } from '@/components/platform/SubscriptionDrawer';

// ─── Tipos (contratos do backend) ────────────────────────────────────────────

interface Tenant {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  plan: string | null;
  subscription_status: string | null;
  is_bonus: boolean | null;
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

interface BillingStats {
  active_tenants: number;
  trial_tenants: number;
  suspended_tenants: number;
  mrr: number;
  plan_distribution: Record<string, number>;
}

interface RetentionLite {
  tenant_id: string;
  last_ticket_at: string | null;
  never_emitted: boolean;
  days_inactive: number;
}

interface ActivationLite {
  tenant_id: string;
  last_activity_at: string | null;
  days_since_signup: number | null;
}

/** Linha da tabela: tenant + assinatura + atividade. */
export interface TenantRow extends Tenant {
  mrr: number;
  is_trial: boolean;
  trial_ends_at: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  /** Texto pronto de "última atividade" (ver `lastActivityLabel`). */
  last_activity: string;
}

type YesNo = 'all' | 'sim' | 'nao';
type StatusFilter = 'all' | 'ativo' | 'inativo';

export const PAGE_SIZE = 20;
const ALL_LIMIT = 1000;

/**
 * Última atividade sem endpoint dedicado: ativação (cadastros de 60 dias) traz `last_activity_at`;
 * a retenção lista todo terreiro ativo há mais de 15 dias sem emitir senha (ou que nunca emitiu);
 * quem não está em nenhuma das duas emitiu nos últimos 15 dias.
 */
export function lastActivityLabel(
  t: Tenant,
  activation: ActivationLite | undefined,
  retention: RetentionLite | undefined,
  loaded: boolean,
): string {
  if (!loaded) return '…';
  if (activation?.last_activity_at) return fmtDate(activation.last_activity_at);
  if (retention) return retention.never_emitted ? 'Nunca emitiu' : `${fmtDate(retention.last_ticket_at)} (${retention.days_inactive}d)`;
  if (!t.is_active) return '—';
  if (activation) return 'Sem atividade';
  return 'Últimos 15 dias';
}

function parseYesNo(v: unknown): YesNo {
  return v === 'sim' || v === 'nao' ? v : 'all';
}

// ─── Página ──────────────────────────────────────────────────────────────────

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const EMPTY_CREATE = { slug: '', name: '', email_admin: '', plan: 'basic' };

const TenantsPage: React.FC = () => {
  const router = useRouter();
  const tab = router.query.tab === 'assinaturas' ? 'assinaturas' : 'terreiros';

  // ── Filtros (facetas) ──
  const [search, setSearch] = useState('');
  const [plan, setPlan] = useState<string>('all');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [trial, setTrial] = useState<YesNo>('all');
  const [bonus, setBonus] = useState<YesNo>('all');

  useEffect(() => {
    if (!router.isReady) return;
    const q = router.query;
    if (q.status === 'ativo' || q.status === 'inativo') setStatus(q.status);
    if (typeof q.plan === 'string' && q.plan in PLAN_META) setPlan(q.plan);
    setTrial(parseYesNo(q.trial));
    setBonus(parseYesNo(q.bonus));
    if (typeof q.q === 'string') setSearch(q.q);
  }, [router.isReady, router.query]);

  const clientMode = search.trim().length > 0 || plan !== 'all' || trial !== 'all' || bonus !== 'all';

  // ── Dados ──
  const [pageRows, setPageRows] = useState<Tenant[]>([]);
  const [pageHasMore, setPageHasMore] = useState(false);
  const [allRows, setAllRows] = useState<Tenant[] | null>(null);
  const [subs, setSubs] = useState<SubscriptionItem[] | null>(null);
  const [stats, setStats] = useState<BillingStats | null>(null);
  const [activity, setActivity] = useState<{ activation: Record<string, ActivationLite>; retention: Record<string, RetentionLite> } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: PAGE_SIZE });
  const [reloadKey, setReloadKey] = useState(0);

  const isActiveParam = status === 'all' ? undefined : status === 'ativo';

  // Página do servidor (modo padrão). Pede uma linha a mais para saber se há próxima página.
  useEffect(() => {
    if (clientMode) return;
    let cancelled = false;
    setLoading(true);
    const params: Record<string, string | number | boolean> = { skip: pagination.pageIndex * pagination.pageSize, limit: pagination.pageSize + 1 };
    if (isActiveParam !== undefined) params.is_active = isActiveParam;
    apiClient
      .get<Tenant[]>('/api/v1/platform/tenants', { params })
      .then((res) => {
        if (cancelled) return;
        const data = Array.isArray(res.data) ? res.data : [];
        setPageHasMore(data.length > pagination.pageSize);
        setPageRows(data.slice(0, pagination.pageSize));
        setError(null);
      })
      .catch((err) => {
        if (!cancelled) setError(extractApiErrorMessage(err, 'Erro ao carregar terreiros'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [clientMode, pagination.pageIndex, pagination.pageSize, isActiveParam, reloadKey]);

  // Lista completa (busca/facetas no cliente).
  useEffect(() => {
    if (!clientMode) return;
    let cancelled = false;
    setLoading(true);
    const params: Record<string, string | number | boolean> = { skip: 0, limit: ALL_LIMIT };
    if (isActiveParam !== undefined) params.is_active = isActiveParam;
    apiClient
      .get<Tenant[]>('/api/v1/platform/tenants', { params })
      .then((res) => {
        if (cancelled) return;
        setAllRows(Array.isArray(res.data) ? res.data : []);
        setError(null);
      })
      .catch((err) => {
        if (!cancelled) setError(extractApiErrorMessage(err, 'Erro ao carregar terreiros'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [clientMode, isActiveParam, reloadKey]);

  // Assinaturas + estatísticas (uma vez; alimentam MRR/trial das duas abas).
  const loadBilling = useCallback(async () => {
    const [s, st] = await Promise.allSettled([
      apiClient.get<SubscriptionItem[]>('/api/v1/platform/billing/subscriptions', { params: { limit: ALL_LIMIT } }),
      apiClient.get<BillingStats>('/api/v1/platform/billing/statistics/summary'),
    ]);
    if (s.status === 'fulfilled') setSubs(Array.isArray(s.value.data) ? s.value.data : []);
    else setSubs([]);
    if (st.status === 'fulfilled') setStats(st.value.data);
  }, []);

  useEffect(() => {
    loadBilling();
  }, [loadBilling, reloadKey]);

  // Atividade (observatório) — não bloqueia a tabela.
  useEffect(() => {
    let cancelled = false;
    apiClient
      .get<{ activation: { tenants: ActivationLite[] }; retention: RetentionLite[] }>('/api/v1/platform/tenant-observatory')
      .then((res) => {
        if (cancelled) return;
        const activation: Record<string, ActivationLite> = {};
        const retention: Record<string, RetentionLite> = {};
        (res.data.activation?.tenants ?? []).forEach((t) => { activation[t.tenant_id] = t; });
        (res.data.retention ?? []).forEach((t) => { retention[t.tenant_id] = t; });
        setActivity({ activation, retention });
      })
      .catch(() => {
        if (!cancelled) setActivity({ activation: {}, retention: {} });
      });
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  const subsById = useMemo(() => {
    const map: Record<string, SubscriptionItem> = {};
    (subs ?? []).forEach((s) => { map[s.tenant_id] = s; });
    return map;
  }, [subs]);

  const enrich = useCallback(
    (t: Tenant): TenantRow => {
      const s = subsById[t.id];
      return {
        ...t,
        plan: t.plan ?? s?.plan ?? null,
        subscription_status: t.subscription_status ?? s?.status ?? null,
        is_bonus: t.is_bonus ?? s?.is_bonus ?? null,
        mrr: s?.status === 'active' ? s.monthly_price : 0,
        is_trial: s?.is_trial ?? false,
        trial_ends_at: s?.trial_ends_at ?? null,
        current_period_end: s?.current_period_end ?? null,
        cancel_at_period_end: s?.cancel_at_period_end ?? false,
        last_activity: lastActivityLabel(t, activity?.activation[t.id], activity?.retention[t.id], activity !== null),
      };
    },
    [subsById, activity],
  );

  const filteredAll = useMemo(() => {
    if (!clientMode) return [];
    const q = search.trim().toLowerCase();
    return (allRows ?? [])
      .map(enrich)
      .filter((t) => {
        if (q && !t.name.toLowerCase().includes(q) && !t.slug.toLowerCase().includes(q)) return false;
        if (plan !== 'all' && (t.plan ?? '') !== plan) return false;
        if (trial !== 'all' && t.is_trial !== (trial === 'sim')) return false;
        if (bonus !== 'all' && Boolean(t.is_bonus) !== (bonus === 'sim')) return false;
        return true;
      });
  }, [clientMode, allRows, enrich, search, plan, trial, bonus]);

  const rows: TenantRow[] = useMemo(() => (clientMode ? filteredAll : pageRows.map(enrich)), [clientMode, filteredAll, pageRows, enrich]);

  // Total para o rodapé: no modo servidor não há contagem — "há mais" vira +1 página.
  const serverRowCount = pagination.pageIndex * pagination.pageSize + pageRows.length + (pageHasMore ? 1 : 0);

  useEffect(() => {
    // Qualquer mudança de filtro volta para a primeira página.
    setPagination((p) => (p.pageIndex === 0 ? p : { ...p, pageIndex: 0 }));
  }, [search, plan, status, trial, bonus]);

  const refresh = () => setReloadKey((k) => k + 1);

  // ── Ações de linha ──
  const [subTenant, setSubTenant] = useState<SubscriptionDrawerTenant | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Tenant | null>(null);
  const [deleteSlug, setDeleteSlug] = useState('');
  const [deleteConfirmed, setDeleteConfirmed] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const enterAsAdmin = async (t: Tenant) => {
    try {
      await impersonateTenantAdmin(t.id);
    } catch (err) {
      toast.error(extractApiErrorMessage(err, err instanceof Error ? err.message : 'Erro ao entrar como admin'));
    }
  };

  const openDelete = (t: Tenant) => {
    setDeleteTarget(t);
    setDeleteSlug('');
    setDeleteConfirmed(false);
    setDeleteError(null);
  };

  const confirmDelete = async () => {
    if (!deleteTarget || !deleteConfirmed || deleteSlug !== deleteTarget.slug) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await apiClient.delete(`/api/v1/platform/tenants/${deleteTarget.id}`, { data: { confirm_slug: deleteSlug } });
      toast.success(`Terreiro "${deleteTarget.name}" excluído permanentemente.`);
      setDeleteTarget(null);
      refresh();
    } catch (err) {
      setDeleteError(extractApiErrorMessage(err, 'Erro ao excluir terreiro'));
    } finally {
      setDeleting(false);
    }
  };

  // ── Novo terreiro ──
  const [createOpen, setCreateOpen] = useState(false);
  const [createData, setCreateData] = useState(EMPTY_CREATE);
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const createValid = createData.slug.trim().length > 0 && createData.name.trim().length > 0 && EMAIL_RE.test(createData.email_admin);
  const createDirty = createData.slug !== '' || createData.name !== '' || createData.email_admin !== '' || createData.plan !== 'basic';

  const handleCreate = async () => {
    setSaving(true);
    setCreateError(null);
    try {
      await apiClient.post('/api/v1/platform/tenants', createData);
      toast.success('Terreiro criado com sucesso.');
      setCreateOpen(false);
      setCreateData(EMPTY_CREATE);
      refresh();
    } catch (err) {
      setCreateError(extractApiErrorMessage(err, 'Erro ao criar terreiro'));
    } finally {
      setSaving(false);
    }
  };

  // ── Colunas ──
  const columns = useMemo<ColumnDef<TenantRow>[]>(
    () => [
      {
        id: 'name',
        accessorKey: 'name',
        header: 'Terreiro',
        meta: { mobile: true },
        cell: ({ row }) => (
          <span className="flex flex-col">
            <span className="font-medium">{row.original.name}</span>
            <span className="font-mono text-xs text-muted-foreground">{row.original.slug}</span>
          </span>
        ),
      },
      {
        id: 'status',
        accessorFn: (t) => (t.is_active ? 'ativo' : 'inativo'),
        header: 'Status',
        meta: { mobile: true },
        cell: ({ row }) => (
          <span className="flex flex-wrap items-center gap-1">
            <TenantActiveBadge active={row.original.is_active} />
            {row.original.subscription_status && row.original.subscription_status !== 'active' && (
              <SubscriptionStatusBadge status={row.original.subscription_status} />
            )}
          </span>
        ),
      },
      {
        id: 'plan',
        accessorKey: 'plan',
        header: 'Plano',
        meta: { mobile: true },
        cell: ({ row }) => <PlanBadge plan={row.original.plan} bonus={row.original.is_bonus} />,
      },
      {
        id: 'trial_ends_at',
        accessorKey: 'trial_ends_at',
        header: 'Fim do trial',
        meta: { mobile: true, cellClassName: 'whitespace-nowrap' },
        cell: ({ row }) => {
          const t = row.original;
          if (!t.is_trial || !t.trial_ends_at) return <span className="text-muted-foreground">—</span>;
          const days = daysUntil(t.trial_ends_at) ?? 0;
          return (
            <ToneBadge tone={days < 0 ? 'destructive' : days <= 7 ? 'warning' : 'muted'}>
              {days < 0 ? `Venceu ${fmtDate(t.trial_ends_at)}` : `${fmtDate(t.trial_ends_at)} (${days}d)`}
            </ToneBadge>
          );
        },
      },
      {
        id: 'mrr',
        accessorKey: 'mrr',
        header: 'MRR',
        meta: { align: 'right', mobile: true, cellClassName: 'tabular-nums font-semibold whitespace-nowrap' },
        cell: ({ row }) => (row.original.mrr > 0 ? fmtMoney(row.original.mrr) : <span className="font-normal text-muted-foreground">—</span>),
      },
      {
        id: 'last_activity',
        accessorKey: 'last_activity',
        header: 'Última atividade',
        enableSorting: false,
        meta: { mobile: true, cellClassName: 'whitespace-nowrap text-muted-foreground' },
      },
      {
        id: 'actions',
        header: '',
        enableSorting: false,
        meta: { align: 'right', width: 48 },
        cell: ({ row }) => {
          const t = row.original;
          return (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon-sm" aria-label={`Ações de ${t.name}`} onClick={(e) => e.stopPropagation()}>
                  <MoreHorizontal />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                <DropdownMenuItem onSelect={() => router.push(`/platform/tenants/${t.id}`)}>
                  <Building2 /> Abrir
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => enterAsAdmin(t)}>
                  <LogIn /> Entrar como admin
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => setSubTenant({ id: t.id, name: t.name, plan: t.plan, is_bonus: t.is_bonus })}>
                  <CreditCard /> Assinatura
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive" onSelect={() => openDelete(t)}>
                  <Trash2 /> Excluir permanentemente
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          );
        },
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [router],
  );

  // ── Aba Assinaturas ──
  const [subSorting, setSubSorting] = useState<SortingState>([{ id: 'monthly_price', desc: true }]);
  const [subSearch, setSubSearch] = useState('');
  const subRows = useMemo(() => {
    const q = subSearch.trim().toLowerCase();
    return (subs ?? []).filter((s) => !q || s.tenant_name.toLowerCase().includes(q) || s.tenant_slug.toLowerCase().includes(q));
  }, [subs, subSearch]);

  const subColumns = useMemo<ColumnDef<SubscriptionItem>[]>(
    () => [
      {
        id: 'tenant_name',
        accessorKey: 'tenant_name',
        header: 'Terreiro',
        meta: { mobile: true },
        cell: ({ row }) => (
          <span className="flex flex-col">
            <span className="font-medium">{row.original.tenant_name}</span>
            <span className="font-mono text-xs text-muted-foreground">{row.original.tenant_slug}</span>
          </span>
        ),
      },
      { id: 'plan', accessorKey: 'plan', header: 'Plano', meta: { mobile: true }, cell: ({ row }) => <PlanBadge plan={row.original.plan} bonus={row.original.is_bonus} /> },
      { id: 'status', accessorKey: 'status', header: 'Status', meta: { mobile: true }, cell: ({ row }) => <SubscriptionStatusBadge status={row.original.status} /> },
      {
        id: 'monthly_price',
        accessorKey: 'monthly_price',
        header: 'MRR',
        meta: { align: 'right', mobile: true, cellClassName: 'tabular-nums font-semibold whitespace-nowrap' },
        cell: ({ row }) => fmtMoney(row.original.monthly_price),
      },
      {
        id: 'users',
        accessorFn: (s) => s.current_users,
        header: 'Usuários',
        meta: { align: 'center' },
        cell: ({ row }) => (
          <span className="tabular-nums">
            {row.original.current_users}
            <span className="text-xs text-muted-foreground">/{row.original.max_users >= 99999 ? '∞' : row.original.max_users}</span>
          </span>
        ),
      },
      {
        id: 'trial_ends_at',
        accessorFn: (s) => (s.is_trial ? s.trial_ends_at ?? '' : ''),
        header: 'Trial termina',
        meta: { mobile: true, cellClassName: 'whitespace-nowrap' },
        sortUndefined: 'last',
        cell: ({ row }) => (row.original.is_trial ? fmtDate(row.original.trial_ends_at) : <span className="text-muted-foreground">—</span>),
      },
      {
        id: 'current_period_end',
        accessorFn: (s) => s.current_period_end ?? '',
        header: 'Renova em',
        meta: { mobile: true, cellClassName: 'whitespace-nowrap' },
        cell: ({ row }) => (
          <span className="flex items-center gap-1">
            {fmtDate(row.original.current_period_end)}
            {row.original.cancel_at_period_end && <ToneBadge tone="destructive">Cancela</ToneBadge>}
          </span>
        ),
      },
    ],
    [],
  );

  const activeFacets = [plan !== 'all', status !== 'all', trial !== 'all', bonus !== 'all', search.trim() !== ''].filter(Boolean).length;

  return (
    <PlatformLayout title="Terreiros">
      <div data-tour="tenants-header">
        <PageHeader
          title="Terreiros"
          subtitle="Todos os terreiros da plataforma e suas assinaturas."
          actions={
            <>
              <Button variant="outline" size="sm" onClick={refresh} disabled={loading}>
                <RefreshCw className={loading ? 'animate-spin' : undefined} /> Atualizar
              </Button>
              <Button size="sm" data-tour="tenants-novo" onClick={() => { setCreateData(EMPTY_CREATE); setTouched({}); setCreateError(null); setCreateOpen(true); }}>
                <Plus /> Novo terreiro
              </Button>
            </>
          }
        />
      </div>

      {error && (
        <Alert variant="destructive" className="mb-4">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Tabs value={tab} onValueChange={(v) => router.replace({ pathname: '/platform/tenants', query: v === 'assinaturas' ? { tab: v } : {} }, undefined, { shallow: true })}>
        <TabsList className="mb-4">
          <TabsTrigger value="terreiros"><Building2 /> Terreiros</TabsTrigger>
          <TabsTrigger value="assinaturas"><CreditCard /> Assinaturas</TabsTrigger>
        </TabsList>

        <TabsContent value="terreiros">
          <div className="mb-3 flex flex-col gap-2 md:flex-row md:flex-wrap md:items-end" role="search" aria-label="Filtros de terreiros">
            <TextField
              label="Buscar"
              placeholder="Nome ou slug"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              size="small"
              className="md:w-64"
              startAdornment={<Search className="size-4 text-muted-foreground" aria-hidden />}
            />
            <FacetSelect id="f-plan" label="Plano" value={plan} onChange={setPlan} options={[{ value: 'all', label: 'Todos' }, ...PLAN_ORDER.map((k) => ({ value: k, label: PLAN_META[k].label }))]} />
            <FacetSelect id="f-status" label="Status" value={status} onChange={(v) => setStatus(v as StatusFilter)} options={[{ value: 'all', label: 'Todos' }, { value: 'ativo', label: 'Ativo' }, { value: 'inativo', label: 'Desativado' }]} />
            <FacetSelect id="f-trial" label="Trial" value={trial} onChange={(v) => setTrial(v as YesNo)} options={[{ value: 'all', label: 'Todos' }, { value: 'sim', label: 'Em trial' }, { value: 'nao', label: 'Sem trial' }]} />
            <FacetSelect id="f-bonus" label="Bônus" value={bonus} onChange={(v) => setBonus(v as YesNo)} options={[{ value: 'all', label: 'Todos' }, { value: 'sim', label: 'Bonificados' }, { value: 'nao', label: 'Sem bônus' }]} />
            {activeFacets > 0 && (
              <Button variant="ghost" size="sm" onClick={() => { setSearch(''); setPlan('all'); setStatus('all'); setTrial('all'); setBonus('all'); }}>
                Limpar filtros ({activeFacets})
              </Button>
            )}
          </div>

          <div data-tour="tenants-tabela" className="rounded-xl border bg-card">
            {clientMode ? (
              <DataTable
                columns={columns}
                data={rows}
                getRowId={(t) => t.id}
                loading={loading || subs === null}
                pageSize={PAGE_SIZE}
                onRowClick={(t) => router.push(`/platform/tenants/${t.id}`)}
                emptyMessage="Nenhum terreiro com esses filtros."
                emptyIcon={<Building2 />}
                data-testid="tenants-table"
              />
            ) : (
              <DataTable
                columns={columns}
                data={rows}
                getRowId={(t) => t.id}
                loading={loading || subs === null}
                manualPagination
                pagination={pagination}
                onPaginationChange={setPagination}
                rowCount={serverRowCount}
                onRowClick={(t) => router.push(`/platform/tenants/${t.id}`)}
                emptyMessage="Nenhum terreiro cadastrado."
                emptyIcon={<Building2 />}
                data-testid="tenants-table"
              />
            )}
          </div>
          {!clientMode && pageHasMore && (
            <p className="mt-2 text-xs text-muted-foreground">O total exato não é informado pelo servidor; a paginação avança enquanto houver resultados.</p>
          )}
        </TabsContent>

        <TabsContent value="assinaturas">
          <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <KpiCard label="MRR" value={stats ? fmtMoney(stats.mrr) : '—'} subtitle="Receita mensal recorrente" icon={<TrendingUp />} color="var(--primary)" loading={stats === null && subs === null} />
            <KpiCard label="Assinaturas ativas" value={stats?.active_tenants ?? '—'} icon={<Users />} color="var(--success)" loading={stats === null && subs === null} />
            <KpiCard label="Em trial" value={stats?.trial_tenants ?? '—'} icon={<FlaskConical />} color="var(--warning)" loading={stats === null && subs === null} />
            <KpiCard label="Suspensas / canceladas" value={stats?.suspended_tenants ?? '—'} icon={<Wallet />} color="var(--destructive)" loading={stats === null && subs === null} />
          </div>

          {stats && (
            <div className="mb-4 flex flex-wrap items-center gap-1.5 text-xs">
              <span className="mr-1 font-bold tracking-wide text-muted-foreground uppercase">Planos</span>
              {PLAN_ORDER.map((k) => (
                <span key={k} className="inline-flex items-center gap-1">
                  <PlanBadge plan={k} />
                  <span className="font-semibold tabular-nums">{stats.plan_distribution[k] ?? 0}</span>
                </span>
              ))}
            </div>
          )}

          <div className="mb-3 md:w-72">
            <TextField
              label="Buscar assinatura"
              placeholder="Nome ou slug"
              value={subSearch}
              onChange={(e) => setSubSearch(e.target.value)}
              size="small"
              startAdornment={<Search className="size-4 text-muted-foreground" aria-hidden />}
            />
          </div>
          <div className="rounded-xl border bg-card">
            <DataTable
              columns={subColumns}
              data={subRows}
              getRowId={(s) => s.tenant_id}
              loading={subs === null}
              pageSize={PAGE_SIZE}
              sorting={subSorting}
              onSortingChange={setSubSorting}
              onRowClick={(s) => router.push(`/platform/tenants/${s.tenant_id}?tab=assinatura`)}
              emptyMessage={subSearch ? 'Nenhum resultado para a busca.' : 'Nenhuma assinatura encontrada.'}
              emptyIcon={<CreditCard />}
              data-testid="subscriptions-table"
            />
          </div>
        </TabsContent>
      </Tabs>

      {/* Drawer: assinatura */}
      <SubscriptionDrawer
        open={subTenant !== null}
        tenant={subTenant}
        onClose={() => setSubTenant(null)}
        onSaved={(msg) => { toast.success(msg); refresh(); }}
      />

      {/* Drawer: novo terreiro */}
      <CrudDrawer
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Novo terreiro"
        subtitle="Cria o terreiro, o admin inicial e a assinatura."
        icon={<Building2 />}
        onSave={handleCreate}
        saveLabel="Criar"
        saving={saving}
        saveDisabled={!createValid}
        isDirty={createDirty}
        error={createError}
      >
        <TextField
          label="Slug"
          required
          placeholder="casa-de-pai-joao"
          value={createData.slug}
          onChange={(e) => setCreateData({ ...createData, slug: e.target.value })}
          onBlur={() => setTouched((p) => ({ ...p, slug: true }))}
          error={touched.slug && !createData.slug.trim() ? 'Slug obrigatório' : undefined}
          helperText="Identificador único na URL"
        />
        <TextField
          label="Nome"
          required
          value={createData.name}
          onChange={(e) => setCreateData({ ...createData, name: e.target.value })}
          onBlur={() => setTouched((p) => ({ ...p, name: true }))}
          error={touched.name && !createData.name.trim() ? 'Nome obrigatório' : undefined}
        />
        <TextField
          label="E-mail do admin"
          type="email"
          required
          value={createData.email_admin}
          onChange={(e) => setCreateData({ ...createData, email_admin: e.target.value })}
          onBlur={() => setTouched((p) => ({ ...p, email_admin: true }))}
          error={touched.email_admin && !EMAIL_RE.test(createData.email_admin) ? 'E-mail inválido' : undefined}
        />
        <div className="grid gap-1.5">
          <Label htmlFor="create-plan">Plano</Label>
          <Select value={createData.plan} onValueChange={(v) => setCreateData({ ...createData, plan: v })}>
            <SelectTrigger id="create-plan" className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              {(['basic', 'pro', 'premium'] as const).map((k) => (
                <SelectItem key={k} value={k}>{planLabel(k)} — {fmtMoney(PLAN_META[k].price)}/mês</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CrudDrawer>

      {/* Exclusão permanente */}
      <AlertDialog open={deleteTarget !== null} onOpenChange={(o) => !o && !deleting && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-destructive">Excluir terreiro permanentemente</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 text-sm text-muted-foreground">
                <p>
                  Esta ação <strong>não pode ser desfeita</strong>. Usuários, giras, senhas, médiuns, estoque e dados de{' '}
                  <strong className="text-foreground">{deleteTarget?.name}</strong> serão removidos.
                </p>
                <TextField
                  label={`Digite o slug "${deleteTarget?.slug ?? ''}" para confirmar`}
                  value={deleteSlug}
                  onChange={(e) => setDeleteSlug(e.target.value)}
                  disabled={deleting}
                  autoComplete="off"
                  error={deleteSlug.length > 0 && deleteSlug !== deleteTarget?.slug ? 'Slug não corresponde' : undefined}
                />
                <label className="flex items-start gap-2 text-sm text-foreground">
                  <Checkbox checked={deleteConfirmed} onCheckedChange={(v) => setDeleteConfirmed(v === true)} disabled={deleting} className="mt-0.5" />
                  Entendo que todos os dados serão removidos permanentemente.
                </label>
                {deleteError && (
                  <Alert variant="destructive"><AlertDescription>{deleteError}</AlertDescription></Alert>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className={buttonVariants({ variant: 'destructive' })}
              disabled={deleting || !deleteConfirmed || deleteSlug !== deleteTarget?.slug}
              onClick={(e) => { e.preventDefault(); confirmDelete(); }}
            >
              {deleting ? 'Excluindo…' : 'Excluir permanentemente'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PlatformLayout>
  );
};

function FacetSelect({ id, label, value, onChange, options }: { id: string; label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  return (
    <div className="grid gap-1 md:w-40">
      <Label htmlFor={id} className="text-xs text-muted-foreground">{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger id={id} size="sm" className="w-full"><SelectValue /></SelectTrigger>
        <SelectContent>
          {options.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );
}

export default TenantsPage;
