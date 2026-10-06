/**
 * Aviso de conexão da Porta (P-01).
 *
 * "Sem conexão" quando o navegador diz que está offline **ou** a atualização periódica da fila
 * falhou `OFFLINE_AFTER_FAILURES` vezes seguidas (o `navigator.onLine` mente em Wi-Fi sem
 * internet). A fila na tela continua a última que carregou. Ao recuperar, toast "Conexão de
 * volta". Quando o navegador avisa que a rede voltou, chama `onOnline` para atualizar na hora,
 * sem esperar o próximo ciclo.
 */
import React, { useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { WifiOff } from 'lucide-react';

import { useOnlineStatus } from '@/hooks/useOnlineStatus';

export const OFFLINE_AFTER_FAILURES = 2;

interface Props {
  /** Falhas seguidas da atualização da fila (zera a cada sucesso). */
  failures: number;
  /** Chamado quando o navegador volta a ficar online. */
  onOnline?: () => void;
}

export default function PortaOfflineNotice({ failures, onOnline }: Props) {
  const online = useOnlineStatus();
  const offline = !online || failures >= OFFLINE_AFTER_FAILURES;

  const wasOfflineRef = useRef(false);
  useEffect(() => {
    if (wasOfflineRef.current && !offline) toast.success('Conexão de volta');
    wasOfflineRef.current = offline;
  }, [offline]);

  const onOnlineRef = useRef(onOnline);
  onOnlineRef.current = onOnline;
  const prevOnlineRef = useRef(online);
  useEffect(() => {
    if (!prevOnlineRef.current && online) onOnlineRef.current?.();
    prevOnlineRef.current = online;
  }, [online]);

  if (!offline) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="porta-sem-conexao"
      className="flex items-center gap-2 rounded-md border border-warning/40 bg-warning/15 px-3 py-1.5 text-sm text-warning-strong"
    >
      <WifiOff className="size-4 shrink-0" aria-hidden />
      <span>Sem conexão — mostrando a última fila carregada</span>
    </div>
  );
}
