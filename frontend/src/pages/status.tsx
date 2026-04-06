/**
 * Página pública de status do sistema — girahub.com.br/status
 *
 * Mostra saúde em tempo real de cada componente e histórico de 90 dias.
 * Não requer autenticação.
 */

import React, { useEffect, useState, useCallback } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import {
  Box,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Container,
  Divider,
  Tooltip,
  Typography,
} from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import ConfirmationNumberIcon from '@mui/icons-material/ConfirmationNumber';
import { apiClient } from '../services/api_client';

// ---------------------------------------------------------------------------
// Constantes
// ---------------------------------------------------------------------------

const POLLING_MS = 60_000;
const HISTORY_DAYS = 90;

const STATUS_COLOR: Record<string, string> = {
  operational: '#22c55e',
  degraded: '#f59e0b',
  outage: '#ef4444',
  unknown: '#d1d5db',
};

const STATUS_LABEL: Record<string, string> = {
  operational: 'Operacional',
  degraded: 'Degradado',
  outage: 'Indisponível',
  unknown: 'Sem dados',
};

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

interface HistoryEntry {
  date: string;
  status: string;
}

interface Component {
  name: string;
  description: string;
  status: string;
  latency_ms?: number | null;
  uptime_30d: number;
  uptime_90d: number;
  history: HistoryEntry[];
}

interface StatusData {
  overall: string;
  components: Component[];
  generated_at: string;
}

// ---------------------------------------------------------------------------
// Subcomponentes
// ---------------------------------------------------------------------------

const StatusChip = ({ status }: { status: string }) => {
  const icons: Record<string, React.ReactNode> = {
    operational: <CheckCircleIcon fontSize="small" />,
    degraded: <WarningAmberIcon fontSize="small" />,
    outage: <ErrorOutlineIcon fontSize="small" />,
  };
  const colors: Record<string, 'success' | 'warning' | 'error' | 'default'> = {
    operational: 'success',
    degraded: 'warning',
    outage: 'error',
    unknown: 'default',
  };
  return (
    <Chip
      size="small"
      label={STATUS_LABEL[status] ?? status}
      color={colors[status] ?? 'default'}
      icon={icons[status] as React.ReactElement | undefined}
      sx={{ fontWeight: 600 }}
    />
  );
};

const HistoryBar = ({ entry }: { entry: HistoryEntry }) => (
  <Tooltip
    title={`${entry.date} — ${STATUS_LABEL[entry.status] ?? entry.status}`}
    arrow
    placement="top"
  >
    <Box
      sx={{
        width: 'calc(100% / 90)',
        minWidth: 3,
        height: 28,
        bgcolor: STATUS_COLOR[entry.status] ?? STATUS_COLOR.unknown,
        borderRadius: '2px',
        cursor: 'default',
        transition: 'opacity 0.15s',
        '&:hover': { opacity: 0.75 },
      }}
    />
  </Tooltip>
);

const ComponentCard = ({ component }: { component: Component }) => (
  <Card variant="outlined" sx={{ mb: 2 }}>
    <CardContent sx={{ pb: '16px !important' }}>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
        <Box>
          <Typography variant="subtitle1" fontWeight={700}>
            {component.name}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {component.description}
            {component.latency_ms != null && (
              <> &nbsp;·&nbsp; <strong>{component.latency_ms} ms</strong></>
            )}
          </Typography>
        </Box>
        <StatusChip status={component.status} />
      </Box>

      {/* History bars */}
      <Box sx={{ display: 'flex', gap: '2px', mb: 1 }}>
        {component.history.map((entry) => (
          <HistoryBar key={entry.date} entry={entry} />
        ))}
      </Box>

      {/* Uptime footer */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
        <Typography variant="caption" color="text.secondary">
          90 dias atrás
        </Typography>
        <Typography variant="caption" color="text.secondary" fontWeight={600}>
          {component.uptime_30d}% uptime (30d)
        </Typography>
        <Typography variant="caption" color="text.secondary">
          Hoje
        </Typography>
      </Box>
    </CardContent>
  </Card>
);

// ---------------------------------------------------------------------------
// Página principal
// ---------------------------------------------------------------------------

const StatusPage: React.FC = () => {
  const [data, setData] = useState<StatusData | null>(null);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    try {
      const res = await apiClient.get<StatusData>('/api/v1/platform/status');
      setData(res.data);
    } catch {
      // keep previous data on error
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetch();
  }, [fetch]);

  useEffect(() => {
    const timer = setInterval(fetch, POLLING_MS);
    return () => clearInterval(timer);
  }, [fetch]);

  const overall = data?.overall ?? 'operational';

  const overallBg: Record<string, string> = {
    operational: '#f0fdf4',
    degraded: '#fffbeb',
    outage: '#fef2f2',
  };
  const overallBorder: Record<string, string> = {
    operational: '#86efac',
    degraded: '#fcd34d',
    outage: '#fca5a5',
  };
  const overallMsg: Record<string, string> = {
    operational: 'Tudo operacional',
    degraded: 'Serviço parcialmente degradado',
    outage: 'Interrupção em andamento',
  };

  return (
    <>
      <Head>
        <title>Status — GiraHub</title>
        <meta name="description" content="Status dos serviços do GiraHub" />
      </Head>

      {/* Navbar mínima */}
      <Box
        sx={{
          px: 3,
          py: 1.5,
          borderBottom: '1px solid',
          borderColor: 'divider',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <ConfirmationNumberIcon sx={{ color: '#4f46e5' }} />
          <Typography variant="h6" fontWeight={700} sx={{ color: '#1e1b4b' }}>
            GiraHub
          </Typography>
        </Box>
        <Link href="/" passHref legacyBehavior>
          <Typography
            component="a"
            variant="body2"
            sx={{ color: 'text.secondary', textDecoration: 'none', '&:hover': { color: '#4f46e5' } }}
          >
            ← Voltar ao site
          </Typography>
        </Link>
      </Box>

      <Container maxWidth="md" sx={{ py: 6 }}>
        <Typography variant="h4" fontWeight={800} gutterBottom>
          Status dos Serviços
        </Typography>

        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
            <CircularProgress />
          </Box>
        ) : (
          <>
            {/* Banner geral */}
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1.5,
                p: 2,
                mb: 4,
                borderRadius: 2,
                border: '1px solid',
                borderColor: overallBorder[overall] ?? '#86efac',
                bgcolor: overallBg[overall] ?? '#f0fdf4',
              }}
            >
              {overall === 'operational' ? (
                <CheckCircleIcon sx={{ color: '#22c55e', fontSize: 28 }} />
              ) : overall === 'degraded' ? (
                <WarningAmberIcon sx={{ color: '#f59e0b', fontSize: 28 }} />
              ) : (
                <ErrorOutlineIcon sx={{ color: '#ef4444', fontSize: 28 }} />
              )}
              <Box>
                <Typography variant="subtitle1" fontWeight={700}>
                  {overallMsg[overall]}
                </Typography>
                {data && (
                  <Typography variant="caption" color="text.secondary">
                    Atualizado em{' '}
                    {new Date(data.generated_at).toLocaleString('pt-BR', {
                      dateStyle: 'short',
                      timeStyle: 'short',
                    })}
                  </Typography>
                )}
              </Box>
            </Box>

            {/* Legenda de cores */}
            <Box sx={{ display: 'flex', gap: 2, mb: 3, flexWrap: 'wrap' }}>
              {(['operational', 'degraded', 'outage', 'unknown'] as const).map((s) => (
                <Box key={s} sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <Box
                    sx={{
                      width: 12,
                      height: 12,
                      borderRadius: '2px',
                      bgcolor: STATUS_COLOR[s],
                    }}
                  />
                  <Typography variant="caption" color="text.secondary">
                    {STATUS_LABEL[s]}
                  </Typography>
                </Box>
              ))}
            </Box>

            {/* Componentes */}
            <Box>
              {(data?.components ?? []).map((component) => (
                <ComponentCard key={component.name} component={component} />
              ))}
            </Box>

            <Divider sx={{ my: 4 }} />

            {/* Rodapé */}
            <Typography variant="caption" color="text.secondary" align="center" display="block">
              GiraHub · Histórico dos últimos 90 dias
            </Typography>
          </>
        )}
      </Container>
    </>
  );
};

export default StatusPage;
