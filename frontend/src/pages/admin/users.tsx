/**
 * /admin/users — Pessoas e acessos: quem entra no sistema do terreiro e o que cada um pode fazer.
 *
 * - Lista em `DataTable` (cartões no celular), criação/edição em `CrudDrawer`, exclusão com
 *   `ConfirmDialog`.
 * - "Perfil de acesso": Administrador (vê e muda tudo) ou Operador (só o que o grupo permite).
 * - "Pode fazer:" — ao criar um operador, escolhe o grupo de permissão. O backend já coloca todo
 *   operador novo no grupo padrão "Acesso total" (Q-05); se outro grupo for escolhido, a tela
 *   adiciona a pessoa nele (`POST /permission-groups/{id}/members`) e a tira do padrão — senão o
 *   "Acesso total" continuaria valendo por cima do grupo escolhido.
 *   Os grupos só aparecem para quem é administrador (o endpoint de grupos exige admin).
 * - Senha: a mesma regra do backend (`constants/passwordPolicy.ts`), visível antes de digitar.
 */
'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Pencil, RefreshCw, Trash2, UserPlus } from 'lucide-react';
import AdminLayout from './admin_layout';
import { apiClient, extractApiErrorMessage } from '@/services/api_client';
import { permissionGroupsService, type PermissionGroup } from '@/services/permissionGroupsService';
import CrudDrawer from '@/components/CrudDrawer';
import { PasswordField, TextField } from '@/components/fields';
import { PasswordRules } from '@/components/auth/PasswordRules';
import { PermissionDenied } from '@/components/gates';
import { ConfirmDialog, DataTable, PageHeader, type ColumnDef } from '@/components/admin';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { useSubscription } from '@/hooks/useSubscription';
import { usePermissions } from '@/hooks/usePermissions';
import { useProfile } from '@/hooks/useProfile';
import { useSnackbar } from '@/contexts/SnackbarContext';
import { passwordError } from '@/constants/passwordPolicy';

interface UserItem {
  id: string;
  email: string;
  username: string;
  role: string;
  is_active: boolean;
  created_at: string;
}

type Role = 'admin' | 'operator';

interface FormData {
  email: string;
  username: string;
  password: string;
  role: Role;
  is_active: boolean;
  group_id: string;
}

const EMPTY_FORM: FormData = {
  email: '',
  username: '',
  password: '',
  role: 'operator',
  is_active: true,
  group_id: '',
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// O backend aceita até 500 por página; um terreiro não chega perto disso.
const FETCH_LIMIT = 500;

const ROLE_LABELS: Record<Role, { label: string; description: string }> = {
  admin: { label: 'Administrador', description: 'Vê e muda tudo, inclusive assinatura e pessoas.' },
  operator: { label: 'Operador', description: 'Acessa só o que o grupo dele permite.' },
};

const roleLabel = (role: string) => ROLE_LABELS[role as Role]?.label ?? role;

export default function AdminUsersPage() {
  return (
    <AdminLayout title="Pessoas e acessos">
      <AdminUsersContent />
    </AdminLayout>
  );
}

function AdminUsersContent() {
  const { subscription, canCreateUser: canCreateUserCheck } = useSubscription();
  const { can: canGroup } = usePermissions();
  const { profile } = useProfile();
  const { showSuccess, showError } = useSnackbar();
  const canView = canGroup('usuarios', 'view');
  const canInsert = canGroup('usuarios', 'insert');
  const canEdit = canGroup('usuarios', 'edit');
  const canDelete = canGroup('usuarios', 'delete');
  const isAdmin = profile?.role === 'admin' || profile?.role === 'super_admin';

  const [users, setUsers] = useState<UserItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [roleFilter, setRoleFilter] = useState<'all' | Role>('all');
  const [groups, setGroups] = useState<PermissionGroup[]>([]);

  const canCreateUser = canCreateUserCheck(users.length);

  // Drawer
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerMode, setDrawerMode] = useState<'create' | 'edit'>('create');
  const [editUserId, setEditUserId] = useState<string | null>(null);
  const [formData, setFormData] = useState<FormData>(EMPTY_FORM);
  const [originalData, setOriginalData] = useState<FormData>(EMPTY_FORM);
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [confirmTarget, setConfirmTarget] = useState<UserItem | null>(null);
  const [deleting, setDeleting] = useState(false);

  const defaultGroup = useMemo(() => groups.find((g) => g.is_default) ?? null, [groups]);

  const fetchUsers = useCallback(async () => {
    if (!canView) return;
    setLoading(true);
    setError(null);
    try {
      let url = `/api/v1/admin/users?skip=0&limit=${FETCH_LIMIT}`;
      if (roleFilter !== 'all') url += `&role_filter=${roleFilter}`;
      const response = await apiClient.get(url);
      const data = response.data;
      setUsers(Array.isArray(data) ? data : data?.items || []);
    } catch (err) {
      setError(extractApiErrorMessage(err, 'Não foi possível carregar as pessoas.'));
    } finally {
      setLoading(false);
    }
  }, [canView, roleFilter]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  // Grupos de permissão: só administradores conseguem listar (o endpoint exige admin).
  useEffect(() => {
    if (!isAdmin || !canInsert) return;
    let cancelled = false;
    permissionGroupsService
      .listGroups()
      .then((list) => {
        if (!cancelled && Array.isArray(list)) setGroups(list);
      })
      .catch(() => {
        // Sem grupos a escolha some e o backend usa o padrão "Acesso total".
      });
    return () => {
      cancelled = true;
    };
  }, [isAdmin, canInsert]);

  // ─── Drawer ───────────────────────────────────────────────────────────────
  const openCreate = () => {
    const data = { ...EMPTY_FORM, group_id: defaultGroup?.id ?? '' };
    setFormData(data);
    setOriginalData(data);
    setTouched({});
    setSaveError(null);
    setDrawerMode('create');
    setEditUserId(null);
    setDrawerOpen(true);
  };

  const openEdit = (user: UserItem) => {
    const data: FormData = {
      email: user.email,
      username: user.username,
      password: '',
      role: user.role === 'admin' ? 'admin' : 'operator',
      is_active: user.is_active,
      group_id: '',
    };
    setFormData(data);
    setOriginalData(data);
    setTouched({});
    setSaveError(null);
    setDrawerMode('edit');
    setEditUserId(user.id);
    setDrawerOpen(true);
  };

  const setField = <K extends keyof FormData>(field: K, value: FormData[K]) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const isDirty = (Object.keys(formData) as (keyof FormData)[]).some((k) => formData[k] !== originalData[k]);

  // ─── Validação ───────────────────────────────────────────────────────────
  const pwdMessage = formData.password ? passwordError(formData.password) : null;
  const emailError = touched.email && !EMAIL_RE.test(formData.email) ? 'E-mail inválido.' : '';
  const usernameError = touched.username && !formData.username.trim() ? 'Informe o nome.' : '';
  const passwordFieldError =
    drawerMode === 'create'
      ? touched.password
        ? formData.password
          ? pwdMessage
          : 'Informe uma senha.'
        : null
      : touched.password
        ? pwdMessage
        : null;

  const isValid =
    EMAIL_RE.test(formData.email) &&
    formData.username.trim().length > 0 &&
    (drawerMode === 'create' ? !!formData.password && !pwdMessage : !pwdMessage);

  const showGroupSelect = drawerMode === 'create' && formData.role === 'operator' && groups.length > 0;

  // ─── CRUD ────────────────────────────────────────────────────────────────
  const assignGroup = async (userId: string, groupId: string) => {
    if (!groupId || !defaultGroup || groupId === defaultGroup.id) return;
    await apiClient.post(`/api/v1/admin/permission-groups/${groupId}/members`, { user_id: userId });
    // Sai do "Acesso total" para que valha só o grupo escolhido.
    await apiClient.delete(`/api/v1/admin/permission-groups/${defaultGroup.id}/members/${userId}`);
  };

  const handleSave = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      if (drawerMode === 'create') {
        const res = await apiClient.post('/api/v1/admin/users', {
          email: formData.email,
          username: formData.username,
          password: formData.password,
          role: formData.role,
        });
        const createdId: string | undefined = res?.data?.id;
        if (createdId && formData.role === 'operator') {
          try {
            await assignGroup(createdId, formData.group_id);
          } catch (err) {
            showError(
              extractApiErrorMessage(
                err,
                'A pessoa foi criada, mas não deu para trocar o grupo. Ajuste em Grupos de permissão.',
              ),
            );
          }
        }
        showSuccess('Pessoa adicionada.');
      } else {
        const payload: Record<string, unknown> = {
          username: formData.username,
          role: formData.role,
          is_active: formData.is_active,
        };
        if (formData.password) payload.password = formData.password;
        await apiClient.put(`/api/v1/admin/users/${editUserId}`, payload);
        showSuccess('Alterações salvas.');
      }
      setDrawerOpen(false);
      fetchUsers();
    } catch (err) {
      setSaveError(extractApiErrorMessage(err, 'Não foi possível salvar.'));
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteUser = async () => {
    if (!confirmTarget) return;
    setDeleting(true);
    try {
      await apiClient.delete(`/api/v1/admin/users/${confirmTarget.id}`);
      showSuccess('Pessoa removida.');
      setConfirmTarget(null);
      fetchUsers();
    } catch (err) {
      showError(extractApiErrorMessage(err, 'Não foi possível remover.'));
    } finally {
      setDeleting(false);
    }
  };

  // ─── Colunas ─────────────────────────────────────────────────────────────
  const columns = useMemo<ColumnDef<UserItem>[]>(() => {
    const cols: ColumnDef<UserItem>[] = [
      {
        accessorKey: 'username',
        header: 'Pessoa',
        meta: { mobile: true },
        cell: ({ row }) => (
          <div className="min-w-0">
            <div className="truncate font-medium">{row.original.username}</div>
            <div className="truncate text-xs text-muted-foreground">{row.original.email}</div>
          </div>
        ),
      },
      {
        accessorKey: 'role',
        header: 'Perfil de acesso',
        meta: { mobile: true },
        cell: ({ row }) => (
          <Badge variant={row.original.role === 'admin' ? 'default' : 'outline'}>{roleLabel(row.original.role)}</Badge>
        ),
      },
      {
        accessorKey: 'is_active',
        header: 'Situação',
        meta: { mobile: true },
        cell: ({ row }) =>
          row.original.is_active ? (
            <Badge variant="outline" className="border-success/40 text-success">Ativo</Badge>
          ) : (
            <Badge variant="outline" className="text-muted-foreground">Inativo</Badge>
          ),
      },
      {
        accessorKey: 'created_at',
        header: 'Desde',
        cell: ({ row }) => new Date(row.original.created_at).toLocaleDateString('pt-BR'),
      },
    ];
    if (canEdit || canDelete) {
      cols.push({
        id: 'acoes',
        header: '',
        enableSorting: false,
        meta: { align: 'right', mobile: true },
        cell: ({ row }) => (
          <div className="flex justify-end gap-1">
            {canEdit && (
              <Button size="icon-sm" variant="ghost" aria-label="Editar usuário" onClick={() => openEdit(row.original)}>
                <Pencil />
              </Button>
            )}
            {canDelete && (
              <Button
                size="icon-sm"
                variant="ghost"
                className="text-destructive hover:text-destructive"
                aria-label="Excluir usuário"
                onClick={() => setConfirmTarget(row.original)}
              >
                <Trash2 />
              </Button>
            )}
          </div>
        ),
      });
    }
    return cols;
    // openEdit só usa setters estáveis.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canEdit, canDelete]);

  if (!canView) {
    return <PermissionDenied className="mt-4" />;
  }

  return (
    <div className="space-y-4">
      <div data-tour="users-header">
        <PageHeader
          title="Pessoas e acessos"
          subtitle="Quem entra no sistema do terreiro e o que cada pessoa pode fazer."
          actions={
            <>
              <div data-tour="users-filtro">
                <Select value={roleFilter} onValueChange={(v) => setRoleFilter(v as 'all' | Role)}>
                  <SelectTrigger className="w-44" aria-label="Filtrar por perfil de acesso">
                    <SelectValue placeholder="Perfil de acesso" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos os perfis</SelectItem>
                    <SelectItem value="admin">Administradores</SelectItem>
                    <SelectItem value="operator">Operadores</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button variant="outline" onClick={fetchUsers} disabled={loading}>
                <RefreshCw /> Atualizar
              </Button>
              {canInsert && (
                <Button data-tour="users-novo" onClick={openCreate} disabled={loading || !canCreateUser}>
                  <UserPlus /> Nova pessoa
                </Button>
              )}
            </>
          }
        />
      </div>

      {canInsert && !canCreateUser && !loading && (
        <Alert variant="info">
          <AlertDescription>
            Seu plano permite {subscription?.max_users ?? 0} pessoa(s).{' '}
            <Link href="/admin/billing" className="font-medium underline underline-offset-4">
              Ver planos
            </Link>{' '}
            para adicionar mais.
          </AlertDescription>
        </Alert>
      )}

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div data-tour="users-tabela">
        <DataTable
          columns={columns}
          data={users}
          getRowId={(u) => u.id}
          loading={loading}
          pageSize={20}
          emptyMessage="Nenhuma pessoa encontrada."
        />
      </div>

      <CrudDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title={drawerMode === 'create' ? 'Nova pessoa' : 'Editar pessoa'}
        subtitle={
          drawerMode === 'create'
            ? 'A pessoa entra com o e-mail e a senha que você definir aqui.'
            : 'Atualize os dados de acesso.'
        }
        icon={<UserPlus />}
        onSave={handleSave}
        saveLabel={drawerMode === 'create' ? 'Adicionar' : 'Salvar'}
        saving={saving}
        saveDisabled={!isValid}
        isDirty={isDirty}
        error={saveError}
      >
        <TextField
          label="E-mail"
          type="email"
          value={formData.email}
          onChange={(e) => setField('email', e.target.value)}
          onBlur={() => setTouched((p) => ({ ...p, email: true }))}
          required
          disabled={drawerMode === 'edit'}
          error={emailError || undefined}
          autoComplete="off"
        />
        <TextField
          label="Nome"
          value={formData.username}
          onChange={(e) => setField('username', e.target.value)}
          onBlur={() => setTouched((p) => ({ ...p, username: true }))}
          required
          error={usernameError || undefined}
        />
        <div className="space-y-2">
          <PasswordField
            label={drawerMode === 'create' ? 'Senha' : 'Nova senha (opcional)'}
            value={formData.password}
            onChange={(e) => setField('password', e.target.value)}
            onBlur={() => setTouched((p) => ({ ...p, password: true }))}
            required={drawerMode === 'create'}
            error={passwordFieldError || undefined}
            helperText={drawerMode === 'edit' ? 'Deixe em branco para manter a senha atual.' : undefined}
            autoComplete="new-password"
          />
          {(drawerMode === 'create' || formData.password) && <PasswordRules value={formData.password} />}
        </div>

        <fieldset className="m-0 min-w-0 space-y-2 border-0 p-0">
          <legend className="mb-2 p-0 text-sm font-medium">Perfil de acesso</legend>
          <RadioGroup
            value={formData.role}
            onValueChange={(v) => setField('role', v as Role)}
            className="gap-2"
          >
            {(Object.keys(ROLE_LABELS) as Role[]).map((r) => (
              <Label
                key={r}
                htmlFor={`role-${r}`}
                className="flex cursor-pointer items-start gap-3 rounded-md border p-3 font-normal has-[[data-state=checked]]:border-primary"
              >
                <RadioGroupItem id={`role-${r}`} value={r} className="mt-0.5" />
                <span>
                  <span className="block text-sm font-medium">{ROLE_LABELS[r].label}</span>
                  <span className="block text-xs text-muted-foreground">{ROLE_LABELS[r].description}</span>
                </span>
              </Label>
            ))}
          </RadioGroup>
        </fieldset>

        {showGroupSelect && (
          <div className="space-y-1.5">
            <Label htmlFor="user-group">Pode fazer:</Label>
            <Select value={formData.group_id || defaultGroup?.id} onValueChange={(v) => setField('group_id', v)}>
              <SelectTrigger id="user-group" className="w-full">
                <SelectValue placeholder="Escolha um grupo" />
              </SelectTrigger>
              <SelectContent>
                {groups.map((g) => (
                  <SelectItem key={g.id} value={g.id}>
                    {g.name}
                    {g.is_default ? ' (padrão)' : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Os grupos ficam em{' '}
              <Link href="/admin/permission-groups" className="underline underline-offset-4">
                Grupos de permissão
              </Link>
              .
            </p>
          </div>
        )}

        {drawerMode === 'edit' && (
          <div className="flex items-center justify-between gap-4 rounded-md border p-3">
            <Label htmlFor="user-active" className="block font-normal">
              <span className="block text-sm font-medium">Ativo</span>
              <span className="block text-xs text-muted-foreground">Desligado, a pessoa não consegue entrar.</span>
            </Label>
            <Switch
              id="user-active"
              checked={formData.is_active}
              onCheckedChange={(v) => setField('is_active', v)}
            />
          </div>
        )}
      </CrudDrawer>

      <ConfirmDialog
        open={!!confirmTarget}
        title="Remover pessoa"
        message={
          <>
            Remover <strong>{confirmTarget?.email}</strong>? A pessoa perde o acesso na hora.
          </>
        }
        confirmText="Excluir"
        destructive
        loading={deleting}
        onConfirm={handleDeleteUser}
        onCancel={() => setConfirmTarget(null)}
      />
    </div>
  );
}
