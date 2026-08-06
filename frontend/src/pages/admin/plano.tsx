'use client';

import React, { useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Divider,
  Grid,
  LinearProgress,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import CheckRoundedIcon from '@mui/icons-material/CheckRounded';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import EmailRoundedIcon from '@mui/icons-material/EmailRounded';
import WorkspacePremiumRoundedIcon from '@mui/icons-material/WorkspacePremiumRounded';
import WhatsAppIcon from '@mui/icons-material/WhatsApp';

import { useRouter } from 'next/router';

import AdminLayout from './admin_layout';
import { apiClient } from '../../services/api_client';
import { useAdminTheme } from '@/providers/AdminThemeProvider';
import { useTenant } from '@/providers/ThemeProvider';

// ─── Types ────────────────────────────────────────────────────────────────────

interface SubscriptionInfo {
  plan: string;
  status: string;
  max_users: number;
  max_giras_per_month: number;
  max_mediuns: number;
  current_users: number;
  current_giras_this_month: number;
  current_mediuns: number;
  monthly_price: number;
  is_trial: boolean;
  trial_ends_at: string | null;
  auto_renew: boolean;
}

// ─── Static data ──────────────────────────────────────────────────────────────

const PLAN_DISPLAY: Record<string, { label: string; color: string }> = {
  free:    { label: 'Free',    color: '#94a3b8' },
  basic:   { label: 'Basic',   color: '#3b82f6' },
  pro:     { label: 'Pro',     color: '#8b5cf6' },
  premium: { label: 'Premium', color: '#f59e0b' },
};

const PLAN_PRICES: Record<string, string> = {
  free:    'Grátis',
  basic:   'R$ 49/mês',
  pro:     'R$ 79/mês',
  premium: 'R$ 99/mês',
};

const PLAN_KEYS = ['free', 'basic', 'pro', 'premium'] as const;

type PlanKey = typeof PLAN_KEYS[number];

interface FeatureGroup {
  group: string;
  rows: { label: string; free: boolean | string; basic: boolean | string; pro: boolean | string; premium: boolean | string }[];
}

const FEATURE_GROUPS: FeatureGroup[] = [
  {
    group: 'Base',
    rows: [
      { label: 'Emissão de senhas online',     free: true,        basic: true,        pro: true,        premium: true },
      { label: 'Porta (fila em tempo real)',    free: true,        basic: true,        pro: true,        premium: true },
      { label: 'Link público personalizável',   free: true,        basic: true,        pro: true,        premium: true },
      { label: 'Relatório de gira',             free: false,       basic: true,        pro: true,        premium: true },
    ],
  },
  {
    group: 'Capacidade',
    rows: [
      { label: 'Usuários administradores',      free: '1',         basic: '3',         pro: '10',        premium: 'Ilimitado' },
      { label: 'Giras por mês',                 free: '4',         basic: '10',        pro: '15',        premium: 'Ilimitado' },
      { label: 'Médiuns cadastrados',           free: '—',         basic: '50',        pro: '150',       premium: 'Ilimitado' },
    ],
  },
  {
    group: 'Comunicação',
    rows: [
      { label: 'Envio de e-mail transacional',  free: false,       basic: false,       pro: true,        premium: true },
      { label: 'Tema personalizado',            free: false,       basic: false,       pro: true,        premium: true },
      { label: 'Site do terreiro',              free: false,       basic: false,       pro: true,        premium: true },
    ],
  },
  {
    group: 'Relatórios e análise',
    rows: [
      { label: 'Analytics básico',              free: false,       basic: false,       pro: true,        premium: true },
      { label: 'Analytics avançado',            free: false,       basic: false,       pro: true,        premium: true },
      { label: 'Export CSV',                    free: false,       basic: false,       pro: true,        premium: true },
      { label: 'Auditoria completa',            free: false,       basic: false,       pro: true,        premium: true },
    ],
  },
  {
    group: 'Módulos',
    rows: [
      { label: 'Gestão de médiuns',             free: false,       basic: true,        pro: true,        premium: true },
      { label: 'Mensalidade de médiuns',        free: false,       basic: false,       pro: true,        premium: true },
      { label: 'Gestão de associados',          free: false,       basic: false,       pro: true,        premium: true },
      { label: 'Mensalidade de associados',     free: false,       basic: false,       pro: true,        premium: true },
      { label: 'Controle de estoque',           free: false,       basic: false,       pro: true,        premium: true },
      { label: 'Contas a pagar / receber',      free: false,       basic: false,       pro: true,        premium: true },
      { label: 'Fluxo de caixa',                free: false,       basic: false,       pro: true,        premium: true },
      { label: 'Agendamento por horário',       free: false,       basic: false,       pro: true,        premium: true },
    ],
  },
  {
    group: 'Enterprise',
    rows: [
      { label: 'Operações em lote',             free: false,       basic: true,        pro: true,        premium: true },
      { label: 'API access',                    free: false,       basic: false,       pro: false,       premium: true },
      { label: 'Suporte prioritário',           free: false,       basic: false,       pro: false,       premium: true },
    ],
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isUnlimited(n: number): boolean {
  return n < 0 || n >= 99999;
}

function usageColor(pct: number): string {
  if (pct >= 90) return '#ef4444';
  if (pct >= 70) return '#f59e0b';
  return '#22c55e';
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function UsageRow({ label, current, max }: { label: string; current: number; max: number }) {
  const unlimited = isUnlimited(max);
  const pct = unlimited ? 0 : Math.min((current / max) * 100, 100);
  const color = usageColor(pct);

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', mb: 0.75 }}>
        <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.82rem' }}>
          {label}
        </Typography>
        <Typography variant="caption" fontWeight={700} sx={{ fontFamily: 'monospace', color: unlimited ? 'text.secondary' : pct >= 90 ? 'error.main' : 'text.primary' }}>
          {unlimited ? `${current} / ∞` : `${current} / ${max}`}
        </Typography>
      </Box>
      {!unlimited && (
        <LinearProgress
          variant="determinate"
          value={pct}
          sx={{
            height: 6,
            borderRadius: 3,
            bgcolor: `${color}20`,
            '& .MuiLinearProgress-bar': { borderRadius: 3, bgcolor: color },
          }}
        />
      )}
    </Box>
  );
}

function FeatureCell({ value, isCurrent }: { value: boolean | string; isCurrent: boolean }) {
  if (typeof value === 'string') {
    return (
      <Typography
        variant="body2"
        fontWeight={isCurrent ? 700 : 400}
        sx={{ fontSize: '0.82rem', color: isCurrent ? 'primary.main' : 'text.primary' }}
      >
        {value}
      </Typography>
    );
  }
  return value
    ? <CheckRoundedIcon sx={{ fontSize: 17, color: isCurrent ? 'primary.main' : '#22c55e' }} />
    : <CloseRoundedIcon sx={{ fontSize: 17, color: 'divider' }} />;
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function AdminPlano() {
  const [subscription, setSubscription] = useState<SubscriptionInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { tenantName } = useTenant();
  const { isDark } = useAdminTheme();
  const router = useRouter();

  const diasRestantesTrial = subscription?.is_trial && subscription.trial_ends_at
    ? Math.max(0, Math.ceil((new Date(subscription.trial_ends_at).getTime() - Date.now()) / (24 * 60 * 60 * 1000)))
    : null;

  useEffect(() => {
    apiClient
      .get('/api/v1/admin/subscription')
      .then((res) => setSubscription(res.data))
      .catch(() => setError('Erro ao carregar informações do plano.'))
      .finally(() => setLoading(false));
  }, []);

  const currentPlan = (subscription?.plan || 'free') as PlanKey;
  const planInfo = PLAN_DISPLAY[currentPlan] ?? PLAN_DISPLAY.free;

  const whatsappMsg = encodeURIComponent(
    `Olá! Sou administrador do terreiro "${tenantName || ''}" no Girahub e gostaria de informações sobre alteração de plano. Meu plano atual é ${planInfo.label}.`
  );

  return (
    <AdminLayout title="Meu Plano">
      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 320 }}>
          <CircularProgress />
        </Box>
      ) : error ? (
        <Alert severity="error" sx={{ borderRadius: 2 }}>{error}</Alert>
      ) : (
        <Box>
          {/* ── Header ── */}
          <Box data-tour="plano-header" sx={{ mb: 3 }}>
            <Typography variant="h5" fontWeight={700}>Meu plano</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>
              Limites de uso e comparativo de planos
            </Typography>
          </Box>

          {/* ── Status + usage card ── */}
          <Paper
            data-tour="plano-status"
            elevation={0}
            sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 3, p: 3, mb: 4 }}
          >
            {/* Plan identity */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3 }}>
              <Box
                sx={{
                  width: 48,
                  height: 48,
                  borderRadius: 2,
                  bgcolor: isDark ? `${planInfo.color}20` : `${planInfo.color}15`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                <WorkspacePremiumRoundedIcon sx={{ color: planInfo.color, fontSize: 24 }} />
              </Box>
              <Box>
                <Typography variant="subtitle1" fontWeight={700}>
                  Plano {planInfo.label}
                </Typography>
                <Box sx={{ display: 'flex', gap: 1, mt: 0.5, flexWrap: 'wrap' }}>
                  <Chip
                    label={subscription?.status === 'active' ? 'Ativo' : subscription?.status}
                    size="small"
                    sx={{
                      height: 20, fontSize: '0.7rem', fontWeight: 700,
                      bgcolor: subscription?.status === 'active' ? '#dcfce7' : '#fef3c7',
                      color: subscription?.status === 'active' ? '#16a34a' : '#d97706',
                    }}
                  />
                  {subscription?.is_trial && (
                    <Chip label="Trial" size="small" sx={{ height: 20, fontSize: '0.7rem', fontWeight: 700, bgcolor: '#fef3c7', color: '#d97706' }} />
                  )}
                  <Typography variant="caption" color="text.secondary" sx={{ alignSelf: 'center' }}>
                    {PLAN_PRICES[currentPlan] || 'Personalizado'}
                  </Typography>
                </Box>
              </Box>
            </Box>

            {diasRestantesTrial !== null && (
              <Alert
                severity="info"
                sx={{ mb: 3, borderRadius: 2 }}
                action={
                  <Button color="inherit" size="small" onClick={() => router.push('/admin/billing')} sx={{ fontWeight: 700 }}>
                    Adicionar cartão
                  </Button>
                }
              >
                Faltam <strong>{diasRestantesTrial === 1 ? '1 dia' : `${diasRestantesTrial} dias`}</strong> do
                seu mês grátis no Premium. Depois disso, se nenhum plano for assinado, sua conta volta
                automaticamente para o plano gratuito.
              </Alert>
            )}

            <Divider sx={{ mb: 3 }} />

            {/* Usage bars */}
            <Typography variant="overline" sx={{ fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.08em', color: 'text.secondary', display: 'block', mb: 2 }}>
              Uso atual
            </Typography>
            <Grid container spacing={3}>
              <Grid item xs={12} sm={4}>
                <UsageRow
                  label="Usuários administradores"
                  current={subscription?.current_users ?? 0}
                  max={subscription?.max_users ?? 1}
                />
              </Grid>
              <Grid item xs={12} sm={4}>
                <UsageRow
                  label="Giras este mês"
                  current={subscription?.current_giras_this_month ?? 0}
                  max={subscription?.max_giras_per_month ?? 2}
                />
              </Grid>
              <Grid item xs={12} sm={4}>
                <UsageRow
                  label="Médiuns cadastrados"
                  current={subscription?.current_mediuns ?? 0}
                  max={subscription?.max_mediuns ?? 0}
                />
              </Grid>
            </Grid>
          </Paper>

          {/* ── Feature comparison table ── */}
          <Box data-tour="plano-comparativo" sx={{ mb: 4 }}>
            <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 2 }}>
              Comparativo de planos
            </Typography>

            <TableContainer
              component={Paper}
              elevation={0}
              sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 3, overflowX: 'auto' }}
            >
              <Table size="small" stickyHeader>
                <TableHead>
                  <TableRow>
                    <TableCell
                      sx={{
                        fontWeight: 700,
                        minWidth: 180,
                        bgcolor: isDark ? 'background.paper' : '#fafafa',
                        borderBottom: '2px solid',
                        borderColor: 'divider',
                        fontSize: '0.75rem',
                      }}
                    >
                      Funcionalidade
                    </TableCell>
                    {PLAN_KEYS.map((key) => {
                      const isCurrent = key === currentPlan;
                      const pd = PLAN_DISPLAY[key];
                      return (
                        <TableCell
                          key={key}
                          align="center"
                          sx={{
                            fontWeight: 700,
                            minWidth: 100,
                            borderBottom: '2px solid',
                            borderColor: isCurrent ? pd.color : 'divider',
                            bgcolor: isDark ? 'background.paper' : '#fafafa',
                            borderTop: isCurrent ? `3px solid ${pd.color}` : '3px solid transparent',
                          }}
                        >
                          <Typography variant="caption" fontWeight={800} sx={{ color: pd.color, display: 'block', fontSize: '0.8rem' }}>
                            {pd.label}
                          </Typography>
                          <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.7rem' }}>
                            {PLAN_PRICES[key]}
                          </Typography>
                          {isCurrent && (
                            <Box sx={{ mt: 0.5 }}>
                              <Chip label="Atual" size="small" sx={{ height: 16, fontSize: '0.6rem', fontWeight: 700, bgcolor: `${pd.color}18`, color: pd.color }} />
                            </Box>
                          )}
                        </TableCell>
                      );
                    })}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {FEATURE_GROUPS.map((group, gi) => (
                    <React.Fragment key={group.group}>
                      {/* Group header row */}
                      <TableRow>
                        <TableCell
                          colSpan={5}
                          sx={{
                            py: 1,
                            px: 2,
                            bgcolor: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.025)',
                            borderTop: gi > 0 ? '1px solid' : 'none',
                            borderColor: 'divider',
                          }}
                        >
                          <Typography variant="overline" sx={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.08em', color: 'text.secondary' }}>
                            {group.group}
                          </Typography>
                        </TableCell>
                      </TableRow>
                      {/* Feature rows */}
                      {group.rows.map((feat) => (
                        <TableRow key={feat.label} hover>
                          <TableCell sx={{ fontSize: '0.82rem', color: 'text.secondary', pl: 2.5 }}>
                            {feat.label}
                          </TableCell>
                          {PLAN_KEYS.map((key) => {
                            const isCurrent = key === currentPlan;
                            return (
                              <TableCell
                                key={key}
                                align="center"
                                sx={{
                                  bgcolor: isCurrent
                                    ? isDark ? `${PLAN_DISPLAY[key].color}08` : `${PLAN_DISPLAY[key].color}06`
                                    : 'transparent',
                                }}
                              >
                                <FeatureCell value={feat[key]} isCurrent={isCurrent} />
                              </TableCell>
                            );
                          })}
                        </TableRow>
                      ))}
                    </React.Fragment>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </Box>

          {/* ── Contact section ── */}
          <Paper
            data-tour="plano-contato"
            elevation={0}
            sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 3, p: 3 }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
              <Box sx={{ flex: 1 }}>
                <Typography variant="subtitle2" fontWeight={700}>Deseja mudar de plano?</Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>
                  Entre em contato pelo WhatsApp ou e-mail — faremos a alteração de forma rápida e segura.
                </Typography>
              </Box>
              <Box sx={{ display: 'flex', gap: 1.5, flexShrink: 0, flexWrap: 'wrap' }}>
                <Button
                  variant="contained"
                  size="small"
                  startIcon={<WhatsAppIcon sx={{ fontSize: 17 }} />}
                  disableElevation
                  href={`https://wa.me/5516991091234?text=${whatsappMsg}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  sx={{ bgcolor: '#22c55e', fontWeight: 700, '&:hover': { bgcolor: '#16a34a' } }}
                >
                  WhatsApp
                </Button>
                <Button
                  variant="outlined"
                  size="small"
                  startIcon={<EmailRoundedIcon sx={{ fontSize: 17 }} />}
                  href={`mailto:leonfpontes@gmail.com?subject=${encodeURIComponent(`Alteração de Plano - ${tenantName || 'Meu Terreiro'}`)}&body=${encodeURIComponent(`Olá!\n\nSou administrador do terreiro "${tenantName || ''}" no Girahub.\nMeu plano atual é: ${planInfo.label}\n\nGostaria de solicitar alteração de plano.\n\nAguardo retorno!`)}`}
                  sx={{ fontWeight: 600 }}
                >
                  E-mail
                </Button>
              </Box>
            </Box>
          </Paper>
        </Box>
      )}
    </AdminLayout>
  );
}
