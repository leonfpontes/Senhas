/**
 * GrupoChip — etiqueta de um grupo da corrente (AM-23) na cor do grupo, texto branco.
 * A paleta é fechada e toda cor tem contraste AA com branco (`constants/correnteGrupos.ts`).
 */
import React from 'react';
import { cn } from '@/lib/utils';
import { corDoGrupo, type GrupoResumo } from '@/constants/correnteGrupos';

export function GrupoChip({
  grupo,
  className,
  size = 'md',
}: {
  grupo: Pick<GrupoResumo, 'nome' | 'cor'>;
  className?: string;
  size?: 'sm' | 'md';
}) {
  return (
    <span
      data-testid="grupo-chip"
      className={cn(
        'inline-flex max-w-full items-center rounded-full font-semibold text-white',
        size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-0.5 text-sm',
        className,
      )}
      style={{ backgroundColor: corDoGrupo(grupo.cor) }}
    >
      <span className="truncate">{grupo.nome}</span>
    </span>
  );
}

/** Bolinha na cor do grupo (listas compactas, seletor de cor). */
export function GrupoDot({ cor, className }: { cor: string; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn('inline-block size-3 shrink-0 rounded-full', className)}
      style={{ backgroundColor: corDoGrupo(cor) }}
    />
  );
}

export default GrupoChip;
