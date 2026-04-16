/**
 * Reset Password Page - Set new password using email reset link
 */
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
  CircularProgress,
  Container,
} from '@mui/material';
import PasswordField from '../components/PasswordField';
import Link from 'next/link';
import Head from 'next/head';
import { apiClient } from '../services/api_client';

export default function ResetPasswordPage() {
  const router = useRouter();
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Wait for router hydration before reading query params
  const token = router.isReady ? (router.query.token as string | undefined) : undefined;

  useEffect(() => {
    if (router.isReady && !token) {
      router.replace('/forgot-password');
    }
  }, [router.isReady, token, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setErrorCode(null);

    if (newPassword !== confirmPassword) {
      setError('As senhas não coincidem.');
      return;
    }

    setLoading(true);

    try {
      await apiClient.post('/api/v1/auth/reset-password', {
        token,
        new_password: newPassword,
      });
      setSuccess(true);
      setTimeout(() => {
        router.push('/login?reset=1');
      }, 2000);
    } catch (err: any) {
      const detail = err?.response?.data?.detail;
      const code = typeof detail === 'object' ? detail?.error_code : null;
      const message = typeof detail === 'object' ? detail?.message : (detail || 'Erro ao redefinir senha.');
      const validationErrors = err?.response?.data?.errors;

      if (code) setErrorCode(code);

      if (validationErrors && Array.isArray(validationErrors)) {
        setError(validationErrors.join(', '));
      } else {
        setError(message);
      }
    } finally {
      setLoading(false);
    }
  };

  // Not ready yet — avoid flash
  if (!router.isReady) {
    return (
      <Box sx={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <>
      <Head>
        <title>Redefinir senha — GiraHub</title>
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
                  Criar nova senha
                </Typography>
              </Box>

              {success ? (
                <Alert severity="success">
                  Senha redefinida com sucesso! Redirecionando para o login…
                </Alert>
              ) : (
                <form onSubmit={handleSubmit}>
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    {error && errorCode === 'EXPIRED_TOKEN' ? (
                      <Alert severity="error">
                        Este link expirou.{' '}
                        <Link href="/forgot-password">
                          Solicite um novo link
                        </Link>
                        .
                      </Alert>
                    ) : error ? (
                      <Alert severity="error" onClose={() => setError(null)}>
                        {error}
                      </Alert>
                    ) : null}

                    <PasswordField
                      label="Nova senha"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      fullWidth
                      required
                      autoComplete="new-password"
                      helperText="Mínimo 12 caracteres, com maiúscula, minúscula, número e símbolo."
                    />

                    <PasswordField
                      label="Confirmar nova senha"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      fullWidth
                      required
                      autoComplete="new-password"
                    />

                    <Button
                      type="submit"
                      variant="contained"
                      size="large"
                      fullWidth
                      disabled={loading || !newPassword || !confirmPassword}
                      sx={{ mt: 1 }}
                    >
                      {loading ? <CircularProgress size={24} color="inherit" /> : 'Redefinir senha'}
                    </Button>

                    <Link href="/login" passHref legacyBehavior>
                      <Button component="a" variant="text" fullWidth>
                        Voltar ao login
                      </Button>
                    </Link>
                  </Box>
                </form>
              )}
            </CardContent>
          </Card>
        </Container>
      </Box>
    </>
  );
}
