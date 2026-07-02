'use client';

import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  Grid,
  Paper,
  Typography,
} from '@mui/material';
import AutorenewRoundedIcon from '@mui/icons-material/AutorenewRounded';
import CancelRoundedIcon from '@mui/icons-material/CancelRounded';
import CheckRoundedIcon from '@mui/icons-material/CheckRounded';
import CreditCardRoundedIcon from '@mui/icons-material/CreditCardRounded';
import StarRoundedIcon from '@mui/icons-material/StarRounded';
import WhatsAppIcon from '@mui/icons-material/WhatsApp';

import AdminLayout from './admin_layout';
import { apiClient } from '../../services/api_client';
import { useSubscription } from '../../hooks/useSubscription';
import { useAdminTheme } from '@/providers/AdminThemeProvider';
import { useRouter } from 'next/router';

// ─── Types ────────────────────────────────────────────────────────────────────

interface BillingInfo {
  plan: string;
  status: string;
  is_bonus: boolean;
  stripe_subscription_id: string | null;
  stripe_customer_id: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  monthly_price: number;
  currency: string;
}

interface PlanMeta {
  key: string;
  label: string;
  monthlyPrice: number;
  priceLabel: string;
  color: string;
  popular: boolean;
  features: string[];
}

// ─── Static data ──────────────────────────────────────────────────────────────

const PLANS: PlanMeta[] = [
  {
    key: 'basic',
    label: 'Basic',
    monthlyPrice: 49,
    priceLabel: 'R$ 49',
    color: '#3b82f6',
    popular: false,
    features: [
      '5 usuários administradores',
      '10 giras por mês',
      '15 médiuns cadastrados',
      'Relatório de gira',
      'Personalização de tema',
      'Módulo de associados',
    ],
  },
  {
    key: 'pro',
    label: 'Pro',
    monthlyPrice: 79,
    priceLabel: 'R$ 79',
    color: '#8b5cf6',
    popular: true,
    features: [
      '20 usuários administradores',
      '50 giras por mês',
      '30 médiuns cadastrados',
      'Envio de e-mail transacional',
      'Analytics avançado',
      'Export CSV',
      'Controle de estoque',
      'Mensalidade de médiuns',
    ],
  },
  {
    key: 'premium',
    label: 'Premium',
    monthlyPrice: 99,
    priceLabel: 'R$ 99',
    color: '#f59e0b',
    popular: false,
    features: [
      'Usuários ilimitados',
      'Giras ilimitadas',
      'Médiuns ilimitados',
      'Tudo do Pro',
      'Acesso à API',
      'Suporte prioritário',
    ],
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
}

function planLabel(key: string): string {
  return PLANS.find((p) => p.key === key)?.label ?? (key.charAt(0).toUpperCase() + key.slice(1));
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function AdminBilling() {
  const router = useRouter();
  const { refresh: refreshSubscription } = useSubscription();
  const { isDark } = useAdminTheme();

  const [billing, setBilling] = useState<BillingInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [cancelDialog, setCancelDialog] = useState(false);
  const [reactivateDialog, setReactivateDialog] = useState(false);
  const [changePlanTarget, setChangePlanTarget] = useState<string | null>(null);

  const fetchBilling = useCallback(async () => {
    try {
      const res = await apiClient.get('/api/v1/admin/billing');
      setBilling(res.data);
    } catch {
      setError('Erro ao carregar informações de cobrança.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchBilling(); }, [fetchBilling]);

  // Handle Stripe return
  useEffect(() => {
    const { status } = router.query;
    if (status === 'success') {
      setSuccess('Assinatura realizada com sucesso! Seu plano será atualizado em instantes.');
      // O webhook do Stripe chega em paralelo ao redirect do navegador, não
      // antes — um único refetch em 3s pode acontecer antes do webhook ser
      // processado, mostrando o plano antigo por engano. Tenta algumas vezes
      // com backoff em vez de confiar em um timing fixo.
      const delays = [2000, 4000, 8000];
      delays.forEach((delay) => {
        setTimeout(() => { fetchBilling(); refreshSubscription(); }, delay);
      });
    } else if (status === 'cancelled') {
      setError('Checkout cancelado. Nenhuma cobrança foi realizada.');
    } else if (status === 'checkout_error') {
      setError('Não foi possível iniciar o checkout automaticamente. Escolha seu plano abaixo para tentar novamente.');
    }
    if (status) router.replace('/admin/billing', undefined, { shallow: true });
  }, [router.query.status]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleCheckout = async (plan: string) => {
    setActionLoading(plan);
    setError(null);
    try {
      const res = await apiClient.post('/api/v1/admin/billing/checkout', { plan });
      window.location.href = res.data.checkout_url;
    } catch (err: any) {
      setError(err?.response?.data?.detail || 'Erro ao iniciar checkout.');
      setActionLoading(null);
    }
  };

  const handleChangePlan = async (plan: string) => {
    setActionLoading(plan);
    setError(null);
    try {
      await apiClient.post('/api/v1/admin/billing/change-plan', { plan });
      setSuccess(`Plano alterado para ${planLabel(plan)} com sucesso!`);
      await fetchBilling();
      refreshSubscription();
    } catch (err: any) {
      setError(err?.response?.data?.detail || 'Erro ao alterar plano.');
    } finally {
      setActionLoading(null);
    }
  };

  const handleCancel = async () => {
    setCancelDialog(false);
    setActionLoading('cancel');
    setError(null);
    try {
      await apiClient.post('/api/v1/admin/billing/cancel');
      setSuccess('Assinatura será cancelada ao final do período atual. Você continuará com acesso até lá.');
      await fetchBilling();
      refreshSubscription();
    } catch (err: any) {
      setError(err?.response?.data?.detail || 'Erro ao cancelar assinatura.');
    } finally {
      setActionLoading(null);
    }
  };

  const handleReactivate = async () => {
    setReactivateDialog(false);
    setActionLoading('reactivate');
    setError(null);
    try {
      await apiClient.post('/api/v1/admin/billing/reactivate');
      setSuccess('Assinatura reativada com sucesso! As cobranças continuarão normalmente.');
      await fetchBilling();
      refreshSubscription();
    } catch (err: any) {
      setError(err?.response?.data?.detail || 'Erro ao reativar assinatura.');
    } finally {
      setActionLoading(null);
    }
  };

  const isFreePlan = !billing?.stripe_subscription_id;
  const currentPlan = billing?.plan || 'free';

  return (
    <AdminLayout title="Assinatura">
      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 320 }}>
          <CircularProgress />
        </Box>
      ) : (
        <Box>
          {/* ── Page header ── */}
          <Box data-tour="billing-header" sx={{ mb: 3 }}>
            <Typography variant="h5" fontWeight={700}>Assinatura</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>
              Gerencie seu plano e informações de cobrança
            </Typography>
          </Box>

          {/* ── Alerts ── */}
          {success && (
            <Alert severity="success" onClose={() => setSuccess(null)} sx={{ mb: 3, borderRadius: 2 }}>
              {success}
            </Alert>
          )}
          {error && (
            <Alert severity="error" onClose={() => setError(null)} sx={{ mb: 3, borderRadius: 2 }}>
              {error}
            </Alert>
          )}

          {/* ── Bonus banner ── */}
          {billing?.is_bonus && (
            <Alert
              severity="info"
              icon={<StarRoundedIcon />}
              sx={{ mb: 3, borderRadius: 2, fontWeight: 500 }}
            >
              Seu acesso é <strong>bonificado</strong> — você tem o plano{' '}
              <strong>{planLabel(currentPlan)}</strong> sem custo. Para alterações, entre em contato com o suporte.
            </Alert>
          )}

          {/* ── Current plan status card ── */}
          {billing && (
            <Paper
              data-tour="billing-status"
              elevation={0}
              sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 3, p: 3, mb: 4 }}
            >
              <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 2 }}>
                {/* Left: plan info */}
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                  <Box
                    sx={{
                      width: 48,
                      height: 48,
                      borderRadius: 2,
                      bgcolor: isDark ? 'rgba(99,102,241,0.15)' : 'rgba(99,102,241,0.1)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}
                  >
                    <CreditCardRoundedIcon sx={{ color: 'primary.main', fontSize: 24 }} />
                  </Box>
                  <Box>
                    <Typography variant="subtitle1" fontWeight={700}>
                      Plano {planLabel(currentPlan)}
                    </Typography>
                    <Box sx={{ display: 'flex', gap: 1, mt: 0.5, flexWrap: 'wrap' }}>
                      <Chip
                        label={billing.status === 'active' ? 'Ativo' : billing.status}
                        size="small"
                        sx={{
                          height: 20, fontSize: '0.7rem', fontWeight: 700,
                          bgcolor: billing.status === 'active' ? '#dcfce7' : '#fef3c7',
                          color: billing.status === 'active' ? '#16a34a' : '#d97706',
                        }}
                      />
                      {billing.is_bonus && (
                        <Chip label="Bonificado" size="small" sx={{ height: 20, fontSize: '0.7rem', fontWeight: 700, bgcolor: '#dbeafe', color: '#1d4ed8' }} />
                      )}
                      {billing.cancel_at_period_end && (
                        <Chip label="Cancelamento agendado" size="small" sx={{ height: 20, fontSize: '0.7rem', fontWeight: 700, bgcolor: '#fee2e2', color: '#dc2626' }} />
                      )}
                    </Box>
                  </Box>
                </Box>

                {/* Right: actions */}
                {!billing.is_bonus && billing.stripe_subscription_id && (
                  <Box sx={{ display: 'flex', gap: 1, flexShrink: 0 }}>
                    {!billing.cancel_at_period_end ? (
                      <Button
                        size="small"
                        variant="outlined"
                        color="error"
                        startIcon={<CancelRoundedIcon />}
                        disabled={actionLoading === 'cancel'}
                        onClick={() => setCancelDialog(true)}
                      >
                        {actionLoading === 'cancel' ? 'Cancelando…' : 'Cancelar assinatura'}
                      </Button>
                    ) : (
                      <Button
                        size="small"
                        variant="contained"
                        color="success"
                        disableElevation
                        startIcon={<AutorenewRoundedIcon />}
                        disabled={actionLoading === 'reactivate'}
                        onClick={() => setReactivateDialog(true)}
                      >
                        {actionLoading === 'reactivate' ? 'Reativando…' : 'Reativar assinatura'}
                      </Button>
                    )}
                  </Box>
                )}
              </Box>

              {/* Billing details */}
              {billing.stripe_subscription_id && (
                <>
                  <Divider sx={{ my: 2.5 }} />
                  <Grid container spacing={3}>
                    <Grid item xs={6} sm={4}>
                      <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.72rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                        Valor mensal
                      </Typography>
                      <Typography variant="subtitle2" fontWeight={700} sx={{ mt: 0.5 }}>
                        {billing.monthly_price === 0 ? 'Grátis' : `R$ ${billing.monthly_price.toFixed(2)}`}
                      </Typography>
                    </Grid>
                    <Grid item xs={6} sm={4}>
                      <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.72rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                        {billing.cancel_at_period_end ? 'Acesso até' : 'Próxima cobrança'}
                      </Typography>
                      <Typography variant="subtitle2" fontWeight={700} sx={{ mt: 0.5 }}>
                        {formatDate(billing.current_period_end)}
                      </Typography>
                    </Grid>
                    {billing.cancel_at_period_end && (
                      <Grid item xs={12}>
                        <Alert severity="warning" sx={{ borderRadius: 2, py: 0.75 }}>
                          Seu acesso ao plano {planLabel(currentPlan)} será encerrado em{' '}
                          <strong>{formatDate(billing.current_period_end)}</strong>. Reative para continuar usando.
                        </Alert>
                      </Grid>
                    )}
                  </Grid>
                </>
              )}

              {currentPlan === 'free' && !billing.is_bonus && (
                <Alert severity="info" sx={{ mt: 2.5, borderRadius: 2 }}>
                  Você está no plano gratuito com funcionalidades limitadas. Escolha um plano abaixo para liberar o potencial completo do terreiro.
                </Alert>
              )}
            </Paper>
          )}

          {/* ── Plan comparison ── */}
          {!billing?.is_bonus && (
            <>
              <Box data-tour="billing-planos" sx={{ mb: 2 }}>
                <Typography variant="subtitle1" fontWeight={700}>
                  {isFreePlan ? 'Escolha seu plano' : 'Alterar plano'}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Todos os planos incluem emissão de senhas, Porta de atendimento e acesso ao painel.
                </Typography>
              </Box>

              <Grid container spacing={3} sx={{ mb: 4 }}>
                {PLANS.map((plan) => {
                  const isCurrent = plan.key === currentPlan;
                  const isLoading = actionLoading === plan.key;

                  return (
                    <Grid item xs={12} sm={6} md={4} key={plan.key}>
                      <Paper
                        elevation={0}
                        data-tour={`billing-plano-${plan.key}`}
                        sx={{
                          border: '2px solid',
                          borderColor: isCurrent ? plan.color : plan.popular ? `${plan.color}60` : 'divider',
                          borderRadius: 3,
                          height: '100%',
                          display: 'flex',
                          flexDirection: 'column',
                          position: 'relative',
                          overflow: 'hidden',
                          transition: 'border-color .15s, box-shadow .15s',
                          '&:hover': !isCurrent ? { borderColor: plan.color, boxShadow: `0 0 0 1px ${plan.color}30` } : {},
                        }}
                      >
                        {/* Top color accent bar */}
                        <Box sx={{ height: 4, bgcolor: plan.color, width: '100%' }} />

                        <Box sx={{ p: 3, flex: 1, display: 'flex', flexDirection: 'column' }}>
                          {/* Plan header */}
                          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
                            <Typography variant="subtitle1" fontWeight={800} sx={{ color: plan.color }}>
                              {plan.label}
                            </Typography>
                            {plan.popular && (
                              <Chip
                                label="Mais popular"
                                size="small"
                                sx={{ height: 20, fontSize: '0.65rem', fontWeight: 700, bgcolor: plan.color, color: '#fff' }}
                              />
                            )}
                            {isCurrent && (
                              <Chip
                                label="Atual"
                                size="small"
                                sx={{ height: 20, fontSize: '0.65rem', fontWeight: 700, bgcolor: `${plan.color}18`, color: plan.color, border: `1px solid ${plan.color}40` }}
                              />
                            )}
                          </Box>

                          {/* Price */}
                          <Box sx={{ mb: 2.5 }}>
                            <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 0.5 }}>
                              <Typography variant="h4" fontWeight={800} sx={{ lineHeight: 1 }}>
                                {plan.priceLabel}
                              </Typography>
                              <Typography variant="body2" color="text.secondary">/mês</Typography>
                            </Box>
                          </Box>

                          {/* Features */}
                          <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 1, mb: 3 }}>
                            {plan.features.map((f) => (
                              <Box key={f} sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
                                <CheckRoundedIcon sx={{ fontSize: 16, color: plan.color, mt: 0.15, flexShrink: 0 }} />
                                <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.82rem', lineHeight: 1.5 }}>
                                  {f}
                                </Typography>
                              </Box>
                            ))}
                          </Box>

                          {/* CTA */}
                          {isCurrent ? (
                            <Button
                              fullWidth
                              variant="outlined"
                              disabled
                              sx={{ borderColor: plan.color, color: plan.color, '&.Mui-disabled': { borderColor: `${plan.color}50`, color: `${plan.color}80` } }}
                            >
                              Plano atual
                            </Button>
                          ) : isFreePlan ? (
                            <Button
                              fullWidth
                              variant="contained"
                              disableElevation
                              disabled={!!actionLoading}
                              sx={{ bgcolor: plan.color, '&:hover': { bgcolor: plan.color, filter: 'brightness(0.9)' }, fontWeight: 700 }}
                              onClick={() => handleCheckout(plan.key)}
                            >
                              {isLoading
                                ? <CircularProgress size={20} sx={{ color: '#fff' }} />
                                : 'Assinar agora'}
                            </Button>
                          ) : (
                            <Button
                              fullWidth
                              variant={plan.popular ? 'contained' : 'outlined'}
                              disableElevation
                              disabled={!!actionLoading || !!billing?.cancel_at_period_end}
                              sx={
                                plan.popular
                                  ? { bgcolor: plan.color, '&:hover': { bgcolor: plan.color, filter: 'brightness(0.9)' }, fontWeight: 700 }
                                  : { borderColor: plan.color, color: plan.color }
                              }
                              onClick={() => setChangePlanTarget(plan.key)}
                            >
                              {isLoading
                                ? <CircularProgress size={20} sx={{ color: plan.popular ? '#fff' : plan.color }} />
                                : 'Selecionar plano'}
                            </Button>
                          )}
                        </Box>
                      </Paper>
                    </Grid>
                  );
                })}
              </Grid>

              {/* ── Contact / support note ── */}
              <Paper
                data-tour="billing-suporte"
                elevation={0}
                sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 3, p: 3 }}
              >
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
                  <Box sx={{ flex: 1 }}>
                    <Typography variant="subtitle2" fontWeight={700}>Dúvidas sobre os planos?</Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>
                      Entre em contato pelo WhatsApp ou e-mail — respondemos rapidamente.
                    </Typography>
                  </Box>
                  <Button
                    variant="outlined"
                    size="small"
                    startIcon={<WhatsAppIcon />}
                    href="https://wa.me/5511999999999"
                    target="_blank"
                    rel="noopener noreferrer"
                    sx={{ borderColor: '#22c55e', color: '#16a34a', '&:hover': { borderColor: '#16a34a', bgcolor: '#f0fdf4' }, flexShrink: 0 }}
                  >
                    Falar no WhatsApp
                  </Button>
                </Box>
              </Paper>
            </>
          )}

          {/* ── Cancel confirm dialog ── */}
          <Dialog open={cancelDialog} onClose={() => setCancelDialog(false)} maxWidth="xs" fullWidth PaperProps={{ sx: { borderRadius: 3 } }}>
            <DialogTitle sx={{ fontWeight: 700, pb: 1 }}>Cancelar assinatura?</DialogTitle>
            <DialogContent>
              <Typography variant="body2" color="text.secondary">
                Sua assinatura será encerrada ao final do período atual —{' '}
                <strong>{formatDate(billing?.current_period_end || null)}</strong>. Você continuará com acesso
                ao plano <strong>{planLabel(currentPlan)}</strong> até essa data e depois retornará ao plano gratuito.
              </Typography>
            </DialogContent>
            <DialogActions sx={{ px: 3, pb: 2.5, gap: 1 }}>
              <Button onClick={() => setCancelDialog(false)} variant="outlined">
                Manter assinatura
              </Button>
              <Button color="error" variant="contained" disableElevation onClick={handleCancel}>
                Confirmar cancelamento
              </Button>
            </DialogActions>
          </Dialog>

          {/* ── Reactivate confirm dialog ── */}
          <Dialog open={reactivateDialog} onClose={() => setReactivateDialog(false)} maxWidth="xs" fullWidth PaperProps={{ sx: { borderRadius: 3 } }}>
            <DialogTitle sx={{ fontWeight: 700, pb: 1 }}>Reativar assinatura?</DialogTitle>
            <DialogContent>
              <Typography variant="body2" color="text.secondary">
                O cancelamento agendado será removido e as cobranças continuarão normalmente a partir de{' '}
                <strong>{formatDate(billing?.current_period_end || null)}</strong>.
              </Typography>
            </DialogContent>
            <DialogActions sx={{ px: 3, pb: 2.5, gap: 1 }}>
              <Button onClick={() => setReactivateDialog(false)} variant="outlined">
                Voltar
              </Button>
              <Button color="success" variant="contained" disableElevation onClick={handleReactivate}>
                Confirmar reativação
              </Button>
            </DialogActions>
          </Dialog>

          {/* ── Change-plan confirm dialog ── */}
          <Dialog open={!!changePlanTarget} onClose={() => setChangePlanTarget(null)} maxWidth="xs" fullWidth PaperProps={{ sx: { borderRadius: 3 } }}>
            <DialogTitle sx={{ fontWeight: 700, pb: 1 }}>
              Trocar para o plano {changePlanTarget ? planLabel(changePlanTarget) : ''}?
            </DialogTitle>
            <DialogContent>
              <Typography variant="body2" color="text.secondary">
                A troca de plano é aplicada imediatamente. A diferença entre o plano atual e o novo plano
                é cobrada ou estornada na sua próxima fatura, de forma proporcional aos dias restantes do
                período atual, conforme a política de cobrança da Stripe.
              </Typography>
            </DialogContent>
            <DialogActions sx={{ px: 3, pb: 2.5, gap: 1 }}>
              <Button onClick={() => setChangePlanTarget(null)} variant="outlined">
                Cancelar
              </Button>
              <Button
                variant="contained"
                disableElevation
                onClick={() => {
                  const plan = changePlanTarget!;
                  setChangePlanTarget(null);
                  handleChangePlan(plan);
                }}
              >
                Confirmar troca
              </Button>
            </DialogActions>
          </Dialog>
        </Box>
      )}
    </AdminLayout>
  );
}
