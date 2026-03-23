/**
 * Admin Plano Page — Current plan info + comparison table + upgrade request
 */
'use client';

import React, { useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Container,
  Divider,
  Grid,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Typography,
} from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CancelIcon from '@mui/icons-material/Cancel';
import WhatsAppIcon from '@mui/icons-material/WhatsApp';
import EmailIcon from '@mui/icons-material/Email';
import CardMembershipIcon from '@mui/icons-material/CardMembership';
import AdminLayout from './admin_layout';
import { apiClient } from '../../services/api_client';
import { useTenant } from '@/providers/ThemeProvider';

interface SubscriptionInfo {
  plan: string;
  status: string;
  max_users: number;
  max_giras_per_month: number;
  current_users: number;
  monthly_price: number;
  is_trial: boolean;
  trial_ends_at: string | null;
  auto_renew: boolean;
}

const PLAN_DISPLAY: Record<string, { label: string; color: string }> = {
  free: { label: 'Free', color: '#94a3b8' },
  basic: { label: 'Basic', color: '#3b82f6' },
  pro: { label: 'Pro', color: '#8b5cf6' },
  premium: { label: 'Premium', color: '#f59e0b' },
};

interface PlanFeature {
  label: string;
  free: boolean | string;
  basic: boolean | string;
  pro: boolean | string;
  premium: boolean | string;
}

const FEATURES: PlanFeature[] = [
  { label: 'Emissão de senhas online', free: true, basic: true, pro: true, premium: true },
  { label: 'Porta (fila em tempo real)', free: true, basic: true, pro: true, premium: true },
  { label: 'Link público personalizável', free: true, basic: true, pro: true, premium: true },
  { label: 'Usuários', free: '1', basic: '5', pro: '20', premium: 'Ilimitado' },
  { label: 'Giras por mês', free: '2', basic: '10', pro: '50', premium: 'Ilimitado' },
  { label: 'Envio de senhas por e-mail', free: false, basic: false, pro: true, premium: true },
  { label: 'Tema personalizado', free: false, basic: false, pro: true, premium: true },
  { label: 'Relatório Analítico básico', free: false, basic: false, pro: true, premium: true },
  { label: 'Gestão de Associados', free: false, basic: false, pro: true, premium: true },
  { label: 'Relatório Analítico avançado', free: false, basic: false, pro: true, premium: true },
  { label: 'Export CSV', free: false, basic: false, pro: true, premium: true },
  { label: 'Operações em lote', free: false, basic: false, pro: true, premium: true },
  { label: 'Auditoria completa', free: false, basic: false, pro: true, premium: true },
  { label: 'Controle de Estoque', free: false, basic: false, pro: true, premium: true },
  { label: 'Webhooks', free: false, basic: false, pro: false, premium: true },
  { label: 'API access', free: false, basic: false, pro: false, premium: true },
  { label: 'Suporte prioritário', free: false, basic: false, pro: false, premium: true },
];

const PLAN_KEYS = ['free', 'basic', 'pro', 'premium'] as const;
const PLAN_PRICES: Record<string, string> = {
  free: 'Grátis',
  basic: 'R$49/mês',
  pro: 'R$79/mês',
  premium: 'R$99/mês',
};

function FeatureCell({ value, isCurrentPlan }: { value: boolean | string; isCurrentPlan: boolean }) {
  if (typeof value === 'string') {
    return (
      <Typography
        sx={{
          fontWeight: isCurrentPlan ? 700 : 400,
          color: isCurrentPlan ? 'primary.main' : 'text.primary',
          fontSize: '0.85rem',
        }}
      >
        {value}
      </Typography>
    );
  }
  return value ? (
    <CheckCircleIcon sx={{ color: isCurrentPlan ? 'primary.main' : '#22c55e', fontSize: 20 }} />
  ) : (
    <CancelIcon sx={{ color: '#e2e8f0', fontSize: 20 }} />
  );
}

export default function AdminPlano() {
  const [subscription, setSubscription] = useState<SubscriptionInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { tenantName } = useTenant();

  useEffect(() => {
    const fetchSubscription = async () => {
      try {
        const res = await apiClient.get('/api/v1/admin/subscription');
        setSubscription(res.data);
      } catch {
        setError('Erro ao carregar informações do plano');
      } finally {
        setLoading(false);
      }
    };
    fetchSubscription();
  }, []);

  const currentPlan = subscription?.plan || 'free';
  const planInfo = PLAN_DISPLAY[currentPlan] || PLAN_DISPLAY.free;

  const whatsappMessage = encodeURIComponent(
    `Olá! Sou administrador do terreiro "${tenantName || ''}" no Girahub e gostaria de informações sobre alteração de plano. Meu plano atual é ${planInfo.label}.`
  );

  return (
    <AdminLayout title="Meu Plano">
      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
          <CircularProgress />
        </Box>
      ) : error ? (
        <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>
      ) : (
        <>
          {/* ── Current Plan Card ── */}
          <Card elevation={0} sx={{ mb: 4, border: '1px solid', borderColor: 'divider', borderRadius: 2 }}>
            <CardContent sx={{ p: 3 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
                <CardMembershipIcon sx={{ color: planInfo.color, fontSize: 32 }} />
                <Box>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Typography variant="h5" fontWeight={800}>
                      Plano {planInfo.label}
                    </Typography>
                    <Chip
                      label={subscription?.status === 'active' ? 'Ativo' : subscription?.status}
                      color={subscription?.status === 'active' ? 'success' : 'default'}
                      size="small"
                    />
                    {subscription?.is_trial && (
                      <Chip label="Trial" color="warning" size="small" />
                    )}
                  </Box>
                  <Typography color="text.secondary" sx={{ mt: 0.5 }}>
                    {PLAN_PRICES[currentPlan] || 'Personalizado'}
                  </Typography>
                </Box>
              </Box>
              <Divider sx={{ my: 2 }} />
              <Grid container spacing={3}>
                <Grid item xs={6} sm={3}>
                  <Typography variant="caption" color="text.secondary">Usuários</Typography>
                  <Typography fontWeight={600}>
                    {subscription?.current_users || 0} / {(subscription?.max_users || 0) >= 99999 ? '∞' : subscription?.max_users}
                  </Typography>
                </Grid>
                <Grid item xs={6} sm={3}>
                  <Typography variant="caption" color="text.secondary">Giras / mês</Typography>
                  <Typography fontWeight={600}>
                    {(subscription?.max_giras_per_month || 0) >= 999999 ? 'Ilimitado' : subscription?.max_giras_per_month}
                  </Typography>
                </Grid>
                <Grid item xs={6} sm={3}>
                  <Typography variant="caption" color="text.secondary">Preço mensal</Typography>
                  <Typography fontWeight={600}>
                    {subscription?.monthly_price === 0 ? 'Grátis' : `R$${subscription?.monthly_price}`}
                  </Typography>
                </Grid>
                <Grid item xs={6} sm={3}>
                  <Typography variant="caption" color="text.secondary">Renovação automática</Typography>
                  <Typography fontWeight={600}>
                    {subscription?.auto_renew ? 'Sim' : 'Não'}
                  </Typography>
                </Grid>
              </Grid>
            </CardContent>
          </Card>

          {/* ── Feature Comparison Table ── */}
          <Typography variant="h6" fontWeight={700} sx={{ mb: 2 }}>
            Comparação de Planos
          </Typography>
          <TableContainer component={Paper} variant="outlined" sx={{ mb: 4, borderRadius: 2, overflowX: 'auto' }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontWeight: 700, minWidth: 160 }}>Funcionalidade</TableCell>
                  {PLAN_KEYS.map((key) => (
                    <TableCell
                      key={key}
                      align="center"
                      sx={{
                        fontWeight: 700,
                        bgcolor: key === currentPlan ? 'primary.main' : 'transparent',
                        color: key === currentPlan ? '#fff' : 'text.primary',
                        transition: 'all 0.2s',
                      }}
                    >
                      {PLAN_DISPLAY[key].label}
                      <Typography
                        variant="caption"
                        display="block"
                        sx={{ color: key === currentPlan ? 'rgba(255,255,255,0.8)' : 'text.secondary' }}
                      >
                        {PLAN_PRICES[key]}
                      </Typography>
                    </TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {FEATURES.map((feat) => (
                  <TableRow key={feat.label} hover>
                    <TableCell sx={{ fontSize: '0.85rem' }}>{feat.label}</TableCell>
                    {PLAN_KEYS.map((key) => (
                      <TableCell
                        key={key}
                        align="center"
                        sx={{
                          bgcolor: key === currentPlan ? 'rgba(79,70,229,0.04)' : 'transparent',
                        }}
                      >
                        <FeatureCell value={feat[key]} isCurrentPlan={key === currentPlan} />
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>

          {/* ── Contact / Upgrade Request ── */}
          <Card elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2 }}>
            <CardContent sx={{ p: 3, textAlign: 'center' }}>
              <Typography variant="h6" fontWeight={700} sx={{ mb: 1 }}>
                Deseja mudar de plano?
              </Typography>
              <Typography color="text.secondary" sx={{ mb: 3, maxWidth: 480, mx: 'auto' }}>
                Entre em contato conosco por WhatsApp ou e-mail e faremos a alteração do seu plano de forma rápida e segura.
              </Typography>
              <Box sx={{ display: 'flex', justifyContent: 'center', gap: 2, flexWrap: 'wrap' }}>
                <Button
                  variant="contained"
                  startIcon={<WhatsAppIcon />}
                  href={`https://wa.me/5516991091234?text=${whatsappMessage}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  sx={{
                    bgcolor: '#25D366',
                    textTransform: 'none',
                    fontWeight: 600,
                    px: 3,
                    '&:hover': { bgcolor: '#1da851' },
                  }}
                >
                  WhatsApp
                </Button>
                <Button
                  variant="outlined"
                  startIcon={<EmailIcon />}
                  href={`mailto:leonfpontes@gmail.com?subject=${encodeURIComponent(`Alteração de Plano - ${tenantName || 'Meu Terreiro'}`)}&body=${encodeURIComponent(`Olá!\n\nSou administrador do terreiro "${tenantName || ''}" no Girahub.\nMeu plano atual é: ${planInfo.label}\n\nGostaria de solicitar alteração de plano.\n\nAguardo retorno!`)}`}
                  sx={{
                    textTransform: 'none',
                    fontWeight: 600,
                    px: 3,
                  }}
                >
                  E-mail
                </Button>
              </Box>
            </CardContent>
          </Card>
        </>
      )}
    </AdminLayout>
  );
}
