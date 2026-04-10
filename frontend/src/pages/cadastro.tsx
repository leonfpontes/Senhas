/**
 * /cadastro — Self-service onboarding page (Free plan)
 * 2-step form: Terreiro info → User info
 */
'use client';

import React, { useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Checkbox,
  Chip,
  CircularProgress,
  Container,
  FormControlLabel,
  FormHelperText,
  IconButton,
  InputAdornment,
  LinearProgress,
  MenuItem,
  Step,
  StepLabel,
  Stepper,
  TextField,
  Typography,
} from '@mui/material';
import { Visibility, VisibilityOff } from '@mui/icons-material';
import CreditCardIcon from '@mui/icons-material/CreditCard';
import { useRouter } from 'next/router';
import Head from 'next/head';
import Link from 'next/link';
import { apiClient } from '../services/api_client';
import { dispatchTenantBrandingUpdated } from '../providers/ThemeProvider';

const STEPS = ['Seu Terreiro', 'Seus Dados'];

const COMO_CONHECEU_OPTIONS = [
  { value: 'google', label: 'Google' },
  { value: 'instagram', label: 'Instagram' },
  { value: 'indicacao', label: 'Indicação' },
  { value: 'outro', label: 'Outro' },
];

// Simple WhatsApp mask: (99) 99999-9999
function maskPhone(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 11);
  if (digits.length <= 2) return digits.length ? `(${digits}` : '';
  if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

function passwordStrength(pw: string): number {
  let score = 0;
  if (pw.length >= 8) score++;
  if (/[A-Z]/.test(pw)) score++;
  if (/[0-9]/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  return score; // 0-4
}

const strengthColor = ['#d32f2f', '#f57c00', '#fbc02d', '#388e3c'];
const strengthLabel = ['Fraca', 'Razoável', 'Boa', 'Forte'];

export default function CadastroPage() {
  const router = useRouter();
  const planParam = (router.query.plan as string | undefined) || '';
  const wantedPlan = ['basic', 'pro', 'premium'].includes(planParam.toLowerCase()) ? planParam.toLowerCase() : '';

  const PLAN_LABEL: Record<string, string> = { basic: 'Basic — R$49/mês', pro: 'Pro — R$79/mês', premium: 'Premium — R$99/mês' };
  const PLAN_COLOR: Record<string, string> = { basic: '#3b82f6', pro: '#8b5cf6', premium: '#f59e0b' };
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  // Step 1
  const [terreiroNome, setTerreiroNome] = useState('');
  const [endereco, setEndereco] = useState('');
  const [comoConheceu, setComoConheceu] = useState('');

  // Step 2
  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [aceiteTermos, setAceiteTermos] = useState(false);

  // Validation helpers
  const step1Valid = terreiroNome.trim().length >= 3;
  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  const passwordMatch = password === confirmPassword;
  const pwStrength = passwordStrength(password);
  const step2Valid =
    nome.trim().length >= 2 &&
    emailValid &&
    whatsapp.replace(/\D/g, '').length >= 10 &&
    password.length >= 8 &&
    passwordMatch &&
    aceiteTermos;

  const handleNext = () => {
    setError(null);
    if (step === 0 && step1Valid) setStep(1);
  };

  const handleBack = () => {
    setError(null);
    setStep(0);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!step2Valid) return;

    setLoading(true);
    setError(null);

    try {
      const res = await apiClient.post('/api/v1/public/onboarding', {
        terreiro_nome: terreiroNome.trim(),
        endereco: endereco.trim() || undefined,
        responsavel_nome: nome.trim(),
        email,
        whatsapp: whatsapp.replace(/\D/g, ''),
        password,
        como_conheceu: comoConheceu || undefined,
        aceite_termos: true,
      });

      const { access_token, user } = res.data;
      localStorage.setItem('access_token', access_token);
      localStorage.setItem('user', JSON.stringify(user));
      dispatchTenantBrandingUpdated();

      // If a paid plan was requested, initiate Stripe Checkout immediately
      if (wantedPlan) {
        try {
          const checkoutRes = await apiClient.post('/api/v1/admin/billing/checkout', { plan: wantedPlan });
          window.location.href = checkoutRes.data.checkout_url;
          return;
        } catch {
          // Checkout failed — go to billing page so user can try again.
          // Use full page reload so SubscriptionProvider remounts with the token
          // already in localStorage (same reason as login.tsx).
          window.location.href = '/admin/billing?status=checkout_error';
          return;
        }
      }

      // Full page reload so SubscriptionProvider and ProfileProvider remount
      // with the token already in localStorage — prevents canCreateGira()=false
      // on the first visit to /admin/giras after signup.
      window.location.href = '/admin/dashboard';
    } catch (err: any) {
      const detail =
        err?.response?.data?.detail ??
        err?.response?.data?.message ??
        'Erro ao criar conta. Tente novamente.';
      setError(typeof detail === 'string' ? detail : JSON.stringify(detail));
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Head>
        <title>Cadastro — GiraHub</title>
        <meta name="description" content="Crie sua conta gratuita no GiraHub e comece a gerenciar senhas e giras do seu terreiro." />
        <link rel="canonical" href="https://girahub.com.br/cadastro" />
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://girahub.com.br/cadastro" />
        <meta property="og:title" content="Cadastro Grátis — GiraHub" />
        <meta property="og:description" content="Crie sua conta gratuita no GiraHub e comece a gerenciar senhas e giras do seu terreiro." />
        <meta property="og:locale" content="pt_BR" />
        <meta property="og:site_name" content="GiraHub" />
      </Head>

      <Box
        sx={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          bgcolor: 'background.default',
          py: 4,
        }}
      >
        <Container maxWidth="sm">
          <Card elevation={4}>
            <CardContent sx={{ p: { xs: 3, sm: 4 } }}>
              {/* Header */}
              <Box sx={{ textAlign: 'center', mb: 3 }}>
                <Typography variant="h4" fontWeight={700} color="primary.main">
                  GiraHub
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {wantedPlan ? 'Crie sua conta e assine' : 'Crie sua conta gratuita'}
                </Typography>
              </Box>

              {/* Plan banner */}
              {wantedPlan && (
                <Box
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1,
                    bgcolor: `${PLAN_COLOR[wantedPlan]}12`,
                    border: `1px solid ${PLAN_COLOR[wantedPlan]}40`,
                    borderRadius: 2,
                    px: 2,
                    py: 1.2,
                    mb: 3,
                  }}
                >
                  <CreditCardIcon sx={{ color: PLAN_COLOR[wantedPlan], fontSize: 20 }} />
                  <Box sx={{ flex: 1 }}>
                    <Typography variant="body2" fontWeight={700} sx={{ color: PLAN_COLOR[wantedPlan] }}>
                      Plano selecionado: {PLAN_LABEL[wantedPlan]}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      Após o cadastro você será redirecionado para o pagamento seguro via Stripe.
                    </Typography>
                  </Box>
                  <Chip
                    label={wantedPlan.charAt(0).toUpperCase() + wantedPlan.slice(1)}
                    size="small"
                    sx={{ bgcolor: PLAN_COLOR[wantedPlan], color: '#fff', fontWeight: 700 }}
                  />
                </Box>
              )}

              {/* Stepper */}
              <Stepper activeStep={step} alternativeLabel sx={{ mb: 3 }}>
                {STEPS.map((label) => (
                  <Step key={label}>
                    <StepLabel>{label}</StepLabel>
                  </Step>
                ))}
              </Stepper>

              {error && (
                <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
                  {error}
                </Alert>
              )}

              <form onSubmit={step === 1 ? handleSubmit : (e) => { e.preventDefault(); handleNext(); }}>
                {/* ---- STEP 1 ---- */}
                {step === 0 && (
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
                    <TextField
                      label="Nome do Terreiro"
                      value={terreiroNome}
                      onChange={(e) => setTerreiroNome(e.target.value)}
                      fullWidth
                      required
                      autoFocus
                      inputProps={{ maxLength: 255 }}
                      error={terreiroNome.length > 0 && terreiroNome.trim().length < 3}
                      helperText={
                        terreiroNome.length > 0 && terreiroNome.trim().length < 3
                          ? 'Mínimo 3 caracteres'
                          : ''
                      }
                    />

                    <TextField
                      label="Endereço (opcional)"
                      value={endereco}
                      onChange={(e) => setEndereco(e.target.value)}
                      fullWidth
                      inputProps={{ maxLength: 500 }}
                      helperText="Usado no botão 'Como Chegar' dos emails de senha"
                    />

                    <TextField
                      select
                      label="Como nos conheceu? (opcional)"
                      value={comoConheceu}
                      onChange={(e) => setComoConheceu(e.target.value)}
                      fullWidth
                    >
                      <MenuItem value="">
                        <em>Selecione</em>
                      </MenuItem>
                      {COMO_CONHECEU_OPTIONS.map((o) => (
                        <MenuItem key={o.value} value={o.value}>
                          {o.label}
                        </MenuItem>
                      ))}
                    </TextField>

                    <Button
                      type="submit"
                      variant="contained"
                      size="large"
                      fullWidth
                      disabled={!step1Valid}
                      sx={{ mt: 1 }}
                    >
                      Próximo
                    </Button>
                  </Box>
                )}

                {/* ---- STEP 2 ---- */}
                {step === 1 && (
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
                    <TextField
                      label="Nome completo"
                      value={nome}
                      onChange={(e) => setNome(e.target.value)}
                      fullWidth
                      required
                      autoFocus
                      inputProps={{ maxLength: 255 }}
                    />

                    <TextField
                      label="Email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      fullWidth
                      required
                      autoComplete="email"
                    />

                    <TextField
                      label="WhatsApp"
                      value={whatsapp}
                      onChange={(e) => setWhatsapp(maskPhone(e.target.value))}
                      fullWidth
                      required
                      placeholder="(99) 99999-9999"
                      inputProps={{ maxLength: 15 }}
                    />

                    <Box>
                      <TextField
                        label="Senha"
                        type={showPassword ? 'text' : 'password'}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        fullWidth
                        required
                        autoComplete="new-password"
                        InputProps={{
                          endAdornment: (
                            <InputAdornment position="end">
                              <IconButton
                                onClick={() => setShowPassword(!showPassword)}
                                edge="end"
                                size="small"
                              >
                                {showPassword ? <VisibilityOff /> : <Visibility />}
                              </IconButton>
                            </InputAdornment>
                          ),
                        }}
                      />
                      {password.length > 0 && (
                        <Box sx={{ mt: 0.5 }}>
                          <LinearProgress
                            variant="determinate"
                            value={pwStrength * 25}
                            sx={{
                              height: 6,
                              borderRadius: 3,
                              bgcolor: '#eee',
                              '& .MuiLinearProgress-bar': {
                                bgcolor: strengthColor[pwStrength - 1] || '#d32f2f',
                              },
                            }}
                          />
                          <Typography variant="caption" sx={{ color: strengthColor[pwStrength - 1] || '#d32f2f' }}>
                            {strengthLabel[pwStrength - 1] || 'Muito fraca'} — mínimo 8 caracteres
                          </Typography>
                        </Box>
                      )}
                    </Box>

                    <TextField
                      label="Confirmar senha"
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      fullWidth
                      required
                      autoComplete="new-password"
                      error={confirmPassword.length > 0 && !passwordMatch}
                      helperText={
                        confirmPassword.length > 0 && !passwordMatch ? 'As senhas não coincidem' : ''
                      }
                    />

                    <Box>
                      <FormControlLabel
                        control={
                          <Checkbox
                            checked={aceiteTermos}
                            onChange={(e) => setAceiteTermos(e.target.checked)}
                          />
                        }
                        label={
                          <Typography variant="body2">
                            Li e aceito os{' '}
                            <a href="/termos" target="_blank" rel="noopener noreferrer">
                              Termos de Uso
                            </a>{' '}
                            e a{' '}
                            <a href="/privacidade" target="_blank" rel="noopener noreferrer">
                              Política de Privacidade
                            </a>
                          </Typography>
                        }
                      />
                      {!aceiteTermos && (
                        <FormHelperText error>Obrigatório</FormHelperText>
                      )}
                    </Box>

                    <Box sx={{ display: 'flex', gap: 2 }}>
                      <Button variant="outlined" onClick={handleBack} sx={{ flex: 1 }}>
                        Voltar
                      </Button>
                      <Button
                        type="submit"
                        variant="contained"
                        size="large"
                        disabled={!step2Valid || loading}
                        sx={{ flex: 2 }}
                      >
                        {loading
                          ? <CircularProgress size={24} color="inherit" />
                          : wantedPlan
                            ? `Criar conta e assinar ${wantedPlan.charAt(0).toUpperCase() + wantedPlan.slice(1)}`
                            : 'Criar minha conta'
                        }
                      </Button>
                    </Box>
                  </Box>
                )}
              </form>

              {/* Footer link */}
              <Box sx={{ textAlign: 'center', mt: 3 }}>
                <Typography variant="body2" color="text.secondary">
                  Já tem conta?{' '}
                  <Link href="/login" style={{ color: '#6C63FF', fontWeight: 600, textDecoration: 'none' }}>
                    Faça login
                  </Link>
                </Typography>
              </Box>
            </CardContent>
          </Card>
        </Container>
      </Box>
    </>
  );
}
