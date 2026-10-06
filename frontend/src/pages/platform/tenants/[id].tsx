/**
 * /platform/tenants/[id] — Tenant 360.
 *
 * Cabeçalho com nome, plano/status, trial restante, MRR e ações (WhatsApp, Mensagem, Entrar como
 * admin, Assinatura). Abas: Visão geral, Usuários (redefinir senha, impersonar), Giras (próximas,
 * do observatório), Suporte (conversas do terreiro), Auditoria (feed consolidado filtrado) e
 * Assinatura (plano/bônus/suspender). `?tab=` controla a aba; `?bonus=1` abre o drawer já em bônus.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import {
  ArrowLeft,
  Building2,
  Calendar,
  CreditCard,
  KeyRound,
  LifeBuoy,
  LogIn,
  MessageCircle,
  MessageSquare,
  Pencil,
  ScrollText,
  UserRound,
  Users,
} from 'lucide-react';
import { toast } from 'sonner';
import { apiClient, extractApiErrorMessage } from '@/services/api_client';
import PlatformLayout from '../layout';
import CrudDrawer from '@/components/CrudDrawer';
import { ConfirmDialog } from '@/components/admin/ConfirmDialog';
import { DataTable, type ColumnDef } from '@/components/admin/DataTable';
import { EmptyState } from '@/components/EmptyState';
import { PasswordField, TextField } from '@/components/fields';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  PlanBadge,
  SubscriptionStatusBadge,
  TenantActiveBadge,
  ToneBadge,
  STAGE_META,
  roleLabel,
  ago,
  daysUntil,
  fmtDate,
  fmtDateTime,
  fmtMoney,
  plural,
  whatsappLink,
  impersonateUser,
  pickTenantAdmin,
  isoDate,
  isoDaysAgo,
  type ActivationTenant,
  BillingCategoryBadge,
} from '@/components/platform';
import { SubscriptionDrawer, type SubscriptionDetail } from '@/components/platform/SubscriptionDrawer';
import { AuditFeedTable } from '@/components/platform/AuditFeedTable';
import { ACTION_OPTIONS, actionLabel, type FeedEntry } from '@/components/platform/auditFormat';
import { PASSWORD_RULE_HINT, isPasswordValid, passwordHelp } from '@/components/platform/passwordPolicy';

// ─── Tipos (contratos do backend) ────────────────────────────────────────────

interface TenantInfo {
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

interface TenantUser {
  id: string;
  email: string;
  username: string;
  role: string;
  is_active: boolean;
  created_at: string;
}

interface UpcomingGira {
  id: string;
  nome: string;
  data_inicio: string;
  max_tickets: number | null;
  tickets_emitidos: number;
  ocupacao_pct: number | null;
  is_active: boolean;
  tenant_id: string;
  public_link: string;
}

interface RetentionTenant {
  tenant_id: string;
  days_inactive: number;
  never_emitted: boolean;
  last_ticket_at: string | null;
  tickets_30d: number;
  severity: 'atencao' | 'risco' | 'critico';
}

interface ObservatorySlice {
  activation: { tenants: ActivationTenant[] };
  upcoming_giras: UpcomingGira[];
  retention: RetentionTenant[];
  errors_by_tenant: { tenant_id: string | null; total_erros: number; top_endpoints: { endpoint: string; count: number }[] }[];
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

const TABS = ['visao', 'usuarios', 'giras', 'suporte', 'auditoria', 'assinatura'] as const;
type TabKey = (typeof TABS)[number];

function parseTab(v: unknown): TabKey {
  return typeof v === 'string' && (TABS as readonly string[]).includes(v) ? (v as TabKey) : 'visao';
}

// ─── Página ──────────────────────────────────────────────────────────────────

export default function TenantDetailPage() {
  const router = useRouter();
  const id = typeof router.query.id === 'string' ? router.query.id : null;
  const tab = parseTab(router.query.tab);

  const [tenant, setTenant] = useState<TenantInfo | null>(null);
  const [users, setUsers] = useState<TenantUser[]>([]);
  const [subscription, setSubscription] = useState<SubscriptionDetail | null>(null);
  const [observatory, setObservatory] = useState<ObservatorySlice | null>(null);
  const [conversations, setConversations] = useState<ConversationSummary[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    setNotFound(false);
    try {
      const [tenantRes, usersRes] = await Promise.all([
        apiClient.get<TenantInfo>(`/api/v1/platform/tenants/${id}`),
        apiClient.get<TenantUser[]>(`/api/v1/platform/tenants/${id}/users`),
      ]);
      setTenant(tenantRes.data);
      setUsers(Array.isArray(usersRes.data) ? usersRes.data : []);
    } catch (err) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      if (status === 404) setNotFound(true);
      else setError(extractApiErrorMessage(err, 'Erro ao carregar o terreiro'));
    } finally {
      setLoading(false);
    }
    // Secundários (não bloqueiam a página).
    apiClient.get<SubscriptionDetail>(`/api/v1/platform/subscriptions/${id}`).then((r) => setSubscription(r.data)).catch(() => setSubscription(null));
    apiClient.get<ObservatorySlice>('/api/v1/platform/tenant-observatory').then((r) => setObservatory(r.data)).catch(() => setObservatory(null));
    apiClient
      .get<ConversationSummary[]>('/api/v1/platform/support-chat/conversations', { params: { tenant_id: id, limit: 50 } })
      .then((r) => setConversations(Array.isArray(r.data) ? r.data : []))
      .catch(() => setConversations([]));
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const setTab = (next: string) => {
    const query: Record<string, string> = { id: id ?? '' };
    if (next !== 'visao') query.tab = next;
    router.replace({ pathname: '/platform/tenants/[id]', query }, undefined, { shallow: true });
  };

  const activation = useMemo(() => observatory?.activation.tenants.find((t) => t.tenant_id === id) ?? null, [observatory, id]);
  const retention = useMemo(() => observatory?.retention.find((t) => t.tenant_id === id) ?? null, [observatory, id]);
  const giras = useMemo(() => (observatory?.upcoming_giras ?? []).filter((g) => g.tenant_id === id), [observatory, id]);
  const errors = useMemo(() => observatory?.errors_by_tenant.find((e) => e.tenant_id === id) ?? null, [observatory, id]);
  const admin = useMemo(() => pickTenantAdmin(users), [users]);
  const phone = activation?.contact?.phone ?? null;
  const wa = whatsappLink(phone);
  const trialDays = subscription?.is_trial ? daysUntil(subscription.trial_ends_at) : null;
  const mrr = subscription?.mrr ?? 0;
  const potentialMrr = subscription?.potential_mrr ?? 0;

  // ── Ações do cabeçalho ──
  const [impersonating, setImpersonating] = useState(false);
  const enterAsAdmin = async () => {
    if (!admin) {
      toast.error('Este terreiro não tem admin ativo para entrar como.');
      return;
    }
    setImpersonating(true);
    try {
      await impersonateUser(admin.id);
    } catch (err) {
      toast.error(extractApiErrorMessage(err, 'Erro ao entrar como admin'));
    } finally {
      setImpersonating(false);
    }
  };

  // ── Assinatura (drawer) ──
  const [subOpen, setSubOpen] = useState(false);
  const [presetBonus, setPresetBonus] = useState(false);
  useEffect(() => {
    if (router.isReady && router.query.bonus === '1' && tenant) {
      setPresetBonus(true);
      setSubOpen(true);
    }
  }, [router.isReady, router.query.bonus, tenant]);

  // ── Editar terreiro ──
  const [editOpen, setEditOpen] = useState(false);
  const [edit, setEdit] = useState({ name: '', description: '', is_active: true });
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const openEdit = () => {
    if (!tenant) return;
    setEdit({ name: tenant.name, description: tenant.description ?? '', is_active: tenant.is_active });
    setEditError(null);
    setEditOpen(true);
  };
  const editDirty = !!tenant && (edit.name !== tenant.name || edit.description !== (tenant.description ?? '') || edit.is_active !== tenant.is_active);
  const saveEdit = async () => {
    if (!tenant) return;
    setEditSaving(true);
    setEditError(null);
    try {
      await apiClient.put(`/api/v1/platform/tenants/${tenant.id}`, {
        name: edit.name,
        description: edit.description || null,
        is_active: edit.is_active,
      });
      toast.success('Terreiro atualizado.');
      setEditOpen(false);
      load();
    } catch (err) {
      setEditError(extractApiErrorMessage(err, 'Erro ao atualizar o terreiro'));
    } finally {
      setEditSaving(false);
    }
  };

  // ── Usuários: redefinir senha / impersonar ──
  const [resetUser, setResetUser] = useState<TenantUser | null>(null);
  const [resetPassword, setResetPassword] = useState('');
  const [resetConfirm, setResetConfirm] = useState('');
  const [resetSaving, setResetSaving] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);
  const closeReset = () => {
    setResetUser(null);
    setResetPassword('');
    setResetConfirm('');
    setResetError(null);
  };
  const saveReset = async () => {
    if (!resetUser || !id) return;
    setResetSaving(true);
    setResetError(null);
    try {
      await apiClient.post(`/api/v1/platform/tenants/${id}/users/${resetUser.id}/reset-password`, { new_password: resetPassword });
      toast.success(`Senha de ${resetUser.email} redefinida.`);
      closeReset();
    } catch (err) {
      setResetError(extractApiErrorMessage(err, 'Erro ao redefinir senha'));
    } finally {
      setResetSaving(false);
    }
  };
  const [impersonateTarget, setImpersonateTarget] = useState<TenantUser | null>(null);
  const [impersonatingUser, setImpersonatingUser] = useState(false);
  const confirmImpersonate = async () => {
    if (!impersonateTarget) return;
    setImpersonatingUser(true);
    try {
      await impersonateUser(impersonateTarget.id);
      setImpersonateTarget(null);
    } catch (err) {
      toast.error(extractApiErrorMessage(err, 'Erro ao impersonar usuário'));
    } finally {
      setImpersonatingUser(false);
    }
  };

  const userColumns = useMemo<ColumnDef<TenantUser>[]>(
    () => [
      { id: 'email', accessorKey: 'email', header: 'E-mail', meta: { mobile: true }, cell: ({ row }) => <span className="font-medium">{row.original.email}</span> },
      { id: 'username', accessorKey: 'username', header: 'Usuário', meta: { mobile: true } },
      { id: 'role', accessorKey: 'role', header: 'Papel', meta: { mobile: true }, cell: ({ row }) => <ToneBadge tone={row.original.role.toUpperCase() === 'ADMIN' ? 'primary' : 'muted'}>{roleLabel(row.original.role)}</ToneBadge> },
      { id: 'is_active', accessorKey: 'is_active', header: 'Status', meta: { mobile: true }, cell: ({ row }) => <TenantActiveBadge active={row.original.is_active} /> },
      { id: 'created_at', accessorKey: 'created_at', header: 'Criado em', meta: { cellClassName: 'whitespace-nowrap text-muted-foreground' }, cell: ({ row }) => fmtDate(row.original.created_at) },
      {
        id: 'actions',
        header: '',
        enableSorting: false,
        meta: { align: 'right' },
        cell: ({ row }) => {
          const u = row.original;
          return (
            <span className="inline-flex items-center">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon-sm" onClick={() => setResetUser(u)} aria-label={`Redefinir senha de ${u.email}`}>
                    <KeyRound />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Redefinir senha</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span>
                    <Button variant="ghost" size="icon-sm" disabled={!u.is_active} onClick={() => setImpersonateTarget(u)} aria-label={`Impersonar ${u.email}`}>
                      <UserRound />
                    </Button>
                  </span>
                </TooltipTrigger>
                <TooltipContent>{u.is_active ? 'Entrar como este usuário' : 'Usuário inativo'}</TooltipContent>
              </Tooltip>
            </span>
          );
        },
      },
    ],
    [],
  );

  // ── Auditoria (feed filtrado) ──
  const [auditStart, setAuditStart] = useState(isoDaysAgo(30));
  const [auditEnd, setAuditEnd] = useState(isoDate(new Date()));
  const [auditAction, setAuditAction] = useState<string>('all');
  const [audit, setAudit] = useState<FeedEntry[] | null>(null);
  const [auditLoading, setAuditLoading] = useState(false);
  useEffect(() => {
    if (tab !== 'auditoria' || !id) return;
    let cancelled = false;
    setAuditLoading(true);
    const params: Record<string, string | number> = { start_date: auditStart, end_date: auditEnd, tenant_id: id, skip: 0, limit: 100 };
    if (auditAction !== 'all') params.action = auditAction;
    apiClient
      .get<FeedEntry[]>('/api/v1/platform/audit-logs/feed', { params })
      .then((r) => {
        if (!cancelled) setAudit(Array.isArray(r.data) ? r.data : []);
      })
      .catch((err) => {
        if (!cancelled) {
          setAudit([]);
          toast.error(extractApiErrorMessage(err, 'Erro ao carregar a auditoria'));
        }
      })
      .finally(() => {
        if (!cancelled) setAuditLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [tab, id, auditStart, auditEnd, auditAction]);

  // ── Estados de página ──
  const breadcrumbs = [{ label: 'Terreiros', href: '/platform/tenants' }, { label: tenant?.name ?? (notFound ? 'Não encontrado' : '…') }];

  if (notFound) {
    return (
      <PlatformLayout title="Terreiro não encontrado" breadcrumbs={breadcrumbs}>
        <EmptyState
          icon={<Building2 />}
          title="Terreiro não encontrado"
          description="Ele pode ter sido excluído ou o link está errado."
          action={
            <Button asChild variant="outline">
              <Link href="/platform/tenants"><ArrowLeft /> Voltar para Terreiros</Link>
            </Button>
          }
        />
      </PlatformLayout>
    );
  }

  if (error && !tenant) {
    return (
      <PlatformLayout title="Terreiro" breadcrumbs={breadcrumbs}>
        <Alert variant="destructive">
          <AlertTitle>Não foi possível carregar o terreiro</AlertTitle>
          <AlertDescription className="flex flex-wrap items-center gap-2">
            {error}
            <Button variant="outline" size="sm" onClick={load}>Tentar de novo</Button>
          </AlertDescription>
        </Alert>
      </PlatformLayout>
    );
  }

  return (
    <PlatformLayout title={tenant?.name ?? 'Terreiro'} breadcrumbs={breadcrumbs}>
      {/* Cabeçalho */}
      <header className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          {loading || !tenant ? (
            <div className="space-y-2"><Skeleton className="h-8 w-64" /><Skeleton className="h-4 w-40" /></div>
          ) : (
            <>
              <h1 className="truncate text-2xl font-bold tracking-tight">{tenant.name}</h1>
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                <span className="font-mono text-xs text-muted-foreground">{tenant.slug}</span>
                <TenantActiveBadge active={tenant.is_active} />
                <PlanBadge plan={tenant.plan} bonus={tenant.is_bonus} />
                {tenant.subscription_status && <SubscriptionStatusBadge status={tenant.subscription_status} />}
                {trialDays !== null && (
                  <ToneBadge tone={trialDays < 0 ? 'destructive' : trialDays <= 7 ? 'warning' : 'info'}>
                    {trialDays < 0 ? `Trial venceu em ${fmtDate(subscription?.trial_ends_at)}` : `Trial: ${plural(trialDays, 'dia')} restantes`}
                  </ToneBadge>
                )}
                <span className="text-xs text-muted-foreground">
                  {subscription?.billing_category && <BillingCategoryBadge category={subscription.billing_category} />}{' '}
                  MRR <strong className="text-foreground">{fmtMoney(mrr)}</strong>
                  {potentialMrr > 0 && ` (${fmtMoney(potentialMrr)} se assinar)`} · desde {fmtDate(tenant.created_at)}
                </span>
              </div>
            </>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {wa ? (
            <Button asChild variant="outline" size="sm">
              <a href={wa} target="_blank" rel="noopener noreferrer"><MessageCircle className="text-success" /> WhatsApp</a>
            </Button>
          ) : (
            <Tooltip>
              <TooltipTrigger asChild>
                <span><Button variant="outline" size="sm" disabled><MessageCircle /> WhatsApp</Button></span>
              </TooltipTrigger>
              <TooltipContent>Sem telefone do admin cadastrado</TooltipContent>
            </Tooltip>
          )}
          <Button asChild variant="outline" size="sm">
            <Link href={`/platform/suporte?tenant=${id}`}><MessageSquare /> Mensagem</Link>
          </Button>
          <Button variant="outline" size="sm" onClick={enterAsAdmin} disabled={impersonating || loading}>
            <LogIn /> Entrar como admin
          </Button>
          <Button size="sm" onClick={() => { setPresetBonus(false); setSubOpen(true); }} disabled={loading}>
            <CreditCard /> Assinatura
          </Button>
        </div>
      </header>

      {error && (
        <Alert variant="destructive" className="mb-4"><AlertDescription>{error}</AlertDescription></Alert>
      )}

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="mb-4 flex h-auto w-full flex-wrap justify-start">
          <TabsTrigger value="visao"><Building2 /> Visão geral</TabsTrigger>
          <TabsTrigger value="usuarios"><Users /> Usuários</TabsTrigger>
          <TabsTrigger value="giras"><Calendar /> Giras</TabsTrigger>
          <TabsTrigger value="suporte"><LifeBuoy /> Suporte</TabsTrigger>
          <TabsTrigger value="auditoria"><ScrollText /> Auditoria</TabsTrigger>
          <TabsTrigger value="assinatura"><CreditCard /> Assinatura</TabsTrigger>
        </TabsList>

        {/* Visão geral */}
        <TabsContent value="visao" className="grid gap-4 md:grid-cols-2">
          <Card className="gap-3 py-4">
            <CardHeader className="px-4">
              <CardTitle className="flex items-center justify-between text-base">
                Dados do terreiro
                <Button variant="ghost" size="sm" onClick={openEdit} disabled={!tenant}><Pencil /> Editar</Button>
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4">
              {tenant ? (
                <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
                  <dt className="text-muted-foreground">Nome</dt><dd className="font-medium">{tenant.name}</dd>
                  <dt className="text-muted-foreground">Slug</dt><dd className="font-mono text-xs">{tenant.slug}</dd>
                  <dt className="text-muted-foreground">Descrição</dt><dd>{tenant.description || '—'}</dd>
                  <dt className="text-muted-foreground">Criado em</dt><dd>{fmtDateTime(tenant.created_at)}</dd>
                  <dt className="text-muted-foreground">Atualizado em</dt><dd>{fmtDateTime(tenant.updated_at)}</dd>
                  <dt className="text-muted-foreground">Usuários</dt><dd>{users.length} ({users.filter((u) => u.is_active).length} ativos)</dd>
                  <dt className="text-muted-foreground">Admin principal</dt><dd>{admin ? `${admin.username} · ${admin.email}` : 'sem admin ativo'}</dd>
                </dl>
              ) : (
                <Skeleton className="h-32 w-full" />
              )}
            </CardContent>
          </Card>

          <Card className="gap-3 py-4">
            <CardHeader className="px-4">
              <CardTitle className="text-base">Saúde do terreiro</CardTitle>
              <CardDescription>Ativação, uso recente e erros (observatório).</CardDescription>
            </CardHeader>
            <CardContent className="px-4">
              {observatory === null ? (
                <Skeleton className="h-32 w-full" />
              ) : (
                <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
                  <dt className="text-muted-foreground">Estágio</dt>
                  <dd>
                    {activation ? (
                      <ToneBadge tone={STAGE_META[activation.stage].tone} title={STAGE_META[activation.stage].hint}>{STAGE_META[activation.stage].label}</ToneBadge>
                    ) : (
                      <span className="text-muted-foreground">Cadastro com mais de 60 dias</span>
                    )}
                  </dd>
                  <dt className="text-muted-foreground">Giras</dt>
                  <dd>{activation ? `${activation.giras_configuradas}/${activation.giras} com senhas configuradas` : `${plural(giras.length, 'gira')} nos próximos 30 dias`}</dd>
                  <dt className="text-muted-foreground">Senhas pelo link</dt>
                  <dd>{activation ? activation.public_tickets : retention ? retention.tickets_30d + ' nos últimos 30 dias' : '—'}</dd>
                  <dt className="text-muted-foreground">Última atividade</dt>
                  <dd>
                    {activation ? ago(activation.days_since_activity) : retention ? (retention.never_emitted ? 'Nunca emitiu senhas' : `${retention.days_inactive} dias sem emitir senhas`) : tenant?.is_active ? 'Emitiu senhas nos últimos 15 dias' : '—'}
                  </dd>
                  <dt className="text-muted-foreground">Risco</dt>
                  <dd>
                    {retention ? (
                      <ToneBadge tone={retention.severity === 'critico' ? 'destructive' : 'warning'}>
                        {retention.severity === 'critico' ? 'Crítico' : retention.severity === 'risco' ? 'Risco' : 'Atenção'}
                      </ToneBadge>
                    ) : (
                      <span className="text-muted-foreground">Sem alerta</span>
                    )}
                  </dd>
                  <dt className="text-muted-foreground">Erros (60 min)</dt>
                  <dd>{errors ? <ToneBadge tone="destructive">{plural(errors.total_erros, 'erro')}</ToneBadge> : 'Nenhum'}</dd>
                  <dt className="text-muted-foreground">Contato</dt>
                  <dd>
                    {activation?.contact ? (
                      <>
                        {activation.contact.name || '—'}
                        {activation.contact.email && <span className="text-muted-foreground"> · {activation.contact.email}</span>}
                        {activation.contact.phone && <span className="text-muted-foreground"> · {activation.contact.phone}</span>}
                      </>
                    ) : (
                      <span className="text-muted-foreground">Telefone só disponível para cadastros recentes</span>
                    )}
                  </dd>
                </dl>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Usuários */}
        <TabsContent value="usuarios">
          <div className="rounded-xl border bg-card">
            <DataTable
              columns={userColumns}
              data={users}
              getRowId={(u) => u.id}
              loading={loading}
              emptyMessage="Nenhum usuário neste terreiro."
              emptyIcon={<Users />}
              data-testid="tenant-users-table"
            />
          </div>
        </TabsContent>

        {/* Giras */}
        <TabsContent value="giras">
          {observatory === null ? (
            <Skeleton className="h-32 w-full" />
          ) : giras.length === 0 ? (
            <EmptyState compact icon={<Calendar />} title="Nenhuma gira nos próximos 30 dias." />
          ) : (
            <ul className="m-0 grid list-none gap-2 p-0 md:grid-cols-2">
              {giras.map((g) => (
                <li key={g.id}>
                  <Card className="gap-1 py-3">
                    <CardContent className="px-4">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate font-semibold">{g.nome}</p>
                          <p className="text-xs text-muted-foreground">{fmtDateTime(g.data_inicio)}</p>
                        </div>
                        <ToneBadge tone={g.is_active ? 'success' : 'muted'}>{g.is_active ? 'Ativa' : 'Inativa'}</ToneBadge>
                      </div>
                      <p className="mt-2 text-xs text-muted-foreground">
                        {g.tickets_emitidos} senha{g.tickets_emitidos === 1 ? '' : 's'} emitida{g.tickets_emitidos === 1 ? '' : 's'}
                        {g.max_tickets ? ` de ${g.max_tickets}` : ' (sem limite configurado)'}
                        {g.ocupacao_pct !== null && ` · ${g.ocupacao_pct}%`}
                      </p>
                      <a href={g.public_link} target="_blank" rel="noopener noreferrer" className="mt-1 inline-block text-xs text-primary underline-offset-4 hover:underline">
                        Link público
                      </a>
                    </CardContent>
                  </Card>
                </li>
              ))}
            </ul>
          )}
        </TabsContent>

        {/* Suporte */}
        <TabsContent value="suporte">
          {conversations === null ? (
            <Skeleton className="h-24 w-full" />
          ) : conversations.length === 0 ? (
            <EmptyState
              compact
              icon={<LifeBuoy />}
              title="Nenhuma conversa de suporte."
              description="A conversa é aberta pelo terreiro no chat do painel; a plataforma só responde."
            />
          ) : (
            <ul className="m-0 flex list-none flex-col gap-2 p-0">
              {conversations.map((c) => (
                <li key={c.id}>
                  <Link href={`/platform/suporte?conversation=${c.id}`} className="block rounded-xl border bg-card p-4 outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/50">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold">{c.owner_name_snapshot}</span>
                      <span className="flex items-center gap-1">
                        {c.unread && <ToneBadge tone="warning">Nova</ToneBadge>}
                        <ToneBadge tone={c.status === 'open' ? 'success' : 'muted'}>{c.status === 'open' ? 'Aberta' : 'Resolvida'}</ToneBadge>
                      </span>
                    </div>
                    <p className="mt-1 truncate text-sm text-muted-foreground">{c.last_message_preview || '—'}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{fmtDateTime(c.last_message_at)}</p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </TabsContent>

        {/* Auditoria */}
        <TabsContent value="auditoria">
          <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-end">
            <TextField label="De" type="date" value={auditStart} onChange={(e) => setAuditStart(e.target.value)} size="small" className="sm:w-44" />
            <TextField label="Até" type="date" value={auditEnd} onChange={(e) => setAuditEnd(e.target.value)} size="small" className="sm:w-44" />
            <div className="grid gap-1 sm:w-44">
              <Label htmlFor="audit-action" className="text-xs text-muted-foreground">Ação</Label>
              <Select value={auditAction} onValueChange={setAuditAction}>
                <SelectTrigger id="audit-action" size="sm" className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  {ACTION_OPTIONS.map((a) => <SelectItem key={a} value={a}>{actionLabel(a)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="rounded-xl border bg-card">
            <AuditFeedTable entries={audit ?? []} loading={auditLoading || audit === null} hideTenant emptyMessage="Nenhum evento deste terreiro no período." />
          </div>
        </TabsContent>

        {/* Assinatura */}
        <TabsContent value="assinatura">
          <Card className="gap-3 py-4">
            <CardHeader className="px-4">
              <CardTitle className="flex items-center justify-between text-base">
                Assinatura
                <Button size="sm" onClick={() => { setPresetBonus(false); setSubOpen(true); }} disabled={loading}><CreditCard /> Alterar plano ou bônus</Button>
              </CardTitle>
              <CardDescription>Plano, bônus, trial e limites atuais.</CardDescription>
            </CardHeader>
            <CardContent className="px-4">
              {subscription === null ? (
                <p className="text-sm text-muted-foreground">Carregando assinatura…</p>
              ) : (
                <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
                  <dt className="text-muted-foreground">Plano</dt><dd><PlanBadge plan={subscription.plan} bonus={subscription.is_bonus} /></dd>
                  <dt className="text-muted-foreground">Status</dt><dd><SubscriptionStatusBadge status={subscription.status} /></dd>
                  <dt className="text-muted-foreground">Mensalidade</dt><dd>{fmtMoney(subscription.monthly_price)}</dd>
                  <dt className="text-muted-foreground">Trial</dt>
                  <dd>{subscription.is_trial ? `Até ${fmtDate(subscription.trial_ends_at)}${trialDays !== null ? ` (${trialDays}d)` : ''}` : 'Não'}</dd>
                  <dt className="text-muted-foreground">Usuários</dt><dd>{subscription.current_users} / {subscription.max_users >= 99999 ? '∞' : subscription.max_users}</dd>
                  <dt className="text-muted-foreground">Giras por mês</dt><dd>{subscription.max_giras_per_month >= 99999 ? '∞' : subscription.max_giras_per_month}</dd>
                </dl>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Drawers e diálogos */}
      <SubscriptionDrawer
        open={subOpen}
        tenant={tenant ? { id: tenant.id, name: tenant.name, plan: tenant.plan, is_bonus: tenant.is_bonus } : null}
        presetBonus={presetBonus}
        onClose={() => {
          setSubOpen(false);
          if (router.query.bonus) setTab(tab);
        }}
        onSaved={(msg) => { toast.success(msg); load(); }}
      />

      <CrudDrawer
        open={editOpen}
        onClose={() => setEditOpen(false)}
        title="Editar terreiro"
        subtitle={tenant?.name}
        icon={<Pencil />}
        onSave={saveEdit}
        saving={editSaving}
        saveDisabled={!edit.name.trim() || !editDirty}
        isDirty={editDirty}
        error={editError}
      >
        <TextField label="Nome" required value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} error={!edit.name.trim() ? 'Nome obrigatório' : undefined} />
        <TextField label="Descrição" multiline rows={3} value={edit.description} onChange={(e) => setEdit({ ...edit, description: e.target.value })} />
        <div className="grid gap-1.5">
          <Label htmlFor="edit-status">Status</Label>
          <Select value={edit.is_active ? 'ativo' : 'inativo'} onValueChange={(v) => setEdit({ ...edit, is_active: v === 'ativo' })}>
            <SelectTrigger id="edit-status" className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ativo">Ativo</SelectItem>
              <SelectItem value="inativo">Desativado</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CrudDrawer>

      <CrudDrawer
        open={resetUser !== null}
        onClose={closeReset}
        title="Redefinir senha"
        subtitle={resetUser?.email}
        icon={<KeyRound />}
        onSave={saveReset}
        saveLabel="Redefinir"
        saving={resetSaving}
        saveDisabled={!isPasswordValid(resetPassword) || resetPassword !== resetConfirm}
        isDirty={resetPassword.length > 0 || resetConfirm.length > 0}
        error={resetError}
      >
        <PasswordField
          label="Nova senha"
          value={resetPassword}
          onChange={(e) => setResetPassword(e.target.value)}
          autoComplete="new-password"
          helperText={PASSWORD_RULE_HINT}
          error={passwordHelp(resetPassword) || undefined}
        />
        <PasswordField
          label="Confirmar senha"
          value={resetConfirm}
          onChange={(e) => setResetConfirm(e.target.value)}
          autoComplete="new-password"
          error={resetConfirm.length > 0 && resetPassword !== resetConfirm ? 'As senhas não coincidem' : undefined}
        />
        <p className="text-xs text-muted-foreground">As sessões ativas desse usuário são encerradas.</p>
      </CrudDrawer>

      <ConfirmDialog
        open={impersonateTarget !== null}
        title="Entrar como este usuário"
        message={
          <>
            Uma nova aba abre com a sessão de <strong>{impersonateTarget?.email}</strong> ({roleLabel(impersonateTarget?.role)}) em{' '}
            <strong>{tenant?.name}</strong>. Tudo que você fizer fica registrado na auditoria como impersonação.
          </>
        }
        confirmText="Abrir como esse usuário"
        loading={impersonatingUser}
        onConfirm={confirmImpersonate}
        onCancel={() => setImpersonateTarget(null)}
      />
    </PlatformLayout>
  );
}
