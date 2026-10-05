/**
 * Tests for the welcome tour (tours/welcomeTour.tsx): trilha por
 * principal_dor, gate de plano, fallback dos passos ancorados e abertura
 * única por usuário.
 */
import React from 'react';
import { render, renderHook, screen, fireEvent } from '@testing-library/react';
import type { StepType } from '@reactour/tour';
import {
  buildWelcomeTourSteps,
  CENTER_SELECTOR,
  CHECKLIST_SELECTOR,
  HELP_BUTTON_SELECTOR,
  useWelcomeTour,
  welcomeTourSeenKey,
  type WelcomeTourContext,
} from '@/tours/welcomeTour';
import { trackEvent } from '@/services/analytics';

const mockSetSteps = jest.fn();
const mockSetIsOpen = jest.fn();
const mockSetCurrentStep = jest.fn();
jest.mock('@reactour/tour', () => ({
  useTour: () => ({ setSteps: mockSetSteps, setIsOpen: mockSetIsOpen, setCurrentStep: mockSetCurrentStep }),
}));
jest.mock('@/services/analytics', () => ({ trackEvent: jest.fn(), setAnalyticsTag: jest.fn() }));
jest.mock('next/link', () => ({ children, href, onClick }: any) => (
  <a href={href} onClick={onClick}>
    {children}
  </a>
));

function ctx(overrides: Partial<WelcomeTourContext> = {}): WelcomeTourContext {
  return {
    dor: 'senhas',
    firstName: 'Romário',
    can: () => true,
    close: jest.fn(),
    hasChecklist: true,
    hasHelpButton: true,
    ...overrides,
  };
}

/** Renderiza o conteúdo de cada passo e devolve o texto. */
function texts(steps: StepType[]): string[] {
  return steps.map((s) => {
    const { container, unmount } = render(<>{s.content as React.ReactElement}</>);
    const t = container.textContent ?? '';
    unmount();
    return t;
  });
}

describe('buildWelcomeTourSteps', () => {
  it('trilha senhas: boas-vindas citando a dor, checklist, Porta e ajuda', () => {
    const steps = buildWelcomeTourSteps(ctx());
    const t = texts(steps);
    expect(t[0]).toContain('Bem-vindo ao GiraHub, Romário!');
    expect(t[0]).toContain('organizar as senhas e a fila das giras');
    expect(steps[1].selector).toBe(CHECKLIST_SELECTOR);
    expect(t[1]).toContain('Seu roteiro de primeiros passos');
    expect(t[2]).toContain('use a Porta');
    expect(steps[3].selector).toBe(HELP_BUTTON_SELECTOR);
    expect(steps).toHaveLength(4);
  });

  it('passos centralizados apontam para seletor sem elemento e posição center', () => {
    const steps = buildWelcomeTourSteps(ctx());
    expect(steps[0].selector).toBe(CENTER_SELECTOR);
    expect(steps[0].position).toBe('center');
    expect(document.querySelector(CENTER_SELECTOR)).toBeNull();
  });

  it.each([
    ['mediuns', 'Comece pelos médiuns', '/admin/mediuns'],
    ['financeiro', 'Comece pelo financeiro', '/admin/financeiro/mensalidades'],
    ['divulgacao', 'Comece pelo site do terreiro', '/admin/meu-site'],
    ['estoque', 'Comece pelo estoque', '/admin/estoque/itens'],
  ] as const)('trilha %s leva ao módulo e ainda lembra das senhas', (dor, title, href) => {
    const steps = buildWelcomeTourSteps(ctx({ dor }));
    const t = texts(steps);
    expect(t[1]).toContain(title);
    render(<>{steps[1].content as React.ReactElement}</>);
    expect(screen.getByRole('link')).toHaveAttribute('href', href);
    expect(steps[2].selector).toBe(CHECKLIST_SELECTOR);
    expect(t[2]).toContain('E as senhas das giras?');
    expect(t.some((x) => x.includes('use a Porta'))).toBe(false);
  });

  it('recurso fora do plano: avisa e leva aos planos em vez do módulo', () => {
    const steps = buildWelcomeTourSteps(ctx({ dor: 'mediuns', can: () => false }));
    render(<>{steps[1].content as React.ReactElement}</>);
    expect(screen.getByText(/não está no seu plano atual/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ver planos' })).toHaveAttribute('href', '/admin/plano');
  });

  it('financeiro basta uma das features (mensalidade OU contas)', () => {
    const steps = buildWelcomeTourSteps(ctx({ dor: 'financeiro', can: (f) => f === 'contas_financeiras' }));
    render(<>{steps[1].content as React.ReactElement}</>);
    expect(screen.getByRole('link', { name: 'Abrir mensalidades' })).toBeInTheDocument();
  });

  it('"outro" usa o essencial sem citar dor', () => {
    const t = texts(buildWelcomeTourSteps(ctx({ dor: 'outro' })));
    expect(t[0]).toContain('o essencial');
    expect(t[0]).not.toContain('Você contou');
  });

  it('sem checklist na tela, trilha senhas oferece criar gira direto', () => {
    const steps = buildWelcomeTourSteps(ctx({ hasChecklist: false }));
    render(<>{steps[1].content as React.ReactElement}</>);
    expect(screen.getByRole('link', { name: 'Criar gira' })).toHaveAttribute('href', '/admin/giras?nova=1');
  });

  it('sem botão de ajuda, último passo é centralizado', () => {
    const steps = buildWelcomeTourSteps(ctx({ hasHelpButton: false }));
    const last = steps[steps.length - 1];
    expect(last.selector).toBe(CENTER_SELECTOR);
    expect(texts([last])[0]).toContain('Pronto!');
  });

  it('botão de ação fecha o tour e registra evento', () => {
    const close = jest.fn();
    const steps = buildWelcomeTourSteps(ctx({ dor: 'estoque', close }));
    render(<>{steps[1].content as React.ReactElement}</>);
    fireEvent.click(screen.getByRole('link', { name: 'Cadastrar itens' }));
    expect(close).toHaveBeenCalled();
    expect(trackEvent).toHaveBeenCalledWith('welcome_tour_cta', { trilha: 'estoque', href: '/admin/estoque/itens' });
  });
});

describe('useWelcomeTour', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    window.localStorage.clear();
  });
  afterEach(() => jest.useRealTimers());

  const args = { enabled: true, dor: 'senhas' as const, userId: 'u1', firstName: 'Ana', can: () => true };

  it('abre uma vez, grava a flag e registra evento', () => {
    renderHook(() => useWelcomeTour(args));
    expect(mockSetIsOpen).not.toHaveBeenCalled();
    jest.advanceTimersByTime(600);
    expect(mockSetSteps).toHaveBeenCalledTimes(1);
    expect(mockSetCurrentStep).toHaveBeenCalledWith(0);
    expect(mockSetIsOpen).toHaveBeenCalledWith(true);
    expect(window.localStorage.getItem(welcomeTourSeenKey('u1'))).toBe('1');
    expect(trackEvent).toHaveBeenCalledWith('welcome_tour_open', { trilha: 'senhas' });
  });

  it('não reabre para quem já viu', () => {
    window.localStorage.setItem(welcomeTourSeenKey('u1'), '1');
    renderHook(() => useWelcomeTour(args));
    jest.advanceTimersByTime(1000);
    expect(mockSetIsOpen).not.toHaveBeenCalled();
  });

  it('não abre sem dor (tenant antigo), sem usuário ou desabilitado', () => {
    renderHook(() => useWelcomeTour({ ...args, dor: null }));
    renderHook(() => useWelcomeTour({ ...args, userId: undefined }));
    renderHook(() => useWelcomeTour({ ...args, enabled: false }));
    jest.advanceTimersByTime(1000);
    expect(mockSetIsOpen).not.toHaveBeenCalled();
  });

  it('desmontar antes do disparo não gasta a primeira vez', () => {
    const { unmount } = renderHook(() => useWelcomeTour(args));
    unmount();
    jest.advanceTimersByTime(1000);
    expect(mockSetIsOpen).not.toHaveBeenCalled();
    expect(window.localStorage.getItem(welcomeTourSeenKey('u1'))).toBeNull();
  });

  it('detecta o checklist e o botão de ajuda na tela ao montar os passos', () => {
    document.body.innerHTML = '<div data-tour="first-gira-checklist"></div>';
    renderHook(() => useWelcomeTour(args));
    jest.advanceTimersByTime(600);
    const steps: StepType[] = mockSetSteps.mock.calls[0][0];
    expect(steps.some((s) => s.selector === CHECKLIST_SELECTOR)).toBe(true);
    expect(steps.some((s) => s.selector === HELP_BUTTON_SELECTOR)).toBe(false);
    document.body.innerHTML = '';
  });
});
