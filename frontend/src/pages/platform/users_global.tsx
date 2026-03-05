/**
 * Global Users Management Page (T113)
 * 
 * SUPER_ADMIN user management:
 * - List all platform admins
 * - Create new SUPER_ADMIN
 * - Edit existing admin
 * - Deactivate admin
 * - Delete admin
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

interface PlatformUser {
  id: string;
  email: string;
  username: string;
  role: string;
  is_active: boolean;
  created_at: string;
}

interface CreateUserData {
  email: string;
  username: string;
  password: string;
}

const GlobalUsersPage: React.FC = () => {
  const [users, setUsers] = useState<PlatformUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openCreateDialog, setOpenCreateDialog] = useState(false);
  const [openEditDialog, setOpenEditDialog] = useState(false);
  const [editingUser, setEditingUser] = useState<PlatformUser | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const [createFormData, setCreateFormData] = useState<CreateUserData>({
    email: "",
    username: "",
    password: "",
  });

  // Load users
  useEffect(() => {
    fetchUsers();
  }, [page]);

  const fetchUsers = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/v1/platform/users?skip=${(page - 1) * 100}&limit=100`
      );
      if (!response.ok) throw new Error("Failed to fetch users");
      const data = await response.json();
      setUsers(data);
      setTotalPages(Math.ceil(data.length / 100));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  const handleCreateUser = async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/v1/platform/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(createFormData),
      });
      if (!response.ok) throw new Error("Failed to create user");
      
      setOpenCreateDialog(false);
      setCreateFormData({
        email: "",
        username: "",
        password: "",
      });
      fetchUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateUser = async () => {
    if (!editingUser) return;
    setLoading(true);
    try {
      const response = await fetch(`/api/v1/platform/users/${editingUser.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: editingUser.username,
          is_active: editingUser.is_active,
        }),
      });
      if (!response.ok) throw new Error("Failed to update user");
      
      setOpenEditDialog(false);
      setEditingUser(null);
      fetchUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteUser = async (userId: string) => {
    if (!window.confirm("Are you sure you want to delete this user?")) return;
    
    setLoading(true);
    try {
      const response = await fetch(`/api/v1/platform/users/${userId}`, {
        method: "DELETE",
      });
      if (!response.ok) throw new Error("Failed to delete user");
      fetchUsers();
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
              onClick={() => setOpenCreateDialog(true)}
              disabled={loading}
            >
              New Admin
            </Button>
          </Box>
        </Box>

        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

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
                        onClick={() => {
                          setEditingUser(user);
                          setOpenEditDialog(true);
                        }}
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

      {/* Create User Dialog */}
      <Dialog open={openCreateDialog} onClose={() => setOpenCreateDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Create New Super Admin</DialogTitle>
        <DialogContent sx={{ pt: 2 }}>
          <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <TextField
              label="Email"
              type="email"
              value={createFormData.email}
              onChange={(e) =>
                setCreateFormData({ ...createFormData, email: e.target.value })
              }
              fullWidth
            />
            <TextField
              label="Username"
              value={createFormData.username}
              onChange={(e) =>
                setCreateFormData({
                  ...createFormData,
                  username: e.target.value,
                })
              }
              fullWidth
            />
            <TextField
              label="Password"
              type="password"
              value={createFormData.password}
              onChange={(e) =>
                setCreateFormData({
                  ...createFormData,
                  password: e.target.value,
                })
              }
              fullWidth
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenCreateDialog(false)}>Cancel</Button>
          <Button
            onClick={handleCreateUser}
            variant="contained"
            disabled={!createFormData.email || !createFormData.password}
          >
            Create
          </Button>
        </DialogActions>
      </Dialog>

      {/* Edit User Dialog */}
      <Dialog open={openEditDialog} onClose={() => setOpenEditDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Edit User</DialogTitle>
        <DialogContent sx={{ pt: 2 }}>
          {editingUser && (
            <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <TextField
                label="Email"
                value={editingUser.email}
                disabled
                fullWidth
              />
              <TextField
                label="Username"
                value={editingUser.username}
                onChange={(e) =>
                  setEditingUser({
                    ...editingUser,
                    username: e.target.value,
                  })
                }
                fullWidth
              />
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenEditDialog(false)}>Cancel</Button>
          <Button onClick={handleUpdateUser} variant="contained">
            Update
          </Button>
        </DialogActions>
      </Dialog>
    </PlatformLayout>
  );
};

export default GlobalUsersPage;
