/**
 * About — "Sobre o terreiro": título, texto e foto opcional (esquerda/direita).
 */
import React from 'react';
import { cn } from '@/lib/utils';
import type { SectionConfig, SectionContext } from '../types';
import { PreviewHint, SectionBody, SectionShell, SectionTitle } from './SectionShell';

export function About({ config, ctx }: { config: SectionConfig; ctx: SectionContext }) {
  const title = String(config.title || '');
  const body = String(config.body || '');
  const imageUrl = config.image_url ? String(config.image_url) : '';
  const imageLeft = String(config.image_side || 'right') === 'left';
  const isPreview = ctx.mode === 'preview';

  return (
    <SectionShell config={config} defaultBg="#ffffff" aria-label="Sobre o terreiro" data-section="about">
      {title && <SectionTitle config={config}>{title}</SectionTitle>}
      <div className={cn('flex flex-col gap-8', imageLeft ? '@min-[900px]:flex-row-reverse' : '@min-[900px]:flex-row', '@min-[900px]:items-start')}>
        <div className="min-w-0 flex-1">
          {body ? (
            <SectionBody config={config}>{body}</SectionBody>
          ) : (
            isPreview && <PreviewHint>Conte aqui a história do terreiro, a linha de trabalho e como funciona o atendimento.</PreviewHint>
          )}
        </div>
        {imageUrl && (
          <div className="w-full shrink-0 @min-[900px]:w-[280px]">
            {/* Foto enviada pelo terreiro, servida pela nossa API — não passa pelo otimizador. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={imageUrl}
              alt=""
              className="block w-full rounded-xl border-[3px] border-black/10 object-cover shadow-[0_4px_20px_rgba(0,0,0,0.12)]"
            />
          </div>
        )}
      </div>
    </SectionShell>
  );
}

export default About;
