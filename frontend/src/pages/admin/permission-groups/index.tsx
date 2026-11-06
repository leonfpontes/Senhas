/**
 * /admin/permission-groups — grupos de permissão: o que cada operador pode fazer.
 *
 * Só administradores (os endpoints de grupos exigem admin; a tela fica fora do
 * `usePermissions` — ver `scripts/audit-permission-guards.js`). O grupo padrão "Acesso total"
 * recebe operadores novos e não pode ser excluído.
 */
'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import { ChevronRight, Plus, RefreshCw, Search, ShieldCheck, Trash2 } from 'lucide-react';
import AdminLayout from '../admin_layout';
import { permissionGroupsService, type PermissionGroup } from '@/services/permissionGroupsService';
import { apiClient, extractApiErrorMessage } from '@/services/api_client';
import CrudDrawer from '@/components/CrudDrawer';
import { TextField } from '@/components/fields';
import { PermissionDenied } from '@/components/gates';
import { ConfirmDialog, DataTable, EmptyState, PageHeader, type ColumnDef } from '@/components/admin';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useProfile } from '@/hooks/useProfile';
import { useSnackbar } from '@/contexts/SnackbarContext';
import { FEATURE_LABELS } from '@/constants/permissionFeatures';

const TOTAL_MODULES = Object.keys(FEATURE_LABELS).length;

interface UserItem {
  id: string;
  email: string;
  username: string;
  role: string;
}

export default function PermissionGroupsPage() {
  return (
    <AdminLayout title="Perfis de acesso">
      <PermissionGroupsGate />
    </AdminLayout>
  );
}

function PermissionGroupsGate() {
  const { profile, loading } = useProfile();
  if (loading && !profile) return <Skeleton className="h-40 w-full" />;
  const isAdmin = profile?.role === 'admin' || profile?.role === 'super_admin';
  if (!isAdmin) return <PermissionDenied message="Só administradores mudam os perfis de acesso." />;
  return <PermissionGroupsContent />;
}

function PermissionGroupsContent() {
  const router = useRouter();
  const { showSuccess, showError } = useSnackbar();
  const [groups, setGroups] = useState<PermissionGroup[]>([]);
  const [users, setUsers] = useState<UserItem[]>([]);
  const [groupMembersMap, setGroupMembersMap] = useState<Record<string, string[]>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Novo grupo
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [nameTouched, setNameTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [drawerError, setDrawerError] = useState<string | null>(null);

  // Exclusão
  const [groupToDelete, setGroupToDelete] = useState<PermissionGroup | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const groupsData = await permissionGroupsService.listGroups();
      setGroups(groupsData);

      const usersRes = await apiClient.get('/api/v1/admin/users?limit=500');
      setUsers(Array.isArray(usersRes.data) ? usersRes.data : usersRes.data?.items || []);

      // Membros de cada grupo, para achar operadores sem grupo.
      const membersMap: Record<string, string[]> = {};
      await Promise.all(
        groupsData.map(async (g) => {
          try {
            const members = await permissionGroupsService.getGroupMembers(g.id);
            membersMap[g.id] = members.map((m) => m.id);
          } catch {
            membersMap[g.id] = [];
          }
        }),
      );
      setGroupMembersMap(membersMap);
    } catch (err) {
      setError(extractApiErrorMessage(err, 'Não foi possível carregar os perfis.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const operatorsWithoutGroup = useMemo(() => {
    const grouped = new Set(Object.values(groupMembersMap).flat());
    return users.filter((u) => u.role === 'operator' && !grouped.has(u.id));
  }, [users, groupMembersMap]);

  const filteredGroups = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return groups;
    return groups.filter(
      (g) => g.name.toLowerCase().includes(q) || (g.description || '').toLowerCase().includes(q),
    );
  }, [groups, searchQuery]);

  const openCreate = () => {
    setName('');
    setDescription('');
    setNameTouched(false);
    setDrawerError(null);
    setDrawerOpen(true);
  };

  const handleCreate = async () => {
    setSaving(true);
    setDrawerError(null);
    try {
      const created = await permissionGroupsService.createGroup({ name: name.trim(), description });
      showSuccess('Perfil criado. Agora marque o que ele pode fazer.');
      setDrawerOpen(false);
      if (created?.id) {
        router.push(`/admin/permission-groups/${created.id}?aba=permissoes`);
      } else {
        fetchData();
      }
    } catch (err) {
      setDrawerError(extractApiErrorMessage(err, 'Não foi possível criar o perfil.'));
    } finally {
      setSaving(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!groupToDelete) return;
    setDeleting(true);
    try {
      await permissionGroupsService.deleteGroup(groupToDelete.id, groupToDelete.members_count > 0);
      showSuccess('Perfil excluído.');
      setGroupToDelete(null);
      fetchData();
    } catch (err) {
      showError(extractApiErrorMessage(err, 'Não foi possível excluir o perfil.'));
    } finally {
      setDeleting(false);
    }
  };

  const columns = useMemo<ColumnDef<PermissionGroup>[]>(
    () => [
      {
        accessorKey: 'name',
        header: 'Perfil',
        meta: { mobile: true },
        cell: ({ row }) => (
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 font-medium">
              {row.original.name}
              {row.original.is_default && (
                <Badge variant="secondary" title="Operadores novos entram aqui. Pode ser editado, não excluído.">
                  Padrão
                </Badge>
              )}
            </div>
            {row.original.description && (
              <div className="line-clamp-2 text-xs text-muted-foreground">{row.original.description}</div>
            )}
          </div>
        ),
      },
      {
        accessorKey: 'members_count',
        header: 'Pessoas',
        meta: { mobile: true },
        cell: ({ row }) => {
          const n = row.original.members_count;
          return n === 1 ? '1 pessoa' : `${n} pessoas`;
        },
      },
      {
        accessorKey: 'features_configured_count',
        header: 'Módulos com acesso',
        meta: { mobile: true },
        cell: ({ row }) => {
          const n = row.original.features_configured_count;
          return n === 0 ? (
            <Badge variant="outline" className="border-warning/50 text-warning">
              Nenhum
            </Badge>
          ) : (
            `${n} de ${TOTAL_MODULES}`
          );
        },
      },
      {
        accessorKey: 'updated_at',
        header: 'Atualizado em',
        cell: ({ row }) => new Date(row.original.updated_at).toLocaleDateString('pt-BR'),
      },
      {
        id: 'acoes',
        header: '',
        enableSorting: false,
        meta: { align: 'right', mobile: true },
        cell: ({ row }) => (
          <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
            {!row.original.is_default && (
              <Button
                size="icon-sm"
                variant="ghost"
                className="text-destructive hover:text-destructive"
                aria-label={`Excluir perfil ${row.original.name}`}
                onClick={() => setGroupToDelete(row.original)}
              >
                <Trash2 />
              </Button>
            )}
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label={`Abrir perfil ${row.original.name}`}
              onClick={() => router.push(`/admin/permission-groups/${row.original.id}`)}
            >
              <ChevronRight />
            </Button>
          </div>
        ),
      },
    ],
    [router],
  );

  const nameError = nameTouched && !name.trim() ? 'Dê um nome ao perfil.' : undefined;

  return (
    <div data-slot="page" className="space-y-4">
      <PageHeader
        title="Perfis de acesso"
        subtitle="Cada perfil diz o que os operadores podem fazer. Administradores fazem tudo."
        actions={
          <>
            <Button variant="outline" onClick={fetchData} disabled={loading}>
              <RefreshCw /> Atualizar
            </Button>
            <Button onClick={openCreate} disabled={loading}>
              <Plus /> Novo perfil
            </Button>
          </>
        }
      />

      <Alert variant="info">
        <ShieldCheck aria-hidden />
        <AlertDescription>
          Operadores sem perfil não acessam nenhum módulo. Quem está em mais de um perfil pode fazer tudo o que
          qualquer um deles libera.
        </AlertDescription>
      </Alert>

      {!loading && operatorsWithoutGroup.length > 0 && (
        <Alert variant="warning">
          <AlertTitle>
            {operatorsWithoutGroup.length === 1
              ? '1 operador sem perfil'
              : `${operatorsWithoutGroup.length} operadores sem perfil`}
          </AlertTitle>
          <AlertDescription>
            <p>{operatorsWithoutGroup.map((op) => op.username || op.email).join(', ')}</p>
            <p>Coloque cada um no perfil &quot;Acesso total&quot; ou em outro perfil para liberar o acesso.</p>
          </AlertDescription>
        </Alert>
      )}

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {!loading && groups.length === 0 && !error ? (
        <EmptyState
          icon={<ShieldCheck />}
          title="Nenhum perfil ainda"
          description="Crie um perfil para liberar só alguns módulos (por exemplo, só a Porta e as Senhas) para parte da equipe."
          action={
            <Button onClick={openCreate}>
              <Plus /> Criar primeiro perfil
            </Button>
          }
        />
      ) : (
        <>
          <div className="max-w-sm">
            <TextField
              aria-label="Buscar perfis"
              placeholder="Buscar por nome ou descrição"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              startAdornment={<Search className="size-4 text-muted-foreground" aria-hidden />}
            />
          </div>
          <DataTable
            columns={columns}
            data={filteredGroups}
            getRowId={(g) => g.id}
            loading={loading}
            onRowClick={(g) => router.push(`/admin/permission-groups/${g.id}`)}
            emptyMessage="Nenhum perfil encontrado na busca."
          />
        </>
      )}

      <CrudDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title="Novo perfil"
        subtitle="Depois de criar, você marca o que o perfil pode fazer e quem faz parte dele."
        icon={<ShieldCheck />}
        onSave={handleCreate}
        saveLabel="Criar perfil"
        saving={saving}
        saveDisabled={!name.trim()}
        isDirty={name !== '' || description !== ''}
        error={drawerError}
      >
        <TextField
          label="Nome do perfil"
          placeholder="Ex.: Porta, Secretaria"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => setNameTouched(true)}
          required
          error={nameError}
        />
        <TextField
          label="Descrição"
          placeholder="Para que serve este perfil?"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          multiline
          rows={3}
        />
      </CrudDrawer>

      <ConfirmDialog
        open={!!groupToDelete}
        title="Excluir perfil"
        message={
          groupToDelete && groupToDelete.members_count > 0 ? (
            <>
              <strong>{groupToDelete.name}</strong> tem {groupToDelete.members_count}{' '}
              {groupToDelete.members_count === 1 ? 'pessoa' : 'pessoas'}. Quem não estiver em outro perfil fica sem
              acesso a nenhum módulo até ser colocado em outro perfil.
            </>
          ) : (
            <>
              Excluir o perfil <strong>{groupToDelete?.name}</strong>? Não dá para desfazer.
            </>
          )
        }
        confirmText="Excluir"
        destructive
        loading={deleting}
        onConfirm={handleConfirmDelete}
        onCancel={() => setGroupToDelete(null)}
      />
    </div>
  );
}
