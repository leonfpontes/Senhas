/**
 * Linhas — linhas de trabalho da casa (beta "Novo construtor do site"). O texto é sempre
 * da casa: o sistema não escreve sobre entidades nem fundamentos. Layouts: cartões e lista.
 */
import React from 'react';
import { cn } from '@/lib/utils';
import type { SectionConfig, SectionContext } from '../types';
import { SectionShell } from './SectionShell';
import { InlineText } from './InlineText';
import { EmptyHint, TitleAndIntro, listOf, patchItem } from './shared';

interface Linha extends Record<string, unknown> {
  nome?: string;
  texto?: string;
}

export function Linhas({ config, ctx }: { config: SectionConfig; ctx: SectionContext }) {
  const items = listOf<Linha>(config);
  const cartoes = String(config.layout || 'cartoes') === 'cartoes';
  const brand = ctx.brandColor || '#2E6A4E';

  return (
    <SectionShell config={config} defaultBg="#ffffff" aria-label="Linhas de trabalho" data-section="linhas">
      <TitleAndIntro config={config} ctx={ctx} titlePlaceholder="Linhas de trabalho" introPlaceholder="Uma frase sobre o trabalho espiritual da casa (opcional)" />
      {items.length === 0 ? (
        <EmptyHint ctx={ctx}>Adicione as linhas que a casa trabalha no painel ao lado.</EmptyHint>
      ) : (
        <ul className={cn('m-0 list-none p-0', cartoes ? 'grid gap-4 @min-[640px]:grid-cols-2 @min-[900px]:grid-cols-3' : 'flex flex-col divide-y divide-[rgba(127,127,127,0.3)]')}>
          {items.map((it, i) => (
            <li
              key={i}
              className={cn(cartoes ? 'rounded-xl border border-[rgba(127,127,127,0.3)] p-5' : 'py-4')}
              style={cartoes ? { borderTop: `4px solid ${brand}` } : undefined}
            >
              <InlineText
                as="h3"
                className="text-lg font-semibold"
                value={String(it.nome || '')}
                field="nome"
                edit={ctx.edit}
                placeholder="Nome da linha"
                onText={(t) => ctx.edit?.patch(patchItem(config, i, 'nome', t))}
              />
              <InlineText
                as="p"
                multiline
                className="mt-2 leading-relaxed opacity-85"
                value={String(it.texto || '')}
                field="texto"
                edit={ctx.edit}
                placeholder="Um texto curto, escrito pela casa"
                onText={(t) => ctx.edit?.patch(patchItem(config, i, 'texto', t))}
              />
            </li>
          ))}
        </ul>
      )}
    </SectionShell>
  );
}

export default Linhas;
