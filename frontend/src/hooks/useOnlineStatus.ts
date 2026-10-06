/**
 * useOnlineStatus — `navigator.onLine` como estado React (eventos `online`/`offline`).
 * Começa em `true` (SSR e primeira pintura) e lê o valor real no cliente.
 *
 * `navigator.onLine === true` não garante internet (só que há rede); quem precisa de certeza
 * combina com falhas reais de requisição — ver `PortaOfflineNotice`.
 */
import { useEffect, useState } from 'react';

export function useOnlineStatus(): boolean {
  const [online, setOnline] = useState(true);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const update = () => setOnline(navigator.onLine !== false);
    update();
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);

  return online;
}

export default useOnlineStatus;
