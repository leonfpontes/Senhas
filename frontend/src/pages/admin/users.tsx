/**
 * Admin Users Management Page
 * Tenant-scoped user CRUD: list, create/edit via CrudDrawer, delete (soft)
 */
'use client';

import React, { useState, useEffect } from 'react';
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
  Pagination,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Switch,
  FormControlLabel,
  Typography,
  Tooltip,
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import AddIcon from '@mui/icons-material/Add';
import RefreshIcon from '@mui/icons-material/Refresh';
import PersonAddIcon from '@mui/icons-material/PersonAdd';
import AdminLayout from './admin_layout';
import { apiClient } from '../../services/api_client';
import CrudDrawer from '../../components/CrudDrawer';
import { useSubscription } from '../../hooks/useSubscription';

interface UserItem {
  id: string;
  email: string;
  username: string;
  role: string;
  is_active: boolean;
  created_at: string;
}

interface FormData {
  email: string;
  username: string;
  password: string;
  role: string;
  is_active: boolean;
}

const EMPTY_FORM: FormData = {
  email: '',
  username: '',
  password: '',
  role: 'operator',
  is_active: true,
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function AdminUsersPage() {
  return (
    <AdminLayout title="Usuários">
      <AdminUsersContent />
    </AdminLayout>
  );
}

function AdminUsersContent() {
  const { subscription, canCreateUser: canCreateUserCheck } = useSubscription();
  const [users, setUsers] = useState<UserItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [roleFilter, setRoleFilter] = useState<string>('');

  const canCreateUser = canCreateUserCheck(users.length);

  // Drawer state
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerMode, setDrawerMode] = useState<'create' | 'edit'>('create');
  const [editUserId, setEditUserId] = useState<string | null>(null);
  const [formData, setFormData] = useState<FormData>(EMPTY_FORM);
  const [originalData, setOriginalData] = useState<FormData>(EMPTY_FORM);
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchUsers();
  }, [page, roleFilter]);

  const fetchUsers = async () => {
    setLoading(true);
    setError(null);
    try {
      let url = `/api/v1/admin/users?skip=${(page - 1) * 50}&limit=50`;
      if (roleFilter) {
        url += `&role_filter=${roleFilter}`;
      }
      const response = await apiClient.get(url);
      const data = response.data;
      setUsers(Array.isArray(data) ? data : data.items || []);
      setTotalPages(Math.max(1, Math.ceil((Array.isArray(data) ? data.length : data.total || 0) / 50)));
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || 'Erro ao carregar usuários');
    } finally {
      setLoading(false);
    }
  };

  // --- Drawer helpers ---
  const openCreate = () => {
    setFormData(EMPTY_FORM);
    setOriginalData(EMPTY_FORM);
    setTouched({});
    setDrawerMode('create');
    setEditUserId(null);
    setDrawerOpen(true);
  };

  const openEdit = (user: UserItem) => {
    const data: FormData = {
      email: user.email,
      username: user.username,
      password: '',
      role: user.role,
      is_active: user.is_active,
    };
    setFormData(data);
    setOriginalData(data);
    setTouched({});
    setDrawerMode('edit');
    setEditUserId(user.id);
    setDrawerOpen(true);
  };

  const handleChange = (field: keyof FormData, value: string | boolean) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const isDirty =
    formData.email !== originalData.email ||
    formData.username !== originalData.username ||
    formData.password !== originalData.password ||
    formData.role !== originalData.role ||
    formData.is_active !== originalData.is_active;

  // --- Validation ---
  const emailError = touched.email && !EMAIL_RE.test(formData.email) ? 'Email inválido' : '';
  const usernameError = touched.username && !formData.username.trim() ? 'Nome de usuário obrigatório' : '';
  const passwordError =
    drawerMode === 'create' && touched.password && formData.password.length < 6
      ? 'Senha deve ter pelo menos 6 caracteres'
      : drawerMode === 'edit' && formData.password && formData.password.length < 6
        ? 'Senha deve ter pelo menos 6 caracteres'
        : '';

  const isValid =
    EMAIL_RE.test(formData.email) &&
    formData.username.trim().length > 0 &&
    (drawerMode === 'edit' || formData.password.length >= 6) &&
    (drawerMode === 'create' || !formData.password || formData.password.length >= 6);

  // --- CRUD ---
  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      if (drawerMode === 'create') {
        await apiClient.post('/api/v1/admin/users', {
          email: formData.email,
          username: formData.username,
          password: formData.password,
          role: formData.role,
        });
        setSuccess('Usuário criado com sucesso!');
      } else {
        const payload: Record<string, any> = {
          username: formData.username,
          role: formData.role,
          is_active: formData.is_active,
        };
        if (formData.password) {
          payload.password = formData.password;
        }
        await apiClient.put(`/api/v1/admin/users/${editUserId}`, payload);
        setSuccess('Usuário atualizado com sucesso!');
      }
      setDrawerOpen(false);
      setTimeout(() => setSuccess(null), 3000);
      fetchUsers();
    } catch (err: any) {
      setError(err?.response?.data?.detail || err?.message || 'Erro ao salvar usuário');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteUser = async (userId: string) => {
    if (!window.confirm('Tem certeza que deseja excluir este usuário?')) return;
    setLoading(true);
    setError(null);
    try {
      await apiClient.delete(`/api/v1/admin/users/${userId}`);
      setSuccess('Usuário excluído com sucesso!');
      setTimeout(() => setSuccess(null), 3000);
      fetchUsers();
    } catch (err: any) {
      setError(err?.response?.data?.detail || err?.message || 'Erro ao excluir usuário');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Box sx={{ mb: 3 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
          <Typography variant="h5" fontWeight={700}>Gestão de Usuários</Typography>
          <Box sx={{ display: 'flex', gap: 1 }}>
            <FormControl size="small" sx={{ minWidth: 140 }}>
              <InputLabel>Filtrar Role</InputLabel>
              <Select
                value={roleFilter}
                onChange={(e) => { setRoleFilter(e.target.value); setPage(1); }}
                label="Filtrar Role"
              >
                <MenuItem value="">Todos</MenuItem>
                <MenuItem value="admin">Admin</MenuItem>
                <MenuItem value="operator">Operador</MenuItem>
              </Select>
            </FormControl>
            <Button variant="outlined" startIcon={<RefreshIcon />} onClick={fetchUsers} disabled={loading}>
              Atualizar
            </Button>
            <Tooltip title={!canCreateUser ? `Limite de ${subscription?.max_users ?? 0} usuário(s) atingido. Faça upgrade do plano.` : ''}>
              <span>
                <Button variant="contained" startIcon={<AddIcon />} onClick={openCreate} disabled={loading || !canCreateUser}>
                  Novo Usuário
                </Button>
              </span>
            </Tooltip>
          </Box>
        </Box>

        {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>{error}</Alert>}
        {success && <Alert severity="success" sx={{ mb: 2 }}>{success}</Alert>}

        <TableContainer component={Paper}>
          <Table>
            <TableHead>
              <TableRow sx={{ bgcolor: 'primary.light' }}>
                <TableCell>Email</TableCell>
                <TableCell>Nome de Usuário</TableCell>
                <TableCell>Role</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Criado em</TableCell>
                <TableCell align="right">Ações</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={6} align="center"><CircularProgress /></TableCell>
                </TableRow>
              ) : users.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} align="center">Nenhum usuário encontrado</TableCell>
                </TableRow>
              ) : (
                users.map((user) => (
                  <TableRow key={user.id} hover>
                    <TableCell>{user.email}</TableCell>
                    <TableCell>{user.username}</TableCell>
                    <TableCell>
                      <Chip
                        label={user.role === 'admin' ? 'Admin' : 'Operador'}
                        color={user.role === 'admin' ? 'primary' : 'default'}
                        variant="outlined"
                        size="small"
                      />
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={user.is_active ? 'Ativo' : 'Inativo'}
                        color={user.is_active ? 'success' : 'error'}
                        variant="outlined"
                        size="small"
                      />
                    </TableCell>
                    <TableCell>{new Date(user.created_at).toLocaleDateString('pt-BR')}</TableCell>
                    <TableCell align="right">
                      <IconButton size="small" onClick={() => openEdit(user)}>
                        <EditIcon fontSize="small" />
                      </IconButton>
                      <IconButton size="small" color="error" onClick={() => handleDeleteUser(user.id)}>
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>

        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 3 }}>
          <Pagination count={totalPages} page={page} onChange={(_, v) => setPage(v)} disabled={loading} />
        </Box>
      </Box>

      {/* Create / Edit User Drawer */}
      <CrudDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title={drawerMode === 'create' ? 'Novo Usuário' : 'Editar Usuário'}
        subtitle={
          drawerMode === 'create'
            ? 'Preencha os dados para criar um novo usuário do tenant.'
            : 'Atualize as informações do usuário.'
        }
        icon={<PersonAddIcon />}
        onSave={handleSave}
        saveLabel={drawerMode === 'create' ? 'Criar' : 'Salvar'}
        saving={saving}
        saveDisabled={!isValid}
        isDirty={isDirty}
      >
        <TextField
          label="Email"
          type="email"
          value={formData.email}
          onChange={(e) => handleChange('email', e.target.value)}
          onBlur={() => setTouched((p) => ({ ...p, email: true }))}
          fullWidth
          required
          disabled={drawerMode === 'edit'}
          error={!!emailError}
          helperText={emailError}
        />
        <TextField
          label="Nome de Usuário"
          value={formData.username}
          onChange={(e) => handleChange('username', e.target.value)}
          onBlur={() => setTouched((p) => ({ ...p, username: true }))}
          fullWidth
          required
          error={!!usernameError}
          helperText={usernameError}
        />
        <TextField
          label={drawerMode === 'create' ? 'Senha' : 'Nova Senha (opcional)'}
          type="password"
          value={formData.password}
          onChange={(e) => handleChange('password', e.target.value)}
          onBlur={() => setTouched((p) => ({ ...p, password: true }))}
          fullWidth
          required={drawerMode === 'create'}
          error={!!passwordError}
          helperText={passwordError || (drawerMode === 'edit' ? 'Deixe em branco para manter a senha atual' : '')}
        />
        <FormControl fullWidth>
          <InputLabel>Role</InputLabel>
          <Select
            value={formData.role}
            onChange={(e) => handleChange('role', e.target.value)}
            label="Role"
          >
            <MenuItem value="admin">Admin</MenuItem>
            <MenuItem value="operator">Operador</MenuItem>
          </Select>
        </FormControl>
        {drawerMode === 'edit' && (
          <FormControlLabel
            control={
              <Switch
                checked={formData.is_active}
                onChange={(e) => handleChange('is_active', e.target.checked)}
              />
            }
            label="Ativo"
          />
        )}
      </CrudDrawer>
    </>
  );
}
