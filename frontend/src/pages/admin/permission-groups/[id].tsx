'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Box,
  Button,
  Card,
  CardContent,
  CircularProgress,
  Alert,
  Typography,
  Tabs,
  Tab,
  TextField,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  IconButton,
  Autocomplete,
  Tooltip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Chip,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import DeleteIcon from '@mui/icons-material/Delete';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CancelIcon from '@mui/icons-material/Cancel';
import { useRouter } from 'next/router';
import AdminLayout from '../admin_layout';
import {
  permissionGroupsService,
  PermissionGroup,
  GroupPermission,
  GroupMember,
} from '../../../services/permissionGroupsService';
import { apiClient } from '../../../services/api_client';
import PermissionMatrix from '../../../components/PermissionMatrix';
import { PermissionFeature, FEATURE_LABELS } from '../../../constants/permissionFeatures';

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

function CustomTabPanel(props: TabPanelProps) {
  const { children, value, index, ...other } = props;

  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`simple-tabpanel-${index}`}
      aria-labelledby={`simple-tab-${index}`}
      {...other}
    >
      {value === index && <Box sx={{ pt: 3 }}>{children}</Box>}
    </div>
  );
}

export default function PermissionGroupDetailPage() {
  const router = useRouter();
  const { id } = router.query;

  return (
    <AdminLayout title="Detalhes do Grupo">
      {id ? <PermissionGroupDetailContent groupId={id as string} /> : <CircularProgress />}
    </AdminLayout>
  );
}

function PermissionGroupDetailContent({ groupId }: { groupId: string }) {
  const router = useRouter();
  const [tabValue, setTabValue] = useState(0);

  // Core data
  const [group, setGroup] = useState<PermissionGroup | null>(null);
  const [permissions, setPermissions] = useState<GroupPermission[]>([]);
  const [members, setMembers] = useState<GroupMember[]>([]);
  
  // All system groups and users (needed for client-side effective permissions consolidation)
  const [allGroups, setAllGroups] = useState<PermissionGroup[]>([]);
  const [allGroupPermissions, setAllGroupPermissions] = useState<Record<string, GroupPermission[]>>({});
  const [allGroupMembers, setAllGroupMembers] = useState<Record<string, string[]>>({}); // groupId -> userIds
  const [allUsers, setAllUsers] = useState<GroupMember[]>([]);

  // Loading & States
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Forms state
  const [groupName, setGroupName] = useState('');
  const [groupDescription, setGroupDescription] = useState('');
  const [savingInfo, setSavingInfo] = useState(false);
  const [savingPermissions, setSavingPermissions] = useState(false);

  // Add Member state
  const [selectedUser, setSelectedUser] = useState<GroupMember | null>(null);
  const [addingMember, setAddingMember] = useState(false);

  // Effective Permissions Dialog
  const [effectiveDialogOpen, setEffectiveDialogOpen] = useState(false);
  const [dialogUser, setDialogUser] = useState<GroupMember | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // 1. Fetch current group details, configured permissions, and members list
      const groupData = await permissionGroupsService.getGroup(groupId);
      setGroup(groupData);
      setGroupName(groupData.name);
      setGroupDescription(groupData.description || '');

      const perms = await permissionGroupsService.getGroupPermissions(groupId);
      setPermissions(perms);

      const mems = await permissionGroupsService.getGroupMembers(groupId);
      setMembers(mems);

      // 2. Fetch all groups, users, and mapping to consolidate permissions on the client side (G3/G13)
      const groupsList = await permissionGroupsService.listGroups();
      setAllGroups(groupsList);

      const usersRes = await apiClient.get('/api/v1/admin/users?limit=100');
      const usersList = Array.isArray(usersRes.data) ? usersRes.data : usersRes.data.items || [];
      setAllUsers(usersList);

      const allMembersMap: Record<string, string[]> = {};
      const allPermsMap: Record<string, GroupPermission[]> = {};

      await Promise.all(
        groupsList.map(async (g) => {
          try {
            const m = await permissionGroupsService.getGroupMembers(g.id);
            allMembersMap[g.id] = m.map((u) => u.id);
          } catch {
            allMembersMap[g.id] = [];
          }

          try {
            const p = await permissionGroupsService.getGroupPermissions(g.id);
            allPermsMap[g.id] = p;
          } catch {
            allPermsMap[g.id] = [];
          }
        })
      );

      setAllGroupMembers(allMembersMap);
      setAllGroupPermissions(allPermsMap);

    } catch (err: any) {
      setError(err?.message || 'Erro ao carregar dados do grupo');
    } finally {
      setLoading(false);
    }
  }, [groupId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Tab control
  const handleTabChange = (_event: React.SyntheticEvent, newValue: number) => {
    setTabValue(newValue);
    setError(null);
    setSuccess(null);
  };

  // 1. Informações Save
  const handleSaveInfo = async () => {
    if (!groupName.trim() || !group) return;
    setSavingInfo(true);
    setError(null);
    try {
      const updated = await permissionGroupsService.updateGroup(group.id, {
        name: groupName,
        description: groupDescription,
      });
      setGroup(updated);
      setSuccess('Informações básicas atualizadas com sucesso!');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || 'Erro ao atualizar grupo');
    } finally {
      setSavingInfo(false);
    }
  };

  // 2. Permissões Save (incorporates optimistic locking version)
  const handleSavePermissions = async () => {
    if (!group) return;
    setSavingPermissions(true);
    setError(null);
    try {
      const formattedPerms = permissions.map((p) => ({
        feature: p.feature,
        can_view: p.can_view,
        can_insert: p.can_insert,
        can_edit: p.can_edit,
        can_delete: p.can_delete,
      }));

      const updated = await permissionGroupsService.setGroupPermissions(group.id, {
        permissions: formattedPerms,
        version: group.version, // Optimistic locking (T3)
      });
      setGroup(updated);
      setSuccess('Permissões do grupo atualizadas com sucesso!');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err: any) {
      if (err?.status === 409) {
        setError(
          'Conflito de Concorrência: As permissões deste grupo foram alteradas por outro administrador. Recarregando dados...'
        );
        setTimeout(() => loadData(), 3000);
      } else {
        setError(err?.message || 'Erro ao salvar permissões do grupo');
      }
    } finally {
      setSavingPermissions(false);
    }
  };

  // 3. Membros Add
  const handleAddMember = async () => {
    if (!selectedUser || !group) return;
    setAddingMember(true);
    setError(null);
    try {
      await permissionGroupsService.addMember(group.id, selectedUser.id);
      setSuccess(`Usuário ${selectedUser.username} adicionado ao grupo!`);
      setSelectedUser(null);
      loadData(); // Reload groups, memberships map
      setTimeout(() => setSuccess(null), 3000);
    } catch (err: any) {
      setError(err?.message || 'Erro ao adicionar membro');
    } finally {
      setAddingMember(false);
    }
  };

  // 3. Membros Remove
  const handleRemoveMember = async (userId: string) => {
    if (!group) return;
    setError(null);
    try {
      await permissionGroupsService.removeMember(group.id, userId);
      setSuccess('Membro removido do grupo.');
      loadData(); // Reload
      setTimeout(() => setSuccess(null), 3000);
    } catch (err: any) {
      setError(err?.message || 'Erro ao remover membro');
    }
  };

  // Filter users that are not already members of this group (G7 autocomplete optimization)
  const nonGroupUsers = useMemo(() => {
    const memberIds = new Set(members.map((m) => m.id));
    return allUsers.filter((u) => !memberIds.has(u.id) && u.role === 'operator');
  }, [allUsers, members]);

  // Client-side consolidated permissions calculation (G3/G13)
  const calculateEffectivePermissions = useCallback(
    (userId: string) => {
      // Find all group ids this user belongs to (cross-reference maps)
      const userGroupIds: string[] = [];
      Object.entries(allGroupMembers).forEach(([gId, userIds]) => {
        if (userIds.includes(userId)) {
          userGroupIds.push(gId);
        }
      });

      const allFeatures = Object.keys(FEATURE_LABELS) as PermissionFeature[];
      const effective: Record<PermissionFeature, Record<string, boolean>> = {} as any;

      allFeatures.forEach((f) => {
        effective[f] = {
          view: false,
          insert: false,
          edit: false,
          delete: false,
        };

        // If user is in no groups, they have total access (backward compat)
        if (userGroupIds.length === 0) {
          effective[f] = {
            view: true,
            insert: true,
            edit: true,
            delete: true,
          };
        } else {
          // OR consolidation logic (G3)
          userGroupIds.forEach((gId) => {
            const groupPerms = allGroupPermissions[gId] || [];
            const perm = groupPerms.find((p) => p.feature === f);
            if (perm) {
              if (perm.can_view) effective[f].view = true;
              if (perm.can_insert) effective[f].insert = true;
              if (perm.can_edit) effective[f].edit = true;
              if (perm.can_delete) effective[f].delete = true;
            }
          });
        }
      });

      return { userGroupIds, effective };
    },
    [allGroupMembers, allGroupPermissions]
  );

  const handleViewEffectivePermissions = (user: GroupMember) => {
    setDialogUser(user);
    setEffectiveDialogOpen(true);
  };

  const dialogUserEffectiveData = useMemo(() => {
    if (!dialogUser) return null;
    return calculateEffectivePermissions(dialogUser.id);
  }, [dialogUser, calculateEffectivePermissions]);

  if (loading && !group) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', my: 5 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box>
      {/* Voltar e Cabeçalho */}
      <Box sx={{ mb: 3 }}>
        <Button
          startIcon={<ArrowBackIcon />}
          onClick={() => router.push('/admin/permission-groups')}
          sx={{ mb: 2, textTransform: 'none' }}
          variant="text"
          size="small"
        >
          Voltar para grupos
        </Button>
        <Typography variant="h5" fontWeight={700} gutterBottom>
          {group?.name}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {group?.description || 'Sem descrição'}
        </Typography>
      </Box>

      {success && (
        <Alert severity="success" sx={{ mb: 2, borderRadius: 2 }}>
          {success}
        </Alert>
      )}
      {error && (
        <Alert severity="error" sx={{ mb: 2, borderRadius: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {/* Tabs Menu */}
      <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 3 }}>
        <Tabs value={tabValue} onChange={handleTabChange} aria-label="abas do grupo">
          <Tab label="Informações" />
          <Tab label="Permissões" />
          <Tab label="Membros" />
        </Tabs>
      </Box>

      {/* Tab 1: Informações básicas */}
      <CustomTabPanel value={tabValue} index={0}>
        <Card variant="outlined">
          <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 2.5, p: 3 }}>
            <Typography variant="h6" fontWeight={700}>
              Informações do Grupo
            </Typography>
            <TextField
              label="Nome do Grupo"
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              fullWidth
              required
            />
            <TextField
              label="Descrição"
              value={groupDescription}
              onChange={(e) => setGroupDescription(e.target.value)}
              fullWidth
              multiline
              rows={4}
            />
            <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 1 }}>
              <Button
                variant="contained"
                onClick={handleSaveInfo}
                disabled={savingInfo || !groupName.trim()}
                sx={{ textTransform: 'none' }}
              >
                {savingInfo ? 'Salvando...' : 'Salvar Alterações'}
              </Button>
            </Box>
          </CardContent>
        </Card>
      </CustomTabPanel>

      {/* Tab 2: Permissões Matriz */}
      <CustomTabPanel value={tabValue} index={1}>
        <Card variant="outlined">
          <CardContent sx={{ p: 3 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
              <Box>
                <Typography variant="h6" fontWeight={700}>
                  Matriz de Permissões
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  Marque o que operadores deste grupo podem realizar em cada área do sistema.
                </Typography>
              </Box>
              <Button
                variant="contained"
                onClick={handleSavePermissions}
                disabled={savingPermissions}
                sx={{ textTransform: 'none' }}
              >
                {savingPermissions ? 'Salvando...' : 'Salvar Permissões'}
              </Button>
            </Box>
            <PermissionMatrix value={permissions} onChange={setPermissions} />
          </CardContent>
        </Card>
      </CustomTabPanel>

      {/* Tab 3: Membros */}
      <CustomTabPanel value={tabValue} index={2}>
        {/* Action bar to add member */}
        <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', mb: 3, flexWrap: 'wrap' }}>
          <Autocomplete
            options={nonGroupUsers}
            getOptionLabel={(option) => `${option.username} (${option.email})`}
            value={selectedUser}
            onChange={(_, newValue) => setSelectedUser(newValue)}
            renderInput={(params) => (
              <TextField {...params} label="Pesquisar Operador para adicionar ao grupo..." size="small" placeholder="Selecione..." />
            )}
            sx={{ width: 350 }}
          />
          <Button
            variant="contained"
            onClick={handleAddMember}
            disabled={addingMember || !selectedUser}
            sx={{ textTransform: 'none' }}
          >
            {addingMember ? 'Adicionando...' : 'Adicionar ao Grupo'}
          </Button>
        </Box>

        {/* Members list Table */}
        <TableContainer component={Paper}>
          <Table size="small">
            <TableHead>
              <TableRow sx={{ bgcolor: '#f5f5f5' }}>
                <TableCell sx={{ fontWeight: 600, py: 1.5 }}>Operador</TableCell>
                <TableCell sx={{ fontWeight: 600, py: 1.5 }}>Email</TableCell>
                <TableCell sx={{ fontWeight: 600, py: 1.5 }} align="center">Ações</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {members.map((user) => {
                return (
                  <TableRow key={user.id} hover>
                    <TableCell sx={{ fontWeight: 600 }}>{user.username}</TableCell>
                    <TableCell sx={{ color: 'text.secondary' }}>{user.email}</TableCell>
                    <TableCell align="center">
                      <Button
                        size="small"
                        variant="outlined"
                        onClick={() => handleViewEffectivePermissions(user)}
                        sx={{ mr: 1, textTransform: 'none', borderRadius: 2 }}
                      >
                        Permissões Efetivas
                      </Button>
                      <Tooltip title="Remover do grupo">
                        <IconButton
                          size="small"
                          color="error"
                          onClick={() => handleRemoveMember(user.id)}
                        >
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                );
              })}
              {members.length === 0 && (
                <TableRow>
                  <TableCell colSpan={3} align="center" sx={{ py: 4, color: 'text.secondary' }}>
                    Nenhum membro adicionado a este grupo ainda.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </CustomTabPanel>

      {/* G3/G13 Dialog for Consolidated Effective Permissions */}
      <Dialog
        open={effectiveDialogOpen}
        onClose={() => setEffectiveDialogOpen(false)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle sx={{ fontWeight: 700, pb: 1 }}>
          Permissões Consolidadas — {dialogUser?.username}
        </DialogTitle>
        <DialogContent dividers>
          {dialogUserEffectiveData && (
            <Box>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                As permissões efetivas são resultantes da consolidação de todos os grupos deste usuário via lógica OR permissiva (basta um grupo permitir para ter o acesso).
              </Typography>

              {/* Display groups */}
              <Box sx={{ mb: 3, display: 'flex', flexWrap: 'wrap', gap: 1, alignItems: 'center' }}>
                <Typography variant="body2" fontWeight={600}>
                  Grupos do usuário:
                </Typography>
                {dialogUserEffectiveData.userGroupIds.length === 0 ? (
                  <Chip label="Sem Grupos (Acesso Total)" color="warning" size="small" />
                ) : (
                  dialogUserEffectiveData.userGroupIds.map((gId) => {
                    const gName = allGroups.find((g) => g.id === gId)?.name || 'Grupo';
                    return <Chip key={gId} label={gName} color="primary" size="small" variant="outlined" />;
                  })
                )}
              </Box>

              {/* Effective permissions matrix list (non-editable grid) */}
              <TableContainer component={Paper}>
                <Table size="small">
                  <TableHead>
                    <TableRow sx={{ bgcolor: '#f5f5f5' }}>
                      <TableCell sx={{ fontWeight: 600 }}>Funcionalidade</TableCell>
                      <TableCell sx={{ fontWeight: 600 }} align="center">Visualizar</TableCell>
                      <TableCell sx={{ fontWeight: 600 }} align="center">Inserir</TableCell>
                      <TableCell sx={{ fontWeight: 600 }} align="center">Editar</TableCell>
                      <TableCell sx={{ fontWeight: 600 }} align="center">Deletar</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {Object.entries(FEATURE_LABELS).map(([featureKey, meta]) => {
                      const fPerm = dialogUserEffectiveData.effective[featureKey as PermissionFeature] || {
                        view: false,
                        insert: false,
                        edit: false,
                        delete: false,
                      };

                      return (
                        <TableRow key={featureKey} hover>
                          <TableCell sx={{ fontWeight: 600 }}>{meta.label}</TableCell>
                          <TableCell align="center">
                            {fPerm.view ? (
                              <CheckCircleIcon color="success" fontSize="small" />
                            ) : (
                              <CancelIcon color="disabled" fontSize="small" />
                            )}
                          </TableCell>
                          <TableCell align="center">
                            {fPerm.insert ? (
                              <CheckCircleIcon color="success" fontSize="small" />
                            ) : (
                              <CancelIcon color="disabled" fontSize="small" />
                            )}
                          </TableCell>
                          <TableCell align="center">
                            {fPerm.edit ? (
                              <CheckCircleIcon color="success" fontSize="small" />
                            ) : (
                              <CancelIcon color="disabled" fontSize="small" />
                            )}
                          </TableCell>
                          <TableCell align="center">
                            {fPerm.delete ? (
                              <CheckCircleIcon color="success" fontSize="small" />
                            ) : (
                              <CancelIcon color="disabled" fontSize="small" />
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </TableContainer>
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEffectiveDialogOpen(false)} variant="contained" sx={{ textTransform: 'none' }}>
            Fechar
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
