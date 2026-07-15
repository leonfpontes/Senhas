/**
 * Modo Kiosk / TV — exibição fullscreen da fila da porta.
 * Sem sidebar/topbar; fundo escuro e fonte grande para telas de espera.
 * Rota: /admin/porta/kiosk?gira=<id>  (gira opcional; usa a ativa por padrão)
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import { Box, Typography, CircularProgress } from '@mui/material';
import { apiClient } from '../../../services/api_client';

const POLLING_INTERVAL_MS = 8000;

interface Gira { id: string; nome: string; data_inicio: string; is_active: boolean; }
interface QueueItem {
  id: string;
  numero: number;
  status: string;
  consulente_nome: string | null;
  preferencial: boolean;
  is_sponsor: boolean;
  numero_formatado: string;
  checkin_em: string | null;
}

export default function PortaKioskPage() {
  const router = useRouter();
  const [giraId, setGiraId] = useState<string>('');
  const [giraNome, setGiraNome] = useState<string>('');
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const prevNextRef = useRef<string | null>(null);

  // Resolve a gira (query param ou a ativa mais recente)
  const loadGiras = useCallback(async () => {
    try {
      const res = await apiClient.get('/api/v1/admin/giras');
      const all: Gira[] = Array.isArray(res.data) ? res.data : res.data.items || [];
      const queryGira = typeof router.query.gira === 'string' ? router.query.gira : '';
      const chosen = queryGira
        ? all.find((g) => g.id === queryGira)
        : all.find((g) => g.is_active) || all[0];
      if (chosen) {
        setGiraId(chosen.id);
        setGiraNome(chosen.nome);
      }
    } catch {
      /* silent */
    }
  }, [router.query.gira]);

  const loadQueue = useCallback(async () => {
    if (!giraId) return;
    try {
      const res = await apiClient.get(`/api/v1/admin/giras/${giraId}/door/queue`);
      setQueue(res.data.items || []);
    } catch {
      /* retry on next poll */
    } finally {
      setLoading(false);
    }
  }, [giraId]);

  useEffect(() => { loadGiras(); }, [loadGiras]);
  useEffect(() => { if (giraId) loadQueue(); }, [giraId, loadQueue]);
  useEffect(() => {
    if (!giraId) return;
    const t = setInterval(loadQueue, POLLING_INTERVAL_MS);
    return () => clearInterval(t);
  }, [giraId, loadQueue]);

  const nextInLine = queue.find((t) => t.status === 'emitted' && t.checkin_em);
  const waiting = queue.filter((t) => t.status === 'emitted');
  const upcoming = waiting.filter((t) => t.id !== nextInLine?.id).slice(0, 8);

  // Som ao mudar o "próximo"
  useEffect(() => {
    if (nextInLine && prevNextRef.current && prevNextRef.current !== nextInLine.id) {
      try {
        const audio = new Audio('/sounds/notification.mp3');
        audio.play().catch(() => {});
      } catch { /* non-critical */ }
    }
    prevNextRef.current = nextInLine?.id ?? null;
    // Intentionally depends on the id, not the nextInLine object reference,
    // so the sound only fires when the "next" ticket actually changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nextInLine?.id]);

  return (
    <>
      <Head>
        <title>{nextInLine ? `${nextInLine.numero_formatado} — Porta` : 'Modo TV — Porta'}</title>
        <meta name="robots" content="noindex, nofollow" />
      </Head>
      <Box
        sx={{
          minHeight: '100vh',
          bgcolor: '#0b1020',
          color: '#fff',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          p: { xs: 3, md: 6 },
        }}
      >
        {giraNome && (
          <Typography sx={{ position: 'absolute', top: 24, left: 32, opacity: 0.6, fontSize: '1.25rem' }}>
            {giraNome}
          </Typography>
        )}

        {loading ? (
          <CircularProgress sx={{ color: '#fff' }} />
        ) : (
          <>
            <Typography sx={{ letterSpacing: '0.3em', opacity: 0.7, fontSize: '1.5rem', mb: 2 }}>
              PRÓXIMO
            </Typography>
            <Typography
              sx={{
                fontFamily: 'monospace',
                fontWeight: 900,
                fontSize: { xs: '6rem', md: '12rem' },
                lineHeight: 1,
                color: '#a5b4fc',
              }}
            >
              {nextInLine ? nextInLine.numero_formatado || `#${nextInLine.numero}` : '—'}
            </Typography>
            {nextInLine?.consulente_nome && (
              <Typography sx={{ fontSize: { xs: '2rem', md: '3rem' }, fontWeight: 700, mt: 2 }}>
                {nextInLine.consulente_nome}
              </Typography>
            )}

            {upcoming.length > 0 && (
              <Box sx={{ mt: 6, display: 'flex', gap: 3, flexWrap: 'wrap', justifyContent: 'center' }}>
                {upcoming.map((t) => (
                  <Typography
                    key={t.id}
                    sx={{
                      fontFamily: 'monospace',
                      fontWeight: 700,
                      fontSize: { xs: '2rem', md: '3rem' },
                      opacity: 0.55,
                    }}
                  >
                    {t.numero_formatado || `#${t.numero}`}
                  </Typography>
                ))}
              </Box>
            )}
          </>
        )}
      </Box>
    </>
  );
}
