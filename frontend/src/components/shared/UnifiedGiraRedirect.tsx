/**
 * Unified per-tenant senha link — always resolves to the next/active gira.
 * Used by /public/[tenant] (legacy emission URL, retired to a redirect),
 * /public/[tenant]/senha and /public/[tenant]/associado, which are meant to
 * be shared once and keep working across giras (unlike the per-gira
 * /public/gira/[id] link, which stays pointed at one gira).
 */
'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/router';
import { Box, Button, CircularProgress, Container, Paper, Typography } from '@mui/material';
import { apiClient } from '@/services/api_client';

interface UnifiedGiraRedirectProps {
  tipo: 'comum' | 'associado';
}

// next_gira.py emite dois 404 distintos: "Tenant '<slug>' not found" e
// "No active gira scheduled for this tenant" — estados diferentes para o visitante
type ErrorKind = 'tenant-missing' | 'no-gira' | 'error';

export default function UnifiedGiraRedirect({ tipo }: UnifiedGiraRedirectProps) {
  const router = useRouter();
  const tenantSlug = router.query.tenant as string;

  const [errorKind, setErrorKind] = useState<ErrorKind | null>(null);

  const resolveNextGira = useCallback(async () => {
    if (!tenantSlug) return;
    setErrorKind(null);
    try {
      const res = await apiClient.get(
        `/api/v1/public/next-gira?tenant_slug=${encodeURIComponent(tenantSlug)}&tipo=${tipo}`
      );
      const giraId = res.data.id;
      const query = tipo === 'associado' ? '?tipo=associado' : '';
      router.replace(`/public/gira/${giraId}${query}`);
    } catch (err) {
      const { status, detail } =
        err && typeof err === 'object'
          ? (err as { status?: number; detail?: unknown })
          : { status: undefined, detail: undefined };
      if (status === 404) {
        if (typeof detail === 'string' && detail.startsWith('Tenant')) {
          setErrorKind('tenant-missing');
        } else {
          setErrorKind('no-gira');
        }
      } else {
        setErrorKind('error');
      }
    }
  }, [tenantSlug, tipo, router]);

  useEffect(() => { resolveNextGira(); }, [resolveNextGira]);

  if (errorKind) {
    const content =
      errorKind === 'tenant-missing'
        ? {
            emoji: '🔍',
            title: 'Terreiro não encontrado',
            body: 'Não encontramos nenhum terreiro neste endereço. Confira se o link está correto ou fale com quem o enviou.',
            action: null,
          }
        : errorKind === 'no-gira'
          ? {
              emoji: '🕯️',
              title: 'Nenhuma gira com emissão aberta',
              body: `No momento não há emissão de senhas${tipo === 'associado' ? ' de associado' : ''} disponível. Entre em contato com o terreiro para saber a data da próxima gira.`,
              action: 'Atualizar',
            }
          : {
              emoji: '❌',
              title: 'Erro ao carregar',
              body: 'Não foi possível carregar as informações. Verifique sua conexão e tente novamente.',
              action: 'Tentar novamente',
            };

    return (
      <Container maxWidth="sm" sx={{ py: 8, textAlign: 'center' }}>
        <Paper sx={{ p: 4, borderRadius: 2 }}>
          <Typography sx={{ fontSize: 48, lineHeight: 1, mb: 2 }} component="div">
            {content.emoji}
          </Typography>
          <Typography variant="h6" gutterBottom>{content.title}</Typography>
          <Typography color="text.secondary">{content.body}</Typography>
          {content.action && (
            <Button variant="contained" sx={{ mt: 3 }} onClick={resolveNextGira}>
              {content.action}
            </Button>
          )}
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
