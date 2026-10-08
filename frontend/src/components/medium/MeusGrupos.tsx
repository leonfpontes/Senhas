/**
 * "Seu grupo: G2" — linha só de leitura com os grupos da corrente do médium (AM-23), vindos de
 * `GET /api/v1/medium/me` (`grupos`). O médium vê só o nome (e a cor) do próprio grupo, nunca
 * quem mais está nele (D-07). Sem grupo, não mostra nada.
 */
import React from 'react';
import { GrupoChip } from '@/components/grupos/GrupoChip';
import type { GrupoResumo } from '@/constants/correnteGrupos';
import { cn } from '@/lib/utils';

export function MeusGrupos({ grupos, className }: { grupos?: GrupoResumo[] | null; className?: string }) {
  if (!grupos || grupos.length === 0) return null;
  return (
    <p className={cn('flex flex-wrap items-center gap-1.5 text-base', className)} data-testid="meus-grupos">
      <span>{grupos.length === 1 ? 'Seu grupo:' : 'Seus grupos:'}</span>
      {grupos.map((g) => (
        <GrupoChip key={g.id} grupo={g} size="sm" />
      ))}
    </p>
  );
}

export default MeusGrupos;
