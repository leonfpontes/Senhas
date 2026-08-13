/**
 * usePlatformSupportUnread — contagem global de conversas com mensagem do
 * tenant ainda não vista pelo suporte, para o badge do item "Suporte" na
 * sidebar do superadmin. Poll mais espaçado que a inbox em si, já que roda
 * em toda navegação do platform, não só na tela de suporte.
 */
import { useEffect, useState } from 'react';
import { apiClient } from '@/services/api_client';

const UNREAD_POLL_MS = 15000;

export function usePlatformSupportUnread(): number {
  const [count, setCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await apiClient.get<{ count: number }>('/api/v1/platform/support-chat/unread-count');
        if (!cancelled) setCount(res.data.count);
      } catch {
        /* retry on next poll */
      }
    };

    load();
    const t = setInterval(() => {
      if (document.visibilityState === 'visible') load();
    }, UNREAD_POLL_MS);

    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, []);

  return count;
}
