/**
 * Admin Financeiro — Configuração de Mensalidade
 * Allows ADMIN to set the monthly value and due day for the tenant.
 */
'use client';

import React, { useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  CircularProgress,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  SelectChangeEvent,
  Snackbar,
  TextField,
  Typography,
} from '@mui/material';
import SettingsIcon from '@mui/icons-material/Settings';
import SaveIcon from '@mui/icons-material/Save';
import AdminLayout from '../admin_layout';
import UpgradePrompt from '../../../components/UpgradePrompt';
import { apiClient } from '../../../services/api_client';
import { useSubscription } from '../../../hooks/useSubscription';

export default function FinanceiroConfigPage() {
  const { can } = useSubscription();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [valorMensal, setValorMensal] = useState<string>('');
  const [diaVencimento, setDiaVencimento] = useState<string>('10');
  const [snack, setSnack] = useState<{ open: boolean; msg: string; severity: 'success' | 'error' }>({
    open: false, msg: '', severity: 'success',
  });

  if (!can('mensalidade_mediun')) {
    return (
      <AdminLayout title="Config. Mensalidade">
        <UpgradePrompt feature="Controle de Mensalidade" minPlan="Premium" />
      </AdminLayout>
    );
  }

  useEffect(() => {
    apiClient.get('/api/v1/admin/financeiro/config')
      .then((res) => {
        if (res.data) {
          setValorMensal(String(res.data.valor_mensal ?? ''));
          setDiaVencimento(String(res.data.dia_vencimento ?? '10'));
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    const valor = parseFloat(valorMensal);
    if (isNaN(valor) || valor < 0) {
      setSnack({ open: true, msg: 'Informe um valor mensal válido (≥ 0).', severity: 'error' });
      return;
    }
    setSaving(true);
    try {
      await apiClient.put('/api/v1/admin/financeiro/config', {
        valor_mensal: valor,
        dia_vencimento: parseInt(diaVencimento),
      });
      setSnack({ open: true, msg: 'Configuração salva com sucesso.', severity: 'success' });
    } catch (err: any) {
      const detail = err?.response?.data?.detail || 'Erro ao salvar configuração.';
      setSnack({ open: true, msg: detail, severity: 'error' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <AdminLayout title="Config. Mensalidade">
      <Box sx={{ maxWidth: 480 }}>
        <Typography variant="h5" fontWeight={700} gutterBottom>
          <SettingsIcon sx={{ mr: 1, verticalAlign: 'middle' }} />
          Configuração de Mensalidade
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
          Defina o valor mensal e o dia de vencimento aplicados a todos os médiuns pagantes.
        </Typography>

        {loading ? (
          <CircularProgress />
        ) : (
          <Card variant="outlined">
            <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              <TextField
                label="Valor Mensal (R$)"
                type="number"
                size="small"
                value={valorMensal}
                onChange={(e) => setValorMensal(e.target.value)}
                inputProps={{ min: 0, step: 0.01 }}
                fullWidth
              />

              <FormControl size="small" fullWidth>
                <InputLabel>Dia de Vencimento</InputLabel>
                <Select
                  value={diaVencimento}
                  label="Dia de Vencimento"
                  onChange={(e: SelectChangeEvent) => setDiaVencimento(e.target.value)}
                >
                  {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => (
                    <MenuItem key={d} value={String(d)}>
                      Dia {d}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>

              <Button
                variant="contained"
                startIcon={saving ? <CircularProgress size={16} /> : <SaveIcon />}
                onClick={handleSave}
                disabled={saving}
              >
                Salvar Configuração
              </Button>
            </CardContent>
          </Card>
        )}
      </Box>

      <Snackbar
        open={snack.open}
        autoHideDuration={4000}
        onClose={() => setSnack((s) => ({ ...s, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity={snack.severity} onClose={() => setSnack((s) => ({ ...s, open: false }))}>
          {snack.msg}
        </Alert>
      </Snackbar>
    </AdminLayout>
  );
}
