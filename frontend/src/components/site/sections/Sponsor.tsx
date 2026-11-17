/**
 * Sponsor — "Apoiadores": título e texto introdutório centralizados.
 */
import React from 'react';
import type { SectionConfig, SectionContext } from '../types';
import { PreviewHint, SectionBody, SectionShell, SectionTitle } from './SectionShell';
import { shows } from '../elements';

export function Sponsor({ config, ctx }: { config: SectionConfig; ctx: SectionContext }) {
  const title = String(config.title || 'Apoiadores');
  const intro = String(config.intro || '');
  return (
    <SectionShell config={config} defaultBg="#f8f8f8" innerClassName="text-center" aria-label="Apoiadores">
      {shows(config, 'show_title') && (
        <SectionTitle config={config} className="mb-3">
          {title}
        </SectionTitle>
      )}
      {!shows(config, 'show_intro') ? null : intro ? (
        <SectionBody config={config} className="mx-auto max-w-[640px] opacity-80">
          {intro}
        </SectionBody>
      ) : (
        ctx.mode === 'preview' && <PreviewHint>Agradeça aqui a quem apoia o terreiro.</PreviewHint>
      )}
    </SectionShell>
  );
}

export default Sponsor;
