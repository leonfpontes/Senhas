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
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Tooltip,
  Typography,
} from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import PersonIcon from "@mui/icons-material/Person";
import { apiClient } from "../../../services/api_client";
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
  const [impersonating, setImpersonating] = useState<string | null>(null);

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
    </PlatformLayout>
  );
}
