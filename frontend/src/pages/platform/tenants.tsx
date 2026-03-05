/**
 * Platform Tenants Management Page (T112)
 * 
 * CRUD operations for tenants:
 * - List all tenants
 * - Create new tenant
 * - Edit existing tenant
 * - Suspend/activate tenant
 * - Delete tenant
 */

import React, { useState, useEffect } from "react";
import {
  Box,
  Button,
  Card,
  CardContent,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
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
import {
  Delete as DeleteIcon,
  Edit as EditIcon,
  Add as AddIcon,
  Refresh as RefreshIcon,
} from "@mui/icons-material";
import PlatformLayout from "./layout";

interface Tenant {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

interface CreateTenantData {
  slug: string;
  name: string;
  email_admin: string;
  plan: "basic" | "pro" | "premium" | "enterprise";
  is_trial: boolean;
}

const TenantsPage: React.FC = () => {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openCreateDialog, setOpenCreateDialog] = useState(false);
  const [openEditDialog, setOpenEditDialog] = useState(false);
  const [editingTenant, setEditingTenant] = useState<Tenant | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const [createFormData, setCreateFormData] = useState<CreateTenantData>({
    slug: "",
    name: "",
    email_admin: "",
    plan: "basic",
    is_trial: false,
  });

  // Load tenants
  useEffect(() => {
    fetchTenants();
  }, [page]);

  const fetchTenants = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/v1/platform/tenants?skip=${(page - 1) * 100}&limit=100`
      );
      if (!response.ok) throw new Error("Failed to fetch tenants");
      const data = await response.json();
      setTenants(data);
      // Calculate pages (simplified)
      setTotalPages(Math.ceil(data.length / 100));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  const handleCreateTenant = async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/v1/platform/tenants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(createFormData),
      });
      if (!response.ok) throw new Error("Failed to create tenant");
      
      setOpenCreateDialog(false);
      setCreateFormData({
        slug: "",
        name: "",
        email_admin: "",
        plan: "basic",
        is_trial: false,
      });
      fetchTenants();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateTenant = async () => {
    if (!editingTenant) return;
    setLoading(true);
    try {
      const response = await fetch(
        `/api/v1/platform/tenants/${editingTenant.id}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: editingTenant.name,
            description: editingTenant.description,
            is_active: editingTenant.is_active,
          }),
        }
      );
      if (!response.ok) throw new Error("Failed to update tenant");
      
      setOpenEditDialog(false);
      setEditingTenant(null);
      fetchTenants();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteTenant = async (tenantId: string) => {
    if (!window.confirm("Are you sure you want to delete this tenant?")) return;
    
    setLoading(true);
    try {
      const response = await fetch(`/api/v1/platform/tenants/${tenantId}`, {
        method: "DELETE",
      });
      if (!response.ok) throw new Error("Failed to delete tenant");
      fetchTenants();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
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
              onClick={() => setOpenCreateDialog(true)}
              disabled={loading}
            >
              New Tenant
            </Button>
          </Box>
        </Box>

        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

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
                        onClick={() => {
                          setEditingTenant(tenant);
                          setOpenEditDialog(true);
                        }}
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

      {/* Create Tenant Dialog */}
      <Dialog open={openCreateDialog} onClose={() => setOpenCreateDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Create New Tenant</DialogTitle>
        <DialogContent sx={{ pt: 2 }}>
          <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <TextField
              label="Slug"
              value={createFormData.slug}
              onChange={(e) =>
                setCreateFormData({ ...createFormData, slug: e.target.value })
              }
              fullWidth
              placeholder="company-name"
            />
            <TextField
              label="Name"
              value={createFormData.name}
              onChange={(e) =>
                setCreateFormData({ ...createFormData, name: e.target.value })
              }
              fullWidth
            />
            <TextField
              label="Admin Email"
              type="email"
              value={createFormData.email_admin}
              onChange={(e) =>
                setCreateFormData({
                  ...createFormData,
                  email_admin: e.target.value,
                })
              }
              fullWidth
            />
            <FormControl fullWidth>
              <InputLabel>Plan</InputLabel>
              <Select
                value={createFormData.plan}
                label="Plan"
                onChange={(e) =>
                  setCreateFormData({
                    ...createFormData,
                    plan: e.target.value as any,
                  })
                }
              >
                <MenuItem value="basic">Basic</MenuItem>
                <MenuItem value="pro">Pro</MenuItem>
                <MenuItem value="premium">Premium</MenuItem>
                <MenuItem value="enterprise">Enterprise</MenuItem>
              </Select>
            </FormControl>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenCreateDialog(false)}>Cancel</Button>
          <Button
            onClick={handleCreateTenant}
            variant="contained"
            disabled={!createFormData.slug || !createFormData.name}
          >
            Create
          </Button>
        </DialogActions>
      </Dialog>

      {/* Edit Tenant Dialog */}
      <Dialog open={openEditDialog} onClose={() => setOpenEditDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Edit Tenant</DialogTitle>
        <DialogContent sx={{ pt: 2 }}>
          {editingTenant && (
            <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <TextField
                label="Name"
                value={editingTenant.name}
                onChange={(e) =>
                  setEditingTenant({
                    ...editingTenant,
                    name: e.target.value,
                  })
                }
                fullWidth
              />
              <TextField
                label="Description"
                value={editingTenant.description || ""}
                onChange={(e) =>
                  setEditingTenant({
                    ...editingTenant,
                    description: e.target.value || null,
                  })
                }
                fullWidth
                multiline
                rows={3}
              />
              <FormControl fullWidth>
                <InputLabel>Status</InputLabel>
                <Select
                  value={editingTenant.is_active}
                  label="Status"
                  onChange={(e) =>
                    setEditingTenant({
                      ...editingTenant,
                      is_active: e.target.value as any,
                    })
                  }
                >
                  <MenuItem value={true}>Active</MenuItem>
                  <MenuItem value={false}>Inactive</MenuItem>
                </Select>
              </FormControl>
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenEditDialog(false)}>Cancel</Button>
          <Button onClick={handleUpdateTenant} variant="contained">
            Update
          </Button>
        </DialogActions>
      </Dialog>
    </PlatformLayout>
  );
};

export default TenantsPage;
