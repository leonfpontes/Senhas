/**
 * SupportChatPanel — painel flutuante de mensagens do chat de suporte.
 * Renderizado pelo SupportChatWidget, ancorado perto do FAB (canto inferior
 * esquerdo, deslocado da largura do drawer em desktop — ver SupportChatWidget).
 * Não é modal full-screen — fecha ao clicar fora ou no X.
 */
import React, { useEffect, useRef } from 'react';
import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import IconButton from '@mui/material/IconButton';
import TextField from '@mui/material/TextField';
import CircularProgress from '@mui/material/CircularProgress';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import SendRoundedIcon from '@mui/icons-material/SendRounded';
import AutoAwesomeRoundedIcon from '@mui/icons-material/AutoAwesomeRounded';
import { DRAWER_WIDTH } from '@/components/admin/layout/AdminSidebar';
import type { SupportMessage } from './useSupportChat';

interface SupportChatPanelProps {
  messages: SupportMessage[];
  loading: boolean;
  sending: boolean;
  onSend: (body: string) => Promise<void>;
  onClose: () => void;
}

export function SupportChatPanel({ messages, loading, sending, onSend, onClose }: SupportChatPanelProps) {
  const [draft, setDraft] = React.useState('');
  const listEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    listEndRef.current?.scrollIntoView({ block: 'end' });
  }, [messages.length]);

  const handleSend = async () => {
    const body = draft.trim();
    if (!body || sending) return;
    setDraft('');
    await onSend(body);
  };

  return (
    <Paper
      elevation={8}
      sx={{
        position: 'fixed',
        bottom: 'calc(84px + env(safe-area-inset-bottom))',
        left: {
          xs: 'calc(16px + env(safe-area-inset-left))',
          md: `calc(${DRAWER_WIDTH}px + 16px + env(safe-area-inset-left))`,
        },
        width: { xs: 'calc(100vw - 32px)', sm: 360 },
        maxWidth: 360,
        height: 480,
        maxHeight: 'calc(100vh - 120px)',
        display: 'flex',
        flexDirection: 'column',
        borderRadius: 3,
        overflow: 'hidden',
        zIndex: (theme) => theme.zIndex.speedDial,
      }}
    >
      <Box
        sx={{
          px: 2, py: 1.5,
          display: 'flex', alignItems: 'center', gap: 1,
          bgcolor: 'primary.main', color: 'primary.contrastText',
        }}
      >
        <AutoAwesomeRoundedIcon fontSize="small" />
        <Typography variant="subtitle2" fontWeight={700} sx={{ flex: 1 }}>
          Suporte
        </Typography>
        <IconButton size="small" onClick={onClose} sx={{ color: 'inherit' }} aria-label="Fechar chat de suporte">
          <CloseRoundedIcon fontSize="small" />
        </IconButton>
      </Box>

      <Box sx={{ flex: 1, overflowY: 'auto', p: 1.5, display: 'flex', flexDirection: 'column', gap: 1 }}>
        {loading && messages.length === 0 ? (
          <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <CircularProgress size={28} />
          </Box>
        ) : messages.length === 0 ? (
          <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', px: 2 }}>
            <Typography variant="body2" color="text.secondary" textAlign="center">
              Manda sua dúvida ou problema aqui — o suporte responde por esse chat.
            </Typography>
          </Box>
        ) : (
          messages.map((m) => (
            <Box
              key={m.id}
              sx={{
                alignSelf: m.is_from_support ? 'flex-start' : 'flex-end',
                maxWidth: '82%',
                bgcolor: m.is_from_support ? 'action.selected' : 'primary.main',
                color: m.is_from_support ? 'text.primary' : 'primary.contrastText',
                borderRadius: 2,
                px: 1.5, py: 1,
              }}
            >
              <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                {m.body}
              </Typography>
            </Box>
          ))
        )}
        <div ref={listEndRef} />
      </Box>

      <Box sx={{ p: 1.25, borderTop: '1px solid', borderColor: 'divider', display: 'flex', gap: 1 }}>
        <TextField
          size="small"
          fullWidth
          multiline
          maxRows={4}
          placeholder="Escreva sua mensagem…"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
          disabled={sending}
        />
        <IconButton
          color="primary"
          onClick={handleSend}
          disabled={sending || !draft.trim()}
          aria-label="Enviar mensagem"
        >
          <SendRoundedIcon />
        </IconButton>
      </Box>
    </Paper>
  );
}
