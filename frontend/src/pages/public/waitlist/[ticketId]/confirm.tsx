/**
 * Public waitlist confirmation page — link sent in the "sua vaga abriu" email.
 * Route: /public/waitlist/[ticketId]/confirm
 *
 * Calls POST /api/v1/public/waitlist/{ticketId}/confirm on mount and shows
 * the result. No form — the confirmation itself is the action.
 */
'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/router';
import {
  Box,
  CircularProgress,
  Container,
  Paper,
  Typography,
} from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import { apiClient, extractApiErrorMessage } from '../../../../services/api_client';

type ConfirmState = 'loading' | 'success' | 'expired' | 'error';

export default function WaitlistConfirmPage() {
  const router = useRouter();
  const ticketId = router.query.ticketId as string;

  const [state, setState] = useState<ConfirmState>('loading');
  const [ticketNumber, setTicketNumber] = useState<string | null>(null);
  const [message, setMessage] = useState<string>('');

  const confirm = useCallback(async () => {
    if (!ticketId) return;
    try {
      const res = await apiClient.post(`/api/v1/public/waitlist/${ticketId}/confirm`);
      setTicketNumber(res.data.ticket_number);
      setMessage(res.data.message);
      setState('success');
    } catch (err) {
      const status = err && typeof err === 'object' ? (err as { status?: number }).status : undefined;
      if (status === 410) {
        setState('expired');
      } else {
        setState('error');
      }
      setMessage(extractApiErrorMessage(err, 'Não foi possível confirmar sua senha.'));
    }
  }, [ticketId]);

  useEffect(() => { confirm(); }, [confirm]);

  return (
    <Container maxWidth="sm" sx={{ py: 8 }}>
      <Paper sx={{ p: 4, textAlign: 'center', borderRadius: 2 }}>
        {state === 'loading' && (
          <Box sx={{ py: 4 }}>
            <CircularProgress sx={{ mb: 2 }} />
            <Typography color="text.secondary">Confirmando sua senha...</Typography>
          </Box>
        )}

        {state === 'success' && (
          <>
            <CheckCircleIcon sx={{ fontSize: 64, color: 'success.main', mb: 2 }} />
            <Typography variant="h5" fontWeight={700} gutterBottom>Senha confirmada!</Typography>
            {ticketNumber && (
              <Typography variant="h3" fontWeight={700} color="primary" sx={{ my: 2 }}>
                #{ticketNumber}
              </Typography>
            )}
            <Typography color="text.secondary">{message}</Typography>
          </>
        )}

        {state === 'expired' && (
          <>
            <ErrorOutlineIcon sx={{ fontSize: 64, color: 'warning.main', mb: 2 }} />
            <Typography variant="h5" fontWeight={700} gutterBottom>Prazo expirado</Typography>
            <Typography color="text.secondary">{message}</Typography>
          </>
        )}

        {state === 'error' && (
          <>
            <ErrorOutlineIcon sx={{ fontSize: 64, color: 'error.main', mb: 2 }} />
            <Typography variant="h5" fontWeight={700} gutterBottom>Não foi possível confirmar</Typography>
            <Typography color="text.secondary">{message}</Typography>
          </>
        )}
      </Paper>
    </Container>
  );
}
