/**
 * Cancelamento pela própria pessoa — link do e-mail de emissão.
 * Route: /public/ticket/[ticketId]/cancelar
 *
 * Carrega GET /api/v1/public/tickets/{ticketId}/cancel-info ao abrir (só leitura, então
 * um scanner de e-mail pré-carregando o link não cancela nada) e só chama
 * POST /api/v1/public/tickets/{ticketId}/cancel depois da confirmação explícita.
 * Em seguida busca o bilhete (GET /{tenant_slug}/ticket/{id}) para logo, cores, data com dia
 * da semana e para "Manter minha senha" mostrar o Bilhete na hora. Senha inexistente (404),
 * erro de carga e erro de cancelamento são estados separados; os dois últimos com "Tentar de novo".
 */
'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { CircleCheck, Loader2, Lock, SearchX, TriangleAlert } from 'lucide-react';
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
  ticketPagePath,
  type PublicTicket,
} from '@/components/public';

type PageState =
  | 'loading'
  | 'confirm'
  | 'keeping'
  | 'keep'
  | 'blocked'
  | 'cancelling'
  | 'success'
  | 'notfound'
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
      let full: PublicTicket | null = null;
      try {
        const ticketRes = await apiClient.get<PublicTicket>(`/api/v1/public/${res.data.tenant_slug}/ticket/${ticketId}`);
        full = ticketRes.data?.ticket_number ? ticketRes.data : null;
      } catch {
        /* sem o bilhete completo, segue com os dados do cancel-info */
      }
      setTicket(full);
      if (res.data.cancellable) {
        setState('confirm');
      } else {
        setMessage(res.data.reason || 'Esta senha não pode ser cancelada.');
        setState('blocked');
      }
    } catch (err) {
      const status = (err as { status?: number } | undefined)?.status;
      if (status === 404) {
        setState('notfound');
        return;
      }
      setMessage(publicErrorMessage(err, 'Não foi possível carregar os dados da senha.'));
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
      setMessage(publicErrorMessage(err, 'Não foi possível cancelar sua senha.'));
      setState('cancel-error');
    }
  }, [ticketId]);

  const handleKeep = useCallback(async () => {
    if (!ticketId || !info) return;
    if (ticket) {
      setState('keep');
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    setState('keeping');
    try {
      const res = await apiClient.get<PublicTicket>(`/api/v1/public/${info.tenant_slug}/ticket/${ticketId}`);
      setTicket(res.data);
    } catch {
      setTicket(null);
    }
    setState('keep');
  }, [ticketId, info, ticket]);

  const tenantSlug = info?.tenant_slug;
  const nextGiras = tenantSlug ? (
    <Button asChild variant="outline" size="touch" className="w-full">
      <Link href={tenantAgendaPath(tenantSlug)}>Ver próximas giras</Link>
    </Button>
  ) : null;

  const title = info ? `Cancelar senha ${info.ticket_number} · ${info.tenant_name}` : 'Cancelar minha senha';

  const footer =
    (state === 'confirm' || state === 'cancelling') && info ? (
      <div className="flex flex-col gap-1">
        <Button
          type="button"
          variant="destructive"
          size="touch"
          className="h-[58px] w-full text-[1.1875rem] font-bold"
          onClick={handleCancel}
          disabled={state === 'cancelling'}
          aria-busy={state === 'cancelling'}
        >
          {state === 'cancelling' && <Loader2 className="animate-spin" />}
          {state === 'cancelling' ? 'Cancelando…' : 'Sim, cancelar minha senha'}
        </Button>
        <Button type="button" variant="ghost" size="touch" className="w-full text-base font-semibold" onClick={handleKeep} disabled={state === 'cancelling'}>
          Manter minha senha
        </Button>
      </div>
    ) : undefined;

  return (
    <PublicShell
      title={title}
      footer={footer}
      noindex
      tenantName={ticket?.tenant_name ?? info?.tenant_name}
      logoUrl={ticket?.tenant_logo_url}
      subtitle={info?.gira_name}
      brand={{ primary: ticket?.primary_color, secondary: ticket?.secondary_color }}
    >
      {state === 'loading' && <PublicLoading label="Carregando sua senha…" />}
      {state === 'keeping' && <PublicLoading label="Buscando seu bilhete…" />}

      {(state === 'confirm' || state === 'cancelling') && info && (
        // Jornada 3 v2 · 07: a pergunta em Fraunces, o que acontece em frase, o aviso de que não tem volta e a
        // senha em lista; os botões ficam na barra de baixo ("Sim, cancelar" e "Manter minha senha").
        <section className="flex flex-col gap-4 px-1 pt-1" aria-labelledby="cancelar-titulo">
          <h1 id="cancelar-titulo" className="font-display text-[2rem] leading-tight font-normal tracking-[-0.02em]">
            Cancelar a {info.waitlisted ? 'sua vaga na fila de espera' : 'sua senha'}?
          </h1>
          <p className="text-[1.0625rem]">
            {info.waitlisted
              ? `A vaga ${info.ticket_number} na fila de espera deixa de valer${(info.acompanhantes?.length ?? 0) > 0 ? ', e a dos acompanhantes também' : ''}.`
              : `A senha ${info.ticket_number} deixa de valer${(info.acompanhantes?.length ?? 0) > 0 ? ', e a dos acompanhantes também' : ''}. A vaga vai para quem está na fila de espera.`}
          </p>
          <Alert variant="warning">
            <TriangleAlert aria-hidden />
            <AlertTitle>Isso não pode ser desfeito</AlertTitle>
            <AlertDescription>Se mudar de ideia depois, será preciso pegar outra senha, se ainda houver.</AlertDescription>
          </Alert>
          <dl className="m-0 border-b border-border">
            {[
              ['Senha', [info.ticket_number, ticket?.consulente_name].filter(Boolean).join(' · ')],
              ['Gira', [info.gira_name, ticket ? formatGiraDate(ticket.gira_date_iso, info.gira_date) : info.gira_date].filter(Boolean).join(' · ')],
              ...((info.acompanhantes?.length ?? 0) > 0
                ? [['Acompanhantes', info.acompanhantes!.map((a) => `${a.ticket_number} · ${a.name}`).join(', ')]]
                : []),
            ].map(([k, v]) => (
              <div key={k} className="flex items-baseline justify-between gap-4 border-t border-border py-3">
                <dt className="shrink-0 text-[0.9375rem] text-muted-foreground">{k}</dt>
                <dd className="m-0 text-right text-[0.9375rem] font-semibold">{v}</dd>
              </div>
            ))}
          </dl>
          <p data-testid="ticket-number" className="sr-only">
            {info.ticket_number}
          </p>
        </section>
      )}

      {state === 'keep' && ticket && (
        // Sem ticketId: o link "Cancelar minha senha" do Bilhete apontaria para esta mesma rota.
        <Bilhete
          ticket={ticket}
          heading="Sua senha continua valendo"
          intro="Nada foi cancelado."
          shareLink={ticketId ? `${window.location.origin}${ticketPagePath(ticket.tenant_slug, ticketId)}` : undefined}
        />
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
            <p className="text-[3rem] leading-none font-extrabold tabular-nums tracking-tight text-(color:--brand-text)">{info.ticket_number}</p>
          )}
        </PublicNotice>
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
