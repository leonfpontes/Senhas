/**
 * Ajudar — como ajudar a casa (beta "Novo construtor do site"): chave PIX com botão de
 * copiar e lista do que a casa precisa. Sem meta, contador ou urgência (design ético).
 */
import React, { useState } from 'react';
import { Check, Copy, HandHeart } from 'lucide-react';
import { pickForeground } from '@/lib/brand';
import type { SectionConfig, SectionContext } from '../types';
import { SectionShell } from './SectionShell';
import { InlineText } from './InlineText';
import { EmptyHint, TitleAndIntro } from './shared';

export function Ajudar({ config, ctx }: { config: SectionConfig; ctx: SectionContext }) {
  const chave = String(config.pix_chave || '').trim();
  const nome = String(config.pix_nome || '').trim();
  const necessidades = String(config.necessidades || '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  const brand = ctx.brandColor || '#2E6A4E';
  const [copiado, setCopiado] = useState(false);

  const copiar = async () => {
    if (ctx.mode === 'preview') return;
    try {
      await navigator.clipboard.writeText(chave);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2500);
    } catch {
      /* navegador sem permissão: a chave segue visível para copiar à mão */
    }
  };

  return (
    <SectionShell config={config} defaultBg="#ffffff" aria-label="Como ajudar a casa" data-section="ajudar">
      <TitleAndIntro config={config} ctx={ctx} titlePlaceholder="Como ajudar a casa" introPlaceholder="Conte como a ajuda é usada (opcional)" />
      {!chave && necessidades.length === 0 && !ctx.edit ? null : !chave && necessidades.length === 0 ? (
        <EmptyHint ctx={ctx}>Coloque a chave PIX e o que a casa precisa no painel ao lado.</EmptyHint>
      ) : (
        <div className="grid gap-6 @min-[900px]:grid-cols-2">
          {chave && (
            <div className="rounded-xl border border-[rgba(127,127,127,0.3)] p-5">
              <p className="m-0 flex items-center gap-2 text-sm font-semibold tracking-wide uppercase opacity-75">
                <HandHeart className="size-4" aria-hidden /> PIX
              </p>
              <p className="mt-2 mb-1 font-mono text-lg [overflow-wrap:anywhere]">{chave}</p>
              {nome && <p className="m-0 text-sm opacity-75">Em nome de {nome}</p>}
              <button
                type="button"
                onClick={copiar}
                className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-full px-5 py-2 font-medium text-[var(--b-fg)] hover:opacity-90"
                style={{ background: brand, '--b-fg': pickForeground(brand) } as React.CSSProperties}
              >
                {copiado ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />}
                {copiado ? 'Chave copiada' : 'Copiar chave PIX'}
              </button>
            </div>
          )}
          {necessidades.length > 0 && (
            <div>
              <InlineText as="h3" className="mb-3 text-lg font-semibold" value={String(config.necessidades_titulo || 'A casa precisa de')} field="necessidades_titulo" edit={ctx.edit} placeholder="A casa precisa de" />
              <ul className="m-0 list-disc pl-5 leading-relaxed">
                {necessidades.map((n) => (
                  <li key={n}>{n}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </SectionShell>
  );
}

export default Ajudar;
