/**
 * Unified per-tenant senha link — always resolves to the next/active gira.
 * Used by /public/[tenant]/senha and /public/[tenant]/associado, which are
 * meant to be shared once and keep working across giras (unlike the
 * per-gira /public/gira/[id] link, which stays pointed at one gira).
 */
'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/router';
import { Box, CircularProgress, Container, Paper, Typography } from '@mui/material';
import BlockIcon from '@mui/icons-material/Block';
import { apiClient, extractApiErrorMessage } from '@/services/api_client';

interface UnifiedGiraRedirectProps {
  tipo: 'comum' | 'associado';
}

export default function UnifiedGiraRedirect({ tipo }: UnifiedGiraRedirectProps) {
  const router = useRouter();
  const tenantSlug = router.query.tenant as string;

  const [error, setError] = useState<string | null>(null);

  const resolveNextGira = useCallback(async () => {
    if (!tenantSlug) return;
    try {
      const res = await apiClient.get(
        `/api/v1/public/next-gira?tenant_slug=${encodeURIComponent(tenantSlug)}&tipo=${tipo}`
      );
      const giraId = res.data.id;
      const query = tipo === 'associado' ? '?tipo=associado' : '';
      router.replace(`/public/gira/${giraId}${query}`);
    } catch (err) {
      setError(extractApiErrorMessage(err, 'Nenhuma gira disponível no momento'));
    }
  }, [tenantSlug, tipo, router]);

  useEffect(() => { resolveNextGira(); }, [resolveNextGira]);

  if (error) {
    return (
      <Container maxWidth="sm" sx={{ py: 8, textAlign: 'center' }}>
        <Paper sx={{ p: 4, borderRadius: 2 }}>
          <BlockIcon sx={{ fontSize: 48, color: 'text.disabled', mb: 2 }} />
          <Typography variant="h6" gutterBottom>Nenhuma gira disponível no momento</Typography>
          <Typography color="text.secondary">
            Volte mais tarde para emitir sua senha{tipo === 'associado' ? ' de associado' : ''}.
          </Typography>
        </Paper>
      </Container>
    );
  }

  return (
    <Container maxWidth="sm" sx={{ py: 8, textAlign: 'center' }}>
      <Box sx={{ display: 'flex', justifyContent: 'center' }}>
        <CircularProgress />
      </Box>
    </Container>
  );
}
