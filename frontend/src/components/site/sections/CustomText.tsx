/**
 * CustomText — "Texto livre": título opcional + texto.
 */
import React from 'react';
import type { SectionConfig, SectionContext } from '../types';
import { PreviewHint, SectionBody, SectionShell, SectionTitle } from './SectionShell';

export function CustomText({ config, ctx }: { config: SectionConfig; ctx: SectionContext }) {
  const title = String(config.title || '');
  const body = String(config.body || '');
  return (
    <SectionShell config={config} defaultBg="#ffffff" aria-label="Texto">
      {title && <SectionTitle config={config}>{title}</SectionTitle>}
      {body ? (
        <SectionBody config={config} className="leading-[1.7]">
          {body}
        </SectionBody>
      ) : (
        ctx.mode === 'preview' && <PreviewHint>Escreva o texto desta seção.</PreviewHint>
      )}
    </SectionShell>
  );
}

export default CustomText;
