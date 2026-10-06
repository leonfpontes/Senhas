/**
 * /admin/permission-groups/[id] — um grupo: o que pode fazer, quem faz parte e nome/descrição.
 *
 * Só administradores (endpoints de grupos exigem admin). `?aba=permissoes|pessoas|dados` abre
 * direto na aba (a lista manda para `permissoes` logo depois de criar).
 * "Ver acesso" soma os grupos da pessoa (basta um grupo liberar); sem grupo, nenhum acesso.
 */
'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import { ArrowLeft, Check, Minus, Save, Trash2, UserPlus } from 'lucide-react';
import AdminLayout from '../admin_layout';
import {
  permissionGroupsService,
  type GroupMember,
  type GroupPermission,
  type PermissionGroup,
} from '@/services/permissionGroupsService';
import { apiClient, extractApiErrorMessage } from '@/services/api_client';
import PermissionMatrix, { ACTION_LABELS, PERMISSION_ACTIONS, normalizePermissions } from '@/components/PermissionMatrix';
import { Combobox, TextField } from '@/components/fields';
import { PermissionDenied } from '@/components/gates';
import { EmptyState } from '@/components/admin';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useProfile } from '@/hooks/useProfile';
import { useSnackbar } from '@/contexts/SnackbarContext';
import { FEATURE_LABELS, type PermissionFeature } from '@/constants/permissionFeatures';

type TabKey = 'permissoes' | 'pessoas' | 'dados';
const TABS: TabKey[] = ['permissoes', 'pessoas', 'dados'];

interface UserItem extends GroupMember {
  role?: string;
}

const samePermissions = (a: GroupPermission[], b: GroupPermission[]) => {
  const na = normalizePermissions(a);
  const nb = normalizePermissions(b);
  return na.every((p, i) => PERMISSION_ACTIONS.every((act) => p[act] === nb[i][act]));
};

export default function PermissionGroupDetailPage() {
  const router = useRouter();
  const { id } = router.query;
  const { profile, loading } = useProfile();
  const isAdmin = profile?.role === 'admin' || profile?.role === 'super_admin';

  return (
    <AdminLayout title="Grupo de permissão">
      {(loading && !profile) || !router.isReady ? (
        <Skeleton className="h-40 w-full" />
      ) : !isAdmin ? (
        <PermissionDenied message="Só administradores mudam os grupos de permissão." />
      ) : id ? (
        <PermissionGroupDetailContent groupId={id as string} />
      ) : null}
    </AdminLayout>
  );
}

function PermissionGroupDetailContent({ groupId }: { groupId: string }) {
  const router = useRouter();
  const { showSuccess, showError } = useSnackbar();
  const initialTab = TABS.includes(router.query.aba as TabKey) ? (router.query.aba as TabKey) : 'permissoes';
  const [tab, setTab] = useState<TabKey>(initialTab);

  const [group, setGroup] = useState<PermissionGroup | null>(null);
  const [permissions, setPermissions] = useState<GroupPermission[]>([]);
  const [savedPermissions, setSavedPermissions] = useState<GroupPermission[]>([]);
  const [members, setMembers] = useState<GroupMember[]>([]);

  // Para somar o acesso de cada pessoa em todos os grupos.
  const [allGroups, setAllGroups] = useState<PermissionGroup[]>([]);
  const [allGroupPermissions, setAllGroupPermissions] = useState<Record<string, GroupPermission[]>>({});
  const [allGroupMembers, setAllGroupMembers] = useState<Record<string, string[]>>({});
  const [allUsers, setAllUsers] = useState<UserItem[]>([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [groupName, setGroupName] = useState('');
  const [groupDescription, setGroupDescription] = useState('');
  const [savingInfo, setSavingInfo] = useState(false);
  const [savingPermissions, setSavingPermissions] = useState(false);

  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [addingMember, setAddingMember] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const [accessUser, setAccessUser] = useState<GroupMember | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const groupData = await permissionGroupsService.getGroup(groupId);
      setGroup(groupData);
      setGroupName(groupData.name);
      setGroupDescription(groupData.description || '');

      const perms = await permissionGroupsService.getGroupPermissions(groupId);
      setPermissions(perms);
      setSavedPermissions(perms);

      setMembers(await permissionGroupsService.getGroupMembers(groupId));

      const groupsList = await permissionGroupsService.listGroups();
      setAllGroups(groupsList);

      const usersRes = await apiClient.get('/api/v1/admin/users?limit=500');
      setAllUsers(Array.isArray(usersRes.data) ? usersRes.data : usersRes.data?.items || []);

      const membersMap: Record<string, string[]> = {};
      const permsMap: Record<string, GroupPermission[]> = {};
      await Promise.all(
        groupsList.map(async (g) => {
          try {
            membersMap[g.id] = (await permissionGroupsService.getGroupMembers(g.id)).map((u) => u.id);
          } catch {
            membersMap[g.id] = [];
          }
          try {
            permsMap[g.id] = await permissionGroupsService.getGroupPermissions(g.id);
          } catch {
            permsMap[g.id] = [];
          }
        }),
      );
      setAllGroupMembers(membersMap);
      setAllGroupPermissions(permsMap);
    } catch (err) {
      setError(extractApiErrorMessage(err, 'Não foi possível carregar o grupo.'));
    } finally {
      setLoading(false);
    }
  }, [groupId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const permissionsDirty = !samePermissions(permissions, savedPermissions);

  const handleSaveInfo = async () => {
    if (!groupName.trim() || !group) return;
    setSavingInfo(true);
    try {
      const updated = await permissionGroupsService.updateGroup(group.id, {
        name: groupName.trim(),
        description: groupDescription,
      });
      setGroup(updated);
      showSuccess('Nome e descrição salvos.');
    } catch (err) {
      showError(extractApiErrorMessage(err, 'Não foi possível salvar.'));
    } finally {
      setSavingInfo(false);
    }
  };

  const handleSavePermissions = async () => {
    if (!group) return;
    setSavingPermissions(true);
    try {
      const updated = await permissionGroupsService.setGroupPermissions(group.id, {
        permissions: normalizePermissions(permissions).map((p) => ({
          feature: p.feature,
          can_view: p.can_view,
          can_insert: p.can_insert,
          can_edit: p.can_edit,
          can_delete: p.can_delete,
        })),
        version: group.version, // trava otimista
      });
      setGroup(updated);
      setSavedPermissions(permissions);
      setAllGroupPermissions((prev) => ({ ...prev, [group.id]: permissions }));
      showSuccess('Permissões salvas.');
    } catch (err) {
      const status = err && typeof err === 'object' ? (err as { status?: number }).status : undefined;
      if (status === 409) {
        showError('Outra pessoa mudou este grupo agora há pouco. Carregamos a versão mais nova; revise e salve de novo.');
        loadData();
      } else {
        showError(extractApiErrorMessage(err, 'Não foi possível salvar as permissões.'));
      }
    } finally {
      setSavingPermissions(false);
    }
  };

  const handleAddMember = async () => {
    if (!selectedUserId || !group) return;
    const user = allUsers.find((u) => u.id === selectedUserId);
    setAddingMember(true);
    try {
      await permissionGroupsService.addMember(group.id, selectedUserId);
      showSuccess(`${user?.username ?? 'Pessoa'} entrou no grupo.`);
      setSelectedUserId(null);
      loadData();
    } catch (err) {
      showError(extractApiErrorMessage(err, 'Não foi possível adicionar.'));
    } finally {
      setAddingMember(false);
    }
  };

  const handleRemoveMember = async (userId: string) => {
    if (!group) return;
    setRemovingId(userId);
    try {
      await permissionGroupsService.removeMember(group.id, userId);
      showSuccess('Pessoa saiu do grupo.');
      loadData();
    } catch (err) {
      showError(extractApiErrorMessage(err, 'Não foi possível remover.'));
    } finally {
      setRemovingId(null);
    }
  };

  // Só operadores entram em grupo (administradores fazem tudo).
  const candidateOptions = useMemo(() => {
    const memberIds = new Set(members.map((m) => m.id));
    return allUsers
      .filter((u) => !memberIds.has(u.id) && u.role === 'operator')
      .map((u) => ({ value: u.id, label: u.username, description: u.email, keywords: [u.email] }));
  }, [allUsers, members]);

  const effectiveAccess = useMemo(() => {
    if (!accessUser) return null;
    const groupIds = Object.entries(allGroupMembers)
      .filter(([, ids]) => ids.includes(accessUser.id))
      .map(([gId]) => gId);
    const features = Object.keys(FEATURE_LABELS) as PermissionFeature[];
    const rows = features.map((f) => {
      const acc = { feature: f, can_view: false, can_insert: false, can_edit: false, can_delete: false };
      groupIds.forEach((gId) => {
        const perm = (allGroupPermissions[gId] || []).find((p) => p.feature === f);
        if (perm) PERMISSION_ACTIONS.forEach((a) => (acc[a] = acc[a] || perm[a]));
      });
      return acc;
    });
    return { groupIds, rows };
  }, [accessUser, allGroupMembers, allGroupPermissions]);

  if (loading && !group) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-8 w-60" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!group) {
    return (
      <Alert variant="destructive">
        <AlertDescription>{error ?? 'Grupo não encontrado.'}</AlertDescription>
      </Alert>
    );
  }

  return (
    <div data-slot="page" className="space-y-4 pb-20">
      <div>
        <Button variant="ghost" size="sm" className="-ml-2 mb-2" onClick={() => router.push('/admin/permission-groups')}>
          <ArrowLeft /> Grupos de permissão
        </Button>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-bold tracking-tight">{group.name}</h1>
          {group.is_default && <Badge variant="secondary">Padrão</Badge>}
        </div>
        <p className="mt-0.5 text-sm text-muted-foreground">
          {group.is_default
            ? 'Operadores novos entram aqui. Pode ser editado, não excluído.'
            : group.description || 'Sem descrição.'}
        </p>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Tabs value={tab} onValueChange={(v) => setTab(v as TabKey)}>
        <TabsList className="w-full sm:w-auto">
          <TabsTrigger value="permissoes">O que pode fazer</TabsTrigger>
          <TabsTrigger value="pessoas">Pessoas ({members.length})</TabsTrigger>
          <TabsTrigger value="dados">Nome</TabsTrigger>
        </TabsList>

        <TabsContent value="permissoes" className="mt-4 space-y-3">
          <p className="text-sm text-muted-foreground">
            Marque o que as pessoas deste grupo podem fazer em cada módulo.
          </p>
          <PermissionMatrix value={permissions} onChange={setPermissions} disabled={savingPermissions} />
          {permissionsDirty && (
            <div
              role="region"
              aria-label="Alterações não salvas"
              className="fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+56px)] z-30 border-t bg-card/95 px-4 py-3 shadow-[0_-4px_16px_rgba(0,0,0,0.08)] backdrop-blur md:bottom-0 md:left-64 md:pb-[calc(env(safe-area-inset-bottom)+0.75rem)]"
            >
              <div className="mx-auto flex max-w-5xl items-center justify-end gap-2">
                <span className="mr-auto text-sm text-muted-foreground">Alterações não salvas</span>
                <Button variant="ghost" onClick={() => setPermissions(savedPermissions)} disabled={savingPermissions}>
                  Desfazer
                </Button>
                <Button onClick={handleSavePermissions} disabled={savingPermissions}>
                  <Save /> {savingPermissions ? 'Salvando…' : 'Salvar permissões'}
                </Button>
              </div>
            </div>
          )}
        </TabsContent>

        <TabsContent value="pessoas" className="mt-4 space-y-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <div className="w-full sm:max-w-sm">
              <Combobox
                label="Adicionar operador"
                options={candidateOptions}
                value={selectedUserId}
                onChange={setSelectedUserId}
                placeholder="Escolha uma pessoa"
                searchPlaceholder="Buscar por nome ou e-mail"
                emptyText="Nenhum operador fora deste grupo."
              />
            </div>
            <Button onClick={handleAddMember} disabled={addingMember || !selectedUserId}>
              <UserPlus /> {addingMember ? 'Adicionando…' : 'Adicionar'}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Administradores não entram em grupo: eles já podem fazer tudo.
          </p>

          {members.length === 0 ? (
            <EmptyState compact title="Ninguém neste grupo ainda" description="Adicione operadores acima." />
          ) : (
            <ul className="divide-y rounded-lg border">
              {members.map((user) => (
                <li key={user.id} className="flex flex-wrap items-center gap-2 px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{user.username}</div>
                    <div className="truncate text-xs text-muted-foreground">{user.email}</div>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => setAccessUser(user)}>
                    Ver acesso
                  </Button>
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    className="text-destructive hover:text-destructive"
                    aria-label={`Tirar ${user.username} do grupo`}
                    disabled={removingId === user.id}
                    onClick={() => handleRemoveMember(user.id)}
                  >
                    <Trash2 />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </TabsContent>

        <TabsContent value="dados" className="mt-4">
          <Card>
            <CardContent className="space-y-4 pt-6">
              <TextField label="Nome do grupo" value={groupName} onChange={(e) => setGroupName(e.target.value)} required />
              <TextField
                label="Descrição"
                value={groupDescription}
                onChange={(e) => setGroupDescription(e.target.value)}
                multiline
                rows={4}
              />
              <div className="flex justify-end">
                <Button onClick={handleSaveInfo} disabled={savingInfo || !groupName.trim()}>
                  <Save /> {savingInfo ? 'Salvando…' : 'Salvar'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={!!accessUser} onOpenChange={(o) => !o && setAccessUser(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>O que {accessUser?.username} pode fazer</DialogTitle>
            <DialogDescription>
              Somando todos os grupos da pessoa: basta um grupo liberar para valer.
            </DialogDescription>
          </DialogHeader>
          {effectiveAccess && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="font-medium">Grupos:</span>
                {effectiveAccess.groupIds.length === 0 ? (
                  <Badge variant="outline" className="border-warning/50 text-warning">
                    Nenhum (sem acesso)
                  </Badge>
                ) : (
                  effectiveAccess.groupIds.map((gId) => (
                    <Badge key={gId} variant="outline">
                      {allGroups.find((g) => g.id === gId)?.name ?? 'Grupo'}
                    </Badge>
                  ))
                )}
              </div>
              <Table className="table-fixed">
                <TableHeader>
                  <TableRow>
                    <TableHead>Módulo</TableHead>
                    {PERMISSION_ACTIONS.map((a) => (
                      <TableHead key={a} className="w-12 px-1 text-center sm:w-20">
                        {ACTION_LABELS[a]}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {effectiveAccess.rows.map((row) => (
                    <TableRow key={row.feature}>
                      <TableCell className="whitespace-normal font-medium">{FEATURE_LABELS[row.feature].label}</TableCell>
                      {PERMISSION_ACTIONS.map((a) => (
                        <TableCell key={a} className="px-1 text-center">
                          {row[a] ? (
                            <Check className="mx-auto size-4 text-success" aria-label="Sim" />
                          ) : (
                            <Minus className="mx-auto size-4 text-muted-foreground/50" aria-label="Não" />
                          )}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
          <DialogFooter>
            <Button onClick={() => setAccessUser(null)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
