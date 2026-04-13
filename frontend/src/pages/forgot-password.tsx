/**
 * Forgot Password Page - Request password reset link
 */
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
} from '@mui/material';
import Link from 'next/link';
import Head from 'next/head';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { apiClient } from '../services/api_client';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      await apiClient.post('/api/v1/auth/forgot-password', { email });
    } catch {
      // Never reveal whether the email exists — always show success state
    } finally {
      setLoading(false);
      setSubmitted(true);
    }
  };

  return (
    <>
      <Head>
        <title>Esqueci minha senha — GiraHub</title>
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
                  Recuperar acesso
                </Typography>
              </Box>

              {submitted ? (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <Alert severity="success">
                    Se o e-mail estiver cadastrado, você receberá um link para redefinir sua senha em breve.
                    Verifique também a caixa de spam.
                  </Alert>
                  <Link href="/login" passHref legacyBehavior>
                    <Button
                      component="a"
                      variant="outlined"
                      fullWidth
                      startIcon={<ArrowBackIcon />}
                    >
                      Voltar ao login
                    </Button>
                  </Link>
                </Box>
              ) : (
                <form onSubmit={handleSubmit}>
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <Typography variant="body2" color="text.secondary">
                      Informe o e-mail da sua conta e enviaremos um link para redefinir sua senha.
                    </Typography>

                    <TextField
                      label="E-mail"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      fullWidth
                      required
                      autoComplete="email"
                      autoFocus
                    />

                    <Button
                      type="submit"
                      variant="contained"
                      size="large"
                      fullWidth
                      disabled={loading || !email}
                      sx={{ mt: 1 }}
                    >
                      {loading ? <CircularProgress size={24} color="inherit" /> : 'Enviar link'}
                    </Button>

                    <Link href="/login" passHref legacyBehavior>
                      <Button
                        component="a"
                        variant="text"
                        fullWidth
                        startIcon={<ArrowBackIcon />}
                      >
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
