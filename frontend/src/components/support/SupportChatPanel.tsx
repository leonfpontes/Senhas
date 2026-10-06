/**
 * SupportChatPanel — painel flutuante da conversa do usuário com o suporte.
 * Aberto pelo item "Falar com o suporte" do menu do perfil (SupportChatWidget); o cartão fica
 * no canto inferior direito, acima da barra de abas no celular.
 * Não é modal: fecha no X ou com Esc. Rola até a última mensagem; cada mensagem mostra a hora.
 *
 * Mesma API de props de antes (`messages`, `loading`, `sending`, `onSend`, `onClose`).
 */
import React, { useEffect, useRef, useState } from 'react';
import { Loader2, MessageCircle, SendHorizontal, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import type { SupportMessage } from './useSupportChat';

export interface SupportChatPanelProps {
  messages: SupportMessage[];
  loading: boolean;
  sending: boolean;
  onSend: (body: string) => Promise<void>;
  onClose: () => void;
  className?: string;
}

/** "14:05" hoje; "12/09 14:05" em outro dia. */
export function formatMessageTime(iso: string, now: Date = new Date()): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const time = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  const sameDay =
    d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
  if (sameDay) return time;
  return `${d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} ${time}`;
}

/** Balão de mensagem (usado no painel e na visão do administrador em /admin/suporte). */
export function SupportMessageBubble({ message, showSender = false }: { message: SupportMessage; showSender?: boolean }) {
  const fromSupport = message.is_from_support;
  return (
    <div
      className={cn(
        'max-w-[82%] rounded-2xl px-3 py-2 text-sm',
        fromSupport ? 'self-start rounded-bl-sm bg-muted text-foreground' : 'self-end rounded-br-sm bg-primary text-primary-foreground',
      )}
    >
      {showSender && <div className="mb-0.5 text-xs font-medium opacity-80">{message.sender_name_snapshot}</div>}
      <p className="break-words whitespace-pre-wrap">{message.body}</p>
      <time
        dateTime={message.created_at}
        className={cn('mt-1 block text-right text-[11px]', fromSupport ? 'text-muted-foreground' : 'opacity-75')}
      >
        {formatMessageTime(message.created_at)}
      </time>
    </div>
  );
}

export function SupportChatPanel({ messages, loading, sending, onSend, onClose, className }: SupportChatPanelProps) {
  const [draft, setDraft] = useState('');
  const listEndRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    listEndRef.current?.scrollIntoView({ block: 'end' });
  }, [messages.length]);

  useEffect(() => {
    inputRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const handleSend = async () => {
    const body = draft.trim();
    if (!body || sending) return;
    setDraft('');
    await onSend(body);
  };

  return (
    <section
      data-slot="support-chat"
      role="dialog"
      aria-label="Ajuda — conversa com o suporte"
      className={cn(
        'fixed z-50 flex flex-col overflow-hidden rounded-xl border bg-card text-card-foreground shadow-2xl',
        // Ancorado embaixo (não em cima): a faixa de impersonação muda a altura do topo.
        // celular: largura toda, acima da barra de abas (64px)
        'inset-x-2 bottom-[calc(env(safe-area-inset-bottom)+72px)] h-[480px] max-h-[calc(100dvh-140px)]',
        // a partir de 900px: cartão de 360px no canto direito
        'md:inset-x-auto md:right-4 md:bottom-4 md:w-[360px] md:max-h-[calc(100dvh-88px)]',
        className,
      )}
    >
      <header className="flex items-center gap-2 bg-primary px-4 py-3 text-primary-foreground">
        <MessageCircle className="size-4" aria-hidden />
        <div className="flex-1">
          <h2 className="text-sm font-semibold">Ajuda</h2>
          <p className="text-xs opacity-80">O suporte responde por aqui.</p>
        </div>
        <Button
          size="icon-sm"
          variant="ghost"
          className="text-primary-foreground hover:bg-primary-foreground/15 hover:text-primary-foreground"
          onClick={onClose}
          aria-label="Fechar chat de suporte"
        >
          <X />
        </Button>
      </header>

      <div className="flex flex-1 flex-col gap-2 overflow-y-auto p-3" aria-live="polite">
        {loading && messages.length === 0 ? (
          <div className="flex flex-1 items-center justify-center">
            <Loader2 className="size-6 animate-spin text-muted-foreground" aria-label="Carregando" />
          </div>
        ) : messages.length === 0 ? (
          <p className="m-auto max-w-[16rem] text-center text-sm text-muted-foreground">
            Escreva sua dúvida ou problema aqui. O suporte responde nesta conversa.
          </p>
        ) : (
          messages.map((m) => <SupportMessageBubble key={m.id} message={m} />)
        )}
        <div ref={listEndRef} />
      </div>

      <div className="flex items-end gap-2 border-t p-2">
        <Textarea
          ref={inputRef}
          rows={1}
          aria-label="Mensagem para o suporte"
          placeholder="Escreva sua mensagem…"
          className="max-h-28 min-h-9 resize-none"
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
        <Button size="icon" onClick={handleSend} disabled={sending || !draft.trim()} aria-label="Enviar mensagem">
          {sending ? <Loader2 className="animate-spin" /> : <SendHorizontal />}
        </Button>
      </div>
    </section>
  );
}

export default SupportChatPanel;
