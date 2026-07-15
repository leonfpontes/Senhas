'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  Alert,
  Box,
  Button,
  Card,
  Chip,
  CircularProgress,
  Divider,
  FormControlLabel,
  Grid,
  Paper,
  Radio,
  RadioGroup,
  Slide,
  Snackbar,
  Switch,
  Tab,
  Tabs,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import CheckCircleOutlineRoundedIcon from '@mui/icons-material/CheckCircleOutlineRounded';
import CloudUploadRoundedIcon from '@mui/icons-material/CloudUploadRounded';
import DeleteRoundedIcon from '@mui/icons-material/DeleteRounded';
import DoorFrontRoundedIcon from '@mui/icons-material/DoorFrontRounded';
import HelpOutlineRoundedIcon from '@mui/icons-material/HelpOutlineRounded';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import PaletteRoundedIcon from '@mui/icons-material/PaletteRounded';
import SaveRoundedIcon from '@mui/icons-material/SaveRounded';
import SettingsSuggestRoundedIcon from '@mui/icons-material/SettingsSuggestRounded';
import UndoRoundedIcon from '@mui/icons-material/UndoRounded';

import AdminLayout from './admin_layout';
import { apiClient, extractApiErrorMessage } from '../../services/api_client';
import { dispatchTenantBrandingUpdated } from '../../providers/ThemeProvider';
import { useSubscription } from '../../hooks/useSubscription';
import { usePermissions } from '../../hooks/usePermissions';
import { useAdminTheme } from '@/providers/AdminThemeProvider';
import { PlanFeatures } from '../../hooks/useSubscription';

// ─── Types ────────────────────────────────────────────────────────────────────

interface TenantConfig {
  logo_url?: string | null;
  primary_color: string;
  secondary_color: string;
  custom_settings?: Record<string, unknown> | null;
  reply_to_email?: string | null;
  email_signature?: string | null;
  endereco?: string | null;
  enable_analytics: boolean;
  enable_walk_in: boolean;
  validate_associado_on_emit: boolean;
  sponsor_priority_mode?: string;
  enable_estoque_log?: boolean;
  enable_mensalidade_associado?: boolean;
  enable_waitlist?: boolean;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const HEX_COLOR_RE = /^#[0-9A-Fa-f]{6}$/;

const FEATURE_ITEMS: {
  field: keyof TenantConfig;
  title: string;
  description: string;
  plan?: string;
  gate?: keyof PlanFeatures;
}[] = [
  {
    field: 'enable_analytics',
    title: 'Analytics',
    description: 'Relatórios de atendimento e gráficos de emissão por período.',
    plan: 'Pro',
    gate: 'analytics_basico',
  },
  {
    field: 'enable_walk_in',
    title: 'Walk-in na porta',
    description: 'Permite emissão presencial sem agendamento prévio.',
  },
  {
    field: 'validate_associado_on_emit',
    title: 'Validar associado na emissão',
    description: 'Exige vínculo de associado antes de emitir senha.',
    plan: 'Basic',
    gate: 'associados',
  },
  {
    field: 'enable_estoque_log',
    title: 'Log de movimentações',
    description: 'Registra entradas e saídas no histórico do estoque.',
    plan: 'Pro',
    gate: 'estoque_controle',
  },
  {
    field: 'enable_mensalidade_associado',
    title: 'Mensalidade de associados',
    description: 'Ativa o módulo de cobranças mensais para associados.',
    plan: 'Pro',
    gate: 'mensalidade_associado',
  },
  {
    field: 'enable_waitlist',
    title: 'Fila de espera',
    description: 'Quando uma gira lota, novos pedidos entram na fila e são promovidos automaticamente se uma senha for cancelada.',
    plan: 'Pro',
    gate: 'fila_espera',
  },
];

const PRIORITY_OPTIONS = [
  {
    value: 'first',
    title: 'Associados primeiro',
    description: 'Associados são chamados antes dos demais, independente da chegada.',
  },
  {
    value: 'interleave',
    title: 'Intercalar na fila',
    description: 'Um associado é chamado a cada atendimento da fila geral.',
  },
];

const BRANDING_IMPACT = [
  'Barra lateral e topbar do painel',
  'Página pública de emissão de senha',
  'Site público do terreiro',
  'E-mails de confirmação',
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

const isValidHex = (v: string) => HEX_COLOR_RE.test(v.trim());

const getFontColor = (config: TenantConfig | null): string => {
  const raw =
    config?.custom_settings && typeof config.custom_settings === 'object'
      ? (config.custom_settings as Record<string, unknown>).font_color
      : undefined;
  return typeof raw === 'string' ? raw : '#FFFFFF';
};

// ─── Sub-components ───────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <Typography
      variant="overline"
      sx={{ fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.08em', color: 'text.secondary', display: 'block', mb: 1.5 }}
    >
      {children}
    </Typography>
  );
}

function FieldHint({ label, help }: { label: string; help: string }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.75 }}>
      <Typography variant="subtitle2" fontWeight={600} color="text.primary">{label}</Typography>
      <Tooltip title={help} placement="top-start" arrow>
        <HelpOutlineRoundedIcon sx={{ fontSize: 15, color: 'text.disabled', cursor: 'help' }} />
      </Tooltip>
    </Box>
  );
}

function ColorField({
  label,
  help,
  value,
  onChange,
  error,
  helperText,
  disabled,
}: {
  label: string;
  help: string;
  value: string;
  onChange: (v: string) => void;
  error?: boolean;
  helperText?: string;
  disabled?: boolean;
}) {
  const { tokens } = useAdminTheme();
  return (
    <Box>
      <FieldHint label={label} help={help} />
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <Box
          component="label"
          sx={{
            width: 36,
            height: 36,
            borderRadius: 1.5,
            flexShrink: 0,
            background: isValidHex(value) ? value : tokens.border,
            border: '1px solid',
            borderColor: error ? 'error.main' : 'divider',
            cursor: disabled ? 'not-allowed' : 'pointer',
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          <input
            type="color"
            value={isValidHex(value) ? value : '#000000'}
            onChange={(e) => onChange(e.target.value)}
            disabled={disabled}
            style={{ opacity: 0, position: 'absolute', inset: 0, width: '100%', height: '100%', cursor: 'pointer' }}
          />
        </Box>
        <TextField
          value={value}
          onChange={(e) => onChange(e.target.value)}
          error={error}
          helperText={helperText}
          disabled={disabled}
          size="small"
          inputProps={{ maxLength: 7, style: { fontFamily: 'monospace', fontSize: '0.875rem' } }}
          sx={{ flex: 1 }}
        />
      </Box>
    </Box>
  );
}

function ToggleCard({
  title,
  description,
  plan,
  checked,
  locked,
  onChange,
}: {
  title: string;
  description: string;
  plan?: string;
  checked: boolean;
  locked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <Paper
      variant="outlined"
      sx={{
        p: 2,
        borderRadius: 2,
        height: '100%',
        display: 'flex',
        alignItems: 'flex-start',
        gap: 2,
        borderColor: checked && !locked ? 'primary.main' : 'divider',
        bgcolor: checked && !locked ? 'action.hover' : 'background.paper',
        opacity: locked ? 0.65 : 1,
        transition: 'border-color .15s, background .15s',
      }}
    >
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
          {locked
            ? <LockOutlinedIcon sx={{ fontSize: 15, color: 'text.disabled' }} />
            : null}
          <Typography variant="subtitle2" fontWeight={600} color={locked ? 'text.secondary' : 'text.primary'}>
            {title}
          </Typography>
          {plan && (
            <Chip
              label={plan}
              size="small"
              sx={{ height: 18, fontSize: '0.65rem', fontWeight: 700, bgcolor: locked ? 'action.selected' : 'primary.main', color: locked ? 'text.secondary' : 'primary.contrastText' }}
            />
          )}
        </Box>
        <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.8rem', lineHeight: 1.5 }}>
          {description}
        </Typography>
      </Box>
      <Switch
        checked={checked}
        disabled={locked}
        onChange={(e) => onChange(e.target.checked)}
        size="small"
        sx={{ flexShrink: 0, mt: 0.25 }}
      />
    </Paper>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function AdminConfigPage() {
  return (
    <AdminLayout title="Configurações" maxWidth="xl">
      <AdminConfigContent />
    </AdminLayout>
  );
}

function AdminConfigContent() {
  const { can } = useSubscription();
  const { can: canGroup } = usePermissions();
  const canView = canGroup('configuracoes', 'view');
  const canEdit = canGroup('configuracoes', 'edit');
  const { isDark } = useAdminTheme();

  const [savedConfig, setSavedConfig] = useState<TenantConfig | null>(null);
  const [config, setConfig] = useState<TenantConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [logoPreviewFailed, setLogoPreviewFailed] = useState(false);
  const [snackbar, setSnackbar] = useState<{ open: boolean; severity: 'success' | 'error'; text: string }>({ open: false, severity: 'success', text: '' });
  const [activeTab, setActiveTab] = useState(0);
  const [dragging, setDragging] = useState(false);
  const logoInputRef = useRef<HTMLInputElement | null>(null);

  // ── dirty tracking ──────────────────────────────────────────────────────────
  const isDirty = useMemo(() => {
    if (!config || !savedConfig) return false;
    return JSON.stringify(config) !== JSON.stringify(savedConfig);
  }, [config, savedConfig]);

  // ── derived ─────────────────────────────────────────────────────────────────
  const previewPrimary   = config?.primary_color   || '#6366F1';
  const previewSecondary = config?.secondary_color || '#EC4899';
  const previewFontColor = getFontColor(config);
  const previewLogo      = config?.logo_url?.trim() || '';

  const validationErrors = useMemo(() => ({
    primary_color:   isValidHex(config?.primary_color   ?? '') ? '' : 'Hex inválido',
    secondary_color: isValidHex(config?.secondary_color ?? '') ? '' : 'Hex inválido',
    font_color:      isValidHex(previewFontColor)               ? '' : 'Hex inválido',
  }), [config, previewFontColor]);

  const hasErrors = Object.values(validationErrors).some(Boolean);

  // ── API ─────────────────────────────────────────────────────────────────────
  const loadConfig = useCallback(async () => {
    if (!canView) { setLoading(false); return; }
    try {
      setLoading(true);
      const res = await apiClient.get<TenantConfig>('/api/v1/admin/tenant/config');
      setSavedConfig(res.data);
      setConfig(res.data);
      setLogoPreviewFailed(false);
    } catch {
      showSnackbar('error', 'Erro ao carregar configurações.');
    } finally {
      setLoading(false);
    }
  }, [canView]);

  useEffect(() => { void loadConfig(); }, [loadConfig]);

  const handleChange = <K extends keyof TenantConfig>(field: K, value: TenantConfig[K]) =>
    setConfig((prev) => prev ? { ...prev, [field]: value } : null);

  const handleDiscard = () => {
    setConfig(savedConfig);
    setLogoPreviewFailed(false);
  };

  const handleSave = async () => {
    if (!config || hasErrors || !canEdit) return;
    try {
      setSaving(true);
      const res = await apiClient.put<TenantConfig>('/api/v1/admin/tenant/config', {
        primary_color:              config.primary_color.trim().toUpperCase(),
        secondary_color:            config.secondary_color.trim().toUpperCase(),
        custom_settings: {
          ...(config.custom_settings && typeof config.custom_settings === 'object' ? config.custom_settings : {}),
          font_color: previewFontColor.trim().toUpperCase(),
        },
        enable_analytics:           config.enable_analytics,
        enable_walk_in:             config.enable_walk_in,
        validate_associado_on_emit: config.validate_associado_on_emit,
        enable_estoque_log:         config.enable_estoque_log,
        enable_mensalidade_associado: config.enable_mensalidade_associado,
        enable_waitlist:            config.enable_waitlist,
        sponsor_priority_mode:      config.sponsor_priority_mode || 'first',
        endereco:                   config.endereco || '',
      });
      setSavedConfig(res.data);
      setConfig(res.data);
      dispatchTenantBrandingUpdated();
      showSnackbar('success', 'Configurações salvas. Branding atualizado.');
    } catch (e) {
      showSnackbar('error', extractApiErrorMessage(e, 'Erro ao salvar configurações.'));
    } finally {
      setSaving(false);
    }
  };

  const uploadLogo = async (file: File) => {
    if (!canEdit) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      showSnackbar('error', 'Formato inválido. Use JPG, PNG ou WEBP.');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      showSnackbar('error', 'A imagem deve ter no máximo 2 MB.');
      return;
    }
    setUploadingLogo(true);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await apiClient.post<TenantConfig>('/api/v1/admin/tenant/logo', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setSavedConfig(res.data);
      setConfig(res.data);
      setLogoPreviewFailed(false);
      dispatchTenantBrandingUpdated();
      showSnackbar('success', 'Logo atualizado.');
    } catch (e) {
      showSnackbar('error', extractApiErrorMessage(e, 'Erro ao enviar logo.'));
    } finally {
      setUploadingLogo(false);
    }
  };

  const handleLogoInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) void uploadLogo(file);
    if (e.target) e.target.value = '';
  };

  const handleLogoDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) void uploadLogo(file);
  };

  const handleLogoDelete = async () => {
    if (!canEdit) return;
    setUploadingLogo(true);
    try {
      const res = await apiClient.delete<TenantConfig>('/api/v1/admin/tenant/logo');
      setSavedConfig(res.data);
      setConfig(res.data);
      setLogoPreviewFailed(false);
      dispatchTenantBrandingUpdated();
      showSnackbar('success', 'Logo removido.');
    } catch (e) {
      showSnackbar('error', extractApiErrorMessage(e, 'Erro ao remover logo.'));
    } finally {
      setUploadingLogo(false);
    }
  };

  const showSnackbar = (severity: 'success' | 'error', text: string) =>
    setSnackbar({ open: true, severity, text });

  // ── render ───────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 320 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (!canView) {
    return (
      <Alert severity="warning" sx={{ mt: 2 }}>
        Você não tem permissão para visualizar as configurações. Contate o administrador do sistema.
      </Alert>
    );
  }

  if (!config) {
    return <Alert severity="error">Erro ao carregar configurações do tenant.</Alert>;
  }

  return (
    <Box>
      {/* ── Header ── */}
      <Box data-tour="config-header" sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', mb: 3, gap: 2, flexWrap: 'wrap' }}>
        <Box>
          <Typography variant="h5" fontWeight={700}>Configurações</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>
            Identidade visual, funcionalidades e regras de atendimento do terreiro
          </Typography>
        </Box>

        {/* Save bar — only visible when dirty and user can edit */}
        <Slide direction="left" in={isDirty && canEdit} mountOnEnter unmountOnExit>
          <Paper
            elevation={0}
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 1.5,
              px: 2,
              py: 1,
              borderRadius: 2,
              border: '1px solid',
              borderColor: 'warning.light',
              bgcolor: isDark ? 'rgba(245,158,11,0.08)' : 'rgba(254,243,199,0.8)',
            }}
          >
            <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: 'warning.main', flexShrink: 0 }} />
            <Typography variant="caption" color="text.secondary" sx={{ whiteSpace: 'nowrap' }}>
              Alterações não salvas
            </Typography>
            <Button
              size="small"
              variant="text"
              startIcon={<UndoRoundedIcon />}
              onClick={handleDiscard}
              disabled={saving}
              sx={{ color: 'text.secondary', minWidth: 0 }}
            >
              Descartar
            </Button>
            <Button
              size="small"
              variant="contained"
              startIcon={<SaveRoundedIcon />}
              onClick={handleSave}
              disabled={saving || hasErrors}
              disableElevation
            >
              {saving ? 'Salvando…' : 'Salvar'}
            </Button>
          </Paper>
        </Slide>
      </Box>

      {/* ── Tabs ── */}
      <Box data-tour="config-tabs" sx={{ borderBottom: 1, borderColor: 'divider', mb: 3 }}>
        <Tabs
          value={activeTab}
          onChange={(_, v) => setActiveTab(v)}
          sx={{ '& .MuiTab-root': { minHeight: 44, fontWeight: 600, fontSize: '0.875rem' } }}
        >
          <Tab icon={<PaletteRoundedIcon sx={{ fontSize: 18 }} />} iconPosition="start" label="Identidade visual" />
          <Tab icon={<SettingsSuggestRoundedIcon sx={{ fontSize: 18 }} />} iconPosition="start" label="Funcionalidades" />
          {can('associados') && (
            <Tab icon={<DoorFrontRoundedIcon sx={{ fontSize: 18 }} />} iconPosition="start" label="Atendimento" />
          )}
        </Tabs>
      </Box>

      {/* ══════════════════════════════════════════════════════════════════════
          TAB 0 — Identidade visual
      ══════════════════════════════════════════════════════════════════════ */}
      {activeTab === 0 && (
        <Grid container spacing={3} alignItems="flex-start">
          {/* Left column */}
          <Grid item xs={12} lg={7}>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>

              {/* Logo */}
              <Card data-tour="config-logo" elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 3 }}>
                <Box sx={{ p: 3 }}>
                  <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 0.5 }}>
                    Logo do terreiro
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 2.5 }}>
                    Exibido no painel e nas páginas públicas do terreiro.
                  </Typography>

                  <input
                    ref={logoInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={handleLogoInput}
                    style={{ display: 'none' }}
                  />

                  {previewLogo && !logoPreviewFailed ? (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                      <Box
                        component="img"
                        src={previewLogo}
                        alt="Logo"
                        onError={() => setLogoPreviewFailed(true)}
                        sx={{ width: 80, height: 80, borderRadius: 2, objectFit: 'cover', border: '1px solid', borderColor: 'divider', bgcolor: 'action.hover' }}
                      />
                      <Box>
                        <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1 }}>
                          Logo atual
                        </Typography>
                        <Box sx={{ display: 'flex', gap: 1 }}>
                          <Button size="small" variant="outlined" startIcon={<CloudUploadRoundedIcon />} onClick={() => logoInputRef.current?.click()} disabled={uploadingLogo}>
                            {uploadingLogo ? 'Enviando…' : 'Trocar'}
                          </Button>
                          <Button size="small" variant="outlined" color="error" startIcon={<DeleteRoundedIcon />} onClick={handleLogoDelete} disabled={uploadingLogo}>
                            Remover
                          </Button>
                        </Box>
                      </Box>
                    </Box>
                  ) : (
                    <Box
                      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                      onDragLeave={() => setDragging(false)}
                      onDrop={handleLogoDrop}
                      onClick={() => logoInputRef.current?.click()}
                      sx={{
                        border: '2px dashed',
                        borderColor: dragging ? 'primary.main' : 'divider',
                        borderRadius: 2.5,
                        p: 4,
                        textAlign: 'center',
                        cursor: 'pointer',
                        bgcolor: dragging ? 'action.hover' : 'transparent',
                        transition: 'border-color .15s, background .15s',
                        '&:hover': { borderColor: 'primary.light' },
                      }}
                    >
                      <CloudUploadRoundedIcon sx={{ fontSize: 36, color: 'text.disabled', mb: 1 }} />
                      <Typography variant="body2" color="text.secondary">
                        {uploadingLogo ? 'Enviando…' : 'Clique ou arraste para enviar o logo'}
                      </Typography>
                      <Typography variant="caption" color="text.disabled">
                        JPG, PNG ou WEBP · Máx 2 MB · 200×200 px recomendado
                      </Typography>
                    </Box>
                  )}
                </Box>
              </Card>

              {/* Colors */}
              <Card data-tour="config-cores" elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 3 }}>
                <Box sx={{ p: 3 }}>
                  <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 0.5 }}>
                    Cores da identidade
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 2.5 }}>
                    As alterações refletem no painel e nas emissões públicas após salvar.
                  </Typography>

                  {!can('tema_personalizado') && (
                    <Alert
                      severity="info"
                      icon={<LockOutlinedIcon fontSize="small" />}
                      sx={{ borderRadius: 2, mb: 2.5 }}
                    >
                      Personalização de cores disponível a partir do plano Basic.{' '}
                      <Link href="/admin/plano" style={{ fontWeight: 600 }}>Ver planos</Link>
                    </Alert>
                  )}

                  <SectionLabel>Paleta principal</SectionLabel>
                  <Grid container spacing={2}>
                    <Grid item xs={12} sm={6}>
                      <ColorField
                        label="Cor primária"
                        help="Usada em botões, destaques e ações principais do painel."
                        value={config.primary_color}
                        onChange={(v) => handleChange('primary_color', v)}
                        error={Boolean(validationErrors.primary_color)}
                        helperText={validationErrors.primary_color}
                        disabled={!can('tema_personalizado')}
                      />
                    </Grid>
                    <Grid item xs={12} sm={6}>
                      <ColorField
                        label="Cor secundária"
                        help="Usada em gradientes, contrastes e elementos de apoio."
                        value={config.secondary_color}
                        onChange={(v) => handleChange('secondary_color', v)}
                        error={Boolean(validationErrors.secondary_color)}
                        helperText={validationErrors.secondary_color}
                        disabled={!can('tema_personalizado')}
                      />
                    </Grid>
                    <Grid item xs={12} sm={6}>
                      <ColorField
                        label="Cor da fonte"
                        help="Aplicada no Header e nos itens selecionados do menu lateral."
                        value={previewFontColor}
                        onChange={(v) =>
                          handleChange('custom_settings', {
                            ...(config.custom_settings && typeof config.custom_settings === 'object' ? config.custom_settings : {}),
                            font_color: v,
                          })
                        }
                        error={Boolean(validationErrors.font_color)}
                        helperText={validationErrors.font_color}
                        disabled={!can('tema_personalizado')}
                      />
                    </Grid>
                  </Grid>

                  <Divider sx={{ my: 3 }} />

                  <SectionLabel>Informações do terreiro</SectionLabel>
                  <FieldHint label="Endereço" help="Exibido nos e-mails de confirmação e no botão 'Como chegar' via Google Maps." />
                  <TextField
                    value={config.endereco || ''}
                    onChange={(e) => handleChange('endereco', e.target.value)}
                    placeholder="Rua Exemplo, 123 — Bairro — Cidade/UF"
                    fullWidth
                    multiline
                    rows={2}
                    size="small"
                  />
                </Box>
              </Card>
            </Box>
          </Grid>

          {/* Right column — live preview */}
          <Grid item xs={12} lg={5}>
            <Box sx={{ position: { lg: 'sticky' }, top: { lg: 88 }, display: 'flex', flexDirection: 'column', gap: 2 }}>

              {/* Live preview card */}
              <Box
                data-tour="config-preview"
                sx={{
                  borderRadius: 3,
                  p: 2.5,
                  background: `linear-gradient(135deg, ${previewPrimary} 0%, ${previewSecondary} 100%)`,
                }}
              >
                <Typography variant="overline" sx={{ color: previewFontColor, opacity: 0.75, fontSize: '0.7rem', letterSpacing: '0.1em' }}>
                  Preview ao vivo
                </Typography>

                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mt: 1 }}>
                  {previewLogo && !logoPreviewFailed ? (
                    <Box
                      component="img"
                      src={previewLogo}
                      alt="Logo"
                      onError={() => setLogoPreviewFailed(true)}
                      sx={{ width: 52, height: 52, borderRadius: 2, objectFit: 'cover', border: '1px solid rgba(255,255,255,0.3)', bgcolor: 'rgba(255,255,255,0.15)', flexShrink: 0 }}
                    />
                  ) : (
                    <Box sx={{ width: 52, height: 52, borderRadius: 2, bgcolor: 'rgba(255,255,255,0.2)', border: '1px solid rgba(255,255,255,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <Typography sx={{ color: previewFontColor, fontWeight: 700, fontSize: 22 }}>T</Typography>
                    </Box>
                  )}
                  <Box>
                    <Typography variant="subtitle1" fontWeight={700} sx={{ color: previewFontColor, lineHeight: 1.2 }}>
                      Meu Terreiro
                    </Typography>
                    <Typography variant="caption" sx={{ color: previewFontColor, opacity: 0.8 }}>
                      Identidade visual do painel
                    </Typography>
                  </Box>
                </Box>

                <Box sx={{ display: 'flex', gap: 1, mt: 2 }}>
                  <Button size="small" disableElevation variant="contained"
                    sx={{ bgcolor: 'rgba(255,255,255,0.92)', color: previewPrimary, '&:hover': { bgcolor: 'rgba(255,255,255,0.92)' }, fontWeight: 700 }}>
                    Primária
                  </Button>
                  <Button size="small" disableElevation variant="contained"
                    sx={{ bgcolor: previewSecondary, color: previewFontColor, '&:hover': { bgcolor: previewSecondary }, border: '1px solid rgba(255,255,255,0.3)' }}>
                    Secundária
                  </Button>
                </Box>
              </Box>

              {/* Impact summary */}
              <Paper elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2.5, p: 2 }}>
                <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary', letterSpacing: '0.06em', textTransform: 'uppercase', fontSize: '0.68rem', display: 'block', mb: 1.5 }}>
                  O que muda ao salvar
                </Typography>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                  {BRANDING_IMPACT.map((item) => (
                    <Box key={item} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <CheckCircleOutlineRoundedIcon sx={{ fontSize: 15, color: 'success.main', flexShrink: 0 }} />
                      <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.8rem' }}>{item}</Typography>
                    </Box>
                  ))}
                </Box>
              </Paper>
            </Box>
          </Grid>
        </Grid>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          TAB 1 — Funcionalidades
      ══════════════════════════════════════════════════════════════════════ */}
      {activeTab === 1 && (
        <Box data-tour="config-funcionalidades">
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
            Cada chave controla um módulo do tenant. Itens bloqueados estão disponíveis em planos superiores.
          </Typography>
          <Grid container spacing={2}>
            {FEATURE_ITEMS.map((item) => {
              const locked = Boolean(item.gate && !can(item.gate));
              const value = Boolean(config[item.field]);
              return (
                <Grid item xs={12} md={6} key={item.field}>
                  <ToggleCard
                    title={item.title}
                    description={item.description}
                    plan={item.plan}
                    checked={value}
                    locked={locked}
                    onChange={(v) => handleChange(item.field, v as TenantConfig[typeof item.field])}
                  />
                </Grid>
              );
            })}
          </Grid>
        </Box>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          TAB 2 — Atendimento (só aparece se can('associados'))
      ══════════════════════════════════════════════════════════════════════ */}
      {activeTab === 2 && can('associados') && (
        <Box data-tour="config-atendimento" sx={{ maxWidth: 640 }}>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
            Escolha a política de posicionamento dos associados na fila. Afeta exclusivamente a visão da porta.
          </Typography>

          <Card elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 3 }}>
            <Box sx={{ p: 3 }}>
              <FieldHint label="Prioridade dos associados" help="Define como associados são posicionados na fila de atendimento da porta." />
              <RadioGroup
                value={config.sponsor_priority_mode || 'first'}
                onChange={(e) => handleChange('sponsor_priority_mode', e.target.value)}
              >
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, mt: 1 }}>
                  {PRIORITY_OPTIONS.map((opt) => {
                    const selected = (config.sponsor_priority_mode || 'first') === opt.value;
                    return (
                      <Paper
                        key={opt.value}
                        variant="outlined"
                        sx={{
                          p: 2,
                          borderRadius: 2,
                          borderColor: selected ? 'primary.main' : 'divider',
                          bgcolor: selected ? 'action.hover' : 'background.paper',
                          cursor: 'pointer',
                          transition: 'border-color .15s, background .15s',
                        }}
                        onClick={() => handleChange('sponsor_priority_mode', opt.value)}
                      >
                        <FormControlLabel
                          value={opt.value}
                          control={<Radio size="small" />}
                          sx={{ alignItems: 'flex-start', m: 0, width: '100%' }}
                          label={
                            <Box sx={{ ml: 0.5 }}>
                              <Typography variant="subtitle2" fontWeight={600}>{opt.title}</Typography>
                              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25, fontSize: '0.8rem' }}>
                                {opt.description}
                              </Typography>
                            </Box>
                          }
                        />
                      </Paper>
                    );
                  })}
                </Box>
              </RadioGroup>
            </Box>
          </Card>
        </Box>
      )}

      {/* ── Snackbar ── */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={4000}
        onClose={() => setSnackbar((s) => ({ ...s, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          severity={snackbar.severity}
          onClose={() => setSnackbar((s) => ({ ...s, open: false }))}
          sx={{ width: '100%', borderRadius: 2 }}
        >
          {snackbar.text}
        </Alert>
      </Snackbar>
    </Box>
  );
}
