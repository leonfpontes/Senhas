/**
 * Bilhete do consulente — destino do link "Para resgatar sua senha" dos
 * e-mails de emissão, reenvio e promoção da fila de espera.
 * Route: /public/[tenant]/ticket/[ticketId]
 *
 * Só leitura: GET /api/v1/public/{tenant}/ticket/{ticketId}. O slug na URL
 * amarra a senha ao terreiro (slug errado = 404). Renderiza o `Bilhete`
 * (components/public), que concentra número, gira, data, endereço, recados,
 * acompanhantes e as ações (agenda, WhatsApp, cancelar, próximas giras).
 */
import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { SearchX } from 'lucide-react';
import { apiClient, extractApiErrorMessage } from '@/services/api_client';
import { Button } from '@/components/ui/button';
import {
  Bilhete,
  PublicLoading,
  PublicNotice,
  PublicShell,
  formatGiraDateShort,
  type PublicTicket,
} from '@/components/public';

// Reexportados para quem ainda importa daqui (testes antigos); a fonte é components/public.
export { buildIcs, formatGiraDate, type PublicTicket } from '@/components/public/bilhete-utils';

type PageState = 'loading' | 'ready' | 'notfound' | 'error';

export default function PublicTicketPage() {
  const router = useRouter();
  const tenant = router.query.tenant as string | undefined;
  const ticketId = router.query.ticketId as string | undefined;

  const [state, setState] = useState<PageState>('loading');
  const [ticket, setTicket] = useState<PublicTicket | null>(null);
  const [message, setMessage] = useState('');

  const load = useCallback(async () => {
    if (!tenant || !ticketId) return;
    setState('loading');
    try {
      const res = await apiClient.get<PublicTicket>(`/api/v1/public/${tenant}/ticket/${ticketId}`);
      setTicket(res.data);
      setState('ready');
    } catch (err) {
      const e = err as { status?: number; response?: { status?: number } } | undefined;
      const status = e?.status ?? e?.response?.status;
      if (status === 404) {
        setState('notfound');
        return;
      }
      setMessage(extractApiErrorMessage(err, 'Não foi possível carregar sua senha. Verifique a conexão e tente de novo.'));
      setState('error');
    }
  }, [tenant, ticketId]);

  useEffect(() => { load(); }, [load]);

  const title = ticket ? `Senha ${ticket.ticket_number} · ${ticket.tenant_name}` : 'Sua senha';

  return (
    <PublicShell
      title={title}
      noindex
      tenantName={ticket?.tenant_name}
      logoUrl={ticket?.tenant_logo_url}
      subtitle={ticket ? formatGiraDateShort(ticket.gira_date_iso) ?? ticket.gira_date : undefined}
      brand={{ primary: ticket?.primary_color, secondary: ticket?.secondary_color }}
    >
      {state === 'loading' && <PublicLoading label="Buscando sua senha…" />}

      {state === 'notfound' && (
        <PublicNotice
          tone="warning"
          icon={<SearchX />}
          title="Senha não encontrada"
          description="O link pode estar incompleto ou a senha pode ter sido removida. Se precisar, peça uma nova pelo link do terreiro."
          actions={
            tenant && (
              <Button asChild size="touch" className="w-full">
                <Link href={`/public/${tenant}`}>Ver próximas giras do terreiro</Link>
              </Button>
            )
          }
        />
      )}

      {state === 'error' && (
        <PublicNotice
          tone="error"
          title="Não foi possível carregar"
          description={message}
          actions={
            <Button type="button" size="touch" className="w-full" onClick={load}>
              Tentar de novo
            </Button>
          }
        />
      )}

      {state === 'ready' && ticket && <Bilhete ticket={ticket} ticketId={ticketId} />}
    </PublicShell>
  );
}
