/**
 * Peças das seções novas do construtor (beta "Novo construtor do site"): título e
 * introdução editáveis na prévia, e leitura segura de listas da config.
 */
import React from 'react';
import type { SectionConfig, SectionContext } from '../types';
import { SectionBody, SectionTitle } from './SectionShell';
import { InlineText } from './InlineText';

/** Lista de objetos da config (`items`), tolerante a valor ausente ou malformado. */
export function listOf<T extends Record<string, unknown>>(config: SectionConfig, key = 'items'): T[] {
  const v = config[key];
  return Array.isArray(v) ? (v.filter((x) => x && typeof x === 'object') as T[]) : [];
}

/** Troca um campo de um item da lista e devolve o patch da config. */
export function patchItem(config: SectionConfig, index: number, field: string, value: string, key = 'items'): SectionConfig {
  const items = listOf(config, key).map((it, i) => (i === index ? { ...it, [field]: value } : it));
  return { [key]: items };
}

export function TitleAndIntro({ config, ctx, titlePlaceholder, introPlaceholder }: { config: SectionConfig; ctx: SectionContext; titlePlaceholder: string; introPlaceholder?: string }) {
  const title = String(config.title || '');
  const intro = String(config.intro || '');
  return (
    <>
      {(title || ctx.edit) && (
        <SectionTitle config={config}>
          <InlineText value={title} field="title" edit={ctx.edit} placeholder={titlePlaceholder} />
        </SectionTitle>
      )}
      {introPlaceholder && (intro || ctx.edit) && (
        <SectionBody config={config} as="div" className="mb-8 max-w-[680px] opacity-90">
          <InlineText value={intro} field="intro" edit={ctx.edit} multiline as="div" placeholder={introPlaceholder} />
        </SectionBody>
      )}
    </>
  );
}

/** Aviso da prévia para seção sem conteúdo ainda. */
export function EmptyHint({ ctx, children }: { ctx: SectionContext; children: React.ReactNode }) {
  if (ctx.mode !== 'preview') return null;
  return <p className="rounded-lg border border-dashed border-[rgba(127,127,127,0.4)] p-6 text-center text-sm italic opacity-60">{children}</p>;
}
