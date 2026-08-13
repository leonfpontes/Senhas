/**
 * useSupportChat — estado + polling da conversa própria do usuário com o
 * suporte da plataforma. Usado pelo SupportChatWidget (FAB global do admin).
 *
 * Polling segue o mesmo padrão de admin/porta.tsx (POLLING_INTERVAL_MS),
 * mas roda em TODAS as páginas do admin (o widget vive no AdminLayout) —
 * por isso pausa quando a aba não está em foco (document.visibilityState),
 * diferente de porta.tsx que só roda numa página só.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { apiClient } from '@/services/api_client';

export const POLLING_INTERVAL_MS = 8000;

export interface SupportMessage {
  id: string;
  body: string;
  is_from_support: boolean;
  sender_name_snapshot: string;
  created_at: string;
}

export interface SupportConversationState {
  id: string;
  status: 'open' | 'resolved';
  owner_name_snapshot: string;
  last_message_at: string | null;
  unread: boolean;
}

interface ConversationResponse {
  conversation: SupportConversationState;
  messages: SupportMessage[];
}

export function useSupportChat(enabled: boolean) {
  const [conversation, setConversation] = useState<SupportConversationState | null>(null);
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [hasNewSupportMessage, setHasNewSupportMessage] = useState(false);

  const seenIds = useRef<Set<string>>(new Set());
  const firstLoad = useRef(true);

  const load = useCallback(async () => {
    if (!enabled) return;
    try {
      const res = await apiClient.get<ConversationResponse>('/api/v1/admin/support-chat/me');
      const incoming = res.data.messages;

      if (!firstLoad.current) {
        const genuinelyNew = incoming.some((m) => m.is_from_support && !seenIds.current.has(m.id));
        if (genuinelyNew) setHasNewSupportMessage(true);
      }
      incoming.forEach((m) => seenIds.current.add(m.id));
      firstLoad.current = false;

      setConversation(res.data.conversation);
      setMessages(incoming);
    } catch {
      /* retry on next poll */
    }
  }, [enabled]);

  useEffect(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [load]);

  useEffect(() => {
    if (!enabled) return;
    const t = setInterval(() => {
      if (document.visibilityState === 'visible') load();
    }, POLLING_INTERVAL_MS);
    return () => clearInterval(t);
  }, [enabled, load]);

  const send = useCallback(
    async (body: string) => {
      setSending(true);
      try {
        await apiClient.post('/api/v1/admin/support-chat/me/messages', { body });
        await load();
      } finally {
        setSending(false);
      }
    },
    [load],
  );

  const markRead = useCallback(async () => {
    setHasNewSupportMessage(false);
    try {
      await apiClient.post('/api/v1/admin/support-chat/me/read');
    } catch {
      /* best-effort */
    }
    load();
  }, [load]);

  return {
    conversation,
    messages,
    loading,
    sending,
    unread: conversation?.unread ?? false,
    hasNewSupportMessage,
    send,
    markRead,
  };
}
