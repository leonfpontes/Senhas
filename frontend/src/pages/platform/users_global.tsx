/**
 * Global Users Management Page (T113)
 *
 * SUPER_ADMIN user management:
 * - List all platform admins
 * - Create new SUPER_ADMIN (CrudDrawer)
 * - Edit existing admin (CrudDrawer)
 * - Delete admin (confirm)
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
  Chip,
  CircularProgress,
  Alert,
  Pagination,
} from "@mui/material";
import DeleteIcon from "@mui/icons-material/Delete";
import EditIcon from "@mui/icons-material/Edit";
import AddIcon from "@mui/icons-material/Add";
import RefreshIcon from "@mui/icons-material/Refresh";
import AdminPanelSettingsIcon from "@mui/icons-material/AdminPanelSettings";
import { apiClient } from "../../services/api_client";
import PlatformLayout from "./layout";
import CrudDrawer from "../../components/CrudDrawer";

interface PlatformUser {
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
}

const EMPTY_FORM: FormData = { email: "", username: "", password: "" };
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const GlobalUsersPage: React.FC = () => {
  const [users, setUsers] = useState<PlatformUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  // Drawer state
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerMode, setDrawerMode] = useState<"create" | "edit">("create");
  const [editUserId, setEditUserId] = useState<string | null>(null);
  const [formData, setFormData] = useState<FormData>(EMPTY_FORM);
  const [originalData, setOriginalData] = useState<FormData>(EMPTY_FORM);
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchUsers();
  }, [page]);

  const fetchUsers = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await apiClient.get(
        `/api/v1/platform/users?skip=${(page - 1) * 100}&limit=100`
      );
      const data = response.data;
      setUsers(data);
      setTotalPages(Math.ceil(data.length / 100));
    } catch (err: any) {
      setError(err?.message || "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  // --- Drawer helpers ---
  const openCreate = () => {
    setFormData(EMPTY_FORM);
    setOriginalData(EMPTY_FORM);
    setTouched({});
    setDrawerMode("create");
    setEditUserId(null);
    setDrawerOpen(true);
  };

  const openEdit = (user: PlatformUser) => {
    const data: FormData = { email: user.email, username: user.username, password: "" };
    setFormData(data);
    setOriginalData(data);
    setTouched({});
    setDrawerMode("edit");
    setEditUserId(user.id);
    setDrawerOpen(true);
  };

  const handleChange = (field: keyof FormData, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const isDirty =
    formData.email !== originalData.email ||
    formData.username !== originalData.username ||
    formData.password !== originalData.password;

  // Validation
  const emailError = touched.email && !EMAIL_RE.test(formData.email) ? "Email inválido" : "";
  const usernameError = touched.username && !formData.username.trim() ? "Username obrigatório" : "";
  const passwordError =
    drawerMode === "create" && touched.password && formData.password.length < 6
      ? "Senha deve ter pelo menos 6 caracteres"
      : "";

  const isValid =
    EMAIL_RE.test(formData.email) &&
    formData.username.trim().length > 0 &&
    (drawerMode === "edit" || formData.password.length >= 6);

  // --- CRUD ---
  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      if (drawerMode === "create") {
        await apiClient.post("/api/v1/platform/users", formData);
        setSuccess("Super Admin criado com sucesso!");
      } else {
        await apiClient.put(`/api/v1/platform/users/${editUserId}`, {
          username: formData.username,
          is_active: true,
        });
        setSuccess("Usuário atualizado com sucesso!");
      }
      setDrawerOpen(false);
      setTimeout(() => setSuccess(null), 3000);
      fetchUsers();
    } catch (err: any) {
      setError(err?.response?.data?.detail || err?.message || "Erro ao salvar usuário");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteUser = async (userId: string) => {
    if (!window.confirm("Tem certeza que deseja excluir este usuário?")) return;
    setLoading(true);
    try {
      await apiClient.delete(`/api/v1/platform/users/${userId}`);
      setSuccess("Usuário excluído com sucesso!");
      setTimeout(() => setSuccess(null), 3000);
      fetchUsers();
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
          <h1>Global Users (SUPER_ADMIN)</h1>
          <Box sx={{ display: "flex", gap: 1 }}>
            <Button
              variant="outlined"
              startIcon={<RefreshIcon />}
              onClick={fetchUsers}
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
              New Admin
            </Button>
          </Box>
        </Box>

        {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>{error}</Alert>}
        {success && <Alert severity="success" sx={{ mb: 2 }}>{success}</Alert>}

        {/* Users Table */}
        <TableContainer component={Paper}>
          <Table>
            <TableHead>
              <TableRow sx={{ bgcolor: "primary.light" }}>
                <TableCell>Email</TableCell>
                <TableCell>Username</TableCell>
                <TableCell>Role</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Created</TableCell>
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
              ) : users.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} align="center">
                    No users found
                  </TableCell>
                </TableRow>
              ) : (
                users.map((user) => (
                  <TableRow key={user.id} hover>
                    <TableCell>{user.email}</TableCell>
                    <TableCell>{user.username}</TableCell>
                    <TableCell>
                      <Chip
                        label={user.role.toUpperCase()}
                        color="primary"
                        variant="outlined"
                        size="small"
                      />
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={user.is_active ? "Active" : "Inactive"}
                        color={user.is_active ? "success" : "error"}
                        variant="outlined"
                        size="small"
                      />
                    </TableCell>
                    <TableCell>
                      {new Date(user.created_at).toLocaleDateString()}
                    </TableCell>
                    <TableCell align="right">
                      <IconButton
                        size="small"
                        onClick={() => openEdit(user)}
                      >
                        <EditIcon fontSize="small" />
                      </IconButton>
                      <IconButton
                        size="small"
                        color="error"
                        onClick={() => handleDeleteUser(user.id)}
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

      {/* Create / Edit Super Admin Drawer */}
      <CrudDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title={drawerMode === "create" ? "Novo Super Admin" : "Editar Usuário"}
        subtitle={
          drawerMode === "create"
            ? "Crie um novo administrador da plataforma."
            : "Atualize as informações do administrador."
        }
        icon={<AdminPanelSettingsIcon />}
        onSave={handleSave}
        saveLabel={drawerMode === "create" ? "Criar" : "Salvar"}
        saving={saving}
        saveDisabled={!isValid}
        isDirty={isDirty}
      >
        <TextField
          label="Email"
          type="email"
          value={formData.email}
          onChange={(e) => handleChange("email", e.target.value)}
          onBlur={() => setTouched((p) => ({ ...p, email: true }))}
          fullWidth
          required
          disabled={drawerMode === "edit"}
          error={!!emailError}
          helperText={emailError}
        />
        <TextField
          label="Username"
          value={formData.username}
          onChange={(e) => handleChange("username", e.target.value)}
          onBlur={() => setTouched((p) => ({ ...p, username: true }))}
          fullWidth
          required
          error={!!usernameError}
          helperText={usernameError}
        />
        {drawerMode === "create" && (
          <TextField
            label="Senha"
            type="password"
            value={formData.password}
            onChange={(e) => handleChange("password", e.target.value)}
            onBlur={() => setTouched((p) => ({ ...p, password: true }))}
            fullWidth
            required
            error={!!passwordError}
            helperText={passwordError}
          />
        )}
      </CrudDrawer>
    </PlatformLayout>
  );
};

export default GlobalUsersPage;
