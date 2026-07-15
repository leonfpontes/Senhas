/**
 * Reactivate Account Page - Restore a tenant + account previously deactivated
 * via the self-service "Desativar conta" flow (admin/profile.tsx).
 */
import React, { useState } from 'react';
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
import { apiClient, extractApiErrorMessage, ApiRequestConfig } from '../services/api_client';

export default function ReactivateAccountPage() {
  const router = useRouter();
  const [email, setEmail] = useState(typeof router.query.email === 'string' ? router.query.email : '');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      await apiClient.post(
        '/api/v1/auth/reactivate-account',
        { email, password },
        // Resposta é sempre a mesma mensagem genérica, mesmo em falha —
        // não é um 401 de sessão, então não faz sentido tratar como tal.
        { skipAutoLogout: true } as ApiRequestConfig,
      );
      setSuccess(true);
      setTimeout(() => {
        router.push('/login?reactivated=1');
      }, 2500);
    } catch (err) {
      setError(extractApiErrorMessage(err, 'Não foi possível processar a solicitação. Tente novamente.'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Head>
        <title>Reativar conta — GiraHub</title>
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
                  Reativar conta e terreiro
                </Typography>
              </Box>

              {success ? (
                <Alert severity="success">
                  Se as credenciais estiverem corretas, sua conta foi reativada. Redirecionando
                  para o login…
                </Alert>
              ) : (
                <form onSubmit={handleSubmit}>
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <Typography variant="body2" color="text.secondary">
                      Informe o e-mail e a senha da conta que você desativou. Seus dados
                      (giras, tickets, médiuns, associados) foram preservados e a assinatura
                      volta no plano gratuito.
                    </Typography>

                    {error && (
                      <Alert severity="error" onClose={() => setError(null)}>
                        {error}
                      </Alert>
                    )}

                    <TextField
                      label="E-mail"
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

                    <Button
                      type="submit"
                      variant="contained"
                      size="large"
                      fullWidth
                      disabled={loading || !email || !password}
                      sx={{ mt: 1 }}
                    >
                      {loading ? <CircularProgress size={24} color="inherit" /> : 'Reativar conta'}
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
