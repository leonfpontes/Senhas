/**
 * Login Page - Authentication for Admin and Platform users
 */
'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import {
  Box,
  Button,
  Card,
  CardContent,
  TextField,
  Typography,
  Alert,
  Checkbox,
  CircularProgress,
  Container,
  Divider,
  FormControlLabel,
} from '@mui/material';
import PasswordField from '../components/PasswordField';
import Link from 'next/link';
import Head from 'next/head';
import * as Sentry from '@sentry/nextjs';
import { apiClient } from '../services/api_client';
import { dispatchTenantBrandingUpdated } from '../providers/ThemeProvider';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [accountDeleted, setAccountDeleted] = useState(false);
  const [passwordReset, setPasswordReset] = useState(false);
  const router = useRouter();

  useEffect(() => {
    if (router.query.account_deleted === '1') {
      setAccountDeleted(true);
    }
    if (router.query.reset === '1') {
      setPasswordReset(true);
    }
  }, [router.query.account_deleted, router.query.reset]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const response = await apiClient.post('/api/v1/auth/login', {
        email,
        password,
        remember_me: rememberMe,
      });

      const { user } = response.data;

      // access_token agora chega como cookie HttpOnly — não armazenar em localStorage
      localStorage.setItem('user', JSON.stringify(user));

      // Identificar usuário/tenant no Sentry para rastrear quem é afetado por erros
      Sentry.setUser({ id: user.id, role: user.role });
      if (user.tenant_id) Sentry.setTag('tenant_id', user.tenant_id);
      // Quando "Lembrar-me" está desmarcado, marca a sessão para não persistir.
      // O backend deve setar cookies de sessão; o frontend também sinaliza via
      // sessionStorage para limpeza ao fechar a aba.
      try {
        if (rememberMe) sessionStorage.removeItem('no_remember');
        else sessionStorage.setItem('no_remember', '1');
      } catch {}
      dispatchTenantBrandingUpdated();

      // Full page reload on redirect so that _app.tsx providers (ProfileProvider,
      // SubscriptionProvider) remount with the token already in localStorage.
      // router.push() would be a client-side navigation that leaves the providers
      // mounted from before login (when hasAuthToken()=false), causing them to
      // skip the initial fetch and show stale "Free" / null state until F5.
      if (user.role === 'super_admin') {
        window.location.href = '/platform';
      } else {
        window.location.href = '/admin/dashboard';
      }
    } catch (err: any) {
      const message =
        err?.response?.data?.message ||
        err?.response?.data?.detail ||
        'Credenciais inválidas. Tente novamente.';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Head>
        <title>Login — GiraHub</title>
        <meta name="robots" content="noindex, nofollow" />
      </Head>
      <Box
        sx={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          bgcolor: 'background.default',
        }}
      >
        <Container maxWidth="xs">
          <Card elevation={4}>
            <CardContent sx={{ p: 4 }}>
              <Box sx={{ textAlign: 'center', mb: 3 }}>
                <Typography variant="h4" fontWeight={700} color="primary.main">
                  GiraHub
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Acesse sua conta
                </Typography>
              </Box>

            <form onSubmit={handleSubmit}>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {accountDeleted && (
                  <Alert severity="success" onClose={() => setAccountDeleted(false)}>
                    Sua conta foi excluída com sucesso. Seus dados pessoais foram removidos conforme a LGPD.
                  </Alert>
                )}
                {passwordReset && (
                  <Alert severity="success" onClose={() => setPasswordReset(false)}>
                    Senha redefinida com sucesso. Faça login com sua nova senha.
                  </Alert>
                )}
                {error && (
                  <Alert severity="error" onClose={() => setError(null)}>
                    {error}
                  </Alert>
                )}

                <TextField
                  label="Email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  fullWidth
                  required
                  autoComplete="email"
                />

                <PasswordField
                  label="Senha"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  fullWidth
                  required
                  autoComplete="current-password"
                />

                <FormControlLabel
                  control={
                    <Checkbox
                      checked={rememberMe}
                      onChange={(e) => setRememberMe(e.target.checked)}
                      size="small"
                    />
                  }
                  label="Lembrar-me"
                  sx={{ mt: -1 }}
                />

                <Button
                  type="submit"
                  variant="contained"
                  size="large"
                  fullWidth
                  disabled={loading || !email || !password}
                  sx={{ mt: 1 }}
                >
                  {loading ? <CircularProgress size={24} color="inherit" /> : 'Entrar'}
                </Button>

                <Box sx={{ textAlign: 'center', mt: 1 }}>
                  <Link href="/forgot-password" passHref legacyBehavior>
                    <Typography
                      component="a"
                      variant="body2"
                      color="primary.main"
                      sx={{ cursor: 'pointer', textDecoration: 'none', '&:hover': { textDecoration: 'underline' } }}
                    >
                      Esqueci minha senha
                    </Typography>
                  </Link>
                </Box>
              </Box>
            </form>

            <Divider sx={{ my: 2 }} />

            <Box sx={{ textAlign: 'center' }}>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                Ainda não tem conta?
              </Typography>
              <Button
                component={Link}
                href="/cadastro"
                variant="outlined"
                fullWidth
              >
                Cadastre-se grátis
              </Button>
            </Box>
          </CardContent>
        </Card>
      </Container>
    </Box>
    </>
  );
}
