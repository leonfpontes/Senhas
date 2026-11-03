/**
 * Confirmação da fila de espera — link do e-mail "sua vaga abriu".
 * Route: /public/waitlist/[ticketId]/confirm
 *
 * Tela de decisão: carrega os dados da senha (GET cancel-info → tenant_slug, depois
 * GET /{tenant_slug}/ticket/{id}) e só chama POST /api/v1/public/waitlist/{id}/confirm
 * quando a pessoa toca em "Confirmar minha senha" — abrir o link (ou um scanner de
 * e-mail pré-carregar a página) não confirma nada. "Não vou poder ir" leva ao
 * cancelamento. Sucesso mostra o Bilhete; expirado (410) e erro têm saída clara.
 */
'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { Check, Loader2, SearchX, TimerOff, TriangleAlert } from 'lucide-react';
import { apiClient } from '@/services/api_client';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  Bilhete,
  PublicLoading,
  PublicNotice,
  PublicShell,
  publicErrorMessage,
  formatGiraDate,
  tenantAgendaPath,
  formatGiraDateShort,
  type PublicTicket,
} from '@/components/public';

type PageState =
  | 'loading'
  | 'decide'
  | 'confirming'
  | 'success'
  | 'expired'
  | 'notfound'
  | 'load-error'
  | 'confirm-error'
  | 'not-waiting';

interface CancelInfo {
  ticket_number: string;
  status: string;
  cancellable: boolean;
  reason: string | null;
  gira_name: string;
  gira_date: string;
  tenant_name: string;
  tenant_slug: string;
  consulente_name: string;
  waitlisted: boolean;
}

export default function WaitlistConfirmPage() {
  const router = useRouter();
  const ticketId = router.query.ticketId as string | undefined;

  const [state, setState] = useState<PageState>('loading');
  const [info, setInfo] = useState<CancelInfo | null>(null);
  const [ticket, setTicket] = useState<PublicTicket | null>(null);
  const [message, setMessage] = useState('');

  const load = useCallback(async () => {
    if (!ticketId) return;
    setState('loading');
    try {
      const infoRes = await apiClient.get<CancelInfo>(`/api/v1/public/tickets/${ticketId}/cancel-info`);
      const data = infoRes.data;
      setInfo(data);
      let full: PublicTicket | null = null;
      try {
        const ticketRes = await apiClient.get<PublicTicket>(`/api/v1/public/${data.tenant_slug}/ticket/${ticketId}`);
        full = ticketRes.data;
      } catch {
        /* sem o bilhete completo, segue com os dados do cancel-info */
      }
      setTicket(full);
      const status = full?.status ?? data.status;
      if (status === 'emitted') {
        // Já confirmada (clique repetido no e-mail): mostra o bilhete direto.
        setState('success');
      } else if (status === 'waitlist_expired') {
        setMessage('O prazo de confirmação terminou e a vaga foi repassada para a próxima pessoa da fila.');
        setState('expired');
      } else if (!data.waitlisted && status !== 'waitlisted') {
        setMessage(data.reason || 'Esta senha não está aguardando confirmação.');
        setState('not-waiting');
      } else {
        setState('decide');
      }
    } catch (err) {
      const status = (err as { status?: number } | undefined)?.status;
      if (status === 404) {
        setState('notfound');
        return;
      }
      setMessage(publicErrorMessage(err, 'Não foi possível carregar sua senha.'));
      setState('load-error');
    }
  }, [ticketId]);

  useEffect(() => { load(); }, [load]);

  const confirm = useCallback(async () => {
    if (!ticketId) return;
    setState('confirming');
    try {
      const res = await apiClient.post<{ ticket_number: string; message: string }>(`/api/v1/public/waitlist/${ticketId}/confirm`);
      setMessage(res.data.message);
      setTicket((prev) =>
        prev
          ? { ...prev, status: 'emitted', status_label: 'Confirmada', waitlisted: false, cancellable: true, ticket_number: res.data.ticket_number || prev.ticket_number }
          : prev,
      );
      setState('success');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      const status = (err as { status?: number } | undefined)?.status;
      setMessage(publicErrorMessage(err, 'Não foi possível confirmar sua senha.'));
      setState(status === 410 ? 'expired' : 'confirm-error');
    }
  }, [ticketId]);

  const tenantName = ticket?.tenant_name ?? info?.tenant_name;
  const tenantSlug = ticket?.tenant_slug ?? info?.tenant_slug;
  const title = tenantName ? `Confirmar minha senha · ${tenantName}` : 'Confirmar minha senha';

  const nextGiras = tenantSlug ? (
    <Button asChild variant="outline" size="touch" className="w-full">
      <Link href={tenantAgendaPath(tenantSlug)}>Ver próximas giras</Link>
    </Button>
  ) : null;

  const footer =
    state === 'decide' || state === 'confirming' ? (
      <div className="flex flex-col gap-2">
        <Button type="button" size="touch" className="h-[58px] w-full text-[1.1875rem] font-bold" onClick={confirm} disabled={state === 'confirming'} aria-busy={state === 'confirming'}>
          {state === 'confirming' && <Loader2 className="animate-spin" />}
          {state === 'confirming' ? 'Confirmando…' : 'Confirmar minha senha'}
          {state !== 'confirming' && <Check aria-hidden />}
        </Button>
        <Button asChild variant="ghost" size="touch" className="w-full text-base font-semibold">
          <Link href={`/public/ticket/${ticketId}/cancelar`}>Não vou poder ir</Link>
        </Button>
      </div>
    ) : undefined;

  return (
    <PublicShell
      title={title}
      noindex
      tenantName={tenantName}
      logoUrl={ticket?.tenant_logo_url}
      subtitle={ticket ? formatGiraDateShort(ticket.gira_date_iso) ?? ticket.gira_date : info?.gira_date}
      brand={{ primary: ticket?.primary_color, secondary: ticket?.secondary_color }}
      footer={footer}
    >
      {state === 'loading' && <PublicLoading label="Buscando sua senha…" />}

      {(state === 'decide' || state === 'confirming') && (
        <section aria-labelledby="abriu-vaga" className="flex flex-col gap-4 px-1 pt-1">
          <div>
            <h1 id="abriu-vaga" className="font-display text-[2rem] font-normal leading-tight tracking-[-0.02em]">
              Abriu uma vaga <em className="block text-[color:var(--color-barro-600)]">para você!</em>
            </h1>
            <p className="mt-2 text-[1.0625rem] leading-relaxed">Confirme para transformar sua posição na fila em uma senha.</p>
          </div>

          <Alert variant="warning">
            <TriangleAlert />
            <AlertTitle>A vaga fica reservada por tempo limitado</AlertTitle>
            <AlertDescription>
              O prazo está no e-mail que você recebeu. Depois disso ela passa para a próxima pessoa da fila.
            </AlertDescription>
          </Alert>

          <dl className="m-0 border-b border-border">
            {[
              ['Gira', ticket ? formatGiraDate(ticket.gira_date_iso, ticket.gira_date) : info?.gira_date, ticket?.gira_name ?? info?.gira_name],
              ['Nome', ticket?.consulente_name ?? info?.consulente_name],
              ...(ticket?.horario ? [['Horário', ticket.horario]] : []),
              ['Senha', ticket?.ticket_number ?? info?.ticket_number],
            ]
              .filter(([, v]) => Boolean(v))
              .map(([k, v, extra]) => (
                <div key={k} className="flex items-baseline justify-between gap-4 border-t border-border py-3">
                  <dt className="text-[0.9375rem] text-muted-foreground">{k}</dt>
                  <dd className="m-0 text-right text-[0.9375rem] font-semibold">
                    {extra ? <span className="block">{extra}</span> : null}
                    <span data-testid={k === 'Senha' ? 'ticket-number' : undefined}>{v}</span>
                  </dd>
                </div>
              ))}
          </dl>
        </section>
      )}

      {state === 'success' && ticket && (
        <Bilhete
          ticket={ticket}
          ticketId={ticketId}
          heading="Senha confirmada!"
          intro={message || 'Sua vaga está garantida. Enviamos a confirmação por e-mail.'}
        />
      )}
      {state === 'success' && !ticket && (
        <PublicNotice
          tone="success"
          title="Senha confirmada!"
          description={message || 'Sua vaga está garantida. Enviamos a confirmação por e-mail.'}
          actions={nextGiras}
        />
      )}

      {state === 'expired' && (
        <PublicNotice
          tone="warning"
          icon={<TimerOff />}
          title="Prazo expirado"
          description={message}
          actions={nextGiras}
        />
      )}

      {state === 'not-waiting' && (
        <PublicNotice tone="info" title="Nada para confirmar" description={message} actions={nextGiras} />
      )}

      {state === 'notfound' && (
        <PublicNotice
          tone="warning"
          icon={<SearchX />}
          title="Senha não encontrada"
          description="O link pode estar incompleto ou a senha pode ter sido removida. Confira o e-mail que você recebeu."
        />
      )}

      {state === 'load-error' && (
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

      {state === 'confirm-error' && (
        <PublicNotice
          tone="error"
          title="Não foi possível confirmar"
          description={message}
          actions={
            <>
              <Button type="button" size="touch" className="w-full" onClick={confirm}>
                Tentar de novo
              </Button>
              {nextGiras}
            </>
          }
        />
      )}
    </PublicShell>
  );
}
