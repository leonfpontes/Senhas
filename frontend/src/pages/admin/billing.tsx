/**
 * Admin Billing Page — Stripe Subscriptions
 * Handles checkout for new plans and upgrade/downgrade for existing subscriptions.
 */
'use client';

import React, { useEffect, useState, useCallback } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  Grid,
  Typography,
} from '@mui/material';
import CreditCardIcon from '@mui/icons-material/CreditCard';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CancelIcon from '@mui/icons-material/Cancel';
import StarIcon from '@mui/icons-material/Star';
import AdminLayout from './admin_layout';
import { apiClient } from '../../services/api_client';
import { useRouter } from 'next/router';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Static plan data
// ---------------------------------------------------------------------------

interface PlanMeta {
  key: string;
  label: string;
  price: string;
  color: string;
  highlight: boolean;
  features: string[];
}

const PLANS: PlanMeta[] = [
  {
    key: 'basic',
    label: 'Basic',
    price: 'R$ 49/mês',
    color: '#3b82f6',
    highlight: false,
    features: [
      '5 usuários',
      '10 giras por mês',
      '15 médiuns',
      'Relatório de Gira',
    ],
  },
  {
    key: 'pro',
    label: 'Pro',
    price: 'R$ 79/mês',
    color: '#8b5cf6',
    highlight: true,
    features: [
      '20 usuários',
      '50 giras por mês',
      '30 médiuns',
      'Envio de e-mail',
      'Tema personalizado',
      'Analytics avançado',
      'Export CSV',
    ],
  },
  {
    key: 'premium',
    label: 'Premium',
    price: 'R$ 99/mês',
    color: '#f59e0b',
    highlight: false,
    features: [
      'Usuários ilimitados',
      'Giras ilimitadas',
      'Médiuns ilimitados',
      'Tudo do Pro',
      'API access',
      'Controle de mensalidade de médiuns',
      'Suporte prioritário',
    ],
  },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function AdminBilling() {
  const router = useRouter();
  const [billing, setBilling] = useState<BillingInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [cancelDialog, setCancelDialog] = useState(false);

  const fetchBilling = useCallback(async () => {
    try {
      const res = await apiClient.get('/api/v1/admin/billing');
      setBilling(res.data);
    } catch {
      setError('Erro ao carregar informações de cobrança');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBilling();
  }, [fetchBilling]);

  // Handle return from Stripe Checkout
  useEffect(() => {
    const { status } = router.query;
    if (status === 'success') {
      setSuccess('Assinatura realizada com sucesso! Seu plano será atualizado em instantes.');
      // Reload billing info after a short delay to reflect webhook update
      setTimeout(() => fetchBilling(), 3000);
    } else if (status === 'cancelled') {
      setError('Checkout cancelado. Nenhuma cobrança foi realizada.');
    } else if (status === 'checkout_error') {
      setError('Não foi possível iniciar o checkout automaticamente. Escolha seu plano abaixo para tentar novamente.');
    }
    // Clean up query params
    if (status) router.replace('/admin/billing', undefined, { shallow: true });
  }, [router.query.status]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleCheckout = async (plan: string) => {
    setActionLoading(plan);
    setError(null);
    try {
      const res = await apiClient.post('/api/v1/admin/billing/checkout', { plan });
      window.location.href = res.data.checkout_url;
    } catch (err: any) {
      setError(err?.response?.data?.detail || 'Erro ao iniciar checkout');
      setActionLoading(null);
    }
  };

  const handleChangePlan = async (plan: string) => {
    setActionLoading(plan);
    setError(null);
    try {
      await apiClient.post('/api/v1/admin/billing/change-plan', { plan });
      setSuccess(`Plano alterado para ${plan} com sucesso!`);
      await fetchBilling();
    } catch (err: any) {
      setError(err?.response?.data?.detail || 'Erro ao alterar plano');
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
    } catch (err: any) {
      setError(err?.response?.data?.detail || 'Erro ao cancelar assinatura');
    } finally {
      setActionLoading(null);
    }
  };

  const isFreePlan = !billing?.stripe_subscription_id;
  const currentPlan = billing?.plan || 'free';

  const formatDate = (iso: string | null) => {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
  };

  return (
    <AdminLayout title="Assinatura">
      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
          <CircularProgress />
        </Box>
      ) : (
        <>
          {/* ── Alerts ── */}
          {success && (
            <Alert severity="success" onClose={() => setSuccess(null)} sx={{ mb: 3 }}>
              {success}
            </Alert>
          )}
          {error && (
            <Alert severity="error" onClose={() => setError(null)} sx={{ mb: 3 }}>
              {error}
            </Alert>
          )}

          {/* ── Bonus tenant banner ── */}
          {billing?.is_bonus && (
            <Alert
              severity="info"
              icon={<StarIcon />}
              sx={{ mb: 3, fontWeight: 600 }}
            >
              Seu acesso é bonificado. Você tem acesso ao plano{' '}
              <strong>{currentPlan.charAt(0).toUpperCase() + currentPlan.slice(1)}</strong> sem custo.
              Para alterações, entre em contato com o suporte.
            </Alert>
          )}

          {/* ── Current subscription status card ── */}
          {billing && (
            <Card elevation={0} sx={{ mb: 4, border: '1px solid', borderColor: 'divider', borderRadius: 2 }}>
              <CardContent sx={{ p: 3 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
                  <CreditCardIcon sx={{ fontSize: 32, color: 'primary.main' }} />
                  <Box>
                    <Typography variant="h6" fontWeight={700}>
                      Plano atual:{' '}
                      {currentPlan.charAt(0).toUpperCase() + currentPlan.slice(1)}
                    </Typography>
                    <Box sx={{ display: 'flex', gap: 1, mt: 0.5, flexWrap: 'wrap' }}>
                      <Chip
                        label={billing.status === 'active' ? 'Ativo' : billing.status}
                        color={billing.status === 'active' ? 'success' : 'warning'}
                        size="small"
                      />
                      {billing.is_bonus && <Chip label="Bonificado" color="info" size="small" />}
                      {billing.cancel_at_period_end && (
                        <Chip label="Cancelamento agendado" color="error" size="small" />
                      )}
                    </Box>
                  </Box>
                </Box>

                {billing.stripe_subscription_id && (
                  <>
                    <Divider sx={{ my: 2 }} />
                    <Grid container spacing={2}>
                      <Grid item xs={6} sm={3}>
                        <Typography variant="caption" color="text.secondary">Valor mensal</Typography>
                        <Typography fontWeight={600}>
                          {billing.monthly_price === 0
                            ? 'Grátis'
                            : `R$ ${billing.monthly_price.toFixed(2)}`}
                        </Typography>
                      </Grid>
                      <Grid item xs={6} sm={3}>
                        <Typography variant="caption" color="text.secondary">Próxima cobrança</Typography>
                        <Typography fontWeight={600}>
                          {billing.cancel_at_period_end ? '—' : formatDate(billing.current_period_end)}
                        </Typography>
                      </Grid>
                      <Grid item xs={6} sm={3}>
                        <Typography variant="caption" color="text.secondary">Acesso até</Typography>
                        <Typography fontWeight={600}>{formatDate(billing.current_period_end)}</Typography>
                      </Grid>
                    </Grid>

                    {!billing.is_bonus && !billing.cancel_at_period_end && (
                      <Box sx={{ mt: 2 }}>
                        <Button
                          variant="outlined"
                          color="error"
                          size="small"
                          disabled={actionLoading === 'cancel'}
                          startIcon={<CancelIcon />}
                          onClick={() => setCancelDialog(true)}
                        >
                          {actionLoading === 'cancel' ? 'Cancelando...' : 'Cancelar assinatura'}
                        </Button>
                      </Box>
                    )}
                  </>
                )}

                {currentPlan === 'free' && !billing.is_bonus && (
                  <Alert severity="warning" sx={{ mt: 2 }}>
                    Você está no plano gratuito com recursos limitados. Escolha um plano abaixo para ampliar seu acesso.
                  </Alert>
                )}
              </CardContent>
            </Card>
          )}

          {/* ── Plan cards ── */}
          {!billing?.is_bonus && (
            <>
              <Typography variant="h6" fontWeight={700} sx={{ mb: 2 }}>
                {isFreePlan ? 'Escolha seu plano' : 'Alterar plano'}
              </Typography>
              <Grid container spacing={3} sx={{ mb: 4 }}>
                {PLANS.map((plan) => {
                  const isCurrent = plan.key === currentPlan;
                  const isLoading = actionLoading === plan.key;

                  return (
                    <Grid item xs={12} sm={6} md={4} key={plan.key}>
                      <Card
                        elevation={0}
                        sx={{
                          border: '2px solid',
                          borderColor: isCurrent ? plan.color : plan.highlight ? plan.color : 'divider',
                          borderRadius: 2,
                          position: 'relative',
                          height: '100%',
                          display: 'flex',
                          flexDirection: 'column',
                        }}
                      >
                        {plan.highlight && (
                          <Box
                            sx={{
                              position: 'absolute',
                              top: -12,
                              left: '50%',
                              transform: 'translateX(-50%)',
                            }}
                          >
                            <Chip
                              label="Mais popular"
                              size="small"
                              sx={{ bgcolor: plan.color, color: '#fff', fontWeight: 700 }}
                            />
                          </Box>
                        )}
                        <CardContent sx={{ p: 3, flexGrow: 1 }}>
                          <Typography variant="h6" fontWeight={800} sx={{ color: plan.color }}>
                            {plan.label}
                          </Typography>
                          <Typography variant="h5" fontWeight={700} sx={{ mt: 0.5, mb: 2 }}>
                            {plan.price}
                          </Typography>
                          <Box component="ul" sx={{ pl: 2, m: 0, mb: 2 }}>
                            {plan.features.map((f) => (
                              <Box
                                component="li"
                                key={f}
                                sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}
                              >
                                <CheckCircleIcon sx={{ color: plan.color, fontSize: 16 }} />
                                <Typography variant="body2">{f}</Typography>
                              </Box>
                            ))}
                          </Box>
                        </CardContent>
                        <Box sx={{ p: 2, pt: 0 }}>
                          {isCurrent ? (
                            <Button fullWidth variant="contained" disabled sx={{ bgcolor: `${plan.color} !important` }}>
                              Plano atual
                            </Button>
                          ) : isFreePlan ? (
                            <Button
                              fullWidth
                              variant="contained"
                              disabled={!!actionLoading}
                              sx={{ bgcolor: plan.color, '&:hover': { bgcolor: plan.color, filter: 'brightness(0.9)' } }}
                              onClick={() => handleCheckout(plan.key)}
                            >
                              {isLoading ? <CircularProgress size={22} sx={{ color: '#fff' }} /> : 'Assinar agora'}
                            </Button>
                          ) : (
                            <Button
                              fullWidth
                              variant="outlined"
                              disabled={!!actionLoading || billing?.cancel_at_period_end}
                              sx={{ borderColor: plan.color, color: plan.color }}
                              onClick={() => handleChangePlan(plan.key)}
                            >
                              {isLoading ? <CircularProgress size={22} /> : 'Selecionar'}
                            </Button>
                          )}
                        </Box>
                      </Card>
                    </Grid>
                  );
                })}
              </Grid>
            </>
          )}

          {/* ── Cancel confirm dialog ── */}
          <Dialog open={cancelDialog} onClose={() => setCancelDialog(false)} maxWidth="xs" fullWidth>
            <DialogTitle fontWeight={700}>Cancelar assinatura?</DialogTitle>
            <DialogContent>
              <Typography>
                Sua assinatura será cancelada ao final do período atual (
                {formatDate(billing?.current_period_end || null)}). Você continuará
                com acesso até essa data e então retornará para o plano Free.
              </Typography>
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setCancelDialog(false)}>Manter assinatura</Button>
              <Button color="error" variant="contained" onClick={handleCancel}>
                Confirmar cancelamento
              </Button>
            </DialogActions>
          </Dialog>
        </>
      )}
    </AdminLayout>
  );
}
