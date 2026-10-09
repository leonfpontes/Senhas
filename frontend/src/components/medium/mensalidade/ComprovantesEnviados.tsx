/**
 * Lista dos comprovantes que o médium enviou no mês (pagamento parcial, migração 092): cada envio
 * é um comprovante novo — nada é substituído — com a situação: "Em conferência", "Conferido
 * R$ 30,00" (o que a casa confirmou que entrou) ou "Não confirmado: motivo".
 */
import React from 'react';
import { BR_TIME_ZONE } from '@/lib/dateBr';
import { cn } from '@/lib/utils';
import { valorBr } from '../format';
import type { ComprovanteEnviado } from './tipos';

/** "12/10 às 14h05" (fuso de Brasília). */
export function quandoEnviado(iso: string): string {
  const d = new Date(iso);
  const hora = new Intl.DateTimeFormat('pt-BR', {
    timeZone: BR_TIME_ZONE,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(d);
  const dia = new Intl.DateTimeFormat('pt-BR', {
    timeZone: BR_TIME_ZONE,
    day: '2-digit',
    month: '2-digit',
  }).format(d);
  return `${dia} às ${hora.replace(':', 'h')}`;
}

function situacao(c: ComprovanteEnviado): { texto: string; className: string } {
  if (c.status === 'conferido') {
    return {
      texto: c.valor_conferido ? `Conferido ${valorBr(c.valor_conferido)}` : 'Conferido',
      className: 'bg-success/15 text-success-strong',
    };
  }
  if (c.status === 'nao_confirmado') {
    return { texto: 'Não confirmado', className: 'bg-destructive/15 text-destructive-strong' };
  }
  return { texto: 'Em conferência', className: 'bg-info/15 text-info-strong' };
}

export function ComprovantesEnviados({
  comprovantes,
}: {
  comprovantes?: ComprovanteEnviado[] | null;
}) {
  if (!comprovantes || comprovantes.length === 0) return null;
  return (
    <section className="flex flex-col gap-2" aria-labelledby="titulo-comprovantes-enviados">
      <h3 id="titulo-comprovantes-enviados" className="text-base font-semibold">
        Comprovantes que você enviou
      </h3>
      <ul
        className="flex flex-col divide-y divide-border rounded-lg border border-border"
        data-testid="comprovantes-enviados"
      >
        {comprovantes.map((c) => {
          const s = situacao(c);
          return (
            <li key={c.enviado_em} className="flex flex-col gap-1 px-3 py-2.5 text-base">
              <span className="flex items-center justify-between gap-2">
                <span>{quandoEnviado(c.enviado_em)}</span>
                <span
                  className={cn(
                    'shrink-0 rounded-full px-2.5 py-0.5 text-sm font-semibold',
                    s.className,
                  )}
                >
                  {s.texto}
                </span>
              </span>
              {c.valor_informado ? (
                <span className="text-sm text-muted-foreground">
                  Você informou {valorBr(c.valor_informado)}
                </span>
              ) : null}
              {c.status === 'nao_confirmado' && (
                <span className="text-sm text-destructive-strong">
                  Motivo: {c.motivo || 'a casa não informou.'}
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export default ComprovantesEnviados;
