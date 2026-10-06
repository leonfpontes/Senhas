/**
 * Bilhete — o que o consulente precisa no dia da gira, em um só cartão.
 *
 * Número grande (sem "#"), gira, data com dia da semana e horário em Brasília, horário
 * escolhido, endereço com "Como chegar", recados, acompanhantes, status quando não é mais
 * "confirmada", e as ações: "Adicionar à agenda" (.ics), "Enviar no WhatsApp",
 * "Cancelar minha senha" e "Ver próximas giras".
 *
 * Usado na emissão (sucesso), em /public/[tenant]/ticket/[ticketId], na confirmação da
 * fila de espera e no cancelamento ("Manter minha senha").
 */
import React from 'react';
import Link from 'next/link';
import { CalendarPlus, MapPin, MessageCircle, Users, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  buildIcs,
  buildShareText,
  downloadIcs,
  formatGiraDate,
  isTicketDone,
  tenantAgendaPath,
  ticketPagePath,
  whatsappShareUrl,
  type PublicTicket,
} from './bilhete-utils';

export interface BilheteProps {
  ticket: PublicTicket;
  /** UUID da senha — habilita "Cancelar minha senha" (link para /public/ticket/{id}/cancelar). */
  ticketId?: string | null;
  /** Título acima do número (ex.: "Senha emitida!"). */
  heading?: React.ReactNode;
  /** Texto sob o título (ex.: "Enviamos os detalhes para …"). */
  intro?: React.ReactNode;
  /** Aviso extra entre o número e os dados da gira (ex.: prioridade registrada). */
  notice?: React.ReactNode;
  /**
   * Link do bilhete para a mensagem do WhatsApp. Padrão: a página do bilhete montada com
   * `ticketId`; sem `ticketId`, a URL atual.
   */
  shareLink?: string;
  /** Mostra o link "Ver próximas giras" no rodapé (padrão: sim). */
  showNextGiras?: boolean;
  className?: string;
}

export function Bilhete({
  ticket,
  ticketId,
  heading,
  intro,
  notice,
  shareLink,
  showNextGiras = true,
  className,
}: BilheteProps) {
  const done = isTicketDone(ticket);
  const cancelled = ticket.status === 'cancelled';
  const ics = buildIcs(ticket);

  const handleIcs = () => {
    if (!ics) return;
    downloadIcs(ics, `senha-${ticket.ticket_number}.ics`);
  };

  // Link do WhatsApp: sempre a página do bilhete. A URL atual só serve quando já é ela —
  // na emissão, no "Manter minha senha" e na confirmação da fila a URL é outra tela.
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const link =
    shareLink ??
    (ticketId ? `${origin}${ticketPagePath(ticket.tenant_slug, ticketId)}` : typeof window !== 'undefined' ? window.location.href : undefined);
  const waUrl = whatsappShareUrl(buildShareText(ticket, link));

  return (
    <Card className={cn('gap-5 py-5', className)}>
      <CardContent className="flex flex-col gap-5 px-5">
        {(heading || intro) && (
          <div className="text-center">
            {heading && <h1 className="text-2xl font-bold leading-tight">{heading}</h1>}
            {intro && <p className="mt-1 text-base text-muted-foreground">{intro}</p>}
          </div>
        )}

        <div className="text-center">
          <p className="text-sm font-medium uppercase tracking-wide text-muted-foreground">Sua senha</p>
          <p
            data-testid="ticket-number"
            aria-label={`Senha ${ticket.ticket_number}`}
            style={cancelled ? { textDecoration: 'line-through' } : undefined}
            className={cn(
              'text-[4rem] leading-none font-extrabold tabular-nums tracking-tight sm:text-[5rem]',
              done ? 'text-muted-foreground' : 'text-(color:--brand-text)',
            )}
          >
            {ticket.ticket_number}
          </p>
          {ticket.status !== 'emitted' && (
            <Badge
              variant={done ? 'outline' : 'secondary'}
              className={cn(
                'mt-3 text-sm font-semibold',
                !done && ticket.waitlisted && 'bg-warning/15 text-warning-strong',
                !done && !ticket.waitlisted && 'bg-info/15 text-info-strong',
              )}
            >
              {ticket.status_label}
            </Badge>
          )}
        </div>

        {notice}

        {ticket.waitlisted && (
          <Alert variant="warning">
            <AlertDescription>
              Você está na fila de espera. Se abrir uma vaga, avisamos por e-mail com um prazo para confirmar.
            </AlertDescription>
          </Alert>
        )}

        <div>
          <h2 className="text-lg font-bold leading-snug [text-wrap:balance]">{ticket.gira_name}</h2>
          <p className="text-base">{formatGiraDate(ticket.gira_date_iso, ticket.gira_date)}</p>
          {ticket.horario && (
            <p className="text-base text-muted-foreground">Seu horário de atendimento: {ticket.horario}</p>
          )}
          {ticket.consulente_name && (
            <p className="text-base text-muted-foreground">Em nome de {ticket.consulente_name}</p>
          )}
        </div>

        {(ticket.tenant_address || ticket.gira_local) && (
          <div className="flex items-start gap-2">
            <MapPin aria-hidden className="mt-1 size-4 shrink-0 text-muted-foreground" />
            <div className="min-w-0">
              {ticket.gira_local && <p className="text-base">{ticket.gira_local}</p>}
              {ticket.tenant_address && <p className="text-base text-muted-foreground">{ticket.tenant_address}</p>}
              {ticket.maps_url && (
                <a
                  href={ticket.maps_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-block py-1 text-base font-semibold text-(color:--brand-text) underline-offset-4 hover:underline"
                >
                  Como chegar
                </a>
              )}
            </div>
          </div>
        )}

        {ticket.recados && (
          <Alert variant="info">
            <AlertTitle>Recados do terreiro</AlertTitle>
            <AlertDescription className="whitespace-pre-line text-base">{ticket.recados}</AlertDescription>
          </Alert>
        )}

        {ticket.acompanhantes.length > 0 && (
          <div>
            <h3 className="flex items-center gap-2 text-base font-bold">
              <Users aria-hidden className="size-4 text-muted-foreground" /> Acompanhantes
            </h3>
            <ul className="mt-1 flex flex-col gap-0.5">
              {ticket.acompanhantes.map((a) => (
                <li key={a.ticket_number} className="text-base text-muted-foreground">
                  {a.ticket_number} · {a.name}
                </li>
              ))}
            </ul>
          </div>
        )}

        {!done && (
          <div className="flex flex-col gap-2">
            {ics && (
              <Button type="button" size="touch" className="w-full" onClick={handleIcs}>
                <CalendarPlus /> Adicionar à agenda
              </Button>
            )}
            <Button asChild variant="outline" size="touch" className="w-full">
              <a href={waUrl} target="_blank" rel="noopener noreferrer">
                <MessageCircle /> Enviar no WhatsApp
              </a>
            </Button>
            {ticket.cancellable && ticketId && (
              <Button asChild variant="ghost" size="touch" className="w-full text-muted-foreground">
                <Link href={`/public/ticket/${ticketId}/cancelar`}>
                  <XCircle /> Cancelar minha senha
                </Link>
              </Button>
            )}
          </div>
        )}

        <p className="text-center text-sm text-muted-foreground">
          {!done && <>Na entrada, informe o número {ticket.ticket_number} à equipe. </>}
          {showNextGiras && (
            <Link href={tenantAgendaPath(ticket.tenant_slug)} className="font-semibold text-(color:--brand-text) underline-offset-4 hover:underline">
              Ver próximas giras
            </Link>
          )}
        </p>
      </CardContent>
    </Card>
  );
}

export default Bilhete;
