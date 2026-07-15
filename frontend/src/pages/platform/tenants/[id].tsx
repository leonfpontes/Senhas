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
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
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
import CalendarTodayIcon from "@mui/icons-material/CalendarToday";
import LockResetIcon from "@mui/icons-material/LockReset";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import PersonIcon from "@mui/icons-material/Person";
import StarIcon from "@mui/icons-material/Star";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import Visibility from "@mui/icons-material/Visibility";
import VisibilityOff from "@mui/icons-material/VisibilityOff";
import { apiClient, extractApiErrorMessage } from "../../../services/api_client";
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
  plan: string | null;
  subscription_status: string | null;
  is_bonus: boolean | null;
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

  // Impersonation confirmation dialog
  const [impersonateTarget, setImpersonateTarget] = useState<TenantUser | null>(null);

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
    // loadData isn't memoized — including it would refetch every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    } catch (err) {
      setError(extractApiErrorMessage(err, "Erro ao carregar dados do tenant"));
    } finally {
      setLoading(false);
    }
  };

  const handleImpersonate = async (userId: string) => {
    setImpersonating(userId);
    setImpersonateTarget(null);
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
    } catch (err) {
      setError(extractApiErrorMessage(err, "Erro ao impersonar usuário"));
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
    } catch (err) {
      setResetError(extractApiErrorMessage(err, "Erro ao redefinir senha"));
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

  const roleColor = (role: string): "primary" | "secondary" | "default" => {
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
              <Typography variant="body2" color="text.secondary" sx={{ fontFamily: 'monospace' }}>
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

        {/* Context summary card */}
        <Card variant="outlined" sx={{ mb: 3 }}>
          <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
            <Box sx={{ display: 'flex', gap: 3, flexWrap: 'wrap', alignItems: 'center' }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                <Typography variant="caption" color="text.secondary">Plano</Typography>
                {tenant?.plan ? (
                  <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center' }}>
                    <Chip
                      label={tenant.plan.toUpperCase()}
                      size="small"
                      color={tenant.plan === 'premium' ? 'warning' : tenant.plan === 'pro' ? 'primary' : tenant.plan === 'basic' ? 'info' : 'default'}
                    />
                    {tenant.is_bonus && (
                      <Tooltip title="Acesso bonificado">
                        <StarIcon sx={{ fontSize: 16, color: '#f59e0b' }} />
                      </Tooltip>
                    )}
                  </Box>
                ) : <Typography variant="body2">—</Typography>}
              </Box>
              <Divider orientation="vertical" flexItem />
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                <Typography variant="caption" color="text.secondary">Assinatura</Typography>
                <Chip
                  label={tenant?.subscription_status ?? 'sem dados'}
                  size="small"
                  variant="outlined"
                  color={tenant?.subscription_status === 'active' ? 'success' : 'default'}
                />
              </Box>
              <Divider orientation="vertical" flexItem />
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                <CalendarTodayIcon sx={{ fontSize: 14, color: 'text.secondary' }} />
                <Typography variant="body2" color="text.secondary">
                  Criado em {tenant?.created_at ? new Date(tenant.created_at).toLocaleDateString('pt-BR') : '—'}
                </Typography>
              </Box>
              <Divider orientation="vertical" flexItem />
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                <Typography variant="caption" color="text.secondary">Usuários</Typography>
                <Typography variant="body2" fontWeight={600}>{users.length}</Typography>
              </Box>
            </Box>
          </CardContent>
        </Card>

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
                            color={roleColor(user.role)}
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
                                onClick={() => setImpersonateTarget(user)}
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

      {/* Impersonation Confirmation Dialog */}
      <Dialog
        open={Boolean(impersonateTarget)}
        onClose={() => setImpersonateTarget(null)}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <WarningAmberIcon color="warning" fontSize="small" />
          Confirmar impersonar
        </DialogTitle>
        <DialogContent>
          <Typography variant="body2" gutterBottom>
            Você irá operar como o usuário abaixo em uma nova aba:
          </Typography>
          <Box sx={{ mt: 1.5, p: 1.5, bgcolor: 'action.hover', borderRadius: 1 }}>
            <Typography variant="body2" fontWeight={600}>{impersonateTarget?.email}</Typography>
            <Typography variant="caption" color="text.secondary">
              {impersonateTarget?.role} · {tenant?.name}
            </Typography>
          </Box>
          <Alert severity="warning" sx={{ mt: 2 }} icon={<OpenInNewIcon fontSize="small" />}>
            Uma nova aba será aberta com sessão ativa deste usuário.
          </Alert>
        </DialogContent>
        <DialogActions sx={{ px: 2, pb: 2 }}>
          <Button onClick={() => setImpersonateTarget(null)}>Cancelar</Button>
          <Button
            variant="contained"
            color="warning"
            startIcon={<PersonIcon />}
            onClick={() => {
              if (impersonateTarget) handleImpersonate(impersonateTarget.id);
            }}
          >
            Abrir como esse usuário
          </Button>
        </DialogActions>
      </Dialog>

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
