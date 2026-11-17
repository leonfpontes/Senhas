/**
 * Gallery — fotos da casa (beta "Novo construtor do site"). Layouts: grade, mosaico
 * e faixa (rola de lado no celular, com scroll-snap; sem JavaScript).
 */
import React from 'react';
import { cn } from '@/lib/utils';
import type { SectionConfig, SectionContext } from '../types';
import { SectionShell } from './SectionShell';
import { EmptyHint, TitleAndIntro, listOf } from './shared';
import { shows } from '../elements';

interface Foto extends Record<string, unknown> {
  id?: string;
  url?: string;
  legenda?: string;
}

export function Gallery({ config, ctx }: { config: SectionConfig; ctx: SectionContext }) {
  const fotos = listOf<Foto>(config).filter((f) => typeof f.url === 'string' && f.url);
  const layout = String(config.layout || 'grade');
  const showCaptions = shows(config, 'show_captions');

  return (
    <SectionShell config={config} defaultBg="#ffffff" aria-label="Fotos" data-section="gallery">
      <TitleAndIntro config={config} ctx={ctx} titlePlaceholder="Fotos da casa" introPlaceholder="Uma frase sobre as fotos (opcional)" />
      {fotos.length === 0 ? (
        <EmptyHint ctx={ctx}>Adicione fotos da casa e das festas no painel ao lado.</EmptyHint>
      ) : (
        <ul
          className={cn(
            'm-0 list-none p-0',
            layout === 'faixa' && 'flex snap-x snap-mandatory gap-3 overflow-x-auto pb-2',
            layout === 'mosaico' && 'columns-2 gap-3 @min-[900px]:columns-3',
            layout === 'grade' && 'grid grid-cols-2 gap-3 @min-[900px]:grid-cols-3',
          )}
        >
          {fotos.map((f, i) => (
            <li
              key={String(f.id || f.url || i)}
              className={cn(layout === 'faixa' && 'w-[78%] shrink-0 snap-center @min-[900px]:w-[38%]', layout === 'mosaico' && 'mb-3 break-inside-avoid')}
            >
              <figure className="m-0">
                {/* Foto enviada pelo terreiro, servida pela nossa API — não passa pelo otimizador. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={String(f.url)}
                  alt={String(f.legenda || '')}
                  loading="lazy"
                  className={cn('block w-full rounded-xl object-cover', layout !== 'mosaico' && 'aspect-[4/3]')}
                />
                {showCaptions && f.legenda && <figcaption className="mt-1.5 text-sm opacity-80">{String(f.legenda)}</figcaption>}
              </figure>
            </li>
          ))}
        </ul>
      )}
    </SectionShell>
  );
}

export default Gallery;
