/**
 * Peças comuns dos tours: o corpo do balão (título + texto) e a montagem dos
 * passos dos guias de tela, que pula o que não está na tela.
 *
 * Os guias de tela (`adminTourSteps.ts`) descrevem a tela inteira, mas boa parte
 * dela depende de plano, permissão, dados ou tamanho da tela (a lista de
 * comprovantes só aparece com comprovante, a prévia do site só no computador,
 * o checklist só no terreiro novo...). Um passo cujo elemento não está na tela
 * deixava o balão apontando para o nada; agora ele sai do roteiro.
 */
import React from 'react';
import type { StepType } from '@reactour/tour';

/** Passo de um guia de tela: âncora `data-tour`, título curto e o texto. */
export interface GuideStep {
  selector: string;
  title: string;
  body: string;
}

/**
 * Passos centralizados apontam para um seletor sem elemento: o reactour então
 * escurece a tela inteira e não rola a página (com `body` ele "destacava" a
 * página toda, sem escurecer, e rolava até o meio dela).
 */
export const CENTER_SELECTOR = '[data-tour="welcome-tour-center"]';
// Sem margem: com o padrão, o "buraco" do destaque (tamanho zero, sem elemento)
// aparecia como um quadradinho claro no canto superior esquerdo.
export const CENTER_STEP = { selector: CENTER_SELECTOR, padding: { mask: 0 } } as const;

export function TourStepBody({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <div data-slot="tour-step" className="text-sm leading-relaxed">
      {title && <p className="mb-1.5 text-base font-bold">{title}</p>}
      <div className="space-y-2">{children}</div>
    </div>
  );
}

/** O elemento está na página e ocupa espaço (aba inativa, `hidden` e `display: none` não contam). */
export function isOnScreen(selector: string, root: ParentNode = document): boolean {
  const el = root.querySelector(selector);
  return !!el && el.getClientRects().length > 0;
}

/**
 * Passos do guia que estão na tela agora. Se nenhum estiver (página ainda
 * carregando, por exemplo), o primeiro passo aparece no centro, para o botão
 * de ajuda nunca abrir um balão vazio ou apontando para o nada.
 */
export function buildGuideSteps(
  steps: GuideStep[],
  onScreen: (selector: string) => boolean = (s) => isOnScreen(s),
): StepType[] {
  const visible = steps.filter((s) => onScreen(s.selector));
  if (visible.length === 0 && steps.length > 0) {
    const [first] = steps;
    return [
      {
        ...CENTER_STEP,
        position: 'center',
        content: <TourStepBody title={first.title}>{first.body}</TourStepBody>,
      },
    ];
  }
  return visible.map((s) => ({
    selector: s.selector,
    content: <TourStepBody title={s.title}>{s.body}</TourStepBody>,
  }));
}
