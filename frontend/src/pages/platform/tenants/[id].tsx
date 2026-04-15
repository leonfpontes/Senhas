/**
 * Tenant Detail Page - View users and impersonate
 * 
 * Super Admin can:
 * - View tenant info (name, slug, status)
 * - List all users of the tenant
 * - Impersonate any user (opens new tab)
 */

import React, { useState, useEffect } from "react";
import { useRouter } from "next/router";
import {
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Alert,
  IconButton,
  InputAdornment,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import LockResetIcon from "@mui/icons-material/LockReset";
import PersonIcon from "@mui/icons-material/Person";
import Visibility from "@mui/icons-material/Visibility";
import VisibilityOff from "@mui/icons-material/VisibilityOff";
import { apiClient } from "../../../services/api_client";
import CrudDrawer from "../../../components/CrudDrawer";
import PlatformLayout from "../layout";

interface TenantInfo {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

interface TenantUser {
  id: string;
  email: string;
  username: string;
  role: string;
  is_active: boolean;
  created_at: string;
}

interface ImpersonateResponse {
  access_token: string;
  user: { id: string; email: string; username: string; role: string };
  tenant: { id: string; name: string; slug: string };
}

export default function TenantDetailPage() {
  const router = useRouter();
  const { id } = router.query;

  const [tenant, setTenant] = useState<TenantInfo | null>(null);
  const [users, setUsers] = useState<TenantUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [impersonating, setImpersonating] = useState<string | null>(null);

  // Reset password drawer state
  const [resetDrawerOpen, setResetDrawerOpen] = useState(false);
  const [resetUser, setResetUser] = useState<TenantUser | null>(null);
  const [resetPassword, setResetPassword] = useState("");
  const [resetConfirm, setResetConfirm] = useState("");
  const [resetSaving, setResetSaving] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  useEffect(() => {
    if (id) {
      loadData();
    }
  }, [id]);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [tenantRes, usersRes] = await Promise.all([
        apiClient.get(`/api/v1/platform/tenants/${id}`),
        apiClient.get(`/api/v1/platform/tenants/${id}/users`),
      ]);
      setTenant(tenantRes.data);
      setUsers(usersRes.data);
    } catch (err: any) {
      setError(err.message || "Erro ao carregar dados do tenant");
    } finally {
      setLoading(false);
    }
  };

  const handleImpersonate = async (userId: string) => {
    setImpersonating(userId);
    try {
      const res = await apiClient.post<ImpersonateResponse>(
        `/api/v1/platform/impersonate/${userId}`
      );
      const { access_token, user, tenant: tenantInfo } = res.data;

      const userB64 = btoa(JSON.stringify(user));
      const tenantB64 = btoa(JSON.stringify(tenantInfo));

      window.open(
        `/admin/impersonate?token=${encodeURIComponent(access_token)}&user=${encodeURIComponent(userB64)}&tenant=${encodeURIComponent(tenantB64)}`,
        "_blank"
      );
    } catch (err: any) {
      setError(err.message || "Erro ao impersonar usuário");
    } finally {
      setImpersonating(null);
    }
  };

  const handleOpenResetDrawer = (user: TenantUser) => {
    setResetUser(user);
    setResetDrawerOpen(true);
  };

  const handleResetClose = () => {
    setResetDrawerOpen(false);
    setResetUser(null);
    setResetPassword("");
    setResetConfirm("");
    setResetError(null);
    setShowNewPassword(false);
    setShowConfirmPassword(false);
  };

  const handleResetSave = async () => {
    if (!resetUser) return;
    const tenantId = id as string;
    setResetSaving(true);
    setResetError(null);
    try {
      await apiClient.post(
        `/api/v1/platform/tenants/${tenantId}/users/${resetUser.id}/reset-password`,
        { new_password: resetPassword }
      );
      handleResetClose();
      setSuccessMessage(`Senha de ${resetUser.email} redefinida com sucesso.`);
    } catch (err: any) {
      setResetError(
        err.response?.data?.detail || "Erro ao redefinir senha"
      );
    } finally {
      setResetSaving(false);
    }
  };

  const passwordMismatch =
    resetConfirm.length > 0 && resetPassword !== resetConfirm;
  const resetSaveDisabled =
    !resetPassword ||
    resetPassword !== resetConfirm ||
    resetPassword.length < 12;

  const roleColor = (role: string) => {
    switch (role) {
      case "ADMIN":
        return "primary";
      case "OPERATOR":
        return "secondary";
      default:
        return "default";
    }
  };

  if (loading) {
    return (
      <PlatformLayout>
        <Box display="flex" justifyContent="center" alignItems="center" minHeight="60vh">
          <CircularProgress />
        </Box>
      </PlatformLayout>
    );
  }

  return (
    <PlatformLayout>
      <Box sx={{ p: { xs: 1, sm: 3 } }}>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
            {error}
          </Alert>
        )}
        {successMessage && (
          <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSuccessMessage(null)}>
            {successMessage}
          </Alert>
        )}

        {/* Header */}
        <Box display="flex" alignItems="center" gap={2} mb={3}>
          <IconButton onClick={() => router.push("/platform/tenants")}>
            <ArrowBackIcon />
          </IconButton>
          <Box>
            <Typography variant="h5">
              {tenant?.name || "Tenant"}
            </Typography>
            <Box display="flex" alignItems="center" gap={1} mt={0.5}>
              <Typography variant="body2" color="text.secondary">
                {tenant?.slug}
              </Typography>
              <Chip
                label={tenant?.is_active ? "Ativo" : "Inativo"}
                color={tenant?.is_active ? "success" : "error"}
                size="small"
              />
            </Box>
          </Box>
        </Box>

        {/* Users Table */}
        <Card>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              Usuários ({users.length})
            </Typography>
            <TableContainer component={Paper} variant="outlined" sx={{ overflowX: 'auto' }}>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell>Email</TableCell>
                    <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>Username</TableCell>
                    <TableCell>Role</TableCell>
                    <TableCell>Status</TableCell>
                    <TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }}>Criado em</TableCell>
                    <TableCell align="right">Ações</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {users.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} align="center">
                        Nenhum usuário encontrado
                      </TableCell>
                    </TableRow>
                  ) : (
                    users.map((user) => (
                      <TableRow key={user.id}>
                        <TableCell>{user.email}</TableCell>
                        <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>{user.username}</TableCell>
                        <TableCell>
                          <Chip
                            label={user.role}
                            color={roleColor(user.role) as any}
                            size="small"
                          />
                        </TableCell>
                        <TableCell>
                          <Chip
                            label={user.is_active ? "Ativo" : "Inativo"}
                            color={user.is_active ? "success" : "error"}
                            size="small"
                            variant="outlined"
                          />
                        </TableCell>
                        <TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }}>
                          {new Date(user.created_at).toLocaleDateString("pt-BR")}
                        </TableCell>
                        <TableCell align="right">
                          <Tooltip title="Redefinir senha">
                            <IconButton
                              color="info"
                              onClick={() => handleOpenResetDrawer(user)}
                            >
                              <LockResetIcon />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="Impersonar usuário">
                            <span>
                              <IconButton
                                color="warning"
                                onClick={() => handleImpersonate(user.id)}
                                disabled={
                                  !user.is_active || impersonating === user.id
                                }
                              >
                                {impersonating === user.id ? (
                                  <CircularProgress size={20} />
                                ) : (
                                  <PersonIcon />
                                )}
                              </IconButton>
                            </span>
                          </Tooltip>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          </CardContent>
        </Card>
      </Box>

      {/* Reset Password Drawer */}
      <CrudDrawer
        open={resetDrawerOpen}
        onClose={handleResetClose}
        title="Redefinir Senha"
        subtitle={resetUser?.email}
        icon={<LockResetIcon />}
        onSave={handleResetSave}
        saveLabel="Redefinir"
        saving={resetSaving}
        saveDisabled={resetSaveDisabled}
        isDirty={resetPassword.length > 0 || resetConfirm.length > 0}
      >
        <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {resetError && (
            <Alert severity="error" onClose={() => setResetError(null)}>
              {resetError}
            </Alert>
          )}
          <TextField
            label="Nova senha"
            type={showNewPassword ? "text" : "password"}
            value={resetPassword}
            onChange={(e) => setResetPassword(e.target.value)}
            autoComplete="new-password"
            fullWidth
            helperText="Mínimo 12 caracteres, maiúscula, número e símbolo"
            InputProps={{
              endAdornment: (
                <InputAdornment position="end">
                  <IconButton
                    onClick={() => setShowNewPassword((p) => !p)}
                    edge="end"
                  >
                    {showNewPassword ? <VisibilityOff /> : <Visibility />}
                  </IconButton>
                </InputAdornment>
              ),
            }}
          />
          <TextField
            label="Confirmar senha"
            type={showConfirmPassword ? "text" : "password"}
            value={resetConfirm}
            onChange={(e) => setResetConfirm(e.target.value)}
            autoComplete="new-password"
            fullWidth
            error={passwordMismatch}
            helperText={passwordMismatch ? "Senhas não coincidem" : " "}
            InputProps={{
              endAdornment: (
                <InputAdornment position="end">
                  <IconButton
                    onClick={() => setShowConfirmPassword((p) => !p)}
                    edge="end"
                  >
                    {showConfirmPassword ? <VisibilityOff /> : <Visibility />}
                  </IconButton>
                </InputAdornment>
              ),
            }}
          />
        </Box>
      </CrudDrawer>
    </PlatformLayout>
  );
}
