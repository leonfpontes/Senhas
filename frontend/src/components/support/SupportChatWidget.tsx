/**
 * SupportChatWidget — balão "Ajuda" global, montado no AdminLayout (toda página /admin/*).
 *
 * Canto inferior DIREITO. Abaixo de 900px fica a 72px do rodapé
 * (`bottom: calc(env(safe-area-inset-bottom) + 72px)`) para não cobrir barras fixas de
 * "Salvar"; a partir de 900px, a 24px. Em /admin/porta o FAB "Walk-in" ocupa o canto direito
 * (24px + 48px de altura), então ali o balão sobe para 88px em qualquer largura.
 *
 * Sem animação contínua: mensagem nova acende um ponto (pulsa só sem reduced-motion), muda o
 * título da aba e toca o som.
 */
import React, { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import { MessageCircle, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { useSupportChat } from './useSupportChat';
import { SupportChatPanel } from './SupportChatPanel';

interface SupportChatWidgetProps {
  enabled: boolean;
}

export function SupportChatWidget({ enabled }: SupportChatWidgetProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
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

  if (!enabled) return null;

  const handleOpen = () => {
    setOpen(true);
    markRead();
  };

  return (
    <>
      <Button
        onClick={() => (open ? setOpen(false) : handleOpen())}
        aria-label={open ? 'Fechar ajuda' : unread ? 'Ajuda — nova resposta do suporte' : 'Falar com o suporte'}
        aria-expanded={open}
        className={cn(
          'fixed right-[calc(16px+env(safe-area-inset-right))] z-50 h-11 rounded-full pr-4 pl-3 shadow-lg md:right-6',
          onPorta
            ? 'bottom-[calc(env(safe-area-inset-bottom)+88px)]'
            : 'bottom-[calc(env(safe-area-inset-bottom)+72px)] md:bottom-6',
        )}
      >
        <span className="relative">
          {open ? <X className="size-5" /> : <MessageCircle className="size-5" />}
          {unread && !open && (
            <span className="absolute -top-1 -right-1 flex size-2.5" aria-hidden>
              <span className="absolute inline-flex size-full rounded-full bg-warning opacity-75 motion-safe:animate-ping" />
              <span className="relative inline-flex size-2.5 rounded-full bg-warning ring-2 ring-primary" />
            </span>
          )}
        </span>
        Ajuda
      </Button>

      {open && (
        <SupportChatPanel
          messages={messages}
          loading={loading}
          sending={sending}
          onSend={send}
          onClose={() => setOpen(false)}
          className={onPorta ? 'bottom-[calc(env(safe-area-inset-bottom)+144px)] md:bottom-[144px]' : undefined}
        />
      )}
    </>
  );
}
