/**
 * Login Page - Authentication for Admin and Platform users
 */
'use client';

import React, { useState } from 'react';
import {
  Box,
  Button,
  Card,
  CardContent,
  TextField,
  Typography,
  Alert,
  CircularProgress,
  Container,
  Divider,
} from '@mui/material';
import Link from 'next/link';
import Head from 'next/head';
import { apiClient } from '../services/api_client';
import { dispatchTenantBrandingUpdated } from '../providers/ThemeProvider';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const response = await apiClient.post('/api/v1/auth/login', {
        email,
        password,
      });

      const { access_token, user } = response.data;

      // Store token
      localStorage.setItem('access_token', access_token);
      localStorage.setItem('user', JSON.stringify(user));
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

                <TextField
                  label="Senha"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  fullWidth
                  required
                  autoComplete="current-password"
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
