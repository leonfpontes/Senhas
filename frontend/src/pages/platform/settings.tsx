/**
 * Platform Settings Page
 *
 * Platform-wide settings for SUPER_ADMIN:
 * - Feature flags management per tenant
 */

import React, { useState, useEffect } from "react";
import {
  Box,
  Card,
  CardContent,
  Grid,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Alert,
  Chip,
  Button,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Switch,
  TextField,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import DeleteIcon from "@mui/icons-material/Delete";
import FlagIcon from "@mui/icons-material/Flag";
import { apiClient } from "../../services/api_client";
import PlatformLayout from "./layout";
import CrudDrawer from "../../components/CrudDrawer";

interface Tenant {
  id: string;
  name: string;
  slug: string;
}

interface FeatureFlag {
  id: string;
  tenant_id: string;
  feature: string;
  enabled: boolean;
  expires_at: string | null;
  description: string | null;
  created_at: string;
}

const SettingsPage: React.FC = () => {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [selectedTenant, setSelectedTenant] = useState<string>("");

  const [flags, setFlags] = useState<FeatureFlag[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [newFlag, setNewFlag] = useState({ feature: "", description: "" });
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchTenants();
  }, []);

  useEffect(() => {
    if (selectedTenant) {
      fetchFlags(selectedTenant);
    } else {
      setFlags([]);
    }
  }, [selectedTenant]);

  const fetchTenants = async () => {
    try {
      const response = await apiClient.get("/api/v1/platform/tenants");
      setTenants(response.data);
    } catch (err: any) {
      console.error("Failed to fetch tenants:", err);
    }
  };

  const fetchFlags = async (tenantId: string) => {
    try {
      const response = await apiClient.get(
        `/api/v1/platform/feature-flags/${tenantId}`
      );
      setFlags(response.data);
    } catch (err: any) {
      setFlags([]);
    }
  };

  const openAddFlag = () => {
    setNewFlag({ feature: "", description: "" });
    setTouched({});
    setDrawerOpen(true);
  };

  const flagIsDirty = newFlag.feature.length > 0 || newFlag.description.length > 0;
  const featureError = touched.feature && !newFlag.feature.trim() ? "Nome da feature obrigatório" : "";
  const flagValid = newFlag.feature.trim().length > 0;

  const handleAddFlag = async () => {
    if (!selectedTenant || !newFlag.feature) return;
    setSaving(true);
    try {
      await apiClient.post(
        `/api/v1/platform/feature-flags/${selectedTenant}`,
        {
          feature: newFlag.feature,
          enabled: true,
          description: newFlag.description || null,
        }
      );
      setDrawerOpen(false);
      setSuccess("Feature flag adicionada com sucesso!");
      setTimeout(() => setSuccess(null), 3000);
      fetchFlags(selectedTenant);
    } catch (err: any) {
      setError(err?.response?.data?.detail || err?.message || "Failed to add feature flag");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteFlag = async (feature: string) => {
    if (!selectedTenant) return;
    if (!window.confirm(`Delete feature flag "${feature}"?`)) return;
    try {
      await apiClient.delete(
        `/api/v1/platform/feature-flags/${selectedTenant}/${feature}`
      );
      fetchFlags(selectedTenant);
    } catch (err: any) {
      setError(err?.message || "Failed to delete feature flag");
    }
  };

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString("pt-BR");

  return (
    <PlatformLayout>
      <Box data-tour="settings-header" sx={{ mb: 3 }}>
        <h1>Feature Flags</h1>
        <p>Gerencie feature flags por tenant</p>
      </Box>

      {/* Tenant Selector */}
      <Card data-tour="settings-tenant-select" sx={{ mb: 3 }}>
        <CardContent>
          <FormControl sx={{ minWidth: { xs: '100%', sm: 300 } }} size="small">
            <InputLabel>Select Tenant</InputLabel>
            <Select
              value={selectedTenant}
              onChange={(e) => setSelectedTenant(e.target.value)}
              label="Select Tenant"
            >
              <MenuItem value="">
                <em>-- Select a tenant --</em>
              </MenuItem>
              {tenants.map((t) => (
                <MenuItem key={t.id} value={t.id}>
                  {t.name} ({t.slug})
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </CardContent>
      </Card>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}
      {success && <Alert severity="success" sx={{ mb: 2 }}>{success}</Alert>}

      {!selectedTenant ? (
        <Alert severity="info">
          Selecione um tenant acima para gerenciar suas feature flags.
        </Alert>
      ) : (
        <Grid container spacing={3}>
          {/* Feature Flags Card */}
          <Grid data-tour="settings-flags" item xs={12}>
            <Card sx={{ height: "100%" }}>
              <CardContent>
                <Box
                  sx={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    mb: 2,
                  }}
                >
                  <Box sx={{ fontWeight: 700, fontSize: "1.1rem" }}>
                    Feature Flags
                  </Box>
                  <Button
                    data-tour="settings-add-flag"
                    size="small"
                    variant="contained"
                    startIcon={<AddIcon />}
                    onClick={openAddFlag}
                  >
                    Add Flag
                  </Button>
                </Box>

                {flags.length === 0 ? (
                  <Alert severity="info">
                    No feature flags for this tenant.
                  </Alert>
                ) : (
                  <TableContainer component={Paper} variant="outlined" sx={{ overflowX: 'auto' }}>
                    <Table size="small">
                      <TableHead>
                        <TableRow>
                          <TableCell>Feature</TableCell>
                          <TableCell>Enabled</TableCell>
                          <TableCell>Expires</TableCell>
                          <TableCell />
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {flags.map((flag) => (
                          <TableRow key={flag.id}>
                            <TableCell>
                              <Box>{flag.feature}</Box>
                              {flag.description && (
                                <Box
                                  sx={{
                                    fontSize: "0.75rem",
                                    color: "text.secondary",
                                  }}
                                >
                                  {flag.description}
                                </Box>
                              )}
                            </TableCell>
                            <TableCell>
                              <Chip
                                label={flag.enabled ? "ON" : "OFF"}
                                color={flag.enabled ? "success" : "default"}
                                size="small"
                              />
                            </TableCell>
                            <TableCell>
                              {flag.expires_at
                                ? formatDate(flag.expires_at)
                                : "—"}
                            </TableCell>
                            <TableCell>
                              <Button
                                size="small"
                                color="error"
                                onClick={() => handleDeleteFlag(flag.feature)}
                              >
                                <DeleteIcon fontSize="small" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                )}
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      )}

      {/* Add Feature Flag Drawer */}
      <CrudDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title="Nova Feature Flag"
        subtitle="Adicione uma feature flag para o tenant selecionado."
        icon={<FlagIcon />}
        onSave={handleAddFlag}
        saveLabel="Adicionar"
        saving={saving}
        saveDisabled={!flagValid}
        isDirty={flagIsDirty}
      >
        <TextField
          label="Nome da Feature"
          fullWidth
          value={newFlag.feature}
          onChange={(e) => setNewFlag({ ...newFlag, feature: e.target.value })}
          onBlur={() => setTouched((p) => ({ ...p, feature: true }))}
          required
          error={!!featureError}
          helperText={featureError}
        />
        <TextField
          label="Descrição"
          fullWidth
          value={newFlag.description}
          onChange={(e) => setNewFlag({ ...newFlag, description: e.target.value })}
          multiline
          rows={3}
        />
      </CrudDrawer>
    </PlatformLayout>
  );
};

export default SettingsPage;
