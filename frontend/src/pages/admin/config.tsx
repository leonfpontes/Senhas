/**
 * T075: Admin Config Page - Branding, settings, feature flags
 */
'use client';

import React, { useEffect, useState } from 'react';
import {
  Box,
  Button,
  TextField,
  Paper,
  Typography,
  Switch,
  FormControlLabel,
  CircularProgress,
  Grid,
  Card,
  CardContent,
  Alert,
} from '@mui/material';
import AdminLayout from './admin_layout';
import { apiClient } from '../../services/api_client';

interface TenantConfig {
  logo_url?: string;
  primary_color: string;
  secondary_color: string;
  reply_to_email?: string;
  email_signature?: string;
  enable_bulk_operations: boolean;
  enable_analytics: boolean;
  enable_webhooks: boolean;
}

export default function AdminConfig() {
  const [config, setConfig] = useState<TenantConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    loadConfig();
  }, []);

  const loadConfig = async () => {
    try {
      setLoading(true);
      const response = await apiClient.get('/api/v1/admin/tenant/config');
      setConfig(response.data);
    } catch (error) {
      console.error('Error loading config:', error);
      setMessage('Erro ao carregar configurações');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      await apiClient.put('/api/v1/admin/tenant/config', config);
      setMessage('Configurações salvas com sucesso!');
      setTimeout(() => setMessage(''), 3000);
    } catch (error) {
      console.error('Error saving config:', error);
      setMessage('Erro ao salvar configurações');
    } finally {
      setSaving(false);
    }
  };

  const handleChange = (field: string, value: any) => {
    setConfig((prev) => (prev ? { ...prev, [field]: value } : null));
  };

  if (loading) {
    return (
      <AdminLayout title="Configurações">
        <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
          <CircularProgress />
        </Box>
      </AdminLayout>
    );
  }

  if (!config) {
    return (
      <AdminLayout title="Configurações">
        <Alert severity="error">Erro ao carregar configurações</Alert>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout title="Configurações">
      {message && (
        <Alert severity={message.includes('sucesso') ? 'success' : 'error'} sx={{ mb: 2 }}>
          {message}
        </Alert>
      )}

      <Grid container spacing={3}>
        {/* Branding Section */}
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Marca
              </Typography>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <TextField
                  label="URL do Logo"
                  value={config.logo_url || ''}
                  onChange={(e) => handleChange('logo_url', e.target.value)}
                  fullWidth
                  placeholder="https://..."
                />
                <Box sx={{ display: 'flex', gap: 2 }}>
                  <Box sx={{ flex: 1 }}>
                    <Typography variant="caption" display="block">
                      Cor Primária
                    </Typography>
                    <Box
                      sx={{
                        display: 'flex',
                        gap: 1,
                        alignItems: 'center',
                        mt: 1,
                      }}
                    >
                      <Box
                        sx={{
                          width: 50,
                          height: 50,
                          backgroundColor: config.primary_color,
                          borderRadius: 1,
                          border: '1px solid #ccc',
                        }}
                      />
                      <TextField
                        value={config.primary_color}
                        onChange={(e) => handleChange('primary_color', e.target.value)}
                        type="text"
                        placeholder="#000000"
                        fullWidth
                      />
                    </Box>
                  </Box>
                  <Box sx={{ flex: 1 }}>
                    <Typography variant="caption" display="block">
                      Cor Secundária
                    </Typography>
                    <Box
                      sx={{
                        display: 'flex',
                        gap: 1,
                        alignItems: 'center',
                        mt: 1,
                      }}
                    >
                      <Box
                        sx={{
                          width: 50,
                          height: 50,
                          backgroundColor: config.secondary_color,
                          borderRadius: 1,
                          border: '1px solid #ccc',
                        }}
                      />
                      <TextField
                        value={config.secondary_color}
                        onChange={(e) => handleChange('secondary_color', e.target.value)}
                        type="text"
                        placeholder="#FFFFFF"
                        fullWidth
                      />
                    </Box>
                  </Box>
                </Box>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        {/* Email Settings */}
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Email
              </Typography>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <TextField
                  label="Email de Resposta"
                  type="email"
                  value={config.reply_to_email || ''}
                  onChange={(e) => handleChange('reply_to_email', e.target.value)}
                  fullWidth
                />
                <TextField
                  label="Assinatura de Email"
                  multiline
                  rows={3}
                  value={config.email_signature || ''}
                  onChange={(e) => handleChange('email_signature', e.target.value)}
                  fullWidth
                />
              </Box>
            </CardContent>
          </Card>
        </Grid>

        {/* Feature Flags */}
        <Grid item xs={12}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Funcionalidades
              </Typography>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                <FormControlLabel
                  control={
                    <Switch
                      checked={config.enable_bulk_operations}
                      onChange={(e) => handleChange('enable_bulk_operations', e.target.checked)}
                    />
                  }
                  label="Ativar Operações em Lote"
                />
                <FormControlLabel
                  control={
                    <Switch
                      checked={config.enable_analytics}
                      onChange={(e) => handleChange('enable_analytics', e.target.checked)}
                    />
                  }
                  label="Ativar Analytics"
                />
                <FormControlLabel
                  control={
                    <Switch
                      checked={config.enable_webhooks}
                      onChange={(e) => handleChange('enable_webhooks', e.target.checked)}
                    />
                  }
                  label="Ativar Webhooks"
                />
              </Box>
            </CardContent>
          </Card>
        </Grid>

        {/* Save Button */}
        <Grid item xs={12}>
          <Button
            variant="contained"
            onClick={handleSave}
            disabled={saving}
            size="large"
          >
            {saving ? 'Salvando...' : 'Salvar Configurações'}
          </Button>
        </Grid>
      </Grid>
    </AdminLayout>
  );
}
