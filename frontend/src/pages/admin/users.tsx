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
 * - Convite por e-mail (11/2026): "Nova pessoa" não pede senha. A pessoa recebe o convite e cria
 *   a própria senha (ou usa a que já usa no GiraHub) em `/convite-equipe/[token]`; a conta só nasce
 *   no aceite. Convites em aberto, vencidos e recusados aparecem na lista com a situação; o clique
 *   abre a gaveta do convite (ajustar, Reenviar convite, Cancelar convite). O perfil escolhido fica
 *   no convite e é aplicado no aceite (backend). Na edição, no lugar de "Nova senha", "Enviar link
 *   para criar nova senha" — quem administra nunca sabe a senha de ninguém.
 * - Proteções espelhadas do backend (`users.py`): ninguém se exclui, se desativa nem muda o
 *   próprio perfil; o último administrador ativo não sai; operador (mesmo com permissão de
 *   grupo) não cria/edita/exclui administradores. O limite do plano conta só pessoas ativas
 *   (a lista vem sempre completa — o filtro de perfil é só visual).
 */
'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { KeyRound, MailCheck, RefreshCw, Send, Trash2, UserPlus, XCircle } from 'lucide-react';
import AdminLayout from './admin_layout';
import { apiClient, extractApiErrorMessage } from '@/services/api_client';
import { permissionGroupsService, type PermissionGroup } from '@/services/permissionGroupsService';
import CrudDrawer from '@/components/CrudDrawer';
import { TextField } from '@/components/fields';
import { PermissionDenied } from '@/components/gates';
import { ConfirmDialog, DataTable, PageHeader, type ColumnDef } from '@/components/admin';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { usePermissions } from '@/hooks/usePermissions';
import { useProfile } from '@/hooks/useProfile';
import { useSnackbar } from '@/contexts/SnackbarContext';

interface UserItem {
  id: string;
  email: string;
  username: string;
  role: string;
  is_active: boolean;
  created_at: string;
}

type Role = 'admin' | 'operator';

/** Convite por e-mail ainda sem aceite (`GET /api/v1/admin/users/convites`). */
interface ConviteItem {
  id: string;
  email: string;
  nome: string;
  role: string;
  group_id?: string | null;
  situacao: 'enviado' | 'vencido' | 'recusado';
  enviado_em: string;
  expira_em: string;
  recusado_em?: string | null;
  criado_por_nome?: string | null;
  created_at: string;
}

/** Linha da tabela: pessoa com acesso ou convite pendente. */
type Linha =
  | { tipo: 'pessoa'; id: string; nome: string; email: string; role: string; pessoa: UserItem }
  | { tipo: 'convite'; id: string; nome: string; email: string; role: string; convite: ConviteItem };

interface FormData {
  email: string;
  username: string;
  role: Role;
  is_active: boolean;
  group_id: string;
}

const EMPTY_FORM: FormData = {
  email: '',
  username: '',
  role: 'operator',
  is_active: true,
  group_id: '',
};

const dataCurta = (iso: string) => new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });

const situacaoDoConvite = (c: ConviteItem) =>
  c.situacao === 'enviado'
    ? `Convite enviado · vale até ${dataCurta(c.expira_em)}`
    : c.situacao === 'vencido'
      ? 'Convite vencido'
      : 'Convite recusado';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// O backend aceita até 500 por página; um terreiro não chega perto disso.
const FETCH_LIMIT = 500;

const ROLE_LABELS: Record<Role, { label: string; description: string }> = {
  admin: { label: 'Administrador', description: 'Vê e muda tudo, inclusive assinatura e pessoas.' },
  operator: { label: 'Operador', description: 'Acessa só o que o perfil de acesso dele permite.' },
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
  const { can: canGroup } = usePermissions();
  const { profile } = useProfile();
  const { showSuccess, showError } = useSnackbar();
  const canView = canGroup('usuarios', 'view');
  const canInsert = canGroup('usuarios', 'insert');
  const canEdit = canGroup('usuarios', 'edit');
  const canDelete = canGroup('usuarios', 'delete');
  const isAdmin = profile?.role === 'admin' || profile?.role === 'super_admin';

  // Sempre a lista completa: o filtro de perfil é só visual — a regra do
  // "último administrador" precisa enxergar todo mundo. Usuários não têm limite
  // de plano (ilimitados em todos os planos desde out/2026).
  const [allUsers, setAllUsers] = useState<UserItem[]>([]);
  const [convites, setConvites] = useState<ConviteItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [roleFilter, setRoleFilter] = useState<'all' | Role | 'convites'>('all');
  const [groups, setGroups] = useState<PermissionGroup[]>([]);

  const linhas = useMemo<Linha[]>(() => {
    const pessoas: Linha[] = allUsers.map((u) => ({ tipo: 'pessoa', id: u.id, nome: u.username, email: u.email, role: u.role, pessoa: u }));
    const pendentes: Linha[] = convites.map((c) => ({ tipo: 'convite', id: `convite-${c.id}`, nome: c.nome, email: c.email, role: c.role, convite: c }));
    const todas = [...pendentes, ...pessoas];
    if (roleFilter === 'all') return todas;
    if (roleFilter === 'convites') return pendentes;
    return todas.filter((l) => l.role === roleFilter);
  }, [allUsers, convites, roleFilter]);
  const activeAdminCount = useMemo(
    () => allUsers.filter((u) => u.is_active && u.role === 'admin').length,
    [allUsers],
  );

  /** Proteções espelhadas do backend (users.py): o que esta linha não pode sofrer. */
  const rowGuards = useCallback(
    (u: UserItem) => {
      const isSelf = !!profile?.id && u.id === profile.id;
      const isLastAdmin = u.role === 'admin' && u.is_active && activeAdminCount <= 1;
      // Operador (mesmo com permissão de grupo) não mexe em administradores.
      const protectedAdmin = !isAdmin && (u.role === 'admin' || u.role === 'super_admin');
      return {
        isSelf,
        isLastAdmin,
        canEditRow: !protectedAdmin,
        canDeleteRow: !protectedAdmin && !isSelf && !isLastAdmin,
        lockRoleAndActive: isSelf || isLastAdmin,
      };
    },
    [profile?.id, activeAdminCount, isAdmin],
  );
  /** Convite de administrador: só administrador mexe (backend 403). */
  const podeMexerNoConvite = useCallback((c: ConviteItem) => isAdmin || c.role !== 'admin', [isAdmin]);

  // Drawer
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerMode, setDrawerMode] = useState<'create' | 'edit' | 'convite'>('create');
  const [editUserId, setEditUserId] = useState<string | null>(null);
  const [conviteAberto, setConviteAberto] = useState<ConviteItem | null>(null);
  const [formData, setFormData] = useState<FormData>(EMPTY_FORM);
  const [originalData, setOriginalData] = useState<FormData>(EMPTY_FORM);
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [acaoConvite, setAcaoConvite] = useState<'reenviar' | null>(null);
  const [enviandoLink, setEnviandoLink] = useState(false);

  const [confirmTarget, setConfirmTarget] = useState<UserItem | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [cancelarConvite, setCancelarConvite] = useState<ConviteItem | null>(null);
  const [cancelando, setCancelando] = useState(false);

  const defaultGroup = useMemo(() => groups.find((g) => g.is_default) ?? null, [groups]);

  const fetchUsers = useCallback(async () => {
    if (!canView) return;
    setLoading(true);
    setError(null);
    try {
      const [response, pendentes] = await Promise.all([
        apiClient.get(`/api/v1/admin/users?skip=0&limit=${FETCH_LIMIT}`),
        apiClient.get('/api/v1/admin/users/convites').catch(() => ({ data: [] })),
      ]);
      const data = response.data;
      setAllUsers(Array.isArray(data) ? data : data?.items || []);
      const lista = Array.isArray(pendentes?.data) ? pendentes.data : [];
      setConvites(lista.filter((c: Partial<ConviteItem>) => typeof c?.situacao === 'string'));
    } catch (err) {
      setError(extractApiErrorMessage(err, 'Não foi possível carregar as pessoas.'));
    } finally {
      setLoading(false);
    }
  }, [canView]);

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
    setConviteAberto(null);
    setDrawerOpen(true);
  };

  const openEdit = (user: UserItem) => {
    const data: FormData = {
      email: user.email,
      username: user.username,
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
    setConviteAberto(null);
    setDrawerOpen(true);
  };

  const openConvite = (c: ConviteItem) => {
    const data: FormData = {
      email: c.email,
      username: c.nome,
      role: c.role === 'admin' ? 'admin' : 'operator',
      is_active: true,
      group_id: c.group_id ?? defaultGroup?.id ?? '',
    };
    setFormData(data);
    setOriginalData(data);
    setTouched({});
    setSaveError(null);
    setDrawerMode('convite');
    setEditUserId(null);
    setConviteAberto(c);
    setDrawerOpen(true);
  };

  const abrirLinha = (l: Linha) => (l.tipo === 'pessoa' ? openEdit(l.pessoa) : openConvite(l.convite));

  const setField = <K extends keyof FormData>(field: K, value: FormData[K]) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const isDirty = (Object.keys(formData) as (keyof FormData)[]).some((k) => formData[k] !== originalData[k]);

  // ─── Validação ───────────────────────────────────────────────────────────
  const emailError = touched.email && !EMAIL_RE.test(formData.email) ? 'E-mail inválido.' : '';
  const usernameError = touched.username && !formData.username.trim() ? 'Informe o nome.' : '';
  const isValid = EMAIL_RE.test(formData.email) && formData.username.trim().length > 0;

  const showGroupSelect =
    (drawerMode === 'create' || drawerMode === 'convite') && formData.role === 'operator' && groups.length > 0;

  const editingUser = drawerMode === 'edit' ? allUsers.find((u) => u.id === editUserId) : undefined;
  const editGuard = editingUser ? rowGuards(editingUser) : null;
  const lockRoleAndActive = !!editGuard?.lockRoleAndActive;
  const conviteRecusado = drawerMode === 'convite' && conviteAberto?.situacao === 'recusado';

  // ─── CRUD ────────────────────────────────────────────────────────────────
  const corpoDoGrupo = () =>
    formData.role === 'operator' && formData.group_id && formData.group_id !== defaultGroup?.id
      ? { group_id: formData.group_id }
      : { group_id: null };

  const handleSave = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      if (drawerMode === 'create') {
        await apiClient.post('/api/v1/admin/users/convites', {
          email: formData.email.trim(),
          nome: formData.username.trim(),
          role: formData.role,
          ...corpoDoGrupo(),
        });
        showSuccess(`Convite enviado para ${formData.email.trim()}.`);
      } else if (drawerMode === 'convite' && conviteAberto) {
        await apiClient.put(`/api/v1/admin/users/convites/${conviteAberto.id}`, {
          nome: formData.username.trim(),
          role: formData.role,
          ...corpoDoGrupo(),
        });
        showSuccess('Convite ajustado. O link enviado continua valendo.');
      } else {
        const payload: Record<string, unknown> = {
          username: formData.username,
          role: formData.role,
          is_active: formData.is_active,
        };
        const { data } = await apiClient.put(`/api/v1/admin/users/${editUserId}`, payload);
        // Operador/admin que também é médium: desativar tira só o painel (vira conta da Área do Médium).
        showSuccess(
          !formData.is_active && data?.role === 'medium'
            ? 'Acesso ao painel retirado. Como a pessoa é médium, continua na Área do Médium.'
            : 'Alterações salvas.',
        );
      }
      setDrawerOpen(false);
      fetchUsers();
    } catch (err) {
      setSaveError(mensagemDaApi(err, 'Não foi possível salvar.'));
    } finally {
      setSaving(false);
    }
  };

  const reenviar = async (c: ConviteItem) => {
    setAcaoConvite('reenviar');
    setSaveError(null);
    try {
      await apiClient.post(`/api/v1/admin/users/convites/${c.id}/reenviar`);
      showSuccess(`Convite reenviado para ${c.email}. O link anterior deixou de valer.`);
      setDrawerOpen(false);
      fetchUsers();
    } catch (err) {
      setSaveError(mensagemDaApi(err, 'Não foi possível reenviar.'));
    } finally {
      setAcaoConvite(null);
    }
  };

  const handleCancelarConvite = async () => {
    if (!cancelarConvite) return;
    setCancelando(true);
    try {
      await apiClient.delete(`/api/v1/admin/users/convites/${cancelarConvite.id}`);
      showSuccess(cancelarConvite.situacao === 'recusado' ? 'Convite tirado da lista.' : 'Convite cancelado. O link parou de funcionar.');
      setCancelarConvite(null);
      setDrawerOpen(false);
      fetchUsers();
    } catch (err) {
      showError(mensagemDaApi(err, 'Não foi possível cancelar.'));
    } finally {
      setCancelando(false);
    }
  };

  const enviarLinkNovaSenha = async () => {
    if (!editUserId) return;
    setEnviandoLink(true);
    try {
      await apiClient.post(`/api/v1/admin/users/${editUserId}/link-nova-senha`);
      showSuccess(`Enviamos para ${formData.email} o link de criar uma nova senha.`);
    } catch (err) {
      showError(mensagemDaApi(err, 'Não foi possível enviar o link.'));
    } finally {
      setEnviandoLink(false);
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
  const columns = useMemo<ColumnDef<Linha>[]>(() => {
    const cols: ColumnDef<Linha>[] = [
      {
        accessorKey: 'nome',
        header: 'Pessoa',
        meta: { mobile: true },
        cell: ({ row }) => (
          // J10 v2 · 01: as iniciais em círculo, o nome e o e-mail.
          <div className="flex min-w-0 items-center gap-3">
            <span
              aria-hidden
              className={
                row.original.tipo === 'convite'
                  ? 'flex size-8 shrink-0 items-center justify-center rounded-full border border-dashed border-[color:var(--color-barro-600)] text-xs font-bold text-[color:var(--color-barro-700)]'
                  : 'flex size-8 shrink-0 items-center justify-center rounded-full bg-[color:var(--color-barro-600)] text-xs font-bold text-white'
              }
            >
              {row.original.nome
                .split(/[\s@._-]+/)
                .filter(Boolean)
                .slice(0, 2)
                .map((p) => p.charAt(0).toUpperCase())
                .join('')}
            </span>
            <div className="min-w-0">
              <div className="truncate font-semibold">{row.original.nome}</div>
              <div className="truncate text-xs text-muted-foreground">{row.original.email}</div>
            </div>
          </div>
        ),
      },
      {
        accessorKey: 'role',
        header: 'Tipo de acesso',
        meta: { mobile: true },
        cell: ({ row }) => <span className="font-semibold">{roleLabel(row.original.role)}</span>,
      },
      {
        id: 'situacao',
        header: 'Situação',
        meta: { mobile: true },
        cell: ({ row }) => {
          const l = row.original;
          if (l.tipo === 'convite') {
            return l.convite.situacao === 'enviado' ? (
              <Badge className="border-transparent bg-info/15 text-info-strong">{situacaoDoConvite(l.convite)}</Badge>
            ) : (
              <Badge className="border-transparent bg-warning/20 text-warning-strong">{situacaoDoConvite(l.convite)}</Badge>
            );
          }
          return l.pessoa.is_active ? (
            <Badge className="border-transparent bg-success/15 text-success-strong">Ativo</Badge>
          ) : (
            <Badge className="border-transparent bg-warning/20 text-warning-strong">Inativo</Badge>
          );
        },
      },
      {
        id: 'desde',
        header: 'Desde',
        cell: ({ row }) => {
          const l = row.original;
          const iso = l.tipo === 'pessoa' ? l.pessoa.created_at : l.convite.enviado_em;
          return (
            <span className="text-muted-foreground">
              {l.tipo === 'convite' ? `Convidado em ${dataCurta(iso)}` : new Date(iso).toLocaleDateString('pt-BR', { month: '2-digit', year: 'numeric' })}
            </span>
          );
        },
      },
    ];
    if (canEdit || canDelete || canInsert) {
      cols.push({
        id: 'acoes',
        header: '',
        enableSorting: false,
        meta: { align: 'right', mobile: true },
        cell: ({ row }) => {
          const l = row.original;
          if (l.tipo === 'convite') {
            if (!canDelete || !podeMexerNoConvite(l.convite)) return null;
            return (
              <div className="flex justify-end gap-1">
                <Button
                  size="icon-sm"
                  variant="ghost"
                  className="text-destructive hover:text-destructive"
                  aria-label={`Cancelar convite de ${l.email}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    setCancelarConvite(l.convite);
                  }}
                >
                  <XCircle />
                </Button>
              </div>
            );
          }
          const guard = rowGuards(l.pessoa);
          return (
            <div className="flex justify-end gap-1">
              {canDelete && guard.canDeleteRow && (
                <Button
                  size="icon-sm"
                  variant="ghost"
                  className="text-destructive hover:text-destructive"
                  aria-label="Excluir usuário"
                  onClick={() => setConfirmTarget(l.pessoa)}
                >
                  <Trash2 />
                </Button>
              )}
            </div>
          );
        },
      });
    }
    return cols;
    // openEdit só usa setters estáveis.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canEdit, canDelete, canInsert, rowGuards, podeMexerNoConvite]);

  if (!canView) {
    return <PermissionDenied className="mt-4" />;
  }

  const podeAbrir = (l: Linha) =>
    l.tipo === 'pessoa' ? canEdit && rowGuards(l.pessoa).canEditRow : (canEdit || canInsert || canDelete) && podeMexerNoConvite(l.convite);

  const tituloDrawer = drawerMode === 'create' ? 'Convidar pessoa' : drawerMode === 'convite' ? 'Convite' : 'Editar pessoa';
  const subtituloDrawer =
    drawerMode === 'create'
      ? 'A pessoa recebe um e-mail para criar a própria senha e entrar no terreiro.'
      : drawerMode === 'convite' && conviteAberto
        ? `${situacaoDoConvite(conviteAberto)}${conviteAberto.criado_por_nome ? ` · por ${conviteAberto.criado_por_nome}` : ''}`
        : 'Atualize os dados de acesso.';

  return (
    <div data-slot="page" className="space-y-4">
      <div data-tour="users-header">
        <PageHeader
          title="Pessoas e acessos"
          subtitle="Quem entra no sistema do terreiro."
          eyebrow="Conta e plano"
          actions={
            <>
              <div data-tour="users-filtro">
                <Select value={roleFilter} onValueChange={(v) => setRoleFilter(v as 'all' | Role | 'convites')}>
                  <SelectTrigger className="w-48" aria-label="Filtrar por tipo de acesso">
                    <SelectValue placeholder="Tipo de acesso" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos os tipos</SelectItem>
                    <SelectItem value="admin">Administradores</SelectItem>
                    <SelectItem value="operator">Operadores</SelectItem>
                    <SelectItem value="convites">Convites pendentes</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button variant="outline" onClick={fetchUsers} disabled={loading}>
                <RefreshCw /> Atualizar
              </Button>
              {canInsert && (
                <Button data-tour="users-novo" onClick={openCreate} disabled={loading}>
                  <UserPlus /> Nova pessoa
                </Button>
              )}
            </>
          }
        />
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div data-tour="users-tabela">
        <DataTable
          // Clique para editar (04/11/2026): a linha abre a edição; as outras ações seguem como botões.
          onRowClick={canEdit || canInsert || canDelete ? abrirLinha : undefined}
          isRowClickable={podeAbrir}
          rowLabel={(l) => (l.tipo === 'convite' ? `Abrir convite de ${l.email}` : `Editar ${l.nome || l.email}`)}
          columns={columns}
          data={linhas}
          getRowId={(l) => l.id}
          loading={loading}
          pageSize={20}
          emptyMessage={roleFilter === 'convites' ? 'Nenhum convite pendente.' : 'Nenhuma pessoa encontrada.'}
        />
      </div>

      <CrudDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title={tituloDrawer}
        subtitle={subtituloDrawer}
        icon={drawerMode === 'edit' ? <UserPlus /> : <MailCheck />}
        onSave={handleSave}
        saveLabel={drawerMode === 'create' ? 'Enviar convite' : drawerMode === 'convite' ? 'Salvar ajustes' : 'Salvar'}
        saving={saving}
        saveDisabled={!isValid || (drawerMode === 'convite' && (!canEdit || conviteRecusado || !isDirty))}
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
          disabled={drawerMode !== 'create'}
          error={emailError || undefined}
          helperText={
            drawerMode === 'create'
              ? 'O convite vai para este e-mail. É com ele que a pessoa entra.'
              : drawerMode === 'convite'
                ? 'Errou o e-mail? Cancele este convite e convide de novo.'
                : undefined
          }
          autoComplete="off"
        />
        <TextField
          label="Nome"
          value={formData.username}
          onChange={(e) => setField('username', e.target.value)}
          onBlur={() => setTouched((p) => ({ ...p, username: true }))}
          required
          disabled={conviteRecusado}
          error={usernameError || undefined}
        />

        <fieldset className="m-0 min-w-0 space-y-2 border-0 p-0">
          <legend className="mb-2 p-0 text-sm font-medium">Tipo de acesso</legend>
          <RadioGroup
            value={formData.role}
            onValueChange={(v) => setField('role', v as Role)}
            className="gap-2"
            disabled={lockRoleAndActive || conviteRecusado}
          >
            {(Object.keys(ROLE_LABELS) as Role[]).map((r) => (
              <Label
                key={r}
                htmlFor={`role-${r}`}
                className="flex cursor-pointer items-start gap-3 rounded-md border p-3 font-normal has-[[data-state=checked]]:border-primary has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60"
              >
                {/* Só administrador cria/promove administrador (backend 403). */}
                <RadioGroupItem id={`role-${r}`} value={r} className="mt-0.5" disabled={r === 'admin' && !isAdmin} />
                <span>
                  <span className="block text-sm font-medium">{ROLE_LABELS[r].label}</span>
                  <span className="block text-xs text-muted-foreground">{ROLE_LABELS[r].description}</span>
                </span>
              </Label>
            ))}
          </RadioGroup>
          {lockRoleAndActive && (
            <p className="text-xs text-muted-foreground">
              {editGuard?.isSelf
                ? 'Você não pode mudar o seu próprio perfil nem se desativar. Peça a outro administrador.'
                : 'Esta é a única pessoa administradora ativa. Promova outra pessoa antes de mudar o perfil ou desativar.'}
            </p>
          )}
        </fieldset>

        {showGroupSelect && (
          <div className="space-y-1.5">
            <Label htmlFor="user-group">Pode fazer:</Label>
            <Select
              value={formData.group_id || defaultGroup?.id}
              onValueChange={(v) => setField('group_id', v)}
              disabled={conviteRecusado}
            >
              <SelectTrigger id="user-group" className="w-full">
                <SelectValue placeholder="Escolha um perfil" />
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
              Vale quando a pessoa aceitar o convite. Os grupos ficam em{' '}
              <Link href="/admin/permission-groups" className="underline underline-offset-4">
                Perfis de acesso
              </Link>
              .
            </p>
          </div>
        )}

        {drawerMode === 'convite' && conviteAberto && (
          // Reenviar e cancelar com o mesmo peso (design ético, regra 1: cancelar custa o mesmo que convidar).
          <div className="space-y-2 rounded-md border p-3">
            <p className="text-sm font-medium">
              {conviteRecusado ? 'A pessoa recusou o convite.' : 'A pessoa ainda não aceitou.'}
            </p>
            <p className="text-xs text-muted-foreground">
              Reenviar manda um link novo, válido por mais 7 dias, e o anterior deixa de valer.
            </p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {canInsert && podeMexerNoConvite(conviteAberto) && (
                <Button variant="outline" onClick={() => reenviar(conviteAberto)} disabled={acaoConvite !== null}>
                  <Send /> {acaoConvite === 'reenviar' ? 'Reenviando…' : 'Reenviar convite'}
                </Button>
              )}
              {canDelete && podeMexerNoConvite(conviteAberto) && (
                <Button
                  variant="outline"
                  className="text-destructive hover:text-destructive"
                  onClick={() => setCancelarConvite(conviteAberto)}
                  disabled={acaoConvite !== null}
                >
                  <XCircle /> {conviteRecusado ? 'Tirar da lista' : 'Cancelar convite'}
                </Button>
              )}
            </div>
          </div>
        )}

        {drawerMode === 'edit' && (
          <>
            <div className="space-y-2 rounded-md border p-3">
              <span className="block text-sm font-medium">Senha</span>
              <span className="block text-xs text-muted-foreground">
                Só a própria pessoa define a senha. Se ela esqueceu, mande o link para criar uma nova; a senha atual
                continua valendo até ela usar o link.
              </span>
              <Button variant="outline" onClick={enviarLinkNovaSenha} disabled={enviandoLink || !formData.is_active}>
                <KeyRound /> {enviandoLink ? 'Enviando…' : 'Enviar link para criar nova senha'}
              </Button>
            </div>
            <div className="flex items-center justify-between gap-4 rounded-md border p-3">
              <Label htmlFor="user-active" className="block font-normal">
                <span className="block text-sm font-medium">Ativo</span>
                <span className="block text-xs text-muted-foreground">Desligado, a pessoa não entra mais no painel.</span>
              </Label>
              <Switch
                id="user-active"
                checked={formData.is_active}
                onCheckedChange={(v) => setField('is_active', v)}
                disabled={lockRoleAndActive}
              />
            </div>
          </>
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

      <ConfirmDialog
        open={!!cancelarConvite}
        title={cancelarConvite?.situacao === 'recusado' ? 'Tirar convite da lista' : 'Cancelar convite'}
        message={
          cancelarConvite?.situacao === 'recusado' ? (
            <>
              Tirar o convite de <strong>{cancelarConvite?.email}</strong> da lista?
            </>
          ) : (
            <>
              Cancelar o convite de <strong>{cancelarConvite?.email}</strong>? O link para de funcionar na hora.
            </>
          )
        }
        confirmText={cancelarConvite?.situacao === 'recusado' ? 'Tirar da lista' : 'Cancelar convite'}
        cancelText="Voltar"
        destructive
        loading={cancelando}
        onConfirm={handleCancelarConvite}
        onCancel={() => setCancelarConvite(null)}
        overlayClassName="z-[70]"
        className="z-[70]"
      />
    </div>
  );
}

/** Mensagem do backend, inclusive no formato {detail: {message, error_code}}. */
function mensagemDaApi(err: unknown, fallback: string): string {
  const detail = (err as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail;
  if (detail && typeof detail === 'object' && !Array.isArray(detail) && typeof (detail as { message?: unknown }).message === 'string') {
    return (detail as { message: string }).message;
  }
  return extractApiErrorMessage(err, fallback);
}
