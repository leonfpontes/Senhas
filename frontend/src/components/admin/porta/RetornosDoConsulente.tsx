/**
 * Retorno do consulente na Porta (beta `beta_retorno_consulente`, pedido da Mãe Rai em 06/11/2026).
 *
 * Numa gira, quem chama a senha anota que a pessoa precisa voltar com um médium ou uma entidade
 * (`AttendModal`, seção "Precisa voltar"). Nas giras seguintes, a senha dessa pessoa na fila mostra
 * o selo **Retorno** (`RetornoSelo`); tocar abre `RetornosSheet` com o recado e o botão
 * "Marcar como resolvido". Resolver tira o selo e o toast oferece "Desfazer" (mesmo esforço nos
 * dois sentidos). A API acha a pessoa pelo cadastro, pelo e-mail ou pelo telefone.
 */
import React from 'react';
import { CalendarClock, Check } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';

export const BETA_RETORNO = 'beta_retorno_consulente';

export interface RetornoAberto {
  id: string;
  medium_nome: string | null;
  entidade: string | null;
  recado: string | null;
  criado_em: string;
  gira_nome: string | null;
  gira_data: string | null;
}

export interface RetornoMarcado {
  id: string;
  medium_nome: string | null;
  entidade: string | null;
  recado: string | null;
  resolvido: boolean;
}

/** O que a Porta manda no "Chamar"/"Editar atendimento": omitido não mexe; null tira. */
export interface RetornoPedido {
  medium_nome?: string;
  entidade?: string;
  recado?: string;
}

/** "com Ana · Pai Joaquim" — com quem a pessoa volta. */
export function comQuemVolta(r: { medium_nome: string | null; entidade: string | null }): string {
  const partes = [r.medium_nome ? `com ${r.medium_nome}` : null, r.entidade].filter(Boolean);
  return partes.length > 0 ? partes.join(' · ') : 'retorno anotado';
}

/** "Gira de Caboclos, 30/10" — de onde veio o retorno. */
export function deOndeVeio(r: RetornoAberto): string {
  const quando = new Date(r.gira_data ?? r.criado_em);
  const data = quando.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
  return r.gira_nome ? `${r.gira_nome}, ${data}` : `Anotado em ${data}`;
}

/** Selo da fila: aparece na senha de quem tem retorno aberto. Tocar abre os detalhes. */
export function RetornoSelo({
  retornos,
  onOpen,
  className,
}: {
  retornos: RetornoAberto[];
  onOpen: () => void;
  className?: string;
}) {
  if (retornos.length === 0) return null;
  const primeiro = retornos[0];
  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        'inline-flex min-h-8 items-center gap-1 rounded-full border border-warning/40 bg-warning/15 px-2.5 text-xs font-semibold text-warning-strong hover:bg-warning/25 focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none',
        className,
      )}
      aria-label={`Tem retorno: ${comQuemVolta(primeiro)}${retornos.length > 1 ? ` e mais ${retornos.length - 1}` : ''}. Ver detalhes`}
      data-testid="retorno-selo"
    >
      <CalendarClock className="size-3.5" aria-hidden />
      Retorno{retornos.length > 1 ? ` (${retornos.length})` : ''}
    </button>
  );
}

/** Um retorno com o recado e, para quem pode editar, "Marcar como resolvido". */
export function RetornoCartao({
  retorno,
  canEdit,
  busy,
  onResolver,
}: {
  retorno: RetornoAberto;
  canEdit: boolean;
  busy?: boolean;
  onResolver: (r: RetornoAberto) => void;
}) {
  return (
    <li className="flex flex-col gap-2 rounded-xl border border-warning/40 bg-warning/10 p-3" data-testid="retorno-cartao">
      <div className="flex items-start gap-2">
        <CalendarClock className="mt-0.5 size-5 shrink-0 text-warning-strong" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="text-base leading-snug font-semibold">Voltar {comQuemVolta(retorno)}</p>
          <p className="text-sm text-muted-foreground">{deOndeVeio(retorno)}</p>
        </div>
      </div>
      {retorno.recado && <p className="text-sm break-words whitespace-pre-line">{retorno.recado}</p>}
      {canEdit && (
        <Button
          type="button"
          variant="outline"
          size="touch"
          className="self-start bg-card"
          disabled={busy}
          onClick={() => onResolver(retorno)}
        >
          <Check aria-hidden /> Marcar como resolvido
        </Button>
      )}
    </li>
  );
}

/** Detalhes dos retornos de uma senha (aberto pelo selo da fila). */
export function RetornosSheet({
  open,
  onClose,
  titulo,
  retornos,
  canEdit,
  busyId,
  onResolver,
}: {
  open: boolean;
  onClose: () => void;
  titulo: string;
  retornos: RetornoAberto[];
  canEdit: boolean;
  busyId?: string | null;
  onResolver: (r: RetornoAberto) => void;
}) {
  return (
    <Sheet open={open} onOpenChange={(next) => !next && onClose()}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-md" data-testid="retornos-sheet">
        <SheetHeader>
          <SheetTitle>Retorno</SheetTitle>
          <SheetDescription>{titulo}</SheetDescription>
        </SheetHeader>
        <div className="flex flex-col gap-3 px-4 pb-6">
          {retornos.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum retorno em aberto.</p>
          ) : (
            <ul className="m-0 flex list-none flex-col gap-3 p-0">
              {retornos.map((r) => (
                <RetornoCartao key={r.id} retorno={r} canEdit={canEdit} busy={busyId === r.id} onResolver={onResolver} />
              ))}
            </ul>
          )}
          <p className="text-xs text-muted-foreground">
            O retorno aparece na senha desta pessoa em toda gira até ser marcado como resolvido.
          </p>
        </div>
      </SheetContent>
    </Sheet>
  );
}
