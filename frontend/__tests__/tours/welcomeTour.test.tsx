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
  CREATE_GIRA_HREF,
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

describe('tour na mesma trilha do checklist (módulos)', () => {
  const medium = {
    key: 'medium',
    title: 'Cadastre o primeiro médium',
    description: 'Nome, contato e aniversário.',
    cta: { label: 'Cadastrar médium', href: '/admin/mediuns' },
  };

  it('trilha de médiuns: roteiro com os passos do checklist e o último passo leva ao 1º pendente', () => {
    const close = jest.fn();
    const steps = buildWelcomeTourSteps(
      ctx({
        dor: 'mediuns',
        trilha: 'mediuns',
        checklistTitles: ['Cadastre o primeiro médium', 'Configure a mensalidade', 'Crie sua primeira gira'],
        nextStep: medium,
        close,
      }),
    );
    const t = texts(steps);
    expect(t[0]).toMatch(/começando por: cadastre o primeiro médium/);
    expect(t[1]).toContain('Cadastre o primeiro médium → Configure a mensalidade → Crie sua primeira gira');
    expect(t.some((x) => /use a Porta/.test(x))).toBe(false);
    expect(t[t.length - 1]).toMatch(/Agora: cadastre o primeiro médium/);

    render(<>{steps[steps.length - 1].content as React.ReactElement}</>);
    const link = screen.getByRole('link', { name: 'Cadastrar médium' });
    expect(link).toHaveAttribute('href', '/admin/mediuns');
    fireEvent.click(link);
    expect(close).toHaveBeenCalled();
    expect(trackEvent).toHaveBeenCalledWith('welcome_tour_cta', { trilha: 'mediuns', href: '/admin/mediuns' });
  });

  it('módulo travado pelo plano (próximo passo é a gira): volta para a trilha da gira com o aviso do plano', () => {
    const t = texts(
      buildWelcomeTourSteps(
        ctx({
          dor: 'estoque',
          trilha: 'estoque',
          can: () => false,
          nextStep: { key: 'gira', title: 'Crie sua primeira gira', description: '', cta: { label: 'Criar gira', href: CREATE_GIRA_HREF } },
        }),
      ),
    );
    expect(t[t.length - 1]).toMatch(/Agora, sua primeira gira/);
    expect(t[t.length - 1]).toMatch(/só no plano Premium/);
  });

  it('trilha de senhas segue o roteiro da gira', () => {
    const t = texts(buildWelcomeTourSteps(ctx({ dor: 'senhas', trilha: 'senhas', nextStep: medium })));
    expect(t.some((x) => /use a Porta/.test(x))).toBe(true);
    expect(t[t.length - 1]).toMatch(/Agora, sua primeira gira/);
  });
});

describe('buildWelcomeTourSteps', () => {
  it('trilha senhas: boas-vindas citando a dor, checklist, Porta, ajuda e Criar gira por último', () => {
    const steps = buildWelcomeTourSteps(ctx());
    const t = texts(steps);
    expect(t[0]).toContain('Bem-vindo ao GiraHub, Romário!');
    expect(t[0]).toContain('organizar as senhas e a fila das giras');
    expect(steps[1].selector).toBe(CHECKLIST_SELECTOR);
    expect(t[1]).toContain('Seu roteiro de primeiros passos');
    expect(t[2]).toContain('use a Porta');
    expect(steps[3].selector).toBe(HELP_BUTTON_SELECTOR);
    expect(t[4]).toContain('Agora, sua primeira gira');
    expect(steps).toHaveLength(5);
  });

  it('passos centralizados apontam para seletor sem elemento e posição center', () => {
    const steps = buildWelcomeTourSteps(ctx());
    expect(steps[0].selector).toBe(CENTER_SELECTOR);
    expect(steps[0].position).toBe('center');
    expect(document.querySelector(CENTER_SELECTOR)).toBeNull();
  });

  it.each(['senhas', 'mediuns', 'financeiro', 'divulgacao', 'estoque', 'outro'] as const)(
    'trilha %s termina em "Criar gira" e nenhum passo leva para fora da gira',
    (dor) => {
      const steps = buildWelcomeTourSteps(ctx({ dor }));
      steps.forEach((step, i) => {
        const { unmount } = render(<>{step.content as React.ReactElement}</>);
        const links = screen.queryAllByRole('link');
        if (i === steps.length - 1) {
          expect(links).toHaveLength(1);
          expect(links[0]).toHaveTextContent('Criar gira');
          expect(links[0]).toHaveAttribute('href', CREATE_GIRA_HREF);
        } else {
          expect(links).toHaveLength(0);
        }
        unmount();
      });
    },
  );

  it.each([
    ['mediuns', 'Médiuns'],
    ['financeiro', 'Mensalidades'],
    ['divulgacao', 'Meu Site'],
    ['estoque', 'Estoque'],
  ] as const)('trilha %s cita o módulo só como "depois", no último passo', (dor, modulo) => {
    const t = texts(buildWelcomeTourSteps(ctx({ dor })));
    const last = t[t.length - 1];
    expect(last).toContain('Depois, quando quiser');
    expect(last).toContain(modulo);
    expect(t.slice(0, -1).some((x) => x.includes('Depois, quando quiser'))).toBe(false);
  });

  it('módulo fora do plano: diz a partir de qual plano, sem link', () => {
    const steps = buildWelcomeTourSteps(ctx({ dor: 'mediuns', can: () => false }));
    const last = steps[steps.length - 1];
    render(<>{last.content as React.ReactElement}</>);
    expect(screen.getByText(/disponível a partir do plano Basic/)).toBeInTheDocument();
    expect(screen.getAllByRole('link')).toHaveLength(1);
  });

  it('estoque (Premium desde out/2026): diz "só no plano Premium"', () => {
    const t = texts(buildWelcomeTourSteps(ctx({ dor: 'estoque', can: () => false })));
    expect(t[t.length - 1]).toContain('disponível só no plano Premium');
  });

  it('financeiro basta uma das features (mensalidade OU contas)', () => {
    const t = texts(buildWelcomeTourSteps(ctx({ dor: 'financeiro', can: (f) => f === 'contas_financeiras' })));
    expect(t[t.length - 1]).not.toContain('disponível a partir');
  });

  it('"outro" usa o essencial sem citar dor', () => {
    const t = texts(buildWelcomeTourSteps(ctx({ dor: 'outro' })));
    expect(t[0]).toContain('o essencial');
    expect(t[0]).not.toContain('Você contou');
  });

  it('sem checklist nem botão de ajuda, os passos são centralizados e ainda terminam em Criar gira', () => {
    const steps = buildWelcomeTourSteps(ctx({ hasChecklist: false, hasHelpButton: false }));
    expect(steps.every((s) => s.selector === CENTER_SELECTOR)).toBe(true);
    expect(texts([steps[steps.length - 1]])[0]).toContain('Criar gira');
  });

  it('botão Criar gira fecha o tour e registra evento', () => {
    const close = jest.fn();
    const steps = buildWelcomeTourSteps(ctx({ dor: 'estoque', close }));
    render(<>{steps[steps.length - 1].content as React.ReactElement}</>);
    fireEvent.click(screen.getByRole('link', { name: 'Criar gira' }));
    expect(close).toHaveBeenCalled();
    expect(trackEvent).toHaveBeenCalledWith('welcome_tour_cta', { trilha: 'estoque', href: CREATE_GIRA_HREF });
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
