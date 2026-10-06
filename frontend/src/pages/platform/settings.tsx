/**
 * /platform/settings — Configurações da plataforma, em abas (`?tab=`):
 *   conta   — dados do super admin logado (GET /api/v1/auth/me) e troca de senha
 *   admins  — administradores da plataforma (CRUD em /api/v1/platform/users); a edição envia o
 *             `is_active` escolhido (antes ia sempre `true`)
 *   planos  — tabela de referência dos planos (preço/limites de `PLAN_META`, recursos do
 *             `FEATURE_CATALOG` de constants/plans.ts — a mesma fonte das telas do terreiro)
 *
 * A aba "Flags" (feature flags por terreiro) saiu em 2026-10-06: nada no backend lê a tabela
 * `feature_flags`, então ligar/desligar não mudava nada. A API /api/v1/platform/feature-flags e
 * a tabela continuam (AGENTS.md §11.9).
 *
 * Absorveu /platform/users_global e /platform/profile (que viraram redirecionamento).
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import { Check, KeyRound, Minus, Pencil, Plus, RefreshCw, Shield, Table2, Trash2, UserCog } from 'lucide-react';
import { toast } from 'sonner';
import { apiClient, extractApiErrorMessage, type ApiRequestConfig } from '@/services/api_client';
import PlatformLayout from './layout';
import CrudDrawer from '@/components/CrudDrawer';
import { ConfirmDialog } from '@/components/admin/ConfirmDialog';
import { DataTable, type ColumnDef } from '@/components/admin/DataTable';
import { PageHeader } from '@/components/admin/PageHeader';
import { PasswordField, TextField } from '@/components/fields';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PlanBadge, TenantActiveBadge, ToneBadge, PLAN_META, PLAN_ORDER, fmtDate, fmtMoney, roleLabel } from '@/components/platform';
import { PASSWORD_RULE_HINT, isPasswordValid, passwordHelp } from '@/components/platform/passwordPolicy';
import { BASE_FEATURES, FEATURE_CATALOG, planIncludes } from '@/constants/plans';

const TABS = ['conta', 'admins', 'planos'] as const;
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

// ─── Planos ──────────────────────────────────────────────────────────────────

type PlanCell = string | boolean;
interface PlanRow {
  label: string;
  cells: Record<string, PlanCell>;
}

const limitText = (n: number | null) => (n === null ? 'Ilimitado' : n === 0 ? '—' : String(n));

// Recursos: base de todos os planos + o comparativo vendido (constants/plans.ts).
const PLAN_FEATURE_ROWS: PlanRow[] = [
  ...BASE_FEATURES.map((label) => ({ label, cells: Object.fromEntries(PLAN_ORDER.map((k) => [k, true])) })),
  ...FEATURE_CATALOG.map((f) => ({
    label: f.label,
    cells: Object.fromEntries(PLAN_ORDER.map((k) => [k, planIncludes(k, f.key)])),
  })),
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
          Tabela de referência. Preços e limites vêm de <code>PLAN_META</code> (espelho de <code>PLAN_LIMITS</code> do backend) e os recursos de <code>FEATURE_CATALOG</code>/<code>FEATURE_MIN_PLAN</code> (espelho de <code>plan_features.py</code>); o valor cobrado de cada terreiro é o da assinatura.
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
      <PageHeader title="Configurações" subtitle="Sua conta, administradores da plataforma e planos." />
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList data-tour="settings-tabs" className="mb-4 flex h-auto w-full flex-wrap justify-start">
          <TabsTrigger value="conta"><UserCog /> Conta</TabsTrigger>
          <TabsTrigger value="admins"><Shield /> Admins da plataforma</TabsTrigger>
          <TabsTrigger value="planos"><Table2 /> Planos</TabsTrigger>
        </TabsList>
        <TabsContent value="conta"><ContaTab /></TabsContent>
        <TabsContent value="admins"><AdminsTab /></TabsContent>
        <TabsContent value="planos"><PlanosTab /></TabsContent>
      </Tabs>
    </PlatformLayout>
  );
};

export default SettingsPage;
