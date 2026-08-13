/**
 * useTenantSupportUnread — contagem de conversas do terreiro com resposta do
 * suporte ainda não vista, para o badge do item "Suporte" no AdminSidebar.
 * Só usado por ADMIN (quem vê a visão agregada) — poll bem mais espaçado que
 * o chat em si, já que roda em toda navegação do admin, não só na tela de
 * suporte.
 */
import { useEffect, useState } from 'react';
import { apiClient } from '@/services/api_client';

const TEAM_UNREAD_POLL_MS = 20000;

interface ConversationSummary {
  unread: boolean;
}

export function useTenantSupportUnread(enabled: boolean): number {
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!enabled) {
      setCount(0);
      return;
    }

    let cancelled = false;
    const load = async () => {
      try {
        const res = await apiClient.get<ConversationSummary[]>('/api/v1/admin/support-chat/conversations');
        if (!cancelled) setCount(res.data.filter((c) => c.unread).length);
      } catch {
        /* retry on next poll */
      }
    };

    load();
    const t = setInterval(() => {
      if (document.visibilityState === 'visible') load();
    }, TEAM_UNREAD_POLL_MS);

    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [enabled]);

  return count;
}
