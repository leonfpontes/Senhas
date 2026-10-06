/**
 * /platform/settings — Configurações da plataforma, em abas (`?tab=`):
 *   conta   — dados do super admin logado (GET /api/v1/auth/me) e troca de senha
 *   admins  — administradores da plataforma (CRUD em /api/v1/platform/users); a edição envia o
 *             `is_active` escolhido (antes ia sempre `true`)
 *   flags   — feature flags por terreiro (/api/v1/platform/feature-flags), Switch + AlertDialog
 *   planos  — tabela de referência dos planos (constante única `PLAN_META`)
 *
 * Absorveu /platform/users_global e /platform/profile (que viraram redirecionamento).
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import { Check, Flag, KeyRound, Minus, Pencil, Plus, RefreshCw, Shield, Table2, Trash2, UserCog } from 'lucide-react';
import { toast } from 'sonner';
import { apiClient, extractApiErrorMessage, type ApiRequestConfig } from '@/services/api_client';
import PlatformLayout from './layout';
import CrudDrawer from '@/components/CrudDrawer';
import { ConfirmDialog } from '@/components/admin/ConfirmDialog';
import { DataTable, type ColumnDef } from '@/components/admin/DataTable';
import { PageHeader } from '@/components/admin/PageHeader';
import { EmptyState } from '@/components/EmptyState';
import { Combobox, PasswordField, TextField } from '@/components/fields';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { PlanBadge, TenantActiveBadge, ToneBadge, PLAN_META, PLAN_ORDER, fmtDate, fmtMoney, roleLabel } from '@/components/platform';
import { PASSWORD_RULE_HINT, isPasswordValid, passwordHelp } from '@/components/platform/passwordPolicy';

const TABS = ['conta', 'admins', 'flags', 'planos'] as const;
type TabKey = (typeof TABS)[number];
const parseTab = (v: unknown): TabKey => (typeof v === 'string' && (TABS as readonly string[]).includes(v) ? (v as TabKey) : 'conta');

// ─── Conta ───────────────────────────────────────────────────────────────────

interface Me {
  id: string;
  email: string;
  username: string;
  role: string;
  is_active: boolean;
  created_at: string;
  full_name?: string | null;
}

function ContaTab() {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    apiClient
      .get<Me>('/api/v1/auth/me')
      .then((r) => setMe(r.data))
      .catch((err) => setError(extractApiErrorMessage(err, 'Erro ao carregar a conta')))
      .finally(() => setLoading(false));
  }, []);

  const canSubmit = current.length > 0 && isPasswordValid(next) && next === confirm && !saving;

  const changePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setSaving(true);
    try {
      await apiClient.post(
        '/api/v1/auth/change-password',
        { current_password: current, new_password: next },
        // Senha atual errada volta 401 — sem isso o interceptor deslogaria.
        { skipAutoLogout: true } as ApiRequestConfig,
      );
      toast.success('Senha alterada com sucesso.');
      setCurrent('');
      setNext('');
      setConfirm('');
    } catch (err) {
      toast.error(extractApiErrorMessage(err, 'Falha ao alterar a senha'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card className="gap-3 py-4">
        <CardHeader className="px-4">
          <CardTitle className="text-base">Dados da conta</CardTitle>
          <CardDescription>Sua conta de super admin da plataforma.</CardDescription>
        </CardHeader>
        <CardContent className="px-4">
          {error && <Alert variant="destructive" className="mb-3"><AlertDescription>{error}</AlertDescription></Alert>}
          {loading ? (
            <Skeleton className="h-28 w-full" />
          ) : me ? (
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
              <dt className="text-muted-foreground">Nome</dt><dd className="font-medium">{me.full_name || me.username}</dd>
              <dt className="text-muted-foreground">E-mail</dt><dd>{me.email}</dd>
              <dt className="text-muted-foreground">Usuário</dt><dd>{me.username}</dd>
              <dt className="text-muted-foreground">Papel</dt><dd><ToneBadge tone="primary">{roleLabel(me.role)}</ToneBadge></dd>
              <dt className="text-muted-foreground">Conta criada em</dt><dd>{fmtDate(me.created_at)}</dd>
            </dl>
          ) : null}
        </CardContent>
      </Card>

      <Card className="gap-3 py-4">
        <CardHeader className="px-4">
          <CardTitle className="text-base">Alterar senha</CardTitle>
          <CardDescription>{PASSWORD_RULE_HINT}.</CardDescription>
        </CardHeader>
        <CardContent className="px-4">
          <form className="flex max-w-sm flex-col gap-3" onSubmit={changePassword}>
            <PasswordField label="Senha atual" value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" required />
            <PasswordField label="Nova senha" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" required error={passwordHelp(next) || undefined} />
            <PasswordField
              label="Confirmar nova senha"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              autoComplete="new-password"
              required
              error={confirm.length > 0 && next !== confirm ? 'As senhas não coincidem' : undefined}
            />
            <Button type="submit" className="self-start" disabled={!canSubmit}>
              <KeyRound /> {saving ? 'Salvando…' : 'Alterar senha'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Admins da plataforma ────────────────────────────────────────────────────

interface PlatformUser {
  id: string;
  email: string;
  username: string;
  role: string;
  is_active: boolean;
  created_at: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function AdminsTab() {
  const [users, setUsers] = useState<PlatformUser[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [drawer, setDrawer] = useState<{ mode: 'create' } | { mode: 'edit'; user: PlatformUser } | null>(null);
  const [form, setForm] = useState({ email: '', username: '', password: '', is_active: true });
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<PlatformUser | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await apiClient.get<PlatformUser[]>('/api/v1/platform/users', { params: { skip: 0, limit: 1000 } });
      setUsers(Array.isArray(res.data) ? res.data : []);
      setError(null);
    } catch (err) {
      setUsers([]);
      setError(extractApiErrorMessage(err, 'Erro ao carregar administradores'));
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const openCreate = () => {
    setForm({ email: '', username: '', password: '', is_active: true });
    setTouched({});
    setSaveError(null);
    setDrawer({ mode: 'create' });
  };
  const openEdit = (user: PlatformUser) => {
    setForm({ email: user.email, username: user.username, password: '', is_active: user.is_active });
    setTouched({});
    setSaveError(null);
    setDrawer({ mode: 'edit', user });
  };

  const isEdit = drawer?.mode === 'edit';
  const original = drawer?.mode === 'edit' ? drawer.user : null;
  const isDirty = isEdit
    ? form.username !== original?.username || form.is_active !== original?.is_active
    : form.email !== '' || form.username !== '' || form.password !== '';
  const emailError = touched.email && !EMAIL_RE.test(form.email) ? 'E-mail inválido' : undefined;
  const usernameError = touched.username && !form.username.trim() ? 'Usuário obrigatório' : undefined;
  const passwordError = !isEdit && form.password ? passwordHelp(form.password) || undefined : undefined;
  const isValid = form.username.trim().length > 0 && (isEdit || (EMAIL_RE.test(form.email) && isPasswordValid(form.password)));

  const save = async () => {
    if (!drawer) return;
    setSaving(true);
    setSaveError(null);
    try {
      if (drawer.mode === 'create') {
        await apiClient.post('/api/v1/platform/users', { email: form.email, username: form.username, password: form.password });
        toast.success('Administrador criado.');
      } else {
        // Envia o is_active escolhido (a versão anterior mandava sempre true).
        await apiClient.put(`/api/v1/platform/users/${drawer.user.id}`, { username: form.username, is_active: form.is_active });
        toast.success('Administrador atualizado.');
      }
      setDrawer(null);
      load();
    } catch (err) {
      setSaveError(extractApiErrorMessage(err, 'Erro ao salvar administrador'));
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await apiClient.delete(`/api/v1/platform/users/${deleteTarget.id}`);
      toast.success('Administrador removido.');
      setDeleteTarget(null);
      load();
    } catch (err) {
      toast.error(extractApiErrorMessage(err, 'Erro ao remover administrador'));
    } finally {
      setDeleting(false);
    }
  };

  const columns = useMemo<ColumnDef<PlatformUser>[]>(
    () => [
      { id: 'email', accessorKey: 'email', header: 'E-mail', meta: { mobile: true }, cell: ({ row }) => <span className="font-medium">{row.original.email}</span> },
      { id: 'username', accessorKey: 'username', header: 'Usuário', meta: { mobile: true } },
      { id: 'role', accessorKey: 'role', header: 'Papel', cell: ({ row }) => <ToneBadge tone="primary">{roleLabel(row.original.role)}</ToneBadge> },
      { id: 'is_active', accessorKey: 'is_active', header: 'Status', meta: { mobile: true }, cell: ({ row }) => <TenantActiveBadge active={row.original.is_active} /> },
      { id: 'created_at', accessorKey: 'created_at', header: 'Criado em', meta: { cellClassName: 'whitespace-nowrap text-muted-foreground' }, cell: ({ row }) => fmtDate(row.original.created_at) },
      {
        id: 'actions',
        header: '',
        enableSorting: false,
        meta: { align: 'right' },
        cell: ({ row }) => (
          <span className="inline-flex">
            <Button variant="ghost" size="icon-sm" onClick={() => openEdit(row.original)} aria-label={`Editar ${row.original.email}`}><Pencil /></Button>
            <Button variant="ghost" size="icon-sm" className="text-destructive" onClick={() => setDeleteTarget(row.original)} aria-label={`Remover ${row.original.email}`}><Trash2 /></Button>
          </span>
        ),
      },
    ],
    [],
  );

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">Quem acessa esta área da plataforma.</p>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={load}><RefreshCw /> Atualizar</Button>
          <Button size="sm" onClick={openCreate}><Plus /> Novo admin</Button>
        </div>
      </div>
      {error && <Alert variant="destructive" className="mb-3"><AlertDescription>{error}</AlertDescription></Alert>}
      <div className="rounded-xl border bg-card">
        <DataTable columns={columns} data={users ?? []} getRowId={(u) => u.id} loading={users === null} emptyMessage="Nenhum administrador." emptyIcon={<Shield />} data-testid="admins-table" />
      </div>

      <CrudDrawer
        open={drawer !== null}
        onClose={() => setDrawer(null)}
        title={isEdit ? 'Editar administrador' : 'Novo administrador'}
        subtitle={isEdit ? original?.email : 'Cria um super admin da plataforma.'}
        icon={<UserCog />}
        onSave={save}
        saveLabel={isEdit ? 'Salvar' : 'Criar'}
        saving={saving}
        saveDisabled={!isValid || (isEdit && !isDirty)}
        isDirty={isDirty}
        error={saveError}
      >
        <TextField
          label="E-mail"
          type="email"
          required
          disabled={isEdit}
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
          onBlur={() => setTouched((p) => ({ ...p, email: true }))}
          error={emailError}
        />
        <TextField
          label="Usuário"
          required
          value={form.username}
          onChange={(e) => setForm({ ...form, username: e.target.value })}
          onBlur={() => setTouched((p) => ({ ...p, username: true }))}
          error={usernameError}
        />
        {!isEdit && (
          <PasswordField
            label="Senha"
            required
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            onBlur={() => setTouched((p) => ({ ...p, password: true }))}
            autoComplete="new-password"
            helperText={PASSWORD_RULE_HINT}
            error={passwordError}
          />
        )}
        {isEdit && (
          <div className="flex items-center justify-between rounded-lg border p-3">
            <Label htmlFor="admin-active" className="flex flex-col gap-0.5">
              <span>Conta ativa</span>
              <span className="text-xs font-normal text-muted-foreground">Desativada, não consegue entrar na plataforma.</span>
            </Label>
            <Switch id="admin-active" checked={form.is_active} onCheckedChange={(v) => setForm({ ...form, is_active: v })} />
          </div>
        )}
      </CrudDrawer>

      <ConfirmDialog
        open={deleteTarget !== null}
        title="Remover administrador"
        message={<>Remover <strong>{deleteTarget?.email}</strong> da plataforma? Ele perde o acesso imediatamente.</>}
        destructive
        confirmText="Remover"
        loading={deleting}
        onConfirm={remove}
        onCancel={() => setDeleteTarget(null)}
      />
    </>
  );
}

// ─── Flags ───────────────────────────────────────────────────────────────────

interface TenantLite {
  id: string;
  name: string;
  slug: string;
}

interface FeatureFlag {
  id: string;
  tenant_id: string;
  feature: string;
  enabled: boolean;
  expires_at: string | null;
  description: string | null;
  created_at: string;
}

function FlagsTab() {
  const [tenants, setTenants] = useState<TenantLite[]>([]);
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [flags, setFlags] = useState<FeatureFlag[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [newFlag, setNewFlag] = useState({ feature: '', description: '' });
  const [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<FeatureFlag | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [toggling, setToggling] = useState<string | null>(null);

  useEffect(() => {
    apiClient
      .get<TenantLite[]>('/api/v1/platform/tenants', { params: { limit: 1000 } })
      .then((r) => setTenants(Array.isArray(r.data) ? r.data : []))
      .catch(() => setTenants([]));
  }, []);

  const loadFlags = useCallback(async (id: string) => {
    try {
      const res = await apiClient.get<FeatureFlag[]>(`/api/v1/platform/feature-flags/${id}`);
      setFlags(Array.isArray(res.data) ? res.data : []);
      setError(null);
    } catch (err) {
      setFlags([]);
      setError(extractApiErrorMessage(err, 'Erro ao carregar as flags'));
    }
  }, []);

  useEffect(() => {
    if (tenantId) {
      setFlags(null);
      loadFlags(tenantId);
    } else {
      setFlags(null);
    }
  }, [tenantId, loadFlags]);

  const addFlag = async () => {
    if (!tenantId || !newFlag.feature.trim()) return;
    setSaving(true);
    setSaveError(null);
    try {
      await apiClient.post(`/api/v1/platform/feature-flags/${tenantId}`, { feature: newFlag.feature.trim(), enabled: true, description: newFlag.description || null });
      toast.success('Flag adicionada.');
      setDrawerOpen(false);
      loadFlags(tenantId);
    } catch (err) {
      setSaveError(extractApiErrorMessage(err, 'Erro ao adicionar a flag'));
    } finally {
      setSaving(false);
    }
  };

  const toggleFlag = async (flag: FeatureFlag, enabled: boolean) => {
    if (!tenantId) return;
    setToggling(flag.id);
    try {
      await apiClient.post(`/api/v1/platform/feature-flags/${tenantId}`, { feature: flag.feature, enabled, description: flag.description, expires_at: flag.expires_at });
      setFlags((prev) => (prev ?? []).map((f) => (f.id === flag.id ? { ...f, enabled } : f)));
      toast.success(`Flag "${flag.feature}" ${enabled ? 'ativada' : 'desativada'}.`);
    } catch (err) {
      toast.error(extractApiErrorMessage(err, 'Erro ao alterar a flag'));
    } finally {
      setToggling(null);
    }
  };

  const removeFlag = async () => {
    if (!tenantId || !deleteTarget) return;
    setDeleting(true);
    try {
      await apiClient.delete(`/api/v1/platform/feature-flags/${tenantId}/${deleteTarget.feature}`);
      toast.success(`Flag "${deleteTarget.feature}" removida.`);
      setDeleteTarget(null);
      loadFlags(tenantId);
    } catch (err) {
      toast.error(extractApiErrorMessage(err, 'Erro ao remover a flag'));
    } finally {
      setDeleting(false);
    }
  };

  const tenantOptions = useMemo(() => tenants.map((t) => ({ value: t.id, label: t.name, description: t.slug, keywords: [t.slug] })), [tenants]);
  const selectedTenant = tenants.find((t) => t.id === tenantId) ?? null;

  return (
    <>
      <div className="mb-4 max-w-md">
        <Combobox label="Terreiro" options={tenantOptions} value={tenantId} onChange={setTenantId} placeholder="Selecione um terreiro" searchPlaceholder="Nome ou slug…" emptyText="Nenhum terreiro" clearable />
      </div>

      {error && <Alert variant="destructive" className="mb-3"><AlertDescription>{error}</AlertDescription></Alert>}

      {!tenantId ? (
        <Alert variant="info"><AlertDescription>Selecione um terreiro para gerenciar as feature flags dele.</AlertDescription></Alert>
      ) : (
        <Card className="gap-3 py-4">
          <CardHeader className="px-4">
            <CardTitle className="flex items-center justify-between text-base">
              <span>Flags de {selectedTenant?.name ?? 'terreiro'}</span>
              <Button size="sm" onClick={() => { setNewFlag({ feature: '', description: '' }); setTouched(false); setSaveError(null); setDrawerOpen(true); }}>
                <Plus /> Adicionar flag
              </Button>
            </CardTitle>
            <CardDescription>Liberações pontuais por terreiro, fora do plano.</CardDescription>
          </CardHeader>
          <CardContent className="px-4">
            {flags === null ? (
              <Skeleton className="h-20 w-full" />
            ) : flags.length === 0 ? (
              <EmptyState compact icon={<Flag />} title="Nenhuma flag para este terreiro." />
            ) : (
              <ul className="m-0 list-none divide-y p-0">
                {flags.map((flag) => (
                  <li key={flag.id} className="flex items-center gap-3 py-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="font-mono text-sm font-semibold">{flag.feature}</p>
                      {flag.description && <p className="text-xs text-muted-foreground">{flag.description}</p>}
                      <p className="text-xs text-muted-foreground">{flag.expires_at ? `Expira em ${fmtDate(flag.expires_at)}` : 'Sem expiração'}</p>
                    </div>
                    <Label htmlFor={`flag-${flag.id}`} className="sr-only">{flag.enabled ? 'Desativar' : 'Ativar'} {flag.feature}</Label>
                    <Switch id={`flag-${flag.id}`} checked={flag.enabled} disabled={toggling === flag.id} onCheckedChange={(v) => toggleFlag(flag, v)} />
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button variant="ghost" size="icon-sm" className="text-destructive" onClick={() => setDeleteTarget(flag)} aria-label={`Remover flag ${flag.feature}`}><Trash2 /></Button>
                      </TooltipTrigger>
                      <TooltipContent>Remover</TooltipContent>
                    </Tooltip>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      )}

      <CrudDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title="Nova feature flag"
        subtitle={selectedTenant?.name}
        icon={<Flag />}
        onSave={addFlag}
        saveLabel="Adicionar"
        saving={saving}
        saveDisabled={!newFlag.feature.trim()}
        isDirty={newFlag.feature.length > 0 || newFlag.description.length > 0}
        error={saveError}
      >
        <TextField
          label="Nome da feature"
          required
          value={newFlag.feature}
          onChange={(e) => setNewFlag({ ...newFlag, feature: e.target.value })}
          onBlur={() => setTouched(true)}
          error={touched && !newFlag.feature.trim() ? 'Nome obrigatório' : undefined}
          helperText="Identificador usado no código (ex.: sites_beta)"
        />
        <TextField label="Descrição" multiline rows={3} value={newFlag.description} onChange={(e) => setNewFlag({ ...newFlag, description: e.target.value })} />
      </CrudDrawer>

      <ConfirmDialog
        open={deleteTarget !== null}
        title="Remover feature flag"
        message={<>Remover a flag <strong>{deleteTarget?.feature}</strong> de {selectedTenant?.name}? O terreiro volta ao comportamento do plano.</>}
        destructive
        confirmText="Remover"
        loading={deleting}
        onConfirm={removeFlag}
        onCancel={() => setDeleteTarget(null)}
      />
    </>
  );
}

// ─── Planos ──────────────────────────────────────────────────────────────────

type PlanCell = string | boolean;
interface PlanRow {
  label: string;
  cells: Record<string, PlanCell>;
}

const limitText = (n: number | null) => (n === null ? 'Ilimitado' : n === 0 ? '—' : String(n));

const PLAN_FEATURE_ROWS: PlanRow[] = [
  { label: 'Emissão de senhas', cells: { free: true, basic: true, pro: true, premium: true } },
  { label: 'Porta (fila em tempo real)', cells: { free: true, basic: true, pro: true, premium: true } },
  { label: 'Relatório de gira', cells: { free: false, basic: true, pro: true, premium: true } },
  { label: 'Envio de senha por e-mail', cells: { free: false, basic: false, pro: true, premium: true } },
  { label: 'Tema personalizado', cells: { free: false, basic: false, pro: true, premium: true } },
  { label: 'Analytics avançado', cells: { free: false, basic: false, pro: true, premium: true } },
  { label: 'Gestão de associados', cells: { free: false, basic: false, pro: true, premium: true } },
  { label: 'Controle de estoque', cells: { free: false, basic: false, pro: true, premium: true } },
  { label: 'Site do terreiro', cells: { free: false, basic: false, pro: true, premium: true } },
  { label: 'Exportação CSV', cells: { free: false, basic: false, pro: true, premium: true } },
  { label: 'Auditoria completa', cells: { free: false, basic: false, pro: true, premium: true } },
  { label: 'Mensalidade de médiuns', cells: { free: false, basic: false, pro: false, premium: true } },
  { label: 'Suporte prioritário', cells: { free: false, basic: false, pro: false, premium: true } },
  { label: 'Acesso à API', cells: { free: false, basic: false, pro: false, premium: true } },
];

function PlanCellView({ value }: { value: PlanCell }) {
  if (value === true) return <Check className="mx-auto size-4 text-success" aria-label="Incluído" />;
  if (value === false) return <Minus className="mx-auto size-4 text-muted-foreground/60" aria-label="Não incluído" />;
  return <span className="text-sm font-semibold">{value}</span>;
}

function PlanosTab() {
  const rows: PlanRow[] = [
    { label: 'Preço mensal', cells: Object.fromEntries(PLAN_ORDER.map((k) => [k, PLAN_META[k].price === 0 ? 'Grátis' : fmtMoney(PLAN_META[k].price)])) },
    { label: 'Usuários', cells: Object.fromEntries(PLAN_ORDER.map((k) => [k, limitText(PLAN_META[k].limits.users)])) },
    { label: 'Giras por mês', cells: Object.fromEntries(PLAN_ORDER.map((k) => [k, limitText(PLAN_META[k].limits.girasPerMonth)])) },
    { label: 'Médiuns / cambones', cells: Object.fromEntries(PLAN_ORDER.map((k) => [k, limitText(PLAN_META[k].limits.mediuns)])) },
    ...PLAN_FEATURE_ROWS,
  ];
  return (
    <>
      <Alert variant="info" className="mb-4">
        <AlertDescription>
          Tabela de referência. Preços e limites vêm da constante única <code>PLAN_META</code> (espelho de <code>PLAN_LIMITS</code> do backend); o valor cobrado de cada terreiro é o da assinatura.
        </AlertDescription>
      </Alert>
      <div className="overflow-x-auto rounded-xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="min-w-[200px]">Recurso</TableHead>
              {PLAN_ORDER.map((k) => (
                <TableHead key={k} className="min-w-[110px] text-center"><PlanBadge plan={k} /></TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.label}>
                <TableCell className="text-sm">{row.label}</TableCell>
                {PLAN_ORDER.map((k) => (
                  <TableCell key={k} className="text-center"><PlanCellView value={row.cells[k]} /></TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </>
  );
}

// ─── Página ──────────────────────────────────────────────────────────────────

const SettingsPage: React.FC = () => {
  const router = useRouter();
  const tab = parseTab(router.query.tab);
  const setTab = (next: string) => router.replace({ pathname: '/platform/settings', query: next === 'conta' ? {} : { tab: next } }, undefined, { shallow: true });

  return (
    <PlatformLayout title="Configurações">
      <PageHeader title="Configurações" subtitle="Sua conta, administradores da plataforma, feature flags e planos." />
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList data-tour="settings-tabs" className="mb-4 flex h-auto w-full flex-wrap justify-start">
          <TabsTrigger value="conta"><UserCog /> Conta</TabsTrigger>
          <TabsTrigger value="admins"><Shield /> Admins da plataforma</TabsTrigger>
          <TabsTrigger value="flags"><Flag /> Flags</TabsTrigger>
          <TabsTrigger value="planos"><Table2 /> Planos</TabsTrigger>
        </TabsList>
        <TabsContent value="conta"><ContaTab /></TabsContent>
        <TabsContent value="admins"><AdminsTab /></TabsContent>
        <TabsContent value="flags"><FlagsTab /></TabsContent>
        <TabsContent value="planos"><PlanosTab /></TabsContent>
      </Tabs>
    </PlatformLayout>
  );
};

export default SettingsPage;
