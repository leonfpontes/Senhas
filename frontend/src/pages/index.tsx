import React from 'react';
import { Box, Container, Typography, Button } from '@mui/material';
import Link from 'next/link';

export default function Home() {
  return (
    <Container maxWidth="md">
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          minHeight: '100vh',
          textAlign: 'center',
        }}
      >
        <Typography variant="h1" component="h1" gutterBottom sx={{ mb: 4 }}>
          🔐 Senhas
        </Typography>
        <Typography variant="h5" component="p" gutterBottom sx={{ mb: 6, color: 'text.secondary' }}>
          Sistema Multi-Tenant de Gestão de Senhas para Terreiros de Umbanda
        </Typography>
        <Box sx={{ display: 'flex', gap: 2 }}>
          <Link href="/admin/dashboard" passHref legacyBehavior>
            <Button variant="contained" color="primary" size="large" component="a">
              Admin
            </Button>
          </Link>
          <Link href="/platform" passHref legacyBehavior>
            <Button variant="outlined" color="primary" size="large" component="a">
              Plataforma
            </Button>
          </Link>
        </Box>
      </Box>
    </Container>
  );
}
