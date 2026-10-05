/**
 * Empty state da tela de giras (terreiro sem nenhuma gira cadastrada).
 *
 * Antes, um terreiro novo via só uma tabela vazia. Agora a tela explica o
 * ciclo em três passos e oferece o botão de criar a primeira gira, respeitando
 * permissão de grupo (`giras:insert`) e limite/assinatura do plano.
 */
import React from 'react';
import { Box, Button, Stack, Typography } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EventAvailableRoundedIcon from '@mui/icons-material/EventAvailableRounded';
import Link from 'next/link';
import { trackEvent } from '@/services/analytics';

export interface GirasEmptyStateProps {
  /** Permissão de grupo para criar gira. */
  canInsert: boolean;
  /** Plano/assinatura permite criar gira agora. */
  canCreateGira: boolean;
  /** Motivo do bloqueio por plano (limite atingido, sem assinatura). */
  blockedReason?: string;
  onCreate: () => void;
}

const STEPS = [
  'Crie a gira com a data e quantas senhas liberar.',
  'Compartilhe o link do terreiro no grupo de WhatsApp — os consulentes pegam a senha pelo celular.',
  'No dia da gira, use a Porta para fazer o check-in e chamar as senhas.',
];

export default function GirasEmptyState({ canInsert, canCreateGira, blockedReason, onCreate }: GirasEmptyStateProps) {
  return (
    <Box
      data-testid="giras-empty-state"
      sx={{ py: { xs: 5, sm: 7 }, px: 3, display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}
    >
      <EventAvailableRoundedIcon sx={{ fontSize: 48, color: 'primary.main', mb: 1.5 }} />
      <Typography variant="h6" fontWeight={700}>
        Nenhuma gira cadastrada ainda
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, maxWidth: 440 }}>
        Crie a primeira gira para começar a liberar senhas. É assim que funciona:
      </Typography>

      <Stack component="ol" spacing={1} sx={{ mt: 2.5, mb: 3, p: 0, maxWidth: 440, textAlign: 'left', listStyle: 'none' }}>
        {STEPS.map((text, i) => (
          <Box component="li" key={text} sx={{ display: 'flex', gap: 1.5, alignItems: 'flex-start' }}>
            <Box
              sx={{
                flexShrink: 0,
                width: 22,
                height: 22,
                mt: '1px',
                borderRadius: '50%',
                bgcolor: 'primary.main',
                color: 'primary.contrastText',
                fontSize: '0.75rem',
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {i + 1}
            </Box>
            <Typography variant="body2">{text}</Typography>
          </Box>
        ))}
      </Stack>

      {canInsert && canCreateGira && (
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => {
            trackEvent('giras_empty_create');
            onCreate();
          }}
        >
          Criar primeira gira
        </Button>
      )}

      {canInsert && !canCreateGira && (
        <Stack spacing={1} alignItems="center">
          {blockedReason && (
            <Typography variant="body2" color="text.secondary">
              {blockedReason}
            </Typography>
          )}
          <Button component={Link} href="/admin/plano" variant="outlined">
            Ver planos
          </Button>
        </Stack>
      )}

      {!canInsert && (
        <Typography variant="body2" color="text.secondary">
          Peça a um administrador do terreiro para criar a gira.
        </Typography>
      )}
    </Box>
  );
}
