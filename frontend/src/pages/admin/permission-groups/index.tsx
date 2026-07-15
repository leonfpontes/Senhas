'use client';

import React, { useState, useEffect, useMemo } from 'react';
import {
  Box,
  Button,
  IconButton,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  TextField,
  Chip,
  CircularProgress,
  Alert,
  Typography,
  Tooltip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import AddIcon from '@mui/icons-material/Add';
import RefreshIcon from '@mui/icons-material/Refresh';
import SecurityIcon from '@mui/icons-material/Security';
import SearchIcon from '@mui/icons-material/Search';
import { useRouter } from 'next/router';
import AdminLayout from '../admin_layout';
import { permissionGroupsService, PermissionGroup } from '../../../services/permissionGroupsService';
import { apiClient } from '../../../services/api_client';
import CrudDrawer from '../../../components/CrudDrawer';

interface UserItem {
  id: string;
  email: string;
  username: string;
  role: string;
}

interface GroupFormData {
  name: string;
  description: string;
}

const EMPTY_FORM: GroupFormData = {
  name: '',
  description: '',
};

export default function PermissionGroupsPage() {
  return (
    <AdminLayout title="Grupos de Permissão">
      <PermissionGroupsContent />
    </AdminLayout>
  );
}

function PermissionGroupsContent() {
  const router = useRouter();
  const [groups, setGroups] = useState<PermissionGroup[]>([]);
  const [users, setUsers] = useState<UserItem[]>([]);
  const [groupMembersMap, setGroupMembersMap] = useState<Record<string, string[]>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Search & Filters
  const [searchQuery, setSearchQuery] = useState('');

  // CrudDrawer state for Creation
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [formData, setFormData] = useState<GroupFormData>(EMPTY_FORM);
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);
  const [drawerError, setDrawerError] = useState<string | null>(null);

  // Delete Dialog state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [groupToDelete, setGroupToDelete] = useState<PermissionGroup | null>(null);
  const [deleteForce, setDeleteForce] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      // Fetch groups and users
      const groupsData = await permissionGroupsService.listGroups();
      setGroups(groupsData);

      const usersRes = await apiClient.get('/api/v1/admin/users?limit=100');
      const usersList = Array.isArray(usersRes.data) ? usersRes.data : usersRes.data.items || [];
      setUsers(usersList);

      // Fetch members for each group to calculate operators with no group
      const membersMap: Record<string, string[]> = {};
      await Promise.all(
        groupsData.map(async (g) => {
          try {
            const members = await permissionGroupsService.getGroupMembers(g.id);
            membersMap[g.id] = members.map((m) => m.id);
          } catch {
            membersMap[g.id] = [];
          }
        })
      );
      setGroupMembersMap(membersMap);
    } catch (err: any) {
      setError(err?.message || 'Erro ao carregar dados dos grupos de permissão');
    } finally {
      setLoading(false);
    }
  };

  // G1: Calculate operators without any group (possess total access)
  const operatorsWithoutGroup = useMemo(() => {
    const operators = users.filter((u) => u.role === 'operator');
    const groupedUserIds = new Set<string>();
    Object.values(groupMembersMap).forEach((userIds) => {
      userIds.forEach((uid) => groupedUserIds.add(uid));
    });
    return operators.filter((op) => !groupedUserIds.has(op.id));
  }, [users, groupMembersMap]);

  // Client side filtering (G14)
  const filteredGroups = useMemo(() => {
    return groups.filter(
      (g) =>
        g.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (g.description || '').toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [groups, searchQuery]);

  const handleCreateOpen = () => {
    setFormData(EMPTY_FORM);
    setTouched({});
    setDrawerError(null);
    setDrawerOpen(true);
  };

  const handleDrawerChange = (field: keyof GroupFormData, val: string) => {
    setFormData((prev) => ({ ...prev, [field]: val }));
  };

  const nameError = touched.name && !formData.name.trim() ? 'Nome do grupo é obrigatório' : '';
  const isValid = formData.name.trim().length > 0;
  const isDirty = formData.name !== '' || formData.description !== '';

  const handleSaveGroup = async () => {
    setSaving(true);
    setDrawerError(null);
    try {
      await permissionGroupsService.createGroup({
        name: formData.name,
        description: formData.description,
      });
      setSuccess('Grupo de permissão criado com sucesso!');
      setDrawerOpen(false);
      fetchData();
      setTimeout(() => setSuccess(null), 3000);
    } catch (err: any) {
      const msg = err?.response?.data?.message || err?.message || 'Erro ao criar grupo de permissão';
      setDrawerError(msg);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteClick = (group: PermissionGroup) => {
    setGroupToDelete(group);
    const hasMembers = group.members_count > 0;
    setDeleteForce(hasMembers);
    setDeleteDialogOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!groupToDelete) return;
    setLoading(true);
    setError(null);
    try {
      await permissionGroupsService.deleteGroup(groupToDelete.id, deleteForce);
      setSuccess('Grupo excluído com sucesso!');
      setDeleteDialogOpen(false);
      setGroupToDelete(null);
      fetchData();
      setTimeout(() => setSuccess(null), 3000);
    } catch (err: any) {
      setError(err?.message || 'Erro ao excluir grupo de permissão');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box sx={{ mb: 3 }}>
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: { xs: 'flex-start', sm: 'center' },
          mb: 3,
          flexDirection: { xs: 'column', sm: 'row' },
          gap: { xs: 1.5, sm: 0 },
        }}
      >
        <Typography variant="h5" fontWeight={700}>
          Grupos de Permissão (RBAC)
        </Typography>
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', width: { xs: '100%', sm: 'auto' } }}>
          <Button
            variant="outlined"
            startIcon={<RefreshIcon />}
            onClick={fetchData}
            disabled={loading}
            sx={{ textTransform: 'none' }}
          >
            Atualizar
          </Button>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={handleCreateOpen}
            disabled={loading}
            sx={{ textTransform: 'none' }}
          >
            Novo Grupo
          </Button>
        </Box>
      </Box>

      {/* G1 Contextual Alert Banner */}
      {!loading && operatorsWithoutGroup.length > 0 && (
        <Alert severity="warning" sx={{ mb: 3, borderRadius: 2 }}>
          <Typography variant="body2" sx={{ fontWeight: 600 }}>
            {operatorsWithoutGroup.length} operador(es) sem grupo atribuído:
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
            {operatorsWithoutGroup.map((op) => op.username || op.email).join(', ')}
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5, fontWeight: 600 }}>
            * Operadores sem grupo atribuído possuem acesso total a todas as funcionalidades do sistema (compatibilidade retroativa).
          </Typography>
        </Alert>
      )}

      {error && (
        <Alert severity="error" sx={{ mb: 2, borderRadius: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}
      {success && (
        <Alert severity="success" sx={{ mb: 2, borderRadius: 2 }}>
          {success}
        </Alert>
      )}

      {/* Search Bar (G14) */}
      <Box sx={{ mb: 3 }}>
        <TextField
          placeholder="Buscar grupos por nome ou descrição..."
          variant="outlined"
          size="small"
          fullWidth
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          InputProps={{
            startAdornment: <SearchIcon sx={{ color: 'text.secondary', mr: 1 }} />,
          }}
          sx={{ maxWidth: { sm: 400 } }}
        />
      </Box>

      {/* Main Content Area */}
      {loading && groups.length === 0 ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', my: 5 }}>
          <CircularProgress />
        </Box>
      ) : groups.length === 0 ? (
        // G12 empty state
        <Paper
          variant="outlined"
          sx={{
            p: 5,
            textAlign: 'center',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 2,
            backgroundColor: 'rgba(0,0,0,0.01)',
          }}
        >
          <SecurityIcon sx={{ fontSize: 64, color: 'text.secondary', opacity: 0.6 }} />
          <Typography variant="h6" fontWeight={700}>
            Nenhum grupo de permissão criado ainda
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 450 }}>
            Crie grupos de permissão para restringir ou liberar funcionalidades específicas (como giras, tickets, financeiro) para os seus operadores.
          </Typography>
          <Button variant="contained" onClick={handleCreateOpen} sx={{ textTransform: 'none' }}>
            Criar Primeiro Grupo
          </Button>
        </Paper>
      ) : (
        <TableContainer component={Paper}>
          <Table size="small">
            <TableHead>
              <TableRow sx={{ bgcolor: '#f5f5f5' }}>
                <TableCell sx={{ fontWeight: 600, py: 1.5 }}>Nome</TableCell>
                <TableCell sx={{ fontWeight: 600, py: 1.5 }}>Descrição</TableCell>
                <TableCell sx={{ fontWeight: 600, py: 1.5 }} align="center">Membros Ativos</TableCell>
                <TableCell sx={{ fontWeight: 600, py: 1.5 }} align="center">Funcionalidades Configuradas</TableCell>
                <TableCell sx={{ fontWeight: 600, py: 1.5 }}>Última Atualização</TableCell>
                <TableCell sx={{ fontWeight: 600, py: 1.5 }} align="right">Ações</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filteredGroups.map((g) => (
                <TableRow key={g.id} hover>
                  <TableCell sx={{ fontWeight: 600 }}>{g.name}</TableCell>
                  <TableCell color="text.secondary">{g.description || '—'}</TableCell>
                  <TableCell align="center">
                    <Chip
                      label={`${g.members_count} usuário(s)`}
                      variant="outlined"
                      size="small"
                      color={g.members_count > 0 ? 'primary' : 'default'}
                    />
                  </TableCell>
                  <TableCell align="center">
                    {/* G10 Health indicator */}
                    <Chip
                      label={g.features_configured_count === 0 ? 'Nenhuma' : `${g.features_configured_count}/13 features`}
                      color={g.features_configured_count === 0 ? 'error' : 'success'}
                      size="small"
                      variant="outlined"
                    />
                  </TableCell>
                  <TableCell sx={{ fontSize: '0.85rem' }}>
                    {new Date(g.updated_at).toLocaleDateString('pt-BR')} às{' '}
                    {new Date(g.updated_at).toLocaleTimeString('pt-BR', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </TableCell>
                  <TableCell align="right">
                    <Tooltip title="Editar permissões e membros">
                      <IconButton size="small" onClick={() => router.push(`/admin/permission-groups/${g.id}`)}>
                        <EditIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Excluir grupo">
                      <IconButton size="small" color="error" onClick={() => handleDeleteClick(g)}>
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </TableCell>
                </TableRow>
              ))}
              {filteredGroups.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} align="center" sx={{ py: 3, color: 'text.secondary' }}>
                    Nenhum grupo correspondente à busca.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {/* CrudDrawer for creation */}
      <CrudDrawer
        open={drawerOpen}
        onClose={() => { setDrawerOpen(false); setDrawerError(null); }}
        title="Novo Grupo de Permissão"
        subtitle="Defina o nome e a descrição do grupo. Na próxima tela, você configurará as permissões de acesso e associará usuários."
        icon={<SecurityIcon />}
        onSave={handleSaveGroup}
        saveLabel="Criar Grupo"
        saving={saving}
        saveDisabled={!isValid}
        isDirty={isDirty}
        error={drawerError}
      >
        <TextField
          label="Nome do Grupo"
          placeholder="Ex: Operadores de Tickets, Secretaria"
          value={formData.name}
          onChange={(e) => handleDrawerChange('name', e.target.value)}
          onBlur={() => setTouched((p) => ({ ...p, name: true }))}
          fullWidth
          required
          error={!!nameError}
          helperText={nameError}
        />
        <TextField
          label="Descrição"
          placeholder="Descreva brevemente o propósito deste grupo de acesso..."
          value={formData.description}
          onChange={(e) => handleDrawerChange('description', e.target.value)}
          fullWidth
          multiline
          rows={3}
        />
      </CrudDrawer>

      {/* G2 Dialog: Delete confirmation displaying member list warnings */}
      <Dialog open={deleteDialogOpen} onClose={() => setDeleteDialogOpen(false)}>
        <DialogTitle sx={{ fontWeight: 700 }}>Confirmar Exclusão de Grupo</DialogTitle>
        <DialogContent>
          {groupToDelete && groupToDelete.members_count > 0 ? (
            <Box sx={{ mt: 1 }}>
              <Typography variant="body1" color="error" fontWeight={600} sx={{ mb: 2 }}>
                Atenção: Este grupo possui {groupToDelete.members_count} membro(s) ativo(s)!
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Ao excluir este grupo, estes operadores perderão as restrições e passarão a ter{' '}
                <strong>acesso total</strong> (compatibilidade retroativa) a todas as telas, a menos que sejam associados a outro grupo de acesso.
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
                Deseja prosseguir com a exclusão forçada?
              </Typography>
            </Box>
          ) : (
            <Typography variant="body1" sx={{ mt: 1 }}>
              Tem certeza que deseja excluir o grupo &quot;{groupToDelete?.name}&quot;? Esta ação é irreversível.
            </Typography>
          )}
        </DialogContent>
        <DialogActions sx={{ p: 2, pt: 0 }}>
          <Button onClick={() => setDeleteDialogOpen(false)} color="inherit" sx={{ textTransform: 'none' }}>
            Cancelar
          </Button>
          <Button onClick={handleConfirmDelete} color="error" variant="contained" sx={{ textTransform: 'none' }}>
            Confirmar Exclusão
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
