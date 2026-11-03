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
import { CalendarPlus, MapPin, MessageCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  buildIcs,
  buildShareText,
  downloadIcs,
  formatGiraDate,
  formatGiraDateShort,
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
    // Jornada 3 v2 · 04: só o bilhete é cartão; o resto fica sobre a página, em lista com filetes.
    <Card className={cn('gap-5 border-0 bg-transparent py-2 shadow-none ring-0', className)}>
      <CardContent className="flex flex-col gap-4 px-1">
        {(heading || intro) && (
          <div>
            {heading && <h1 className="font-display text-[2rem] leading-tight font-normal tracking-[-0.02em]">{heading}</h1>}
            {intro && <p className="mt-1 text-base text-muted-foreground">{intro}</p>}
          </div>
        )}

        {/* O Bilhete do design system: faixa na cor da casa com a gira, "Sua senha", o número em Fraunces,
            quem vai e, no rodapé do bilhete, o acompanhante e o número para dizer na entrada. */}
        <div className="mx-auto w-full max-w-[320px] overflow-hidden rounded-[22px] bg-card shadow-lg ring-1 ring-border">
          <div className="bg-primary px-5 py-3 text-left text-primary-foreground">
            <p className="truncate text-[0.9375rem] font-semibold">{ticket.tenant_name}</p>
            <p className="truncate text-[0.8125rem] opacity-90">
              {[ticket.gira_name, formatGiraDateShort(ticket.gira_date_iso)].filter(Boolean).join(' · ')}
            </p>
          </div>
          <div className="px-5 pt-4 pb-4 text-center">
            <p className="text-sm font-medium text-muted-foreground">Sua senha</p>
            <p
              data-testid="ticket-number"
              aria-label={`Senha ${ticket.ticket_number}`}
              style={cancelled ? { textDecoration: 'line-through' } : undefined}
              className={cn(
                'font-display text-[5.25rem] leading-none font-semibold tabular-nums tracking-[-0.03em]',
                done ? 'text-muted-foreground' : 'text-[color:var(--color-barro-700)]',
              )}
            >
              {ticket.ticket_number}
            </p>
            {ticket.consulente_name && <p className="mt-2 text-lg font-semibold">{ticket.consulente_name.split(' ').slice(0, 2).join(' ')}</p>}
            {ticket.status !== 'emitted' && (
              <Badge
                variant={done ? 'outline' : 'secondary'}
                className={cn(
                  'mt-2 text-sm font-semibold',
                  !done && ticket.waitlisted && 'bg-warning/15 text-warning-strong',
                  !done && !ticket.waitlisted && 'bg-info/15 text-info-strong',
                )}
              >
                {ticket.status_label}
              </Badge>
            )}
          </div>
          <div className="flex items-end justify-between gap-3 border-t border-dashed border-border px-5 py-3 text-left">
            <div className="min-w-0">
              {ticket.acompanhantes.length > 0 && (
                <>
                  <p className="text-xs text-muted-foreground">{ticket.acompanhantes.length === 1 ? 'Acompanhante' : 'Acompanhantes'}</p>
                  <p className="truncate font-semibold">
                    {ticket.acompanhantes.map((a) => `${a.ticket_number} · ${a.name.split(' ')[0]}`).join(', ')}
                  </p>
                </>
              )}
            </div>
            {!done && (
              <div className="text-right">
                <p className="text-xs text-muted-foreground">Na entrada, informe</p>
                <p className="font-semibold tabular-nums">{ticket.ticket_number}</p>
              </div>
            )}
          </div>
        </div>

        {!done && (
          <p className="text-center text-base">Na entrada, informe o número {ticket.ticket_number}.</p>
        )}

        {notice}

        {ticket.waitlisted && (
          <Alert variant="warning">
            <AlertDescription>
              Você está na fila de espera. Se abrir uma vaga, avisamos por e-mail com um prazo para confirmar.
            </AlertDescription>
          </Alert>
        )}

        {/* ListaDeDetalhes: rótulo à esquerda, valor à direita, filete entre as linhas. */}
        <dl className="m-0 border-b border-border" data-testid="bilhete-detalhes">
          {[
            ['Gira', ticket.gira_name],
            ['Dia', formatGiraDate(ticket.gira_date_iso, ticket.gira_date)],
            ['Horário', ticket.horario ? `Seu horário de atendimento: ${ticket.horario}` : null],
            ['Em nome de', ticket.consulente_name ? `Em nome de ${ticket.consulente_name}` : null],
            ['Acompanhante', ticket.acompanhantes.length ? ticket.acompanhantes.map((a) => a.name).join(', ') : null],
            ['Local', ticket.gira_local || ticket.tenant_address ? 'local' : null],
          ]
            .filter(([, v]) => v)
            .map(([k, v]) => (
              <div key={k as string} className="flex items-baseline justify-between gap-4 border-t border-border py-3">
                <dt className="shrink-0 text-[0.9375rem] text-muted-foreground">{k}</dt>
                <dd className="m-0 text-right text-[0.9375rem] font-semibold">
                  {k === 'Local' ? (
                    <>
                      {ticket.gira_local && <span className="block">{ticket.gira_local}</span>}
                      {ticket.tenant_address && <span className="block font-normal text-muted-foreground">{ticket.tenant_address}</span>}
                    </>
                  ) : (
                    (v as string).replace(/^Seu horário de atendimento: |^Em nome de /, '')
                  )}
                </dd>
              </div>
            ))}
        </dl>
        {/* Os textos completos continuam para leitores de tela e para quem copia o bilhete. */}
        <p className="sr-only">
          {ticket.horario && <>Seu horário de atendimento: {ticket.horario}. </>}
          {ticket.consulente_name && <>Em nome de {ticket.consulente_name}.</>}
        </p>

        {ticket.maps_url && (
          <a
            href={ticket.maps_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-11 items-center gap-2 self-start text-[1.0625rem] font-semibold text-foreground underline underline-offset-4"
          >
            Como chegar <MapPin aria-hidden className="size-4" />
          </a>
        )}

        {ticket.recados && (
          <div>
            <p className="text-base font-semibold">Recados da casa</p>
            <p className="mt-1 text-base whitespace-pre-line text-muted-foreground">{ticket.recados}</p>
          </div>
        )}

        {!done && (
          <div className="flex flex-col gap-2.5">
            {ics && (
              <Button type="button" variant="outline" size="touch" className="w-full border-foreground/80 text-base font-semibold" onClick={handleIcs}>
                Adicionar à agenda <CalendarPlus />
              </Button>
            )}
            <Button asChild variant="outline" size="touch" className="w-full border-foreground/80 text-base font-semibold">
              <a href={waUrl} target="_blank" rel="noopener noreferrer">
                Enviar no WhatsApp <MessageCircle />
              </a>
            </Button>
          </div>
        )}

        <div className="flex flex-col items-start gap-1">
          {!done && ticket.cancellable && ticketId && (
            <Link
              href={`/public/ticket/${ticketId}/cancelar`}
              className="inline-flex min-h-11 items-center text-[1.0625rem] font-semibold text-foreground underline underline-offset-4"
            >
              Cancelar minha senha
            </Link>
          )}
          {showNextGiras && (
            <Link
              href={tenantAgendaPath(ticket.tenant_slug)}
              className="inline-flex min-h-11 items-center text-[1.0625rem] font-semibold text-foreground underline underline-offset-4"
            >
              Ver próximas giras
            </Link>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export default Bilhete;
