/**
 * Public self-service cancellation page — link sent in the ticket emission email.
 * Route: /public/ticket/[ticketId]/cancelar
 *
 * Loads GET /api/v1/public/tickets/{ticketId}/cancel-info on mount (read-only,
 * so email-scanner link prefetching can't cancel anything) and only calls
 * POST /api/v1/public/tickets/{ticketId}/cancel after the consulente
 * explicitly confirms.
 */
'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/router';
import {
  Box,
  Button,
  CircularProgress,
  Container,
  Paper,
  Stack,
  Typography,
} from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import EventBusyIcon from '@mui/icons-material/EventBusy';
import { apiClient, extractApiErrorMessage } from '../../../../services/api_client';

type PageState = 'loading' | 'confirm' | 'blocked' | 'cancelling' | 'success' | 'error';

interface CancelInfo {
  ticket_number: string;
  status: string;
  cancellable: boolean;
  reason: string | null;
  gira_name: string;
  gira_date: string;
  tenant_name: string;
  tenant_slug: string;
  consulente_name: string;
  waitlisted: boolean;
}

export default function CancelTicketPage() {
  const router = useRouter();
  const ticketId = router.query.ticketId as string;

  const [state, setState] = useState<PageState>('loading');
  const [info, setInfo] = useState<CancelInfo | null>(null);
  const [message, setMessage] = useState<string>('');

  useEffect(() => {
    if (!ticketId) return;
    let active = true;
    (async () => {
      try {
        const res = await apiClient.get(`/api/v1/public/tickets/${ticketId}/cancel-info`);
        if (!active) return;
        setInfo(res.data);
        setState(res.data.cancellable ? 'confirm' : 'blocked');
        if (!res.data.cancellable) setMessage(res.data.reason || 'Esta senha não pode ser cancelada.');
      } catch (err) {
        if (!active) return;
        setState('error');
        setMessage(extractApiErrorMessage(err, 'Não foi possível carregar os dados da senha.'));
      }
    })();
    return () => { active = false; };
  }, [ticketId]);

  const handleCancel = useCallback(async () => {
    if (!ticketId) return;
    setState('cancelling');
    try {
      const res = await apiClient.post(`/api/v1/public/tickets/${ticketId}/cancel`);
      setMessage(res.data.message);
      setState('success');
    } catch (err) {
      setState('error');
      setMessage(extractApiErrorMessage(err, 'Não foi possível cancelar sua senha.'));
    }
  }, [ticketId]);

  return (
    <Container maxWidth="sm" sx={{ py: 8 }}>
      <Paper sx={{ p: 4, textAlign: 'center', borderRadius: 2 }}>
        {state === 'loading' && (
          <Box sx={{ py: 4 }}>
            <CircularProgress sx={{ mb: 2 }} />
            <Typography color="text.secondary">Carregando sua senha...</Typography>
          </Box>
        )}

        {state === 'confirm' && info && (
          <>
            <EventBusyIcon sx={{ fontSize: 64, color: 'warning.main', mb: 2 }} />
            <Typography variant="h5" fontWeight={700} gutterBottom>
              Cancelar {info.waitlisted ? 'sua vaga na fila de espera' : 'sua senha'}?
            </Typography>
            <Typography variant="h3" fontWeight={700} color="primary" sx={{ my: 2 }}>
              #{info.ticket_number}
            </Typography>
            <Typography color="text.secondary" sx={{ mb: 1 }}>
              {info.gira_name}
              {info.gira_date ? ` — ${info.gira_date}` : ''}
            </Typography>
            <Typography color="text.secondary" sx={{ mb: 3 }}>
              {info.tenant_name}
            </Typography>
            <Typography sx={{ mb: 3 }}>
              {info.waitlisted
                ? 'Você sairá da fila de espera desta gira. Esta ação não pode ser desfeita.'
                : 'Sua vaga será liberada para outra pessoa. Esta ação não pode ser desfeita.'}
            </Typography>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} justifyContent="center">
              <Button variant="outlined" onClick={() => router.push(`/public/${info.tenant_slug}`)}>
                Voltar
              </Button>
              <Button variant="contained" color="error" onClick={handleCancel}>
                Sim, cancelar minha senha
              </Button>
            </Stack>
          </>
        )}

        {state === 'cancelling' && (
          <Box sx={{ py: 4 }}>
            <CircularProgress sx={{ mb: 2 }} />
            <Typography color="text.secondary">Cancelando sua senha...</Typography>
          </Box>
        )}

        {state === 'success' && (
          <>
            <CheckCircleIcon sx={{ fontSize: 64, color: 'success.main', mb: 2 }} />
            <Typography variant="h5" fontWeight={700} gutterBottom>Senha cancelada</Typography>
            {info && (
              <Typography variant="h3" fontWeight={700} color="text.disabled" sx={{ my: 2, textDecoration: 'line-through' }}>
                #{info.ticket_number}
              </Typography>
            )}
            <Typography color="text.secondary">{message}</Typography>
          </>
        )}

        {state === 'blocked' && (
          <>
            <ErrorOutlineIcon sx={{ fontSize: 64, color: 'warning.main', mb: 2 }} />
            <Typography variant="h5" fontWeight={700} gutterBottom>Cancelamento indisponível</Typography>
            {info && (
              <Typography variant="h4" fontWeight={700} color="primary" sx={{ my: 2 }}>
                #{info.ticket_number}
              </Typography>
            )}
            <Typography color="text.secondary">{message}</Typography>
          </>
        )}

        {state === 'error' && (
          <>
            <ErrorOutlineIcon sx={{ fontSize: 64, color: 'error.main', mb: 2 }} />
            <Typography variant="h5" fontWeight={700} gutterBottom>Não foi possível cancelar</Typography>
            <Typography color="text.secondary">{message}</Typography>
          </>
        )}
      </Paper>
    </Container>
  );
}
