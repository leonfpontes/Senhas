/**
 * TicketDetailSheet — detalhe de uma senha num Sheet lateral (tela cheia no celular): número
 * grande, consulente com ligar/WhatsApp, prioridade, status, atendimento e o rastreio do
 * e-mail (TicketEmailPanel, o mesmo da página /admin/tickets/[ticketId]/email).
 *
 * As ações (editar atendimento, excluir) chegam prontas do chamador, que já aplicou os
 * guards de `canGroup('tickets', …)` — sem permissão o botão não é renderizado.
 */
import React from 'react';
import { Mail, MessageCircle, Pencil, Phone, Star, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { TicketEmailPanel } from '@/components/admin/TicketEmailPanel';
import { numeroDaSenha, senhaStatusLabel } from '@/components/admin/senhaFormat';

export interface TicketDetail {
  id: string;
  numero: number;
  numero_formatado?: string | null;
  status: string;
  consulente_nome?: string | null;
  consulente_email?: string | null;
  consulente_telefone?: string | null;
  preferencial?: boolean;
  priority_category?: string | null;
  is_sponsor?: boolean;
  is_acompanhante?: boolean;
  medium_nome?: string | null;
  cambone_nome?: string | null;
  atendimento_descricao?: string | null;
  created_at?: string;
}

/** Link de WhatsApp a partir do telefone digitado (assume Brasil quando faltar o DDI). */
export function whatsappLink(telefone: string): string | null {
  const digits = telefone.replace(/\D/g, '');
  if (digits.length < 10) return null;
  const withCountry = digits.length <= 11 ? `55${digits}` : digits;
  return `https://wa.me/${withCountry}`;
}

export function telLink(telefone: string): string | null {
  const digits = telefone.replace(/\D/g, '');
  return digits.length >= 8 ? `tel:${digits}` : null;
}

export interface TicketDetailSheetProps {
  ticket: TicketDetail | null;
  onOpenChange: (open: boolean) => void;
  priorityLabel?: string | null;
  /** Mostra o rastreio do e-mail (plano com e-mail transacional e senha com e-mail). */
  showEmail: boolean;
  onEdit?: () => void;
  onDelete?: () => void;
}

export function ContactActions({ telefone, nome }: { telefone: string; nome?: string | null }) {
  const tel = telLink(telefone);
  const wa = whatsappLink(telefone);
  const quem = nome ? ` ${nome}` : '';
  return (
    <span className="inline-flex gap-1">
      {tel && (
        <Button asChild size="icon-sm" variant="outline" onClick={(e) => e.stopPropagation()}>
          <a href={tel} aria-label={`Ligar para${quem}`}>
            <Phone aria-hidden />
          </a>
        </Button>
      )}
      {wa && (
        <Button asChild size="icon-sm" variant="outline" onClick={(e) => e.stopPropagation()}>
          <a href={wa} target="_blank" rel="noopener noreferrer" aria-label={`WhatsApp de${quem || ' consulente'}`}>
            <MessageCircle aria-hidden />
          </a>
        </Button>
      )}
    </span>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="m-0 text-sm text-foreground">{children}</dd>
    </div>
  );
}

export function TicketDetailSheet({ ticket, onOpenChange, priorityLabel, showEmail, onEdit, onDelete }: TicketDetailSheetProps) {
  return (
    <Sheet open={!!ticket} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full gap-0 overflow-y-auto sm:max-w-lg" data-testid="ticket-detail-sheet">
        {ticket && (
          <>
            <SheetHeader className="border-b">
              <p className="font-mono text-4xl font-black tabular-nums">{numeroDaSenha(ticket)}</p>
              <SheetTitle>{ticket.consulente_nome || 'Consulente sem nome'}</SheetTitle>
              <SheetDescription>
                {senhaStatusLabel(ticket.status)}
                {ticket.created_at &&
                  ` · emitida em ${new Date(ticket.created_at).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}`}
              </SheetDescription>
              <div className="flex flex-wrap gap-1 pt-1">
                {ticket.is_sponsor && (
                  <Badge variant="outline" className="border-warning/40 bg-warning/15 text-warning-foreground">
                    <Star aria-hidden /> Associado
                  </Badge>
                )}
                {ticket.preferencial && (
                  <Badge variant="outline" className="border-warning/40 text-warning-foreground">
                    <Star aria-hidden /> {priorityLabel || 'Preferencial'}
                  </Badge>
                )}
                {ticket.is_acompanhante && <Badge variant="outline">Acompanhante</Badge>}
              </div>
            </SheetHeader>

            <div className="flex flex-col gap-5 p-4">
              <dl className="m-0 grid gap-3">
                {ticket.consulente_telefone && (
                  <Row label="Telefone">
                    <span className="flex items-center justify-between gap-2">
                      <span>{ticket.consulente_telefone}</span>
                      <ContactActions telefone={ticket.consulente_telefone} nome={ticket.consulente_nome} />
                    </span>
                  </Row>
                )}
                {ticket.consulente_email && (
                  <Row label="E-mail">
                    <a href={`mailto:${ticket.consulente_email}`} className="inline-flex items-center gap-1.5 break-all text-primary">
                      <Mail className="size-4 shrink-0" aria-hidden /> {ticket.consulente_email}
                    </a>
                  </Row>
                )}
                {(ticket.medium_nome || ticket.cambone_nome) && (
                  <Row label="Atendimento">
                    {ticket.medium_nome || '—'}
                    {ticket.cambone_nome ? ` · cambone ${ticket.cambone_nome}` : ''}
                  </Row>
                )}
                {ticket.atendimento_descricao && <Row label="Observações">{ticket.atendimento_descricao}</Row>}
              </dl>

              {(onEdit || onDelete) && (
                <div className="flex flex-col gap-2 sm:flex-row">
                  {onEdit && (
                    <Button type="button" variant="outline" className="flex-1" onClick={onEdit}>
                      <Pencil aria-hidden /> Editar atendimento
                    </Button>
                  )}
                  {onDelete && (
                    <Button type="button" variant="outline" className="flex-1 text-destructive" onClick={onDelete}>
                      <Trash2 aria-hidden /> Excluir senha
                    </Button>
                  )}
                </div>
              )}

              {showEmail && (
                <>
                  <Separator />
                  <section aria-label="Rastreio do e-mail" className="flex flex-col gap-2">
                    <h3 className="text-sm font-semibold">E-mail da senha</h3>
                    <TicketEmailPanel ticketId={ticket.id} showPreview={false} />
                  </section>
                </>
              )}
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

export default TicketDetailSheet;
