/**
 * T075: Admin Config Page - Branding, settings, feature flags
 */
'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Divider,
  FormControl,
  FormControlLabel,
  Grid,
  IconButton,
  Paper,
  Radio,
  RadioGroup,
  Stack,
  Switch,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import AutoAwesomeRoundedIcon from '@mui/icons-material/AutoAwesomeRounded';
import BrandingWatermarkRoundedIcon from '@mui/icons-material/BrandingWatermarkRounded';
import CloudUploadRoundedIcon from '@mui/icons-material/CloudUploadRounded';
import DeleteRoundedIcon from '@mui/icons-material/DeleteRounded';
import HelpOutlineRoundedIcon from '@mui/icons-material/HelpOutlineRounded';
import PaletteRoundedIcon from '@mui/icons-material/PaletteRounded';
import SaveRoundedIcon from '@mui/icons-material/SaveRounded';
import SettingsSuggestRoundedIcon from '@mui/icons-material/SettingsSuggestRounded';
import TuneRoundedIcon from '@mui/icons-material/TuneRounded';
import VisibilityRoundedIcon from '@mui/icons-material/VisibilityRounded';

import AdminLayout from './admin_layout';
import { apiClient } from '../../services/api_client';
import { dispatchTenantBrandingUpdated } from '../../providers/ThemeProvider';

interface TenantConfig {
  logo_url?: string | null;
  primary_color: string;
  secondary_color: string;
  custom_settings?: Record<string, unknown> | null;
  reply_to_email?: string | null;
  email_signature?: string | null;
  endereco?: string | null;
  enable_bulk_operations: boolean;
  enable_analytics: boolean;
  enable_webhooks: boolean;
  enable_walk_in: boolean;
  sponsor_priority_mode?: string;
}

type FeedbackState = {
  severity: 'success' | 'error';
  text: string;
} | null;

const HEX_COLOR_RE = /^#[0-9A-Fa-f]{6}$/;

const HELP_TEXT = {
  logo_url:
    'Faça upload do logo do seu terreiro. Formatos aceitos: JPG, PNG ou WEBP. Tamanho máximo: 2 MB. Dimensão recomendada: 200×200 px.',
  primary_color:
    'Cor principal usada em botões, destaques e elementos de ação do tenant. Use um tom que combine com a identidade visual da casa.',
  secondary_color:
    'Cor de apoio usada para compor gradientes, destaques secundários e contrastes visuais da interface pública.',
  font_color:
    'Cor do texto aplicada no Header e nos itens selecionados do menu lateral, junto ao branding do tenant.',
  enable_bulk_operations:
    'Libera ações em lote para tickets e rotinas administrativas que precisam operar em muitos registros de uma vez.',
  enable_analytics:
    'Mostra a área de analytics do tenant com indicadores, gráficos e acompanhamento operacional das giras.',
  enable_webhooks:
    'Reserva o tenant para integrações automáticas por webhook. Mantenha desligado enquanto essa integração não estiver configurada.',
  enable_walk_in:
    'Permite emitir senhas presenciais diretamente pela visão da porta, usando o fluxo de Walk-in configurado para a gira.',
  sponsor_priority_mode:
    'Define como tickets de patrocinadores entram na ordem de chamada na visão da porta: antes de todos ou intercalados com os demais.',
} as const;

const FEATURE_ITEMS = [
  {
    field: 'enable_bulk_operations' as const,
    title: 'Operações em lote',
    description: 'Ativa ações administrativas que processam muitos tickets de uma vez.',
    tooltip: HELP_TEXT.enable_bulk_operations,
  },
  {
    field: 'enable_analytics' as const,
    title: 'Analytics',
    description: 'Exibe a área de indicadores, gráficos e totais do tenant.',
    tooltip: HELP_TEXT.enable_analytics,
  },
  {
    field: 'enable_webhooks' as const,
    title: 'Webhooks',
    description: 'Prepara o tenant para integrações automáticas externas quando estiverem disponíveis.',
    tooltip: HELP_TEXT.enable_webhooks,
  },
  {
    field: 'enable_walk_in' as const,
    title: 'Walk-in na porta',
    description: 'Permite criar atendimentos presenciais diretamente na fila da porta.',
    tooltip: HELP_TEXT.enable_walk_in,
  },
];

function ColorField({
  label,
  help,
  value,
  onChange,
  error,
  helperText,
}: {
  label: string;
  help: string;
  value: string;
  onChange: (value: string) => void;
  error: boolean;
  helperText: string;
}) {
  return (
    <Box>
      <FieldLabel label={label} help={help} />
      <Stack direction="row" spacing={1.25} alignItems="center" sx={{ mb: 1.25 }}>
        <Box
          sx={{
            width: 42,
            height: 42,
            overflow: 'hidden',
            borderRadius: 2,
            border: '1px solid',
            borderColor: error ? 'error.main' : 'divider',
          }}
        >
          <Box
            component="input"
            type="color"
            value={HEX_COLOR_RE.test(value) ? value : '#000000'}
            onChange={(event: React.ChangeEvent<HTMLInputElement>) => onChange(event.target.value.toUpperCase())}
            sx={{
              width: 54,
              height: 54,
              cursor: 'pointer',
              border: 0,
              background: 'transparent',
              p: 0,
              m: -0.75,
            }}
          />
        </Box>
        <TextField
          value={value}
          onChange={(event) => onChange(event.target.value.toUpperCase())}
          placeholder="#000000"
          inputProps={{ maxLength: 7 }}
          fullWidth
          error={error}
        />
      </Stack>
      <Typography variant="caption" color={error ? 'error.main' : 'text.secondary'}>
        {helperText}
      </Typography>
    </Box>
  );
}

const PRIORITY_OPTIONS = [
  {
    value: 'first',
    title: 'Patrocinadores primeiro',
    description: 'Patrocinadores são chamados antes dos preferenciais e comuns.',
  },
  {
    value: 'interleave',
    title: 'Intercalar na fila',
    description: 'Patrocinadores entram alternados com os demais atendimentos.',
  },
];

function FieldLabel({ label, help }: { label: string; help: string }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 0.75 }}>
      <Typography variant="subtitle2" fontWeight={700} color="text.primary">
        {label}
      </Typography>
      <Tooltip title={help} placement="top-start">
        <IconButton size="small" sx={{ color: 'text.secondary', p: 0.25 }}>
          <HelpOutlineRoundedIcon sx={{ fontSize: 18 }} />
        </IconButton>
      </Tooltip>
    </Box>
  );
}

function FeatureToggleCard({
  title,
  description,
  tooltip,
  checked,
  onChange,
}: {
  title: string;
  description: string;
  tooltip: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <Paper
      variant="outlined"
      sx={{
        p: 2.25,
        height: '100%',
        borderRadius: 3,
        borderColor: checked ? 'primary.main' : 'divider',
        backgroundColor: checked ? 'rgba(99, 102, 241, 0.05)' : 'background.paper',
      }}
    >
      <Stack direction="row" justifyContent="space-between" gap={2} alignItems="flex-start">
        <Box sx={{ minWidth: 0 }}>
          <FieldLabel label={title} help={tooltip} />
          <Typography variant="body2" color="text.secondary">
            {description}
          </Typography>
        </Box>
        <Switch checked={checked} onChange={(event) => onChange(event.target.checked)} />
      </Stack>
    </Paper>
  );
}

const isValidHexColor = (value: string) => HEX_COLOR_RE.test(value.trim());

const getFontColor = (config: TenantConfig | null): string => {
  const raw = config?.custom_settings && typeof config.custom_settings === 'object'
    ? (config.custom_settings as Record<string, unknown>).font_color
    : undefined;

  return typeof raw === 'string' ? raw : '#FFFFFF';
};

export default function AdminConfig() {
  const [config, setConfig] = useState<TenantConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<FeedbackState>(null);
  const [logoPreviewFailed, setLogoPreviewFailed] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const logoInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    void loadConfig();
  }, []);

  const loadConfig = async () => {
    try {
      setLoading(true);
      const response = await apiClient.get<TenantConfig>('/api/v1/admin/tenant/config');
      setConfig(response.data);
      setLogoPreviewFailed(false);
    } catch (error) {
      console.error('Error loading config:', error);
      setFeedback({ severity: 'error', text: 'Erro ao carregar configurações do tenant.' });
    } finally {
      setLoading(false);
    }
  };

  const handleChange = <K extends keyof TenantConfig>(field: K, value: TenantConfig[K]) => {
    setConfig((prev) => (prev ? { ...prev, [field]: value } : null));
  };

  const validationErrors = useMemo(() => {
    if (!config) {
      return { primary_color: '', secondary_color: '', font_color: '' };
    }

    const fontColor = getFontColor(config);

    return {
      primary_color: isValidHexColor(config.primary_color)
        ? ''
        : 'Escolha uma cor válida no formato hexadecimal.',
      secondary_color: isValidHexColor(config.secondary_color)
        ? ''
        : 'Escolha uma cor válida no formato hexadecimal.',
      font_color: isValidHexColor(fontColor)
        ? ''
        : 'Escolha uma cor válida no formato hexadecimal.',
    };
  }, [config]);

  const hasValidationErrors = Boolean(
    validationErrors.primary_color ||
    validationErrors.secondary_color ||
    validationErrors.font_color
  );

  const previewPrimary = config?.primary_color || '#6366f1';
  const previewSecondary = config?.secondary_color || '#ec4899';
  const previewFontColor = getFontColor(config);
  const previewLogo = config?.logo_url?.trim() || '';

  const handleSave = async () => {
    if (!config) {
      return;
    }

    if (hasValidationErrors) {
      setFeedback({ severity: 'error', text: 'Revise os campos de identidade visual antes de salvar.' });
      return;
    }

    try {
      setSaving(true);
      const response = await apiClient.put<TenantConfig>('/api/v1/admin/tenant/config', {
        primary_color: config.primary_color.trim().toUpperCase(),
        secondary_color: config.secondary_color.trim().toUpperCase(),
        custom_settings: {
          ...(config.custom_settings && typeof config.custom_settings === 'object'
            ? config.custom_settings
            : {}),
          font_color: previewFontColor.trim().toUpperCase(),
        },
        enable_bulk_operations: config.enable_bulk_operations,
        enable_analytics: config.enable_analytics,
        enable_webhooks: config.enable_webhooks,
        enable_walk_in: config.enable_walk_in,
        sponsor_priority_mode: config.sponsor_priority_mode || 'first',
        endereco: config.endereco || '',
      });

      setConfig(response.data);
      setLogoPreviewFailed(false);
      dispatchTenantBrandingUpdated();
      setFeedback({
        severity: 'success',
        text: 'Configurações salvas. O branding já foi atualizado no painel e no público.',
      });
    } catch (error: any) {
      console.error('Error saving config:', error);
      setFeedback({
        severity: 'error',
        text: error?.message || error?.detail || 'Erro ao salvar configurações.',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleLogoUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setFeedback({ severity: 'error', text: 'Formato inválido. Use JPG, PNG ou WEBP.' });
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      setFeedback({ severity: 'error', text: 'A imagem deve ter no máximo 2 MB.' });
      return;
    }

    setUploadingLogo(true);
    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await apiClient.post<TenantConfig>('/api/v1/admin/tenant/logo', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      setConfig(response.data);
      setLogoPreviewFailed(false);
      dispatchTenantBrandingUpdated();
      setFeedback({ severity: 'success', text: 'Logo atualizado com sucesso.' });
    } catch (err: any) {
      setFeedback({ severity: 'error', text: err?.message || 'Erro ao enviar logo.' });
    } finally {
      setUploadingLogo(false);
      if (event.target) event.target.value = '';
    }
  };

  const handleLogoDelete = async () => {
    setUploadingLogo(true);
    try {
      const response = await apiClient.delete<TenantConfig>('/api/v1/admin/tenant/logo');
      setConfig(response.data);
      setLogoPreviewFailed(false);
      dispatchTenantBrandingUpdated();
      setFeedback({ severity: 'success', text: 'Logo removido.' });
    } catch (err: any) {
      setFeedback({ severity: 'error', text: err?.message || 'Erro ao remover logo.' });
    } finally {
      setUploadingLogo(false);
    }
  };

  if (loading) {
    return (
      <AdminLayout title="Configurações" maxWidth="xl">
        <Box sx={{ display: 'flex', justifyContent: 'center', p: 6 }}>
          <CircularProgress />
        </Box>
      </AdminLayout>
    );
  }

  if (!config) {
    return (
      <AdminLayout title="Configurações" maxWidth="xl">
        <Alert severity="error">Erro ao carregar configurações do tenant.</Alert>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout title="Configurações" maxWidth="xl">
      <Stack spacing={3}>
        {feedback && (
          <Alert severity={feedback.severity} onClose={() => setFeedback(null)}>
            {feedback.text}
          </Alert>
        )}

        <Paper
          elevation={0}
          sx={{
            p: { xs: 3, md: 4 },
            borderRadius: 4,
            color: previewFontColor,
            background: `linear-gradient(135deg, ${previewPrimary} 0%, ${previewSecondary} 100%)`,
          }}
        >
          <Grid container spacing={3} alignItems="center">
            <Grid item xs={12} md={7}>
              <Stack spacing={2}>
                <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                  <Chip icon={<BrandingWatermarkRoundedIcon />} label="Identidade visual" sx={{ bgcolor: 'rgba(255,255,255,0.18)', color: previewFontColor }} />
                  <Chip icon={<AutoAwesomeRoundedIcon />} label="Aplicação imediata" sx={{ bgcolor: 'rgba(255,255,255,0.12)', color: previewFontColor }} />
                  <Chip icon={<VisibilityRoundedIcon />} label="Painel + público" sx={{ bgcolor: 'rgba(255,255,255,0.12)', color: previewFontColor }} />
                </Stack>
                <Box>
                  <Typography variant="h4" fontWeight={800} sx={{ mb: 1 }}>
                    Organize o branding e as regras do seu tenant em um só lugar
                  </Typography>
                    <Typography variant="body1" sx={{ opacity: 0.92, maxWidth: 720, color: previewFontColor }}>
                    Esta tela foi separada por contexto de uso para ficar fácil entender o impacto de cada configuração. Branding altera a identidade visual do painel e da emissão pública. Funcionalidades controlam módulos do tenant. Regras de atendimento organizam a fila da porta.
                  </Typography>
                </Box>
              </Stack>
            </Grid>
            <Grid item xs={12} md={5}>
              <Paper
                elevation={0}
                sx={{
                  p: 2.5,
                  borderRadius: 3,
                  color: previewFontColor,
                  bgcolor: 'rgba(10, 14, 28, 0.16)',
                  border: '1px solid rgba(255,255,255,0.18)',
                  backdropFilter: 'blur(10px)',
                }}
              >
                <Stack direction="row" spacing={2} alignItems="center">
                  {previewLogo && !logoPreviewFailed ? (
                    <Box
                      component="img"
                      src={previewLogo}
                      alt="Logo do tenant"
                      onError={() => setLogoPreviewFailed(true)}
                      sx={{
                        width: 72,
                        height: 72,
                        borderRadius: 2.5,
                        objectFit: 'cover',
                        border: '1px solid rgba(255,255,255,0.24)',
                        backgroundColor: 'rgba(255,255,255,0.18)',
                      }}
                    />
                  ) : (
                    <Box
                      sx={{
                        width: 72,
                        height: 72,
                        borderRadius: 2.5,
                        display: 'grid',
                        placeItems: 'center',
                        fontSize: 28,
                        fontWeight: 800,
                        border: '1px solid rgba(255,255,255,0.24)',
                        backgroundColor: 'rgba(255,255,255,0.18)',
                      }}
                    >
                      T
                    </Box>
                  )}
                  <Box sx={{ minWidth: 0 }}>
                    <Typography variant="overline" sx={{ opacity: 0.78, color: previewFontColor }}>
                      Preview ao vivo
                    </Typography>
                    <Typography variant="h6" fontWeight={700}>
                      Meu Terreiro
                    </Typography>
                    <Typography variant="body2" sx={{ opacity: 0.84, color: previewFontColor }}>
                      Veja instantaneamente como as cores e o logo vão se comportar no tenant.
                    </Typography>
                  </Box>
                </Stack>
                <Stack direction="row" spacing={1.5} sx={{ mt: 2.5 }}>
                  <Button variant="contained" disableElevation sx={{ bgcolor: 'rgba(255,255,255,0.92)', color: previewPrimary, '&:hover': { bgcolor: 'rgba(255,255,255,0.92)' } }}>
                    Primária
                  </Button>
                  <Button variant="contained" disableElevation sx={{ bgcolor: previewSecondary, color: previewFontColor, '&:hover': { bgcolor: previewSecondary } }}>
                    Secundária
                  </Button>
                </Stack>
              </Paper>
            </Grid>
          </Grid>
        </Paper>

        <Grid container spacing={3}>
          <Grid item xs={12} lg={7}>
            <Card sx={{ borderRadius: 4, height: '100%' }}>
              <CardContent sx={{ p: { xs: 3, md: 3.5 } }}>
                <Stack spacing={3}>
                  <Box>
                    <Stack direction="row" spacing={1.25} alignItems="center" sx={{ mb: 1 }}>
                      <PaletteRoundedIcon color="primary" />
                      <Typography variant="h5" fontWeight={800}>
                        Identidade visual
                      </Typography>
                    </Stack>
                    <Typography variant="body2" color="text.secondary">
                      Configure o logo e a paleta principal do tenant. As mudanças refletem no painel administrativo e nas páginas públicas do terreiro.
                    </Typography>
                  </Box>

                  <Divider />

                  <Box>
                    <FieldLabel label="Logo do terreiro" help={HELP_TEXT.logo_url} />

                    <input
                      ref={logoInputRef}
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      onChange={handleLogoUpload}
                      style={{ display: 'none' }}
                    />

                    {previewLogo && !logoPreviewFailed ? (
                      <Stack spacing={1.5} alignItems="center">
                        <Box
                          component="img"
                          src={previewLogo}
                          alt="Logo do terreiro"
                          onError={() => setLogoPreviewFailed(true)}
                          sx={{
                            maxWidth: 200,
                            maxHeight: 200,
                            objectFit: 'contain',
                            objectPosition: 'center',
                            borderRadius: 2,
                            border: '1px solid',
                            borderColor: 'divider',
                          }}
                        />
                        <Stack direction="row" spacing={1}>
                          <Button
                            variant="outlined"
                            size="small"
                            startIcon={<CloudUploadRoundedIcon />}
                            onClick={() => logoInputRef.current?.click()}
                            disabled={uploadingLogo}
                          >
                            {uploadingLogo ? 'Enviando…' : 'Trocar logo'}
                          </Button>
                          <Button
                            variant="outlined"
                            color="error"
                            size="small"
                            startIcon={<DeleteRoundedIcon />}
                            onClick={handleLogoDelete}
                            disabled={uploadingLogo}
                          >
                            Remover
                          </Button>
                        </Stack>
                      </Stack>
                    ) : (
                      <Box
                        onClick={() => logoInputRef.current?.click()}
                        sx={{
                          border: '2px dashed',
                          borderColor: 'divider',
                          borderRadius: 3,
                          p: 4,
                          textAlign: 'center',
                          cursor: 'pointer',
                          transition: 'border-color 0.2s',
                          '&:hover': { borderColor: 'primary.main' },
                        }}
                      >
                        <CloudUploadRoundedIcon sx={{ fontSize: 40, color: 'text.secondary', mb: 1 }} />
                        <Typography variant="body2" color="text.secondary">
                          {uploadingLogo
                            ? 'Enviando…'
                            : 'Clique ou arraste para enviar o logo do terreiro'}
                        </Typography>
                        <Typography variant="caption" color="text.disabled">
                          JPG, PNG ou WEBP · Máx 2 MB · Recomendado: 200×200 px
                        </Typography>
                      </Box>
                    )}
                  </Box>

                  <Grid container spacing={2}>
                    <Grid item xs={12} md={6}>
                      <ColorField
                        label="Cor primária"
                        help={HELP_TEXT.primary_color}
                        value={config.primary_color}
                        onChange={(value) => handleChange('primary_color', value)}
                        error={Boolean(validationErrors.primary_color)}
                        helperText={
                          validationErrors.primary_color ||
                          'Usada em botões, destaques e ações principais.'
                        }
                      />
                    </Grid>
                    <Grid item xs={12} md={6}>
                      <ColorField
                        label="Cor secundária"
                        help={HELP_TEXT.secondary_color}
                        value={config.secondary_color}
                        onChange={(value) => handleChange('secondary_color', value)}
                        error={Boolean(validationErrors.secondary_color)}
                        helperText={
                          validationErrors.secondary_color ||
                          'Usada em composições de apoio e contraste visual.'
                        }
                      />
                    </Grid>
                    <Grid item xs={12} md={6}>
                      <ColorField
                        label="Cor da fonte"
                        help={HELP_TEXT.font_color}
                        value={previewFontColor}
                        onChange={(value) =>
                          handleChange('custom_settings', {
                            ...(config.custom_settings && typeof config.custom_settings === 'object'
                              ? config.custom_settings
                              : {}),
                            font_color: value,
                          })
                        }
                        error={Boolean(validationErrors.font_color)}
                        helperText={
                          validationErrors.font_color ||
                          'Aplicada no texto do Header e nos itens selecionados do menu lateral.'
                        }
                      />
                    </Grid>
                  </Grid>

                  <Grid container spacing={2}>
                    <Grid item xs={12} md={6}>
                      <Paper variant="outlined" sx={{ p: 2.25, borderRadius: 3 }}>
                        <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1 }}>
                          Onde a cor primária aparece
                        </Typography>
                        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                          Botões principais, links de destaque, estados ativos e controles de navegação.
                        </Typography>
                        <Button variant="contained" disableElevation sx={{ bgcolor: config.primary_color, '&:hover': { bgcolor: config.primary_color } }}>
                          Exemplo primário
                        </Button>
                      </Paper>
                    </Grid>
                    <Grid item xs={12} md={6}>
                      <Paper variant="outlined" sx={{ p: 2.25, borderRadius: 3 }}>
                        <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1 }}>
                          Onde a cor secundária aparece
                        </Typography>
                        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                          Gradientes, contrastes públicos, blocos de apoio e elementos complementares.
                        </Typography>
                        <Button variant="contained" disableElevation sx={{ bgcolor: config.secondary_color, '&:hover': { bgcolor: config.secondary_color } }}>
                          Exemplo secundário
                        </Button>
                      </Paper>
                    </Grid>
                  </Grid>

                  <Divider />

                  <Box>
                    <FieldLabel label="Endereço do terreiro" help="Endereço completo do terreiro. Será usado nos e-mails de confirmação de senha e no botão Como chegar (Google Maps)." />
                    <TextField
                      value={config.endereco || ''}
                      onChange={(e) => handleChange('endereco', e.target.value)}
                      placeholder="Rua Exemplo, 123 - Bairro - Cidade/UF"
                      fullWidth
                      multiline
                      rows={2}
                    />
                    <Typography variant="caption" color="text.secondary">
                      Será exibido nos e-mails de confirmação e usado no botão &quot;Como chegar&quot; via Google Maps.
                    </Typography>
                  </Box>
                </Stack>
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={12} lg={5}>
            <Card sx={{ borderRadius: 4, height: '100%' }}>
              <CardContent sx={{ p: { xs: 3, md: 3.5 } }}>
                <Stack spacing={3}>
                  <Box>
                    <Stack direction="row" spacing={1.25} alignItems="center" sx={{ mb: 1 }}>
                      <VisibilityRoundedIcon color="primary" />
                      <Typography variant="h5" fontWeight={800}>
                        Leitura rápida da tela
                      </Typography>
                    </Stack>
                    <Typography variant="body2" color="text.secondary">
                      Use esta área como mapa mental da página antes de salvar qualquer ajuste.
                    </Typography>
                  </Box>

                  <Paper variant="outlined" sx={{ p: 2.25, borderRadius: 3 }}>
                    <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 0.75 }}>
                      1. Identidade visual
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      Logo, cor primária e cor secundária do tenant.
                    </Typography>
                  </Paper>

                  <Paper variant="outlined" sx={{ p: 2.25, borderRadius: 3 }}>
                    <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 0.75 }}>
                      2. Funcionalidades operacionais
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      Liga ou desliga módulos do painel conforme o momento operacional do terreiro.
                    </Typography>
                  </Paper>

                  <Paper variant="outlined" sx={{ p: 2.25, borderRadius: 3 }}>
                    <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 0.75 }}>
                      3. Regras da porta
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      Define a prioridade de patrocinadores na fila de atendimento da visão da porta.
                    </Typography>
                  </Paper>

                  <Alert severity="info" sx={{ borderRadius: 3 }}>
                    A seção de e-mail foi removida desta página. O envio via Resend será tratado em uma configuração dedicada no momento apropriado.
                  </Alert>
                </Stack>
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={12}>
            <Card sx={{ borderRadius: 4 }}>
              <CardContent sx={{ p: { xs: 3, md: 3.5 } }}>
                <Stack spacing={3}>
                  <Box>
                    <Stack direction="row" spacing={1.25} alignItems="center" sx={{ mb: 1 }}>
                      <SettingsSuggestRoundedIcon color="primary" />
                      <Typography variant="h5" fontWeight={800}>
                        Funcionalidades operacionais
                      </Typography>
                    </Stack>
                    <Typography variant="body2" color="text.secondary">
                      Cada chave abaixo controla um módulo do tenant. Passe o mouse no ícone de ajuda para entender o impacto de cada funcionalidade antes de ativar.
                    </Typography>
                  </Box>

                  <Grid container spacing={2}>
                    {FEATURE_ITEMS.map((item) => (
                      <Grid item xs={12} md={6} key={item.field}>
                        <FeatureToggleCard
                          title={item.title}
                          description={item.description}
                          tooltip={item.tooltip}
                          checked={config[item.field]}
                          onChange={(checked) => handleChange(item.field, checked)}
                        />
                      </Grid>
                    ))}
                  </Grid>
                </Stack>
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={12}>
            <Card sx={{ borderRadius: 4 }}>
              <CardContent sx={{ p: { xs: 3, md: 3.5 } }}>
                <Stack spacing={3}>
                  <Box>
                    <Stack direction="row" spacing={1.25} alignItems="center" sx={{ mb: 1 }}>
                      <TuneRoundedIcon color="primary" />
                      <Typography variant="h5" fontWeight={800}>
                        Regras de atendimento na porta
                      </Typography>
                    </Stack>
                    <Typography variant="body2" color="text.secondary">
                      Escolha a política de posicionamento dos patrocinadores na fila. Esta definição afeta exclusivamente a visão da porta.
                    </Typography>
                  </Box>

                  <FormControl component="fieldset">
                    <FieldLabel label="Prioridade dos patrocinadores" help={HELP_TEXT.sponsor_priority_mode} />
                    <RadioGroup
                      value={config.sponsor_priority_mode || 'first'}
                      onChange={(event) => handleChange('sponsor_priority_mode', event.target.value)}
                    >
                      <Grid container spacing={2}>
                        {PRIORITY_OPTIONS.map((option) => {
                          const selected = (config.sponsor_priority_mode || 'first') === option.value;

                          return (
                            <Grid item xs={12} md={6} key={option.value}>
                              <Paper
                                variant="outlined"
                                sx={{
                                  p: 2.25,
                                  borderRadius: 3,
                                  borderColor: selected ? 'primary.main' : 'divider',
                                  backgroundColor: selected ? 'rgba(99, 102, 241, 0.05)' : 'background.paper',
                                }}
                              >
                                <FormControlLabel
                                  value={option.value}
                                  control={<Radio />}
                                  sx={{ alignItems: 'flex-start', m: 0 }}
                                  label={
                                    <Box>
                                      <Typography variant="subtitle2" fontWeight={700}>
                                        {option.title}
                                      </Typography>
                                      <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                                        {option.description}
                                      </Typography>
                                    </Box>
                                  }
                                />
                              </Paper>
                            </Grid>
                          );
                        })}
                      </Grid>
                    </RadioGroup>
                  </FormControl>
                </Stack>
              </CardContent>
            </Card>
          </Grid>
        </Grid>

        <Paper
          elevation={0}
          sx={{
            p: 2.5,
            borderRadius: 4,
            position: { md: 'sticky' },
            bottom: { md: 24 },
            zIndex: 2,
            border: '1px solid',
            borderColor: 'divider',
            backgroundColor: 'rgba(255,255,255,0.92)',
            backdropFilter: 'blur(14px)',
          }}
        >
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} justifyContent="space-between" alignItems={{ xs: 'stretch', md: 'center' }}>
            <Box>
              <Typography variant="subtitle1" fontWeight={700}>
                Tudo pronto para salvar
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Ao salvar, as cores e o logo do tenant são atualizados imediatamente no painel e nas páginas públicas.
              </Typography>
            </Box>
            <Button
              variant="contained"
              size="large"
              startIcon={<SaveRoundedIcon />}
              onClick={handleSave}
              disabled={saving || hasValidationErrors}
              sx={{ minWidth: { md: 260 } }}
            >
              {saving ? 'Salvando configurações...' : 'Salvar configurações do tenant'}
            </Button>
          </Stack>
        </Paper>
      </Stack>
    </AdminLayout>
  );
}
