/**
 * Cancelamento pela própria pessoa — link do e-mail de emissão.
 * Route: /public/ticket/[ticketId]/cancelar
 *
 * Carrega GET /api/v1/public/tickets/{ticketId}/cancel-info ao abrir (só leitura, então
 * um scanner de e-mail pré-carregando o link não cancela nada) e só chama
 * POST /api/v1/public/tickets/{ticketId}/cancel depois da confirmação explícita.
 * "Manter minha senha" mostra o Bilhete (GET /{tenant_slug}/ticket/{id}); erro de carga e
 * erro de cancelamento são estados separados, cada um com "Tentar de novo".
 */
'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { CalendarX2, CircleCheck, Loader2, Lock } from 'lucide-react';
import { apiClient, extractApiErrorMessage } from '@/services/api_client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Bilhete, PublicLoading, PublicNotice, PublicShell, type PublicTicket } from '@/components/public';

type PageState =
  | 'loading'
  | 'confirm'
  | 'keeping'
  | 'keep'
  | 'blocked'
  | 'cancelling'
  | 'success'
  | 'load-error'
  | 'cancel-error';

interface AcompanhanteCancelInfo {
  ticket_number: string;
  name: string;
}

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
  acompanhantes?: AcompanhanteCancelInfo[];
}

export default function CancelTicketPage() {
  const router = useRouter();
  const ticketId = router.query.ticketId as string | undefined;

  const [state, setState] = useState<PageState>('loading');
  const [info, setInfo] = useState<CancelInfo | null>(null);
  const [ticket, setTicket] = useState<PublicTicket | null>(null);
  const [message, setMessage] = useState<string>('');

  const load = useCallback(async () => {
    if (!ticketId) return;
    setState('loading');
    try {
      const res = await apiClient.get<CancelInfo>(`/api/v1/public/tickets/${ticketId}/cancel-info`);
      setInfo(res.data);
      if (res.data.cancellable) {
        setState('confirm');
      } else {
        setMessage(res.data.reason || 'Esta senha não pode ser cancelada.');
        setState('blocked');
      }
    } catch (err) {
      setMessage(extractApiErrorMessage(err, 'Não foi possível carregar os dados da senha.'));
      setState('load-error');
    }
  }, [ticketId]);

  useEffect(() => { load(); }, [load]);

  const handleCancel = useCallback(async () => {
    if (!ticketId) return;
    setState('cancelling');
    try {
      const res = await apiClient.post<{ ticket_number: string; message: string }>(`/api/v1/public/tickets/${ticketId}/cancel`);
      setMessage(res.data.message);
      setState('success');
    } catch (err) {
      setMessage(extractApiErrorMessage(err, 'Não foi possível cancelar sua senha.'));
      setState('cancel-error');
    }
  }, [ticketId]);

  const handleKeep = useCallback(async () => {
    if (!ticketId || !info) return;
    setState('keeping');
    try {
      const res = await apiClient.get<PublicTicket>(`/api/v1/public/${info.tenant_slug}/ticket/${ticketId}`);
      setTicket(res.data);
    } catch {
      setTicket(null);
    }
    setState('keep');
  }, [ticketId, info]);

  const tenantSlug = info?.tenant_slug;
  const nextGiras = tenantSlug ? (
    <Button asChild variant="outline" size="touch" className="w-full">
      <Link href={`/public/${tenantSlug}`}>Ver próximas giras</Link>
    </Button>
  ) : null;

  const title = info ? `Cancelar senha ${info.ticket_number} · ${info.tenant_name}` : 'Cancelar minha senha';

  return (
    <PublicShell
      title={title}
      noindex
      tenantName={ticket?.tenant_name ?? info?.tenant_name}
      logoUrl={ticket?.tenant_logo_url}
      subtitle={info?.gira_name}
      brand={{ primary: ticket?.primary_color, secondary: ticket?.secondary_color }}
    >
      {state === 'loading' && <PublicLoading label="Carregando sua senha…" />}
      {state === 'keeping' && <PublicLoading label="Buscando seu bilhete…" />}

      {(state === 'confirm' || state === 'cancelling') && info && (
        <Card className="gap-4 py-5">
          <CardContent className="flex flex-col gap-4 px-5">
            <div className="text-center">
              <span aria-hidden className="mx-auto mb-3 flex size-14 items-center justify-center rounded-full bg-warning/10 text-warning [&_svg]:size-7">
                <CalendarX2 />
              </span>
              <h1 className="text-2xl font-bold leading-tight">
                Cancelar {info.waitlisted ? 'sua vaga na fila de espera' : 'sua senha'}?
              </h1>
            </div>

            <div className="text-center">
              <p data-testid="ticket-number" className="text-[4rem] leading-none font-extrabold tabular-nums tracking-tight text-primary">
                {info.ticket_number}
              </p>
              <p className="mt-2 text-base font-semibold">{info.gira_name}</p>
              {info.gira_date && <p className="text-base text-muted-foreground">{info.gira_date}</p>}
              <p className="text-base text-muted-foreground">{info.tenant_name}</p>
            </div>

            {(info.acompanhantes?.length ?? 0) > 0 && (
              <Alert variant="warning">
                <AlertDescription>
                  As senhas dos seus acompanhantes também serão canceladas:{' '}
                  {info.acompanhantes!.map((a) => `${a.ticket_number} (${a.name})`).join(', ')}.
                </AlertDescription>
              </Alert>
            )}

            <p className="text-center text-base">
              {info.waitlisted
                ? 'Você sairá da fila de espera desta gira. Esta ação não pode ser desfeita.'
                : 'Sua vaga será liberada para outra pessoa. Esta ação não pode ser desfeita.'}
            </p>

            <div className="flex flex-col gap-2">
              <Button
                type="button"
                variant="destructive"
                size="touch"
                className="w-full"
                onClick={handleCancel}
                disabled={state === 'cancelling'}
                aria-busy={state === 'cancelling'}
              >
                {state === 'cancelling' && <Loader2 className="animate-spin" />}
                {state === 'cancelling' ? 'Cancelando…' : 'Sim, cancelar minha senha'}
              </Button>
              <Button type="button" variant="outline" size="touch" className="w-full" onClick={handleKeep} disabled={state === 'cancelling'}>
                Manter minha senha
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {state === 'keep' && ticket && (
        <Bilhete ticket={ticket} ticketId={ticketId} heading="Sua senha continua valendo" intro="Nada foi cancelado." />
      )}
      {state === 'keep' && !ticket && info && (
        <PublicNotice
          tone="success"
          icon={<CircleCheck />}
          title="Sua senha continua valendo"
          description={`Nada foi cancelado. Senha ${info.ticket_number} — ${info.gira_name}.`}
          actions={nextGiras}
        />
      )}

      {state === 'success' && (
        <PublicNotice tone="success" title="Senha cancelada" description={message} actions={nextGiras}>
          {info && (
            <p className="text-[3rem] leading-none font-extrabold tabular-nums tracking-tight text-muted-foreground" style={{ textDecoration: 'line-through' }}>
              {info.ticket_number}
            </p>
          )}
        </PublicNotice>
      )}

      {state === 'blocked' && (
        <PublicNotice tone="warning" icon={<Lock />} title="Cancelamento indisponível" description={message} actions={nextGiras}>
          {info && (
            <p className="text-[3rem] leading-none font-extrabold tabular-nums tracking-tight text-primary">{info.ticket_number}</p>
          )}
        </PublicNotice>
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

      {state === 'cancel-error' && (
        <PublicNotice
          tone="error"
          title="Não foi possível cancelar"
          description={message}
          actions={
            <>
              <Button type="button" variant="destructive" size="touch" className="w-full" onClick={handleCancel}>
                Tentar de novo
              </Button>
              <Button type="button" variant="outline" size="touch" className="w-full" onClick={handleKeep}>
                Manter minha senha
              </Button>
            </>
          }
        />
      )}
    </PublicShell>
  );
}
