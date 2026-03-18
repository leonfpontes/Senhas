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
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  TextField,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Chip,
  CircularProgress,
  Alert,
  Pagination,
} from "@mui/material";
import DeleteIcon from "@mui/icons-material/Delete";
import EditIcon from "@mui/icons-material/Edit";
import AddIcon from "@mui/icons-material/Add";
import RefreshIcon from "@mui/icons-material/Refresh";
import PeopleIcon from "@mui/icons-material/People";
import BusinessIcon from "@mui/icons-material/Business";
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
}

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
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

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

  return (
    <PlatformLayout>
      <Box sx={{ mb: 3 }}>
        <Box
          sx={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            mb: 3,
          }}
        >
          <h1>Tenant Management</h1>
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
        <TableContainer component={Paper}>
          <Table>
            <TableHead>
              <TableRow sx={{ bgcolor: "primary.light" }}>
                <TableCell>Slug</TableCell>
                <TableCell>Name</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Created</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={5} align="center">
                    <CircularProgress />
                  </TableCell>
                </TableRow>
              ) : tenants.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} align="center">
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
                    <TableCell>
                      {new Date(tenant.created_at).toLocaleDateString()}
                    </TableCell>
                    <TableCell align="right">
                      <IconButton
                        size="small"
                        color="info"
                        title="Ver Usuários"
                        onClick={() => router.push(`/platform/tenants/${tenant.id}`)}
                      >
                        <PeopleIcon fontSize="small" />
                      </IconButton>
                      <IconButton
                        size="small"
                        onClick={() => openEdit(tenant)}
                      >
                        <EditIcon fontSize="small" />
                      </IconButton>
                      <IconButton
                        size="small"
                        color="error"
                        onClick={() => handleDeleteTenant(tenant.id)}
                      >
                        <DeleteIcon fontSize="small" />
                      </IconButton>
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
                <MenuItem value="enterprise">Enterprise</MenuItem>
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
