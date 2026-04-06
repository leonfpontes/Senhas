/**
 * Platform Tenants Management Page (T112)
 *
 * CRUD operations for tenants:
 * - List all tenants
 * - Create new tenant (CrudDrawer)
 * - Edit existing tenant (CrudDrawer)
 * - Delete tenant (confirm dialog)
 */

import React, { useState, useEffect } from "react";
import {
  Box,
  Button,
  IconButton,
  Menu,
  MenuItem,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  TextField,
  Select,
  FormControl,
  InputLabel,
  Chip,
  CircularProgress,
  Alert,
  Pagination,
  Tooltip,
  useTheme,
  useMediaQuery,
} from "@mui/material";
import DeleteIcon from "@mui/icons-material/Delete";
import EditIcon from "@mui/icons-material/Edit";
import AddIcon from "@mui/icons-material/Add";
import RefreshIcon from "@mui/icons-material/Refresh";
import PeopleIcon from "@mui/icons-material/People";
import BusinessIcon from "@mui/icons-material/Business";
import MoreVertIcon from "@mui/icons-material/MoreVert";
import StarIcon from "@mui/icons-material/Star";
import CreditScoreIcon from "@mui/icons-material/CreditScore";
import { useRouter } from "next/router";
import { apiClient } from "../../services/api_client";
import PlatformLayout from "./layout";
import CrudDrawer from "../../components/CrudDrawer";

interface Tenant {
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

interface SubscriptionDetail {
  plan: string;
  status: string;
  max_users: number;
  max_giras_per_month: number;
  current_users: number;
  monthly_price: number;
  is_trial: boolean;
  is_bonus?: boolean;
}

const PLAN_COLOR: Record<string, 'default' | 'info' | 'primary' | 'warning' | 'error' | 'success'> = {
  free: 'default',
  basic: 'info',
  pro: 'primary',
  premium: 'warning',
};

interface CreateFormData {
  slug: string;
  name: string;
  email_admin: string;
  plan: string;
}

interface EditFormData {
  name: string;
  description: string;
  is_active: boolean;
}

const EMPTY_CREATE: CreateFormData = { slug: "", name: "", email_admin: "", plan: "basic" };
const EMPTY_EDIT: EditFormData = { name: "", description: "", is_active: true };
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const TenantsPage: React.FC = () => {
  const router = useRouter();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
  const [menuTenant, setMenuTenant] = useState<Tenant | null>(null);

  // Subscription drawer state
  const [subDrawerTenant, setSubDrawerTenant] = useState<Tenant | null>(null);
  const [subDrawerOpen, setSubDrawerOpen] = useState(false);
  const [subDetail, setSubDetail] = useState<SubscriptionDetail | null>(null);
  const [subDetailLoading, setSubDetailLoading] = useState(false);
  const [subIsBonus, setSubIsBonus] = useState(false);
  const [subPlan, setSubPlan] = useState('pro');
  const [subSaving, setSubSaving] = useState(false);

  // Drawer state
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerMode, setDrawerMode] = useState<"create" | "edit">("create");
  const [editingTenantId, setEditingTenantId] = useState<string | null>(null);
  const [createData, setCreateData] = useState<CreateFormData>(EMPTY_CREATE);
  const [editData, setEditData] = useState<EditFormData>(EMPTY_EDIT);
  const [originalCreate, setOriginalCreate] = useState<CreateFormData>(EMPTY_CREATE);
  const [originalEdit, setOriginalEdit] = useState<EditFormData>(EMPTY_EDIT);
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchTenants();
  }, [page]);

  const fetchTenants = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await apiClient.get(
        `/api/v1/platform/tenants?skip=${(page - 1) * 100}&limit=100`
      );
      const data = response.data;
      setTenants(data);
      setTotalPages(Math.ceil(data.length / 100));
    } catch (err: any) {
      setError(err?.message || "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  // --- Drawer helpers ---
  const openCreate = () => {
    setCreateData(EMPTY_CREATE);
    setOriginalCreate(EMPTY_CREATE);
    setTouched({});
    setDrawerMode("create");
    setEditingTenantId(null);
    setDrawerOpen(true);
  };

  const openEdit = (tenant: Tenant) => {
    const data: EditFormData = {
      name: tenant.name,
      description: tenant.description || "",
      is_active: tenant.is_active,
    };
    setEditData(data);
    setOriginalEdit(data);
    setTouched({});
    setDrawerMode("edit");
    setEditingTenantId(tenant.id);
    setDrawerOpen(true);
  };

  // isDirty
  const isDirty =
    drawerMode === "create"
      ? createData.slug !== originalCreate.slug ||
        createData.name !== originalCreate.name ||
        createData.email_admin !== originalCreate.email_admin ||
        createData.plan !== originalCreate.plan
      : editData.name !== originalEdit.name ||
        editData.description !== originalEdit.description ||
        editData.is_active !== originalEdit.is_active;

  // Validation (create)
  const slugError = touched.slug && !createData.slug.trim() ? "Slug obrigatório" : "";
  const createNameError = touched.name && !createData.name.trim() ? "Nome obrigatório" : "";
  const emailError =
    touched.email_admin && !EMAIL_RE.test(createData.email_admin) ? "Email inválido" : "";

  const createValid =
    createData.slug.trim().length > 0 &&
    createData.name.trim().length > 0 &&
    EMAIL_RE.test(createData.email_admin);

  // Validation (edit)
  const editNameError = touched.name && !editData.name.trim() ? "Nome obrigatório" : "";
  const editValid = editData.name.trim().length > 0;

  const isValid = drawerMode === "create" ? createValid : editValid;

  // --- CRUD ---
  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      if (drawerMode === "create") {
        await apiClient.post("/api/v1/platform/tenants", createData);
        setSuccess("Tenant criado com sucesso!");
      } else {
        await apiClient.put(`/api/v1/platform/tenants/${editingTenantId}`, {
          name: editData.name,
          description: editData.description || null,
          is_active: editData.is_active,
        });
        setSuccess("Tenant atualizado com sucesso!");
      }
      setDrawerOpen(false);
      setTimeout(() => setSuccess(null), 3000);
      fetchTenants();
    } catch (err: any) {
      setError(err?.response?.data?.detail || err?.message || "Erro ao salvar tenant");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteTenant = async (tenantId: string) => {
    if (!window.confirm("Tem certeza que deseja excluir este tenant?")) return;
    setLoading(true);
    try {
      await apiClient.delete(`/api/v1/platform/tenants/${tenantId}`);
      setSuccess("Tenant excluído com sucesso!");
      setTimeout(() => setSuccess(null), 3000);
      fetchTenants();
    } catch (err: any) {
      setError(err?.message || "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  const openSubDrawer = async (tenant: Tenant) => {
    setSubDrawerTenant(tenant);
    setSubIsBonus(tenant.is_bonus ?? false);
    setSubPlan(tenant.plan ?? 'basic');
    setSubDetail(null);
    setSubDrawerOpen(true);
    setSubDetailLoading(true);
    try {
      const res = await apiClient.get(`/api/v1/platform/subscriptions/${tenant.id}`);
      setSubDetail(res.data);
    } catch {
      // non-critical: drawer shows partial info
    } finally {
      setSubDetailLoading(false);
    }
  };

  const handleSaveSubscription = async () => {
    if (!subDrawerTenant) return;
    setSubSaving(true);
    setError(null);
    try {
      const originalIsBonus = subDrawerTenant.is_bonus ?? false;
      const originalPlan = subDrawerTenant.plan ?? 'basic';

      if (subIsBonus) {
        // Grant/update bonus
        await apiClient.patch(
          `/api/v1/platform/subscriptions/${subDrawerTenant.id}/bonus`,
          { is_bonus: true, plan: subPlan },
        );
      } else if (originalIsBonus && !subIsBonus) {
        // Remove bonus
        await apiClient.patch(
          `/api/v1/platform/subscriptions/${subDrawerTenant.id}/bonus`,
          { is_bonus: false },
        );
      } else if (subPlan !== originalPlan) {
        // Plan change without bonus
        await apiClient.put(
          `/api/v1/platform/subscriptions/${subDrawerTenant.id}/upgrade`,
          { plan: subPlan },
        );
      }

      setSuccess(`Assinatura de "${subDrawerTenant.name}" atualizada.`);
      setSubDrawerOpen(false);
      setSubDrawerTenant(null);
      setTimeout(() => setSuccess(null), 4000);
      fetchTenants();
    } catch (err: any) {
      setError(err?.response?.data?.detail || 'Erro ao salvar assinatura');
    } finally {
      setSubSaving(false);
    }
  };

  const subIsDirty =
    subIsBonus !== (subDrawerTenant?.is_bonus ?? false) ||
    subPlan !== (subDrawerTenant?.plan ?? 'basic');

  return (
    <PlatformLayout>
      <Box data-tour="tenants-header" sx={{ mb: 3 }}>
        <Box
          sx={{
            display: "flex",
            flexDirection: { xs: 'column', sm: 'row' },
            justifyContent: "space-between",
            alignItems: { xs: 'stretch', sm: 'center' },
            gap: 1,
            mb: 3,
          }}
        >
          <h1 style={{ margin: 0 }}>Tenant Management</h1>
          <Box sx={{ display: "flex", gap: 1 }}>
            <Button
              variant="outlined"
              startIcon={<RefreshIcon />}
              onClick={fetchTenants}
              disabled={loading}
            >
              Refresh
            </Button>
            <Button
              data-tour="tenants-novo"
              variant="contained"
              startIcon={<AddIcon />}
              onClick={openCreate}
              disabled={loading}
            >
              New Tenant
            </Button>
          </Box>
        </Box>

        {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>{error}</Alert>}
        {success && <Alert severity="success" sx={{ mb: 2 }}>{success}</Alert>}

        {/* Tenants Table */}
        <TableContainer data-tour="tenants-tabela" component={Paper} sx={{ overflowX: 'auto' }}>
          <Table size="small">
            <TableHead>
              <TableRow sx={{ bgcolor: "primary.light" }}>
                <TableCell>Slug</TableCell>
                <TableCell>Name</TableCell>
                <TableCell>Status</TableCell>
                <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>Plano</TableCell>
                <TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }}>Created</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={6} align="center">
                    <CircularProgress />
                  </TableCell>
                </TableRow>
              ) : tenants.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} align="center">
                    No tenants found
                  </TableCell>
                </TableRow>
              ) : (
                tenants.map((tenant) => (
                  <TableRow key={tenant.id} hover>
                    <TableCell sx={{ fontFamily: "monospace" }}>
                      {tenant.slug}
                    </TableCell>
                    <TableCell>{tenant.name}</TableCell>
                    <TableCell>
                      <Chip
                        label={tenant.is_active ? "Active" : "Inactive"}
                        color={tenant.is_active ? "success" : "error"}
                        variant="outlined"
                        size="small"
                      />
                    </TableCell>
                    <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>
                      {tenant.plan ? (
                        <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center' }}>
                          <Chip
                            label={tenant.plan.toUpperCase()}
                            color={PLAN_COLOR[tenant.plan] ?? 'default'}
                            size="small"
                          />
                          {tenant.is_bonus && (
                            <Tooltip title="Bonificado">
                              <StarIcon sx={{ fontSize: 15, color: '#f59e0b' }} />
                            </Tooltip>
                          )}
                        </Box>
                      ) : '—'}
                    </TableCell>
                    <TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }}>
                      {new Date(tenant.created_at).toLocaleDateString()}
                    </TableCell>
                    <TableCell align="right">
                      {isMobile ? (
                        <>
                          <IconButton
                            size="small"
                            onClick={(e) => { setMenuAnchor(e.currentTarget); setMenuTenant(tenant); }}
                          >
                            <MoreVertIcon fontSize="small" />
                          </IconButton>
                          <Menu
                            anchorEl={menuAnchor}
                            open={Boolean(menuAnchor) && menuTenant?.id === tenant.id}
                            onClose={() => { setMenuAnchor(null); setMenuTenant(null); }}
                          >
                            <MenuItem onClick={() => { openSubDrawer(tenant); setMenuAnchor(null); setMenuTenant(null); }}>
                              <CreditScoreIcon fontSize="small" sx={{ mr: 1 }} /> Assinatura
                            </MenuItem>
                            <MenuItem onClick={() => { router.push(`/platform/tenants/${tenant.id}`); setMenuAnchor(null); setMenuTenant(null); }}>
                              <PeopleIcon fontSize="small" sx={{ mr: 1 }} /> Ver Usuários
                            </MenuItem>
                            <MenuItem onClick={() => { openEdit(tenant); setMenuAnchor(null); setMenuTenant(null); }}>
                              <EditIcon fontSize="small" sx={{ mr: 1 }} /> Editar
                            </MenuItem>
                            <MenuItem
                              onClick={() => { handleDeleteTenant(tenant.id); setMenuAnchor(null); setMenuTenant(null); }}
                              sx={{ color: 'error.main' }}
                            >
                              <DeleteIcon fontSize="small" sx={{ mr: 1 }} /> Deletar
                            </MenuItem>
                          </Menu>
                        </>
                      ) : (
                        <>
                          <Tooltip title="Assinatura">
                            <IconButton
                              size="small"
                              sx={{ color: tenant.is_bonus ? '#f59e0b' : 'action.active' }}
                              onClick={() => openSubDrawer(tenant)}
                            >
                              <StarIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="Ver Usuários">
                            <IconButton
                              size="small"
                              color="info"
                              onClick={() => router.push(`/platform/tenants/${tenant.id}`)}
                            >
                              <PeopleIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="Editar">
                            <IconButton
                              size="small"
                              onClick={() => openEdit(tenant)}
                            >
                              <EditIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="Deletar">
                            <IconButton
                              size="small"
                              color="error"
                              onClick={() => handleDeleteTenant(tenant.id)}
                            >
                              <DeleteIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        </>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>

        {/* Pagination */}
        <Box sx={{ display: "flex", justifyContent: "center", mt: 3 }}>
          <Pagination
            count={totalPages}
            page={page}
            onChange={(e, value) => setPage(value)}
            disabled={loading}
          />
        </Box>
      </Box>

      {/* Subscription Drawer */}
      <CrudDrawer
        open={subDrawerOpen}
        onClose={() => { setSubDrawerOpen(false); setSubDrawerTenant(null); }}
        title="Assinatura"
        subtitle={subDrawerTenant?.name ?? ''}
        icon={<CreditScoreIcon />}
        onSave={handleSaveSubscription}
        saveLabel="Salvar"
        saving={subSaving}
        saveDisabled={!subIsDirty}
        isDirty={subIsDirty}
      >
        {/* Current subscription info */}
        {subDetailLoading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}>
            <CircularProgress size={24} />
          </Box>
        ) : subDetail ? (
          <Box sx={{ p: 2, bgcolor: 'action.hover', borderRadius: 1 }}>
            <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', mb: 1 }}>
              <Chip
                label={subDetail.plan.toUpperCase()}
                color={PLAN_COLOR[subDetail.plan] ?? 'default'}
                size="small"
              />
              <Chip
                label={subDetail.status}
                color={subDetail.status === 'active' ? 'success' : 'default'}
                size="small"
                variant="outlined"
              />
              {subDetail.is_bonus && (
                <Chip label="Bonificado" size="small" sx={{ bgcolor: '#fef3c7', color: '#92400e' }} icon={<StarIcon sx={{ fontSize: 14, color: '#f59e0b !important' }} />} />
              )}
            </Box>
            <Box sx={{ fontSize: '0.85rem', color: 'text.secondary' }}>
              Usuários: {subDetail.current_users} / {subDetail.max_users === -1 ? '∞' : subDetail.max_users}
              {' · '}
              Giras/mês: {subDetail.max_giras_per_month === -1 ? '∞' : subDetail.max_giras_per_month}
              {subDetail.monthly_price > 0 && ` · R$ ${subDetail.monthly_price.toFixed(2)}/mês`}
            </Box>
          </Box>
        ) : null}

        {/* Access type */}
        <FormControl fullWidth>
          <InputLabel>Tipo de acesso</InputLabel>
          <Select
            value={subIsBonus ? 'bonus' : 'normal'}
            label="Tipo de acesso"
            onChange={(e) => {
              const bonus = e.target.value === 'bonus';
              setSubIsBonus(bonus);
              if (bonus && (!subPlan || subPlan === 'free')) setSubPlan('pro');
            }}
          >
            <MenuItem value="normal">Normal (pago via Stripe)</MenuItem>
            <MenuItem value="bonus">Bonificado (gratuito)</MenuItem>
          </Select>
        </FormControl>

        {/* Plan selector */}
        <FormControl fullWidth>
          <InputLabel>Plano</InputLabel>
          <Select
            value={subPlan}
            label="Plano"
            onChange={(e) => setSubPlan(e.target.value)}
            disabled={!subIsBonus && subDrawerTenant?.is_bonus === false}
          >
            {subIsBonus ? (
              [<MenuItem key="basic" value="basic">Basic — até 5 usuários</MenuItem>,
               <MenuItem key="pro" value="pro">Pro — até 20 usuários</MenuItem>,
               <MenuItem key="premium" value="premium">Premium — ilimitado</MenuItem>]
            ) : (
              [<MenuItem key="free" value="free">Free</MenuItem>,
               <MenuItem key="basic" value="basic">Basic</MenuItem>,
               <MenuItem key="pro" value="pro">Pro</MenuItem>,
               <MenuItem key="premium" value="premium">Premium</MenuItem>]
            )}
          </Select>
        </FormControl>

        {/* Warning when removing bonus */}
        {!subIsBonus && (subDrawerTenant?.is_bonus ?? false) && (
          <Alert severity="warning">
            Ao remover o bônus, o tenant voltará ao plano Free até realizar uma nova assinatura via Stripe.
          </Alert>
        )}
      </CrudDrawer>

      {/* Create / Edit Tenant Drawer */}
      <CrudDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title={drawerMode === "create" ? "Novo Tenant" : "Editar Tenant"}
        subtitle={
          drawerMode === "create"
            ? "Preencha os dados para criar um novo tenant."
            : "Atualize as informações do tenant."
        }
        icon={<BusinessIcon />}
        onSave={handleSave}
        saveLabel={drawerMode === "create" ? "Criar" : "Salvar"}
        saving={saving}
        saveDisabled={!isValid}
        isDirty={isDirty}
      >
        {drawerMode === "create" ? (
          <>
            <TextField
              label="Slug"
              value={createData.slug}
              onChange={(e) => setCreateData({ ...createData, slug: e.target.value })}
              onBlur={() => setTouched((p) => ({ ...p, slug: true }))}
              fullWidth
              required
              placeholder="company-name"
              error={!!slugError}
              helperText={slugError || "Identificador único (ex: casa-pai-benedito)"}
            />
            <TextField
              label="Nome"
              value={createData.name}
              onChange={(e) => setCreateData({ ...createData, name: e.target.value })}
              onBlur={() => setTouched((p) => ({ ...p, name: true }))}
              fullWidth
              required
              error={!!createNameError}
              helperText={createNameError}
            />
            <TextField
              label="Email do Admin"
              type="email"
              value={createData.email_admin}
              onChange={(e) => setCreateData({ ...createData, email_admin: e.target.value })}
              onBlur={() => setTouched((p) => ({ ...p, email_admin: true }))}
              fullWidth
              required
              error={!!emailError}
              helperText={emailError}
            />
            <FormControl fullWidth>
              <InputLabel>Plano</InputLabel>
              <Select
                value={createData.plan}
                label="Plano"
                onChange={(e) => setCreateData({ ...createData, plan: e.target.value })}
              >
                <MenuItem value="basic">Basic</MenuItem>
                <MenuItem value="pro">Pro</MenuItem>
                <MenuItem value="premium">Premium</MenuItem>
              </Select>
            </FormControl>
          </>
        ) : (
          <>
            <TextField
              label="Nome"
              value={editData.name}
              onChange={(e) => setEditData({ ...editData, name: e.target.value })}
              onBlur={() => setTouched((p) => ({ ...p, name: true }))}
              fullWidth
              required
              error={!!editNameError}
              helperText={editNameError}
            />
            <TextField
              label="Descrição"
              value={editData.description}
              onChange={(e) => setEditData({ ...editData, description: e.target.value })}
              fullWidth
              multiline
              rows={3}
            />
            <FormControl fullWidth>
              <InputLabel>Status</InputLabel>
              <Select
                value={editData.is_active ? "active" : "inactive"}
                label="Status"
                onChange={(e) =>
                  setEditData({ ...editData, is_active: e.target.value === "active" })
                }
              >
                <MenuItem value="active">Ativo</MenuItem>
                <MenuItem value="inactive">Inativo</MenuItem>
              </Select>
            </FormControl>
          </>
        )}
      </CrudDrawer>
    </PlatformLayout>
  );
};

export default TenantsPage;
