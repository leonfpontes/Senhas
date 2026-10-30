/**
 * buildGuideSteps (tours/tourContent.tsx): o guia de tela pula o que não está
 * na tela e nunca abre vazio.
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import { buildGuideSteps, CENTER_SELECTOR, isOnScreen, type GuideStep } from '@/tours/tourContent';

const steps: GuideStep[] = [
  { selector: '[data-tour="a"]', title: 'Tela A', body: 'Apresenta a tela.' },
  { selector: '[data-tour="b"]', title: 'Botão B', body: 'Só aparece com permissão.' },
  { selector: '[data-tour="c"]', title: 'Lista C', body: 'A lista da tela.' },
];

describe('buildGuideSteps', () => {
  it('tira os passos cujo elemento não está na tela', () => {
    const out = buildGuideSteps(steps, (s) => s !== '[data-tour="b"]');
    expect(out.map((s) => s.selector)).toEqual(['[data-tour="a"]', '[data-tour="c"]']);
  });

  it('mostra título e texto no balão', () => {
    const [first] = buildGuideSteps(steps, () => true);
    render(<>{first.content as React.ReactNode}</>);
    expect(screen.getByText('Tela A')).toBeInTheDocument();
    expect(screen.getByText('Apresenta a tela.')).toBeInTheDocument();
  });

  it('sem nada na tela, abre o primeiro passo no centro', () => {
    const out = buildGuideSteps(steps, () => false);
    expect(out).toHaveLength(1);
    expect(out[0].selector).toBe(CENTER_SELECTOR);
    expect(out[0].position).toBe('center');
  });

  it('guia vazio continua vazio', () => {
    expect(buildGuideSteps([], () => false)).toEqual([]);
  });
});

describe('isOnScreen', () => {
  it('elemento ausente ou sem caixa (display: none) não conta', () => {
    document.body.innerHTML = '<div data-tour="x"></div>';
    const el = document.querySelector('[data-tour="x"]') as HTMLElement;
    expect(isOnScreen('[data-tour="nada"]')).toBe(false);
    el.getClientRects = () => [] as unknown as DOMRectList;
    expect(isOnScreen('[data-tour="x"]')).toBe(false);
    el.getClientRects = () => [{}] as unknown as DOMRectList;
    expect(isOnScreen('[data-tour="x"]')).toBe(true);
  });
});
