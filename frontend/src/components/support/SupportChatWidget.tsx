/**
 * SupportChatWidget — FAB global de suporte, montado no AdminLayout (aparece
 * em toda página /admin/*, inclusive /admin/porta). Fica no canto inferior
 * ESQUERDO de propósito: o FAB "Walk-in" de /admin/porta é fixed no canto
 * inferior direito (ver porta.tsx) — cantos opostos, zero sobreposição.
 *
 * Em telas >= md o AdminSidebar é um drawer permanente (DRAWER_WIDTH) com seu
 * próprio rodapé (chip de plano + versão) plantado nesse mesmo canto — sem
 * compensar a largura do drawer, o FAB fica por cima/atrás desse rodapé. Em
 * mobile o drawer é temporary (fechado por padrão), então ali basta o
 * respiro padrão de 24px.
 */
import React, { useEffect, useRef, useState } from 'react';
import Badge from '@mui/material/Badge';
import Fab from '@mui/material/Fab';
import { keyframes } from '@mui/material/styles';
import useMediaQuery from '@mui/material/useMediaQuery';
import { useRouter } from 'next/router';
import AutoAwesomeRoundedIcon from '@mui/icons-material/AutoAwesomeRounded';
import { DRAWER_WIDTH } from '@/components/admin/layout/AdminSidebar';
import { useSupportChat } from './useSupportChat';
import { SupportChatPanel } from './SupportChatPanel';

const glowIdle = keyframes`
  0%   { box-shadow: 0 0 0 0 rgba(99, 102, 241, 0.35); }
  70%  { box-shadow: 0 0 0 12px rgba(99, 102, 241, 0); }
  100% { box-shadow: 0 0 0 0 rgba(99, 102, 241, 0); }
`;

const glowUnread = keyframes`
  0%   { box-shadow: 0 0 0 0 rgba(245, 184, 65, 0.55); }
  70%  { box-shadow: 0 0 0 14px rgba(245, 184, 65, 0); }
  100% { box-shadow: 0 0 0 0 rgba(245, 184, 65, 0); }
`;

interface SupportChatWidgetProps {
  enabled: boolean;
}

export function SupportChatWidget({ enabled }: SupportChatWidgetProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const prefersReducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
  const { messages, loading, sending, unread, hasNewSupportMessage, send, markRead } = useSupportChat(enabled);
  const baseTitleRef = useRef<string | null>(null);

  // Título da aba + som — mesmo padrão de admin/porta.tsx, mas essa página já
  // controla o próprio document.title (fila de espera), então o widget não
  // disputa o título ali pra não ter duas fontes de verdade.
  const ownsTitle = router.pathname !== '/admin/porta';

  useEffect(() => {
    if (!ownsTitle) return;
    if (baseTitleRef.current === null) baseTitleRef.current = document.title;
    const base = baseTitleRef.current;
    document.title = unread ? `(1) ${base}` : base;
    return () => {
      if (baseTitleRef.current !== null) document.title = baseTitleRef.current;
    };
  }, [unread, ownsTitle]);

  useEffect(() => {
    if (!hasNewSupportMessage) return;
    try {
      new Audio('/sounds/notification.mp3').play().catch(() => {});
    } catch {
      /* autoplay blocked or unsupported — non-critical */
    }
  }, [hasNewSupportMessage]);

  if (!enabled) return null;

  const handleOpen = () => {
    setOpen(true);
    markRead();
  };

  return (
    <>
      <Fab
        size="small"
        color={unread ? 'warning' : 'primary'}
        onClick={() => (open ? setOpen(false) : handleOpen())}
        aria-label="Falar com o suporte"
        sx={{
          position: 'fixed',
          bottom: 'calc(24px + env(safe-area-inset-bottom))',
          left: {
            xs: 'calc(24px + env(safe-area-inset-left))',
            md: `calc(${DRAWER_WIDTH}px + 24px + env(safe-area-inset-left))`,
          },
          zIndex: (theme) => theme.zIndex.speedDial,
          animation: prefersReducedMotion
            ? 'none'
            : `${unread ? glowUnread : glowIdle} ${unread ? '1.2s' : '2.8s'} ease-in-out infinite`,
        }}
      >
        <Badge variant="dot" color="error" invisible={!unread} overlap="circular">
          <AutoAwesomeRoundedIcon fontSize="small" />
        </Badge>
      </Fab>

      {open && (
        <SupportChatPanel
          messages={messages}
          loading={loading}
          sending={sending}
          onSend={send}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
