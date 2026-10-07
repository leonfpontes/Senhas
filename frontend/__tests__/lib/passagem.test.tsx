/**
 * Passagem animada marketing ⇄ telas de conta: qual passagem vale entre duas rotas, a troca
 * direta sem a View Transitions API (fallback), nada de animação com `prefers-reduced-motion`
 * e a interceptação de cliques só nesse trecho do site.
 */
import React from 'react';
import { act, fireEvent, render } from '@testing-library/react';
import {
  DURACAO_DA_SAIDA_MS,
  _reiniciarPassagem,
  comPassagem,
  navegarComPassagem,
  passagemEntre,
  suportaTransicao,
  ultimaPassagem,
} from '@/lib/passagem';

const mockPush = jest.fn(() => Promise.resolve(true));
const mockBeforePopState = jest.fn();
jest.mock('next/router', () => ({
  useRouter: () => ({ push: mockPush, replace: jest.fn(), asPath: '/', beforePopState: mockBeforePopState }),
}));

import { PassagemDeEntrada } from '@/components/shared/PassagemDeEntrada';

type Doc = Document & { startViewTransition?: unknown };

function setReducedMotion(reduce: boolean) {
  (window.matchMedia as unknown) = jest.fn().mockImplementation((q: string) => ({
    matches: reduce && q.includes('reduce'),
    media: q,
    addListener: jest.fn(),
    removeListener: jest.fn(),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
  }));
}

function fakeViewTransition() {
  const start = jest.fn((update: () => Promise<unknown>) => {
    const done = Promise.resolve().then(update);
    return { ready: Promise.resolve(), updateCallbackDone: done, finished: done };
  });
  (document as Doc).startViewTransition = start;
  return start;
}

beforeEach(() => {
  _reiniciarPassagem();
  delete (document as Doc).startViewTransition;
  delete document.documentElement.dataset.passagem;
  delete document.documentElement.dataset.passagemSaindo;
  setReducedMotion(false);
  mockPush.mockClear();
});

describe('passagemEntre', () => {
  it.each([
    ['/', '/login', 'avancar'],
    ['/planos', '/cadastro?plan=pro', 'avancar'],
    ['/login', '/', 'voltar'],
    ['/cadastro', '/#como-funciona', 'voltar'],
    ['/login', '/cadastro', 'lado'],
    ['/cadastro?passo=2', '/forgot-password', 'lado'],
    ['/', '/termos', 'abrir-documento'],
    ['/planos', '/cookies', 'abrir-documento'],
    ['/privacidade', '/#duvidas', 'fechar-documento'],
    ['/termos', '/privacidade', 'folhear-frente'],
    ['/cookies', '/termos', 'folhear-tras'],
    ['/termos', '/cadastro', 'avancar'],
    ['/login', '/privacidade', 'voltar'],
  ])('%s → %s = %s', (de, para, esperado) => {
    expect(passagemEntre(de, para)).toBe(esperado);
  });

  it.each([
    ['/cadastro', '/cadastro?passo=2'],
    ['/', '/planos'],
    ['/login', '/admin/dashboard'],
    ['/admin/giras', '/login'],
    ['/termos', '/termos#contato'],
    ['/cookies', '/admin/dashboard'],
  ])('%s → %s fica de fora (navegação comum)', (de, para) => {
    expect(passagemEntre(de, para)).toBeNull();
  });
});

describe('comPassagem', () => {
  it('sem a View Transitions API troca direto, sem erro', async () => {
    const trocar = jest.fn(() => Promise.resolve());
    expect(suportaTransicao()).toBe(false);
    await comPassagem('avancar', trocar);
    expect(trocar).toHaveBeenCalledTimes(1);
    expect(ultimaPassagem()).toBe('avancar');
    expect(document.documentElement.dataset.passagem).toBeUndefined();
  });

  it('com menos movimento não usa a transição mesmo com a API', async () => {
    const start = fakeViewTransition();
    setReducedMotion(true);
    const trocar = jest.fn(() => Promise.resolve());
    await comPassagem('avancar', trocar);
    expect(start).not.toHaveBeenCalled();
    expect(trocar).toHaveBeenCalledTimes(1);
  });

  it('com a API, troca dentro da transição e marca o sentido no <html> enquanto anima', async () => {
    const start = fakeViewTransition();
    let durante: string | undefined;
    const trocar = jest.fn(() => {
      durante = document.documentElement.dataset.passagem;
      return Promise.resolve();
    });
    await comPassagem('voltar', trocar);
    expect(start).toHaveBeenCalledTimes(1);
    expect(durante).toBe('voltar');
    expect(document.documentElement.dataset.passagem).toBeUndefined();
  });

  it('transição cancelada pelo navegador não vira erro', async () => {
    (document as Doc).startViewTransition = jest.fn((update: () => Promise<unknown>) => {
      void update();
      const cancelada = Promise.reject(new Error('AbortError'));
      return { ready: cancelada, updateCallbackDone: Promise.resolve(), finished: cancelada };
    });
    await expect(comPassagem('avancar', () => Promise.resolve())).resolves.toBeUndefined();
  });
});

describe('navegarComPassagem — a volta', () => {
  it('na tela de conta, o escuro avança antes de trocar de página', async () => {
    jest.useFakeTimers();
    const moldura = document.createElement('div');
    moldura.setAttribute('data-passagem-moldura', '');
    document.body.appendChild(moldura);
    const push = jest.fn(() => Promise.resolve(true));

    const feito = navegarComPassagem(push, '/', 'voltar');
    expect(document.documentElement.dataset.passagemSaindo).toBe('1');
    expect(push).not.toHaveBeenCalled();
    await act(async () => {
      jest.advanceTimersByTime(DURACAO_DA_SAIDA_MS + 100);
    });
    jest.useRealTimers();
    await feito;
    expect(push).toHaveBeenCalledWith('/');
    expect(document.documentElement.dataset.passagemSaindo).toBeUndefined();
    moldura.remove();
  });

  it('com menos movimento troca na hora', async () => {
    setReducedMotion(true);
    const push = jest.fn(() => Promise.resolve(true));
    await navegarComPassagem(push, '/', 'voltar');
    expect(push).toHaveBeenCalledWith('/');
    expect(document.documentElement.dataset.passagemSaindo).toBeUndefined();
  });
});

describe('<PassagemDeEntrada />', () => {
  function clicar(href: string, init: MouseEventInit = {}) {
    const a = document.createElement('a');
    a.href = href;
    a.textContent = 'ir';
    document.body.appendChild(a);
    const evento = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0, ...init });
    fireEvent(a, evento);
    a.remove();
    return evento;
  }

  it('intercepta "Entrar" da landing e navega pelo router (sem a API: troca direta)', async () => {
    render(<PassagemDeEntrada />);
    let evento!: MouseEvent;
    await act(async () => {
      evento = clicar('/login');
    });
    expect(evento.defaultPrevented).toBe(true);
    expect(mockPush).toHaveBeenCalledWith('/login');
    expect(ultimaPassagem()).toBe('avancar');
  });

  it('deixa passar links fora do trecho, com modificador ou com menos movimento', () => {
    render(<PassagemDeEntrada />);
    expect(clicar('/admin/giras').defaultPrevented).toBe(false);
    expect(clicar('/login', { metaKey: true }).defaultPrevented).toBe(false);
    expect(clicar('https://exemplo.com/login').defaultPrevented).toBe(false);
    setReducedMotion(true);
    expect(clicar('/login').defaultPrevented).toBe(false);
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('registra o voltar do navegador (beforePopState) e deixa o Next cuidar sem a API', () => {
    render(<PassagemDeEntrada />);
    const handler = mockBeforePopState.mock.calls.at(-1)?.[0] as (s: { url: string; as: string }) => boolean;
    expect(typeof handler).toBe('function');
    expect(handler({ url: '/login', as: '/login' })).toBe(true);
  });
});
