/**
 * CustomText — "Texto livre": título opcional + texto.
 */
import React from 'react';
import type { SectionConfig, SectionContext } from '../types';
import { PreviewHint, SectionBody, SectionShell, SectionTitle } from './SectionShell';
import { InlineText } from './InlineText';
import { shows } from '../elements';

export function CustomText({ config, ctx }: { config: SectionConfig; ctx: SectionContext }) {
  const showTitle = shows(config, 'show_title');
  const showBody = shows(config, 'show_body');
  const title = showTitle ? String(config.title || '') : '';
  const body = showBody ? String(config.body || '') : '';
  return (
    <SectionShell config={config} defaultBg="#ffffff" aria-label="Texto">
      {ctx.edit ? (
        <>
          {showTitle && (
            <SectionTitle config={config}>
              <InlineText value={title} field="title" edit={ctx.edit} placeholder="Título (opcional)" />
            </SectionTitle>
          )}
          {showBody && (
            <SectionBody config={config} as="div" className="leading-[1.7]">
              <InlineText value={body} field="body" edit={ctx.edit} multiline as="div" placeholder="Escreva o texto desta seção." />
            </SectionBody>
          )}
        </>
      ) : title ? <SectionTitle config={config}>{title}</SectionTitle> : null}
      {ctx.edit ? null : body ? (
        <SectionBody config={config} className="leading-[1.7]">
          {body}
        </SectionBody>
      ) : (
        ctx.mode === 'preview' && showBody && <PreviewHint>Escreva o texto desta seção.</PreviewHint>
      )}
    </SectionShell>
  );
}

export default CustomText;
