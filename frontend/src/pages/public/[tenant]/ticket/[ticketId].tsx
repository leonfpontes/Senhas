/**
 * Bilhete do consulente — destino do link "Para resgatar sua senha" dos
 * e-mails de emissão, reenvio e promoção da fila de espera.
 * Route: /public/[tenant]/ticket/[ticketId]
 *
 * Só leitura: GET /api/v1/public/{tenant}/ticket/{ticketId}. O slug na URL
 * amarra a senha ao terreiro (slug errado = 404). Mostra o que a pessoa precisa
 * no dia: número grande, gira, data e horário, endereço com "Como chegar",
 * recados, acompanhantes; e as ações "Adicionar à agenda" (.ics gerado aqui) e
 * "Cancelar minha senha" (página de cancelamento já existente).
 */
import React, { useCallback, useEffect, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Container,
  Paper,
  Stack,
  Typography,
} from '@mui/material';
import EventAvailableIcon from '@mui/icons-material/EventAvailable';
import PlaceIcon from '@mui/icons-material/Place';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import { apiClient, extractApiErrorMessage } from '../../../../services/api_client';

type PageState = 'loading' | 'ready' | 'notfound' | 'error';

interface Acompanhante {
  ticket_number: string;
  name: string;
}

export interface PublicTicket {
  ticket_number: string;
  status: string;
  status_label: string;
  waitlisted: boolean;
  cancellable: boolean;
  cancel_reason: string | null;
  gira_name: string;
  gira_date: string;
  gira_date_iso: string | null;
  gira_local: string | null;
  horario: string | null;
  recados: string | null;
  tenant_name: string;
  tenant_slug: string;
  tenant_address: string | null;
  maps_url: string | null;
  tenant_logo_url: string | null;
  primary_color: string | null;
  secondary_color: string | null;
  consulente_name: string;
  acompanhantes: Acompanhante[];
}

const DONE_STATUSES = new Set(['cancelled', 'no_show', 'waitlist_expired', 'completed']);

/** "quinta-feira, 8 de outubro às 19h" a partir do ISO; cai no texto do backend se faltar. */
export function formatGiraDate(iso: string | null, fallback: string): string {
  if (!iso) return fallback;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return fallback;
  const dia = new Intl.DateTimeFormat('pt-BR', {
    weekday: 'long', day: 'numeric', month: 'long', timeZone: 'America/Sao_Paulo',
  }).format(d);
  const hora = new Intl.DateTimeFormat('pt-BR', {
    hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo',
  }).format(d).replace(':00', 'h').replace(':', 'h');
  return `${dia.charAt(0).toUpperCase()}${dia.slice(1)} às ${hora}`;
}

/** Evento .ics de 2h começando na gira (ou no horário escolhido, se houver). */
export function buildIcs(t: PublicTicket): string | null {
  if (!t.gira_date_iso) return null;
  const start = new Date(t.gira_date_iso);
  if (Number.isNaN(start.getTime())) return null;
  if (t.horario) {
    // Horário escolhido é no fuso de Brasília (UTC-3 fixo desde 2019): troca só a hora, mantém o dia da gira.
    const ymd = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(start);
    const chosen = new Date(`${ymd}T${t.horario}:00-03:00`);
    if (!Number.isNaN(chosen.getTime())) start.setTime(chosen.getTime());
  }
  const end = new Date(start.getTime() + 2 * 60 * 60 * 1000);
  const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/[,;]/g, (c) => `\\${c}`);
  const location = [t.gira_local, t.tenant_address].filter(Boolean).join(' · ');
  const description = [`Senha ${t.ticket_number}`, t.recados].filter(Boolean).join('\n');
  return [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//GiraHub//Senha//PT', 'BEGIN:VEVENT',
    `UID:${t.tenant_slug}-${t.ticket_number}-${stamp(start)}@girahub`,
    `DTSTAMP:${stamp(new Date())}`, `DTSTART:${stamp(start)}`, `DTEND:${stamp(end)}`,
    `SUMMARY:${esc(`${t.gira_name} — ${t.tenant_name}`)}`,
    location ? `LOCATION:${esc(location)}` : '',
    `DESCRIPTION:${esc(description)}`,
    'END:VEVENT', 'END:VCALENDAR',
  ].filter(Boolean).join('\r\n');
}

export default function PublicTicketPage() {
  const router = useRouter();
  const tenant = router.query.tenant as string | undefined;
  const ticketId = router.query.ticketId as string | undefined;

  const [state, setState] = useState<PageState>('loading');
  const [ticket, setTicket] = useState<PublicTicket | null>(null);
  const [message, setMessage] = useState('');

  const load = useCallback(async () => {
    if (!tenant || !ticketId) return;
    setState('loading');
    try {
      const res = await apiClient.get<PublicTicket>(`/api/v1/public/${tenant}/ticket/${ticketId}`);
      setTicket(res.data);
      setState('ready');
    } catch (err) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      if (status === 404) {
        setState('notfound');
        return;
      }
      setMessage(extractApiErrorMessage(err, 'Não foi possível carregar sua senha. Verifique a conexão e tente de novo.'));
      setState('error');
    }
  }, [tenant, ticketId]);

  useEffect(() => { load(); }, [load]);

  const handleIcs = () => {
    if (!ticket) return;
    const ics = buildIcs(ticket);
    if (!ics) return;
    const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `senha-${ticket.ticket_number}.ics`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const accent = ticket?.primary_color || undefined;
  const isDone = ticket ? DONE_STATUSES.has(ticket.status) : false;
  const title = ticket ? `Senha ${ticket.ticket_number} · ${ticket.tenant_name}` : 'Sua senha';

  return (
    <>
      <Head><title>{title}</title><meta name="robots" content="noindex" /></Head>
      <Container maxWidth="sm" sx={{ py: { xs: 3, sm: 6 }, px: 2 }}>
        <Paper sx={{ p: { xs: 3, sm: 4 }, borderRadius: 3 }}>
          {state === 'loading' && (
            <Box sx={{ py: 6, textAlign: 'center' }} role="status" aria-live="polite">
              <CircularProgress sx={{ mb: 2 }} />
              <Typography color="text.secondary">Buscando sua senha...</Typography>
            </Box>
          )}

          {state === 'notfound' && (
            <Box sx={{ textAlign: 'center' }}>
              <ErrorOutlineIcon sx={{ fontSize: 56, color: 'warning.main', mb: 1 }} />
              <Typography variant="h5" fontWeight={700} gutterBottom>Senha não encontrada</Typography>
              <Typography color="text.secondary" sx={{ mb: 3 }}>
                O link pode estar incompleto ou a senha pode ter sido removida. Se precisar, peça uma nova pelo link do terreiro.
              </Typography>
              {tenant && (
                <Button component={Link} href={`/public/${tenant}`} variant="contained" fullWidth sx={{ minHeight: 48 }}>
                  Ver próximas giras do terreiro
                </Button>
              )}
            </Box>
          )}

          {state === 'error' && (
            <Box sx={{ textAlign: 'center' }}>
              <ErrorOutlineIcon sx={{ fontSize: 56, color: 'error.main', mb: 1 }} />
              <Typography variant="h5" fontWeight={700} gutterBottom>Não foi possível carregar</Typography>
              <Typography color="text.secondary" sx={{ mb: 3 }}>{message}</Typography>
              <Button onClick={load} variant="contained" fullWidth sx={{ minHeight: 48 }}>Tentar de novo</Button>
            </Box>
          )}

          {state === 'ready' && ticket && (
            <Stack spacing={2.5}>
              <Stack direction="row" spacing={1.5} alignItems="center">
                {ticket.tenant_logo_url && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={ticket.tenant_logo_url} alt="" width={40} height={40} style={{ borderRadius: 8, objectFit: 'cover' }} />
                )}
                <Box sx={{ minWidth: 0 }}>
                  <Typography variant="overline" color="text.secondary" sx={{ lineHeight: 1.2, display: 'block' }}>Sua senha</Typography>
                  <Typography fontWeight={700} noWrap>{ticket.tenant_name}</Typography>
                </Box>
              </Stack>

              <Box sx={{ textAlign: 'center', py: 1 }}>
                <Typography
                  component="p"
                  data-testid="ticket-number"
                  sx={{
                    fontSize: { xs: '4rem', sm: '5rem' }, lineHeight: 1, fontWeight: 800,
                    fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em',
                    color: isDone ? 'text.disabled' : accent || 'primary.main',
                    textDecoration: ticket.status === 'cancelled' ? 'line-through' : 'none',
                  }}
                >
                  {ticket.ticket_number}
                </Typography>
                {ticket.status !== 'emitted' && (
                  <Chip
                    label={ticket.status_label}
                    color={isDone ? 'default' : ticket.waitlisted ? 'warning' : 'info'}
                    size="small"
                    sx={{ mt: 1.5, fontWeight: 700 }}
                  />
                )}
              </Box>

              {ticket.waitlisted && (
                <Alert severity="warning">
                  Você está na fila de espera. Se abrir uma vaga, avisamos por e-mail com um prazo para confirmar.
                </Alert>
              )}

              <Box>
                <Typography variant="h6" fontWeight={700} sx={{ textWrap: 'balance' }}>{ticket.gira_name}</Typography>
                <Typography color="text.primary">{formatGiraDate(ticket.gira_date_iso, ticket.gira_date)}</Typography>
                {ticket.horario && (
                  <Typography color="text.secondary">Seu horário de atendimento: {ticket.horario}</Typography>
                )}
                {ticket.consulente_name && (
                  <Typography color="text.secondary">Em nome de {ticket.consulente_name}</Typography>
                )}
              </Box>

              {(ticket.tenant_address || ticket.gira_local) && (
                <Stack direction="row" spacing={1} alignItems="flex-start">
                  <PlaceIcon fontSize="small" sx={{ mt: 0.25, color: 'text.secondary' }} />
                  <Box sx={{ minWidth: 0 }}>
                    {ticket.gira_local && <Typography>{ticket.gira_local}</Typography>}
                    {ticket.tenant_address && <Typography color="text.secondary">{ticket.tenant_address}</Typography>}
                    {ticket.maps_url && (
                      <Typography component="a" href={ticket.maps_url} target="_blank" rel="noopener noreferrer" sx={{ fontWeight: 600 }}>
                        Como chegar
                      </Typography>
                    )}
                  </Box>
                </Stack>
              )}

              {ticket.recados && (
                <Alert severity="info" icon={false} sx={{ whiteSpace: 'pre-line' }}>
                  <Typography variant="subtitle2" fontWeight={700} gutterBottom>Recados do terreiro</Typography>
                  {ticket.recados}
                </Alert>
              )}

              {ticket.acompanhantes.length > 0 && (
                <Box>
                  <Typography variant="subtitle2" fontWeight={700}>Acompanhantes</Typography>
                  {ticket.acompanhantes.map((a) => (
                    <Typography key={a.ticket_number} color="text.secondary">
                      {a.ticket_number} · {a.name}
                    </Typography>
                  ))}
                </Box>
              )}

              {!isDone && (
                <Stack spacing={1.5}>
                  {ticket.gira_date_iso && (
                    <Button onClick={handleIcs} variant="contained" startIcon={<EventAvailableIcon />} fullWidth sx={{ minHeight: 48 }}>
                      Adicionar à agenda
                    </Button>
                  )}
                  {ticket.cancellable && (
                    <Button component={Link} href={`/public/ticket/${ticketId}/cancelar`} variant="outlined" color="inherit" fullWidth sx={{ minHeight: 48 }}>
                      Não vou poder ir: cancelar minha senha
                    </Button>
                  )}
                </Stack>
              )}

              <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center' }}>
                Na entrada, informe o número {ticket.ticket_number} à equipe.
                {' '}
                <Link href={`/public/${ticket.tenant_slug}`}>Ver próximas giras</Link>
              </Typography>
            </Stack>
          )}
        </Paper>
      </Container>
    </>
  );
}
