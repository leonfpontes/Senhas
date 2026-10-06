/**
 * SupportChatWidget — conversa do usuário com o suporte, aberta pelo item "Falar com o
 * suporte" do menu do perfil (AdminTopbar).
 *
 * Até 2026-10-06 era um balão "Ajuda" flutuante no canto inferior direito e cobria
 * conteúdo e ações das telas. Agora não há nada fixo na tela: o componente só cuida do
 * painel (aberto/fechado pelo menu), do som, do título da aba e avisa o menu quando há
 * resposta não lida (`onUnreadChange`), que acende um ponto no avatar.
 */
import React, { useEffect, useRef } from 'react';
import { useRouter } from 'next/router';
import { useSupportChat } from './useSupportChat';
import { SupportChatPanel } from './SupportChatPanel';

interface SupportChatWidgetProps {
  enabled: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Avisado quando muda o estado de "resposta do suporte não lida". */
  onUnreadChange?: (unread: boolean) => void;
}

export function SupportChatWidget({ enabled, open, onOpenChange, onUnreadChange }: SupportChatWidgetProps) {
  const router = useRouter();
  const { messages, loading, sending, unread, hasNewSupportMessage, send, markRead } = useSupportChat(enabled);
  const baseTitleRef = useRef<string | null>(null);

  // /admin/porta controla o próprio document.title (fila), então o widget não disputa ali.
  const onPorta = router.pathname === '/admin/porta';
  const ownsTitle = !onPorta;

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
      /* autoplay bloqueado ou sem suporte — não é crítico */
    }
  }, [hasNewSupportMessage]);

  useEffect(() => {
    onUnreadChange?.(enabled && unread);
  }, [enabled, unread, onUnreadChange]);

  // Abrir a conversa marca as respostas como lidas.
  useEffect(() => {
    if (open && enabled) markRead();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, enabled]);

  if (!enabled || !open) return null;

  return (
    <SupportChatPanel
      messages={messages}
      loading={loading}
      sending={sending}
      onSend={send}
      onClose={() => onOpenChange(false)}
    />
  );
}
