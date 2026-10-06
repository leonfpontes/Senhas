/**
 * /admin/suporte — acompanhamento (só leitura) das conversas de suporte de todas as pessoas do
 * terreiro. Só administrador acessa (checagem própria, sem grupo — ver CLAUDE.md); cada pessoa
 * responde na própria conversa pelo balão "Ajuda", não aqui.
 *
 * Desktop: lista à esquerda e conversa à direita. Celular (< 900px): lista; tocar abre a
 * conversa num Sheet de tela cheia.
 */
'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, MessagesSquare } from 'lucide-react';
import AdminLayout from './admin_layout';
import { EmptyState, PageHeader } from '@/components/admin';
import { PermissionDenied } from '@/components/gates';
import { SupportMessageBubble, formatMessageTime } from '@/components/support/SupportChatPanel';
import type { SupportMessage } from '@/components/support/useSupportChat';
import { Badge } from '@/components/ui/badge';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { useProfile } from '@/hooks/useProfile';
import { apiClient } from '@/services/api_client';

const POLLING_INTERVAL_MS = 8000;

interface ConversationSummary {
  id: string;
  status: 'open' | 'resolved';
  owner_name_snapshot: string;
  last_message_at: string | null;
  last_message_preview: string | null;
  unread: boolean;
}

function StatusBadge({ status }: { status: ConversationSummary['status'] }) {
  return status === 'open' ? (
    <Badge variant="outline" className="border-success/40 text-success">
      Aberta
    </Badge>
  ) : (
    <Badge variant="outline" className="text-muted-foreground">
      Resolvida
    </Badge>
  );
}

function MessagesView({ messages, loading }: { messages: SupportMessage[]; loading: boolean }) {
  const endRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [messages.length]);

  if (loading && messages.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" aria-label="Carregando" />
      </div>
    );
  }
  if (messages.length === 0) {
    return <p className="m-auto text-sm text-muted-foreground">Sem mensagens nesta conversa.</p>;
  }
  return (
    <div className="flex flex-1 flex-col gap-2 overflow-y-auto p-3" aria-live="polite">
      {messages.map((m) => (
        <SupportMessageBubble key={m.id} message={m} showSender />
      ))}
      <div ref={endRef} />
    </div>
  );
}

function AdminSuporteContent() {
  const isDesktop = useMediaQuery('(min-width: 900px)');
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);

  const loadConversations = useCallback(async () => {
    try {
      const res = await apiClient.get<ConversationSummary[]>('/api/v1/admin/support-chat/conversations');
      setConversations(res.data);
    } catch {
      /* tenta de novo no próximo ciclo */
    } finally {
      setLoadingList(false);
    }
  }, []);

  const loadMessages = useCallback(async (conversationId: string) => {
    try {
      const res = await apiClient.get<SupportMessage[]>(
        `/api/v1/admin/support-chat/conversations/${conversationId}/messages`,
      );
      setMessages(res.data);
    } catch {
      /* tenta de novo no próximo ciclo */
    }
  }, []);

  useEffect(() => {
    loadConversations();
    const t = setInterval(() => {
      if (document.visibilityState === 'visible') loadConversations();
    }, POLLING_INTERVAL_MS);
    return () => clearInterval(t);
  }, [loadConversations]);

  useEffect(() => {
    if (!selectedId) return;
    setMessages([]);
    setLoadingMessages(true);
    loadMessages(selectedId).finally(() => setLoadingMessages(false));
    const t = setInterval(() => {
      if (document.visibilityState === 'visible') loadMessages(selectedId);
    }, POLLING_INTERVAL_MS);
    return () => clearInterval(t);
  }, [selectedId, loadMessages]);

  const selected = conversations.find((c) => c.id === selectedId) ?? null;

  const list = (
    <div className="flex min-h-0 flex-col overflow-hidden rounded-lg border bg-card md:w-80 md:shrink-0">
      {loadingList ? (
        <div className="space-y-2 p-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      ) : conversations.length === 0 ? (
        <EmptyState
          compact
          icon={<MessagesSquare />}
          title="Nenhuma conversa ainda"
          description="Ninguém do seu terreiro falou com o suporte até agora."
        />
      ) : (
        <ul className="divide-y overflow-y-auto" aria-label="Conversas">
          {conversations.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => setSelectedId(c.id)}
                aria-current={c.id === selectedId || undefined}
                className={cn(
                  'flex w-full flex-col gap-1 px-3 py-2.5 text-left outline-none hover:bg-accent focus-visible:bg-accent',
                  c.id === selectedId && 'bg-accent',
                )}
              >
                <span className="flex items-center gap-2">
                  <span className={cn('min-w-0 flex-1 truncate text-sm', c.unread ? 'font-bold' : 'font-medium')}>
                    {c.owner_name_snapshot}
                  </span>
                  {c.last_message_at && (
                    <time dateTime={c.last_message_at} className="shrink-0 text-xs text-muted-foreground">
                      {formatMessageTime(c.last_message_at)}
                    </time>
                  )}
                </span>
                <span className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                    {c.last_message_preview || '—'}
                  </span>
                  {c.unread && (
                    <Badge variant="outline" className="border-warning/50 text-warning">
                      Nova resposta
                    </Badge>
                  )}
                  <StatusBadge status={c.status} />
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );

  return (
    <div className="space-y-4">
      <PageHeader
        title="Suporte"
        subtitle="Acompanhe as conversas das pessoas do seu terreiro com o suporte. Para falar com o suporte, use o botão Ajuda."
      />

      {isDesktop ? (
        <div className="flex h-[calc(100dvh-260px)] min-h-[420px] gap-4">
          {list}
          <div className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-lg border bg-card">
            {selected ? (
              <>
                <div className="flex items-center gap-2 border-b px-4 py-3">
                  <h2 className="flex-1 truncate font-semibold">{selected.owner_name_snapshot}</h2>
                  <StatusBadge status={selected.status} />
                </div>
                <MessagesView messages={messages} loading={loadingMessages} />
              </>
            ) : (
              <p className="m-auto text-sm text-muted-foreground">Escolha uma conversa para ver as mensagens.</p>
            )}
          </div>
        </div>
      ) : (
        <>
          {list}
          <Sheet open={!!selected} onOpenChange={(o) => !o && setSelectedId(null)}>
            <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-full">
              <SheetHeader className="border-b">
                <SheetTitle>{selected?.owner_name_snapshot}</SheetTitle>
                <SheetDescription>
                  {selected?.status === 'open' ? 'Conversa aberta' : 'Conversa resolvida'} · só leitura
                </SheetDescription>
              </SheetHeader>
              <MessagesView messages={messages} loading={loadingMessages} />
            </SheetContent>
          </Sheet>
        </>
      )}
    </div>
  );
}

export default function AdminSuportePage() {
  const { profile, loading } = useProfile();
  const isAdmin = profile?.role === 'admin' || profile?.role === 'super_admin';

  return (
    <AdminLayout title="Suporte">
      {loading ? (
        <Skeleton className="h-40 w-full" />
      ) : !isAdmin ? (
        <PermissionDenied message="Só administradores veem as conversas do terreiro. A sua conversa continua no botão Ajuda." />
      ) : (
        <AdminSuporteContent />
      )}
    </AdminLayout>
  );
}
