/**
 * Public Gira Page — Direct link to a specific gira for ticket emission.
 * Route: /public/gira/[id]
 *
 * 3 states:
 *  1. Waiting — countdown until release_start_at
 *  2. Open — emit form
 *  3. Exhausted — all tickets taken or window closed
 */
'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/router';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Container,
  FormControl,
  FormControlLabel,
  FormLabel,
  Paper,
  Radio,
  RadioGroup,
  Snackbar,
  TextField,
  Typography,
} from '@mui/material';
import ConfirmationNumberIcon from '@mui/icons-material/ConfirmationNumber';
import EventIcon from '@mui/icons-material/Event';
import PlaceIcon from '@mui/icons-material/Place';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import BlockIcon from '@mui/icons-material/Block';
import StarIcon from '@mui/icons-material/Star';
import HourglassEmptyIcon from '@mui/icons-material/HourglassEmpty';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import { apiClient, extractApiErrorMessage } from '../../../services/api_client';
import PoweredByGiraHubFooter from '../../../components/shared/PoweredByGiraHubFooter';
import { useGiraCountdown, parseCountdownParts } from '../../../hooks/useGiraCountdown';
import {
  PRIORITY_CATEGORY_LABELS,
  PRIORITY_ORDER,
} from 'shared-types';

interface TimeSlotOption {
  id: string;
  horario: string; // "HH:MM"
  vagas_disponiveis: number;
}

interface GiraPublicData {
  id: string;
  nome: string;
  descricao?: string;
  data_inicio: string;
  local?: string;
  release_start_at: string | null;
  release_end_at: string | null;
  max_tickets: number | null;
  current_tickets: number;
  tickets_available: number;
  is_open: boolean;
  is_exhausted: boolean;
  waitlist_available: boolean;
  tenant_slug: string;
  tenant_name: string;
  logo_url?: string | null;
  primary_color?: string | null;
  secondary_color?: string | null;
  use_time_slots: boolean;
  time_slots: TimeSlotOption[];
}

function CountdownBlock({ seconds }: { seconds: number }) {
  const parts = parseCountdownParts(seconds);
  const blocks = [
    { label: 'Dias', value: parts.days },
    { label: 'Horas', value: parts.hours },
    { label: 'Min', value: parts.minutes },
    { label: 'Seg', value: parts.seconds },
  ];
  // Hide days block if 0
  const visible = parts.days > 0 ? blocks : blocks.slice(1);

  return (
    <Box sx={{ display: 'flex', gap: 1.5, justifyContent: 'center', my: 3 }}>
      {visible.map((b) => (
        <Box
          key={b.label}
          sx={{
            textAlign: 'center',
            minWidth: 64,
            p: 1.5,
            borderRadius: 2,
            bgcolor: 'primary.main',
            color: 'primary.contrastText',
          }}
        >
          <Typography variant="h4" fontWeight={700}>
            {String(b.value).padStart(2, '0')}
          </Typography>
          <Typography variant="caption">{b.label}</Typography>
        </Box>
      ))}
    </Box>
  );
}

export default function PublicGiraPage() {
  const router = useRouter();
  const giraId = router.query.id as string;
  const tipo = (router.query.tipo as string) || 'comum';
  const isSponsor = tipo === 'associado' || tipo === 'patrocinador';

  const [gira, setGira] = useState<GiraPublicData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Form
  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [telefone, setTelefone] = useState('');
  const [priorityCategory, setPriorityCategory] = useState<string>('none');
  const [selectedTimeSlotId, setSelectedTimeSlotId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Success
  const [success, setSuccess] = useState(false);
  const [ticketNumber, setTicketNumber] = useState<number | null>(null);
  const [waitlisted, setWaitlisted] = useState(false);
  const [waitlistPosition, setWaitlistPosition] = useState<number | null>(null);

  // Snackbar
  const [snack, setSnack] = useState<{ open: boolean; msg: string; sev: 'success' | 'error' }>({
    open: false, msg: '', sev: 'success',
  });

  const fetchGira = useCallback(async () => {
    if (!giraId) return;
    try {
      setLoading(true);
      const res = await apiClient.get(`/api/v1/public/gira/${giraId}?tipo=${tipo}`);
      setGira(res.data);
      setError(null);
    } catch (err) {
      setError(extractApiErrorMessage(err, 'Gira não encontrada'));
    } finally {
      setLoading(false);
    }
  }, [giraId, tipo]);

  useEffect(() => { fetchGira(); }, [fetchGira]);

  // Countdown hook — safe defaults when gira hasn't loaded
  const countdown = useGiraCountdown(
    gira?.release_start_at || '',
    gira?.release_end_at || '',
  );

  // Determine state
  const hasRelease = gira?.release_start_at && gira?.release_end_at;
  const isWaiting = hasRelease && countdown.status === 'upcoming';
  const waitlistMode = Boolean(gira?.is_exhausted && gira?.waitlist_available);
  const isOpen = hasRelease && countdown.status === 'open' && (!gira?.is_exhausted || waitlistMode);
  const isExhausted = (gira?.is_exhausted && !waitlistMode) || (hasRelease && countdown.status === 'closed');
  const notConfigured = gira && !hasRelease;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!gira) return;
    if (gira.use_time_slots && !selectedTimeSlotId) return;
    setSubmitting(true);
    try {
      const res = await apiClient.post(`/api/v1/public/emit-ticket?tenant_slug=${gira.tenant_slug}&tipo=${tipo}`, {
        name: nome,
        email,
        phone: telefone,
        priority_category: priorityCategory === 'none' ? null : priorityCategory,
        time_slot_id: gira.use_time_slots ? selectedTimeSlotId : null,
      });
      setSuccess(true);
      setTicketNumber(res.data.numero ?? res.data.ticket_number ?? null);
      setWaitlisted(Boolean(res.data.waitlisted));
      setWaitlistPosition(res.data.waitlist_position ?? null);
      // Refresh gira data to update counts
      fetchGira();
    } catch (err) {
      const msg = extractApiErrorMessage(err, 'Erro ao emitir senha');
      setSnack({ open: true, msg, sev: 'error' });
      // Horário pode ter lotado entre a seleção e o envio — atualiza as vagas.
      if (gira.use_time_slots) {
        setSelectedTimeSlotId(null);
        fetchGira();
      }
    } finally {
      setSubmitting(false);
    }
  };

  // --- Render ---
  if (loading) {
    return (
      <Container maxWidth="sm" sx={{ py: 8, textAlign: 'center' }}>
        <CircularProgress />
      </Container>
    );
  }

  if (error || !gira) {
    return (
      <Container maxWidth="sm" sx={{ py: 8, textAlign: 'center' }}>
        <BlockIcon sx={{ fontSize: 64, color: 'text.disabled', mb: 2 }} />
        <Typography variant="h5" gutterBottom>Gira não encontrada</Typography>
        <Typography color="text.secondary">{error || 'Verifique o link e tente novamente.'}</Typography>
      </Container>
    );
  }

  const brandPrimary = gira.primary_color || '#2E7D32';
  const brandSecondary = gira.secondary_color || '#1565C0';

  return (
    <Container maxWidth="sm" sx={{ py: 4 }}>
      {/* Header */}
      <Paper elevation={0} sx={{ p: 3, mb: 3, textAlign: 'center', borderRadius: 3, ...(isSponsor ? { background: 'linear-gradient(135deg, #daa520 0%, #f5c842 50%, #b8860b 100%)', color: '#3e2723' } : { background: `linear-gradient(135deg, ${brandPrimary} 0%, ${brandSecondary} 100%)`, color: '#fff' }) }}>
        {gira.logo_url && !isSponsor && (
          <Box
            component="img"
            src={gira.logo_url}
            alt={gira.tenant_name}
            sx={{
              width: 72,
              height: 72,
              objectFit: 'cover',
              borderRadius: 2.5,
              mb: 2,
              border: '1px solid rgba(255,255,255,0.28)',
              backgroundColor: 'rgba(255,255,255,0.18)',
            }}
          />
        )}
        <Typography variant="overline" sx={isSponsor ? { color: '#4e342e' } : {}}>{gira.tenant_name}</Typography>
        <Typography variant="h4" fontWeight={700} sx={{ mt: 0.5, ...(isSponsor && { color: '#3e2723' }) }}>{gira.nome}</Typography>
        {isSponsor && (
          <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, mt: 1, px: 2, py: 0.5, borderRadius: 2, bgcolor: 'rgba(62,39,35,0.15)' }}>
            <StarIcon sx={{ fontSize: 18, color: '#3e2723' }} />
            <Typography variant="body2" fontWeight={600} sx={{ color: '#3e2723' }}>Senha Associado</Typography>
          </Box>
        )}
        {gira.descricao && (
          <Typography variant="body1" sx={{ mt: 1, opacity: 0.9, ...(isSponsor && { color: '#4e342e' }) }}>{gira.descricao}</Typography>
        )}
        <Box sx={{ display: 'flex', justifyContent: 'center', gap: 3, mt: 2, flexWrap: 'wrap', ...(isSponsor && { color: '#4e342e' }) }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <EventIcon fontSize="small" />
            <Typography variant="body2">
              {new Date(gira.data_inicio).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}
            </Typography>
          </Box>
          {gira.local && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <PlaceIcon fontSize="small" />
              <Typography variant="body2">{gira.local}</Typography>
            </Box>
          )}
        </Box>
      </Paper>

      {/* Not configured */}
      {notConfigured && (
        <Paper sx={{ p: 4, textAlign: 'center', borderRadius: 2 }}>
          <BlockIcon sx={{ fontSize: 48, color: 'text.disabled', mb: 2 }} />
          <Typography variant="h6">Emissão de senhas ainda não configurada</Typography>
          <Typography color="text.secondary" sx={{ mt: 1 }}>
            Aguarde o terreiro configurar a liberação de senhas para esta gira.
          </Typography>
        </Paper>
      )}

      {/* State 1: Waiting — countdown */}
      {isWaiting && (
        <Paper sx={{ p: 4, textAlign: 'center', borderRadius: 2 }}>
          <Typography variant="h6" gutterBottom>Emissão abre em</Typography>
          <CountdownBlock seconds={countdown.timeRemaining} />
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            As senhas serão liberadas em{' '}
            {new Date(gira.release_start_at!).toLocaleDateString('pt-BR', {
              day: '2-digit', month: 'long', hour: '2-digit', minute: '2-digit',
            })}
          </Typography>
          {gira.max_tickets && (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              {gira.max_tickets} senhas disponíveis
            </Typography>
          )}
        </Paper>
      )}

      {/* State 2: Open — form (or fila de espera, quando lotado mas com fila habilitada) */}
      {isOpen && !success && (
        <Paper sx={{ p: 3, borderRadius: 2 }}>
          <Typography variant="h6" gutterBottom>
            {waitlistMode ? 'Entrar na fila de espera' : (isSponsor ? 'Emitir Senha Associado' : 'Emitir Senha')}
          </Typography>

          {waitlistMode && (
            <Alert severity="info" icon={<HourglassEmptyIcon />} sx={{ mb: 2 }}>
              As senhas desta gira já foram todas emitidas. Preencha seus dados para entrar
              na fila de espera — se alguma senha for cancelada, avisaremos por e-mail.
            </Alert>
          )}

          {gira.use_time_slots && !waitlistMode && (
            <Box sx={{ mb: 3 }}>
              <FormLabel component="legend" sx={{ fontSize: 14, mb: 1, display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <AccessTimeIcon fontSize="small" /> Escolha o horário que pretende ser atendido
              </FormLabel>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                {gira.time_slots.map((slot) => {
                  const full = slot.vagas_disponiveis <= 0;
                  const selected = selectedTimeSlotId === slot.id;
                  return (
                    <Button
                      key={slot.id}
                      variant={selected ? 'contained' : 'outlined'}
                      disabled={full}
                      onClick={() => setSelectedTimeSlotId(slot.id)}
                      sx={{ flexDirection: 'column', minWidth: 84, lineHeight: 1.2, py: 1 }}
                    >
                      <Typography variant="body2" fontWeight={700}>{slot.horario}</Typography>
                      <Typography variant="caption" sx={{ opacity: 0.8 }}>
                        {full ? 'Esgotado' : `${slot.vagas_disponiveis} vaga${slot.vagas_disponiveis === 1 ? '' : 's'}`}
                      </Typography>
                    </Button>
                  );
                })}
              </Box>
              {gira.time_slots.length === 0 && (
                <Typography variant="body2" color="text.secondary">
                  Nenhum horário disponível no momento.
                </Typography>
              )}
            </Box>
          )}

          <Box component="form" onSubmit={handleSubmit} sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <TextField
              label="Nome completo"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              required
              fullWidth
            />
            <TextField
              label="E-mail"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              fullWidth
            />
            <TextField
              label="Telefone (WhatsApp)"
              value={telefone}
              onChange={(e) => setTelefone(e.target.value)}
              fullWidth
              placeholder="(11) 99999-9999"
            />
            <FormControl component="fieldset" sx={{ mt: 1 }}>
              <FormLabel
                component="legend"
                sx={{ fontSize: 14, mb: 0.5 }}
                id="priority-category-label"
              >
                Atendimento preferencial
              </FormLabel>
              <RadioGroup
                aria-labelledby="priority-category-label"
                value={priorityCategory}
                onChange={(e) => setPriorityCategory(e.target.value)}
              >
                <FormControlLabel
                  value="none"
                  control={<Radio size="small" />}
                  label={<Typography variant="body2">Não sou de grupo prioritário</Typography>}
                />
                {PRIORITY_ORDER.map((cat) => (
                  <FormControlLabel
                    key={cat}
                    value={cat}
                    control={<Radio size="small" />}
                    label={<Typography variant="body2">{PRIORITY_CATEGORY_LABELS[cat]}</Typography>}
                  />
                ))}
              </RadioGroup>
              <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block', lineHeight: 1.4 }}>
                O atendimento preferencial obedece à Lei nº 10.048/2000 (idosos, gestantes, lactantes, pessoas com deficiência e mobilidade reduzida) e à Lei nº 13.146/2015 (Estatuto da Pessoa com Deficiência).
              </Typography>
            </FormControl>
            <Button
              type="submit"
              variant="contained"
              size="large"
              disabled={submitting || !nome.trim() || !email.trim() || (gira.use_time_slots && !waitlistMode && !selectedTimeSlotId)}
              startIcon={submitting ? <CircularProgress size={20} color="inherit" /> : (waitlistMode ? <HourglassEmptyIcon /> : <ConfirmationNumberIcon />)}
              sx={isSponsor ? { bgcolor: '#daa520', color: '#3e2723', fontWeight: 700, '&:hover': { bgcolor: '#b8860b' }, '&.Mui-disabled': { bgcolor: '#daa52080', color: '#3e2723' } } : {}}
            >
              {submitting ? 'Enviando...' : (waitlistMode ? 'Entrar na fila de espera' : 'Emitir Senha')}
            </Button>
          </Box>

          {/* Countdown to close */}
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', textAlign: 'center', mt: 2 }}>
            Emissão encerra em {Math.floor(countdown.timeRemaining / 60)} minutos
          </Typography>
        </Paper>
      )}

      {/* Success state */}
      {success && !waitlisted && (
        <Paper sx={{ p: 4, textAlign: 'center', borderRadius: 2 }}>
          <CheckCircleIcon sx={{ fontSize: 64, color: 'success.main', mb: 2 }} />
          <Typography variant="h5" fontWeight={700} gutterBottom>Senha emitida!</Typography>
          {ticketNumber && (
            <Typography variant="h3" fontWeight={700} color="primary" sx={{ my: 2 }}>
              #{ticketNumber}
            </Typography>
          )}
          <Typography color="text.secondary">
            Enviamos os detalhes para <strong>{email}</strong>.
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            Guarde este número. Apresente-o no dia da gira.
          </Typography>
        </Paper>
      )}

      {/* Success state — entrou na fila de espera */}
      {success && waitlisted && (
        <Paper sx={{ p: 4, textAlign: 'center', borderRadius: 2 }}>
          <HourglassEmptyIcon sx={{ fontSize: 64, color: 'warning.main', mb: 2 }} />
          <Typography variant="h5" fontWeight={700} gutterBottom>Você está na fila de espera!</Typography>
          {waitlistPosition && (
            <Typography variant="h3" fontWeight={700} color="warning.main" sx={{ my: 2 }}>
              {waitlistPosition}º
            </Typography>
          )}
          <Typography color="text.secondary">
            Enviamos os detalhes para <strong>{email}</strong>.
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            Se uma senha oficial for cancelada, você será avisado por e-mail para confirmar a sua.
          </Typography>
        </Paper>
      )}

      {/* State 3: Exhausted / Closed */}
      {isExhausted && !success && (
        <Paper sx={{ p: 4, textAlign: 'center', borderRadius: 2 }}>
          <BlockIcon sx={{ fontSize: 48, color: 'error.main', mb: 2 }} />
          <Typography variant="h6" gutterBottom>
            {gira.is_exhausted ? 'Senhas esgotadas' : 'Emissão encerrada'}
          </Typography>
          <Typography color="text.secondary">
            {gira.is_exhausted
              ? 'Todas as senhas para esta gira já foram emitidas.'
              : 'O período de emissão de senhas para esta gira já foi encerrado.'}
          </Typography>
        </Paper>
      )}

      <PoweredByGiraHubFooter />

      {/* Snackbar */}
      <Snackbar
        open={snack.open}
        autoHideDuration={5000}
        onClose={() => setSnack((prev) => ({ ...prev, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity={snack.sev} variant="filled" onClose={() => setSnack((prev) => ({ ...prev, open: false }))}>
          {snack.msg}
        </Alert>
      </Snackbar>
    </Container>
  );
}
