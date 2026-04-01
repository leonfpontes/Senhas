/**
 * Admin Email Tracking Page
 * Route: /admin/tickets/[ticketId]/email
 */
import React, { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/router';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Divider,
  IconButton,
  Snackbar,
  Stack,
  Tooltip,
  Typography,
  useTheme,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import RefreshIcon from '@mui/icons-material/Refresh';
import SendIcon from '@mui/icons-material/Send';
import AdminLayout from '../../admin_layout';
import { apiClient } from '../../../../services/api_client';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface EmailStatus {
  ticket_id: string;
  ticket_numero: number;
  consulente_nome?: string;
  consulente_email?: string;
  ticket_status: string;
  email_sent_at?: string;
  email_provider?: string;
  resend_id?: string;
  resend_status?: string;
  resend_html?: string;
  resend_subject?: string;
  resend_created_at?: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const RESEND_STATUS_MAP: Record<
  string,
  { label: string; color: 'success' | 'error' | 'warning' | 'info' | 'default' }
> = {
  delivered:        { label: 'Entregue',           color: 'success' },
  opened:           { label: 'Aberto',              color: 'success' },
  clicked:          { label: 'Link clicado',        color: 'success' },
  sent:             { label: 'Enviado',              color: 'info' },
  delivery_delayed: { label: 'Atraso na entrega',   color: 'warning' },
  bounced:          { label: 'Bounce (não entregue)', color: 'error' },
  complained:       { label: 'Marcado como spam',   color: 'error' },
};

const TICKET_STATUS_MAP: Record<string, string> = {
  emitted:   'Emitido',
  called:    'Chamado',
  completed: 'Finalizado',
  cancelled: 'Cancelado',
  no_show:   'Não compareceu',
};

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function TicketEmailPage() {
  return (
    <AdminLayout title="Rastreio de E-mail">
      <TicketEmailContent />
    </AdminLayout>
  );
}

// ---------------------------------------------------------------------------
// Content
// ---------------------------------------------------------------------------

function TicketEmailContent() {
  const router = useRouter();
  const theme = useTheme();
  const { ticketId } = router.query as { ticketId?: string };

  const [data, setData] = useState<EmailStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [resending, setResending] = useState(false);
  const [snackbar, setSnackbar] = useState<{
    open: boolean;
    message: string;
    severity: 'success' | 'error';
  }>({ open: false, message: '', severity: 'success' });

  const closeSnackbar = () => setSnackbar((s) => ({ ...s, open: false }));

  const fetchStatus = useCallback(async () => {
    if (!ticketId) return;
    setLoading(true);
    try {
      const res = await apiClient.get<EmailStatus>(
        `/api/v1/admin/tickets/${ticketId}/email-status`,
      );
      setData(res.data);
    } catch {
      setSnackbar({
        open: true,
        message: 'Erro ao carregar status do e-mail.',
        severity: 'error',
      });
    } finally {
      setLoading(false);
    }
  }, [ticketId]);

  useEffect(() => {
    if (ticketId) {
      fetchStatus();
    }
  }, [ticketId, fetchStatus]);

  const handleResend = async () => {
    if (!ticketId) return;
    setResending(true);
    try {
      await apiClient.post(`/api/v1/admin/tickets/${ticketId}/resend-email`);
      setSnackbar({ open: true, message: 'E-mail reenviado com sucesso!', severity: 'success' });
      // Delay refresh to allow worker to process
      setTimeout(() => fetchStatus(), 3500);
    } catch {
      setSnackbar({ open: true, message: 'Erro ao reenviar e-mail.', severity: 'error' });
    } finally {
      setResending(false);
    }
  };

  // ------------------------------------------------------------------
  // Loading / empty states
  // ------------------------------------------------------------------

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight={240}>
        <CircularProgress />
      </Box>
    );
  }

  if (!data) {
    return (
      <Box p={3}>
        <Alert severity="error">Ticket não encontrado.</Alert>
        <Button
          startIcon={<ArrowBackIcon />}
          onClick={() => router.push('/admin/tickets')}
          sx={{ mt: 2 }}
        >
          Voltar
        </Button>
      </Box>
    );
  }

  // ------------------------------------------------------------------
  // Derived values
  // ------------------------------------------------------------------

  const ticketLabel = `#${String(data.ticket_numero).padStart(4, '0')}`;
  const resendStatusInfo = data.resend_status
    ? (RESEND_STATUS_MAP[data.resend_status] ?? {
        label: data.resend_status,
        color: 'default' as const,
      })
    : null;

  const emailSentDate = data.email_sent_at
    ? new Date(data.email_sent_at).toLocaleString('pt-BR', {
        dateStyle: 'short',
        timeStyle: 'medium',
      })
    : null;

  // ------------------------------------------------------------------
  // Render
  // ------------------------------------------------------------------

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 860, mx: 'auto' }}>
      {/* Header row */}
      <Stack direction="row" alignItems="center" spacing={1} mb={3}>
        <Tooltip title="Voltar para Tickets">
          <IconButton size="small" onClick={() => router.push('/admin/tickets')}>
            <ArrowBackIcon />
          </IconButton>
        </Tooltip>
        <Typography variant="h6" fontWeight={600}>
          E-mail — Senha {ticketLabel}
        </Typography>
        <Box flex={1} />
        <Tooltip title="Atualizar status">
          <IconButton size="small" onClick={fetchStatus} disabled={loading}>
            <RefreshIcon />
          </IconButton>
        </Tooltip>
      </Stack>

      <Stack spacing={2}>
        {/* ---- Ticket info ---- */}
        <Card variant="outlined">
          <CardContent>
            <Typography
              variant="overline"
              color="text.secondary"
              display="block"
              gutterBottom
            >
              Ticket
            </Typography>
            <InfoRow label="Número" value={ticketLabel} />
            <Divider sx={{ my: 1 }} />
            <InfoRow label="Consulente" value={data.consulente_nome ?? '—'} />
            <Divider sx={{ my: 1 }} />
            <InfoRow label="E-mail" value={data.consulente_email ?? '—'} />
            <Divider sx={{ my: 1 }} />
            <InfoRow
              label="Status do ticket"
              value={
                <Chip
                  label={TICKET_STATUS_MAP[data.ticket_status] ?? data.ticket_status}
                  size="small"
                  color={data.ticket_status === 'completed' ? 'success' : 'default'}
                />
              }
            />
          </CardContent>
        </Card>

        {/* ---- Email status ---- */}
        <Card variant="outlined">
          <CardContent>
            <Stack direction="row" justifyContent="space-between" alignItems="center" mb={2}>
              <Typography variant="overline" color="text.secondary">
                Status do E-mail
              </Typography>
              {data.consulente_email && (
                <Button
                  variant="contained"
                  size="small"
                  startIcon={<SendIcon />}
                  onClick={handleResend}
                  disabled={resending}
                >
                  {resending ? 'Reenviando…' : 'Reenviar'}
                </Button>
              )}
            </Stack>

            {!data.consulente_email ? (
              <Alert severity="warning">
                Consulente sem endereço de e-mail cadastrado.
              </Alert>
            ) : !data.email_sent_at ? (
              <Alert severity="info">
                Nenhum e-mail enviado registrado para este ticket.
              </Alert>
            ) : data.email_provider === 'failed' ? (
              <Alert severity="error">
                Falha no envio — tanto Resend quanto Brevo retornaram erro. Clique em
                &quot;Reenviar&quot; para tentar novamente.
              </Alert>
            ) : (
              <Stack>
                <InfoRow label="Enviado em" value={emailSentDate ?? '—'} />
                <Divider sx={{ my: 1 }} />
                <InfoRow
                  label="Provedor"
                  value={
                    <Chip
                      label={
                        data.email_provider === 'resend'
                          ? 'Resend'
                          : data.email_provider === 'brevo'
                          ? 'Brevo'
                          : data.email_provider ?? '—'
                      }
                      size="small"
                      variant="outlined"
                    />
                  }
                />

                {data.email_provider === 'resend' && (
                  <>
                    <Divider sx={{ my: 1 }} />
                    <InfoRow
                      label="Status Resend"
                      value={
                        resendStatusInfo ? (
                          <Chip
                            label={resendStatusInfo.label}
                            size="small"
                            color={resendStatusInfo.color}
                          />
                        ) : (
                          <Typography variant="body2" color="text.secondary">
                            Aguardando evento…
                          </Typography>
                        )
                      }
                    />
                    {data.resend_subject && (
                      <>
                        <Divider sx={{ my: 1 }} />
                        <InfoRow label="Assunto" value={data.resend_subject} />
                      </>
                    )}
                  </>
                )}

                {data.email_provider === 'brevo' && (
                  <Alert severity="info" sx={{ mt: 1.5 }}>
                    Enviado via Brevo — rastreio detalhado indisponível.
                  </Alert>
                )}
              </Stack>
            )}
          </CardContent>
        </Card>

        {/* ---- HTML preview ---- */}
        {data.resend_html && (
          <Card variant="outlined">
            <CardContent>
              <Typography
                variant="overline"
                color="text.secondary"
                display="block"
                gutterBottom
              >
                Prévia do E-mail
              </Typography>
              <Box
                component="iframe"
                srcDoc={data.resend_html}
                title="Prévia do e-mail enviado"
                sx={{
                  width: '100%',
                  minHeight: 520,
                  border: `1px solid ${theme.palette.divider}`,
                  borderRadius: 1,
                  mt: 1,
                  display: 'block',
                }}
                sandbox="allow-same-origin"
              />
            </CardContent>
          </Card>
        )}
      </Stack>

      <Snackbar
        open={snackbar.open}
        autoHideDuration={4500}
        onClose={closeSnackbar}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity={snackbar.severity} onClose={closeSnackbar}>
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}

// ---------------------------------------------------------------------------
// Helper component
// ---------------------------------------------------------------------------

function InfoRow({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <Stack direction="row" justifyContent="space-between" alignItems="center" py={0.5}>
      <Typography variant="body2" color="text.secondary">
        {label}
      </Typography>
      {typeof value === 'string' || typeof value === 'number' ? (
        <Typography variant="body2">{value}</Typography>
      ) : (
        value
      )}
    </Stack>
  );
}
