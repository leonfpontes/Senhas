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
  FormControlLabel,
  InputLabel,
  MenuItem,
  Select,
  SelectChangeEvent,
  Snackbar,
  Switch,
  TextField,
  Typography,
} from '@mui/material';
import SettingsIcon from '@mui/icons-material/Settings';
import SaveIcon from '@mui/icons-material/Save';
import { NumericFormat } from 'react-number-format';
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
  const [emailRelatorioAtivo, setEmailRelatorioAtivo] = useState<boolean>(false);
  const [valorMensalAssociado, setValorMensalAssociado] = useState<string>('');
  const [diaVencimentoAssociado, setDiaVencimentoAssociado] = useState<string>('10');
  const [relatorioHoraEnvio, setRelatorioHoraEnvio] = useState<string>('');
  const [flagMensalidadeAssociado, setFlagMensalidadeAssociado] = useState<boolean>(false);
  const [snack, setSnack] = useState<{ open: boolean; msg: string; severity: 'success' | 'error' }>({
    open: false, msg: '', severity: 'success',
  });

  // Hooks must run unconditionally — gate checked after
  useEffect(() => {
    apiClient.get('/api/v1/admin/financeiro/config')
      .then((finRes) => {
        if (finRes.data) {
          setValorMensal(String(finRes.data.valor_mensal ?? ''));
          setDiaVencimento(String(finRes.data.dia_vencimento ?? '10'));
          setEmailRelatorioAtivo(Boolean(finRes.data.email_relatorio_ativo));
          setValorMensalAssociado(String(finRes.data.valor_mensal_associado ?? ''));
          setDiaVencimentoAssociado(String(finRes.data.dia_vencimento_associado ?? '10'));
          setRelatorioHoraEnvio(finRes.data.relatorio_hora_envio ?? '');
          setFlagMensalidadeAssociado(Boolean(finRes.data.enable_mensalidade_associado));
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Gate (after all hooks)
  if (!can('mensalidade_mediun') && !can('mensalidade_associado')) {
    return (
      <AdminLayout title="Config. Mensalidade">
        <UpgradePrompt feature="Controle de Mensalidade" minPlan="Pro" />
      </AdminLayout>
    );
  }

  const handleSave = async () => {
    if (can('mensalidade_mediun')) {
      const valor = parseFloat(valorMensal);
      if (isNaN(valor) || valor < 0) {
        setSnack({ open: true, msg: 'Informe um valor mensal válido (≥ 0).', severity: 'error' });
        return;
      }
    }
    setSaving(true);
    try {
      const body: Record<string, unknown> = {};
      if (can('mensalidade_mediun')) {
        body.valor_mensal = parseFloat(valorMensal);
        body.dia_vencimento = parseInt(diaVencimento);
        body.email_relatorio_ativo = emailRelatorioAtivo;
      }
      if (can('mensalidade_associado')) {
        body.enable_mensalidade_associado = flagMensalidadeAssociado;
        if (valorMensalAssociado) body.valor_mensal_associado = parseFloat(valorMensalAssociado);
        if (diaVencimentoAssociado) body.dia_vencimento_associado = parseInt(diaVencimentoAssociado);
        if (relatorioHoraEnvio) body.relatorio_hora_envio = relatorioHoraEnvio;
      }
      await apiClient.put('/api/v1/admin/financeiro/config', body);
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
          Defina o valor mensal e o dia de vencimento para as cobranças do seu terreiro.
        </Typography>

        {loading ? (
          <CircularProgress />
        ) : (
          <Card variant="outlined">
            <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>

              {/* Médiuns section (PREMIUM) */}
              {can('mensalidade_mediun') && (
                <>
                  <Typography variant="subtitle2" color="text.secondary" sx={{ textTransform: 'uppercase', letterSpacing: 1, fontSize: 11 }}>
                    Médiuns
                  </Typography>
                  <NumericFormat
                    customInput={TextField}
                    label="Valor Mensal (R$)"
                    size="small"
                    fullWidth
                    value={valorMensal}
                    onValueChange={(values) => setValorMensal(values.value)}
                    thousandSeparator="."
                    decimalSeparator=","
                    decimalScale={2}
                    fixedDecimalScale
                    prefix="R$ "
                    allowNegative={false}
                  />

                  <FormControl size="small" fullWidth>
                    <InputLabel>Dia de Vencimento</InputLabel>
                    <Select
                      value={diaVencimento}
                      label="Dia de Vencimento"
                      onChange={(e: SelectChangeEvent) => setDiaVencimento(e.target.value)}
                    >
                      {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => (
                        <MenuItem key={d} value={String(d)}>Dia {d}</MenuItem>
                      ))}
                    </Select>
                  </FormControl>

                  <FormControlLabel
                    control={
                      <Switch
                        checked={emailRelatorioAtivo}
                        onChange={(e) => setEmailRelatorioAtivo(e.target.checked)}
                        color="primary"
                      />
                    }
                    label={
                      <Box>
                        <Typography variant="body2" fontWeight={600}>Enviar relatório por e-mail</Typography>
                        <Typography variant="caption" color="text.secondary">
                          Quando ativo, o botão "Enviar Relatório" dispara e-mail para todos os admins do tenant.
                        </Typography>
                      </Box>
                    }
                  />
                </>
              )}

              {/* Associados section (PRO+) */}
              {can('mensalidade_associado') && (
                <>
                  <FormControlLabel
                    control={
                      <Switch
                        checked={flagMensalidadeAssociado}
                        onChange={(e) => setFlagMensalidadeAssociado(e.target.checked)}
                        color="primary"
                      />
                    }
                    label={
                      <Box>
                        <Typography variant="body2" fontWeight={600}>Habilitar Mensalidade de Associados</Typography>
                        <Typography variant="caption" color="text.secondary">
                          Ativa o controle de mensalidades para associados do terreiro.
                        </Typography>
                      </Box>
                    }
                  />

                  {flagMensalidadeAssociado && (
                    <>
                      <Typography variant="subtitle2" color="text.secondary" sx={{ textTransform: 'uppercase', letterSpacing: 1, fontSize: 11 }}>
                        Associados
                      </Typography>
                      <NumericFormat
                        customInput={TextField}
                        label="Valor Mensal Associados (R$)"
                        size="small"
                        fullWidth
                        value={valorMensalAssociado}
                        onValueChange={(values) => setValorMensalAssociado(values.value)}
                        thousandSeparator="."
                        decimalSeparator=","
                        decimalScale={2}
                        fixedDecimalScale
                        prefix="R$ "
                        allowNegative={false}
                      />

                      <FormControl size="small" fullWidth>
                        <InputLabel>Dia de Vencimento (Associados)</InputLabel>
                        <Select
                          value={diaVencimentoAssociado}
                          label="Dia de Vencimento (Associados)"
                          onChange={(e: SelectChangeEvent) => setDiaVencimentoAssociado(e.target.value)}
                        >
                          {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => (
                            <MenuItem key={d} value={String(d)}>Dia {d}</MenuItem>
                          ))}
                        </Select>
                      </FormControl>

                      <Box>
                        <TextField
                          size="small"
                          label="Hora de envio do relatório"
                          type="time"
                          value={relatorioHoraEnvio}
                          onChange={(e) => setRelatorioHoraEnvio(e.target.value)}
                          InputLabelProps={{ shrink: true }}
                          inputProps={{ step: 300 }}
                          fullWidth
                        />
                        <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
                          Envio automático — em breve
                        </Typography>
                      </Box>
                    </>
                  )}
                </>
              )}

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
