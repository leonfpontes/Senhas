/**
 * Avisos da casa (AM-09) — peças compartilhadas pela Área do Médium (`/medium/avisos/[id]`) e
 * pelo painel (prévia "Ver como o médium vê" e o texto no detalhe de `/admin/comunicados`).
 *
 * O aviso é TEXTO SIMPLES: `AvisoTexto` nunca usa `dangerouslySetInnerHTML`. Cada linha vira um
 * parágrafo, o texto entra como nó de texto do React (escapado) e só endereços http(s)/www viram
 * link (`lib/autolink`), que abre em outra aba sem passar a página de origem.
 */
import React from 'react';
import { Pin } from 'lucide-react';
import { autolink } from '@/lib/autolink';
import { BR_TIME_ZONE } from '@/lib/dateBr';
import { cn } from '@/lib/utils';

/** Módulo "avisos" desligado pela casa (mesmo texto do 403 do backend). */
export const AVISOS_INDISPONIVEIS = 'Os avisos não estão disponíveis na Área agora.';

/** ISO data-hora → "07/10" no fuso de Brasília. */
export function dataCurtaBr(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('pt-BR', { timeZone: BR_TIME_ZONE, day: '2-digit', month: '2-digit' });
}

/** ISO data-hora → "07/10 às 20h30" (ou "às 8h") no fuso de Brasília. */
export function dataHoraBr(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const parts = new Intl.DateTimeFormat('pt-BR', {
    timeZone: BR_TIME_ZONE,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(d);
  const hora = Number(parts.find((p) => p.type === 'hour')?.value ?? 0) % 24;
  const minuto = Number(parts.find((p) => p.type === 'minute')?.value ?? 0);
  return `${dataCurtaBr(iso)} às ${minuto ? `${hora}h${String(minuto).padStart(2, '0')}` : `${hora}h`}`;
}

export function FixadoBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex w-fit items-center gap-1 rounded-full bg-primary/15 px-2.5 py-0.5 text-xs font-bold text-brand',
        className,
      )}
    >
      <Pin className="size-3.5" aria-hidden />
      Fixado
    </span>
  );
}

export interface AvisoTextoProps {
  texto: string;
  className?: string;
  paragrafoClassName?: string;
}

/** Corpo do aviso: parágrafo por linha, links clicáveis, nada de HTML. */
export function AvisoTexto({ texto, className, paragrafoClassName }: AvisoTextoProps) {
  const linhas = texto.split('\n');
  return (
    <div className={cn('flex flex-col gap-3', className)} data-testid="aviso-texto">
      {linhas.map((linha, i) =>
        linha.trim() === '' ? null : (
          <p key={i} className={cn('break-words', paragrafoClassName)}>
            {autolink(linha).map((p, j) =>
              p.tipo === 'link' ? (
                <a
                  key={j}
                  href={p.href}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                  className="font-semibold break-all text-brand underline underline-offset-2"
                >
                  {p.texto}
                </a>
              ) : (
                <React.Fragment key={j}>{p.texto}</React.Fragment>
              ),
            )}
          </p>
        ),
      )}
    </div>
  );
}

export interface AvisoLeituraProps {
  titulo: string;
  corpo: string;
  fixado?: boolean;
  /** Linha de quem/quando: "Direção da Tenda Luz · 07/10". */
  assinatura: React.ReactNode;
  /** Nível do título (página = h1; prévia dentro de um diálogo = h3). */
  tituloAs?: 'h1' | 'h2' | 'h3';
  className?: string;
}

/** O aviso como o médium lê (tela do aviso e prévia do painel). */
export function AvisoLeitura({ titulo, corpo, fixado, assinatura, tituloAs = 'h1', className }: AvisoLeituraProps) {
  const Titulo = tituloAs;
  return (
    <article className={cn('flex flex-col gap-3.5', className)}>
      {fixado && <FixadoBadge />}
      <Titulo className="text-2xl leading-tight font-semibold tracking-tight">{titulo}</Titulo>
      <p className="text-sm text-muted-foreground">{assinatura}</p>
      <AvisoTexto texto={corpo} className="text-[1.0625rem] leading-relaxed" />
    </article>
  );
}
