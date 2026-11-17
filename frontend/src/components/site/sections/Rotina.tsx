/**
 * Rotina — dias e horários fixos da casa (beta "Novo construtor do site"). Complementa
 * "Próximas giras": a rotina é o que se repete; as giras são as datas marcadas.
 */
import React from 'react';
import { Clock } from 'lucide-react';
import type { SectionConfig, SectionContext } from '../types';
import { SectionShell } from './SectionShell';
import { InlineText } from './InlineText';
import { EmptyHint, TitleAndIntro, listOf, patchItem } from './shared';

interface Item extends Record<string, unknown> {
  dia?: string;
  hora?: string;
  nome?: string;
}

export function Rotina({ config, ctx }: { config: SectionConfig; ctx: SectionContext }) {
  const items = listOf<Item>(config);
  const brand = ctx.brandColor || '#2E6A4E';
  const set = (i: number, field: string) => (t: string) => ctx.edit?.patch(patchItem(config, i, field, t));

  return (
    <SectionShell config={config} defaultBg="#ffffff" aria-label="Rotina da casa" data-section="rotina">
      <TitleAndIntro config={config} ctx={ctx} titlePlaceholder="Rotina da casa" introPlaceholder="Algo que vale para todos os dias (opcional)" />
      {items.length === 0 ? (
        <EmptyHint ctx={ctx}>Adicione os dias e horários fixos no painel ao lado.</EmptyHint>
      ) : (
        <ul className="m-0 grid list-none gap-3 p-0 @min-[640px]:grid-cols-2">
          {items.map((it, i) => (
            <li key={i} className="flex items-start gap-4 rounded-xl border border-[rgba(127,127,127,0.3)] p-4">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-full text-white" style={{ background: brand }} aria-hidden>
                <Clock className="size-5" />
              </span>
              <div className="min-w-0">
                <p className="m-0 text-sm font-semibold tracking-wide uppercase opacity-75">
                  <InlineText value={String(it.dia || '')} field="dia" edit={ctx.edit} placeholder="Dia" onText={set(i, 'dia')} />
                  {(it.hora || ctx.edit) && <span aria-hidden> · </span>}
                  <InlineText value={String(it.hora || '')} field="hora" edit={ctx.edit} placeholder="Horário" onText={set(i, 'hora')} />
                </p>
                <InlineText as="p" className="mt-1 text-lg font-semibold" value={String(it.nome || '')} field="nome" edit={ctx.edit} placeholder="O que acontece" onText={set(i, 'nome')} />
              </div>
            </li>
          ))}
        </ul>
      )}
      {(config.observacao || ctx.edit) && (
        <InlineText as="p" multiline className="mt-6 text-sm opacity-75" value={String(config.observacao || '')} field="observacao" edit={ctx.edit} placeholder="Observação (ex.: a casa fecha em feriados)" />
      )}
    </SectionShell>
  );
}

export default Rotina;
