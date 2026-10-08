/**
 * TipoChip — etiqueta do tipo de atividade (AM-08) com o ícone e a cor que a casa escolheu.
 *
 * Cor da paleta fechada → fundo sólido com texto branco (contraste AA, `constants/correnteGrupos`).
 * Sem cor (`null`, padrão do tipo Gira) → contorno e texto na cor do terreiro (`text-brand`).
 * Usado no painel (`/admin/atividades`) e na Agenda da Área do Médium.
 */
import React from 'react';
import { cn } from '@/lib/utils';
import { iconeDaAtividade } from '@/lib/icons';
import { corDoTipo, type TipoMini } from '@/constants/atividades';

export function TipoChip({
  tipo,
  className,
  size = 'md',
}: {
  tipo: Pick<TipoMini, 'nome' | 'icone' | 'cor'>;
  className?: string;
  size?: 'sm' | 'md';
}) {
  const Icone = iconeDaAtividade(tipo.icone);
  const hex = corDoTipo(tipo.cor);
  return (
    <span
      data-testid="tipo-chip"
      className={cn(
        'inline-flex max-w-full items-center gap-1 rounded-full font-bold',
        size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-0.5 text-sm',
        hex ? 'text-white' : 'border border-primary bg-card text-brand',
        className,
      )}
      style={hex ? { backgroundColor: hex } : undefined}
    >
      <Icone className={size === 'sm' ? 'size-3' : 'size-3.5'} aria-hidden />
      <span className="truncate">{tipo.nome}</span>
    </span>
  );
}

export default TipoChip;
