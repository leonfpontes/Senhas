/**
 * Porta e Modo TV leves no iPad antigo: fila igual não redesenha, aba escondida não busca.
 */
import { act, renderHook } from '@testing-library/react';
import { manterSeIgual, useAtualizacaoPeriodica } from '@/lib/polling';

describe('manterSeIgual', () => {
  it('devolve o valor anterior quando o conteúdo é o mesmo', () => {
    const antes = [{ id: 'a', status: 'emitted' }];
    expect(manterSeIgual(antes, [{ id: 'a', status: 'emitted' }])).toBe(antes);
  });

  it('devolve o novo quando algo mudou', () => {
    const novo = [{ id: 'a', status: 'called' }];
    expect(manterSeIgual([{ id: 'a', status: 'emitted' }], novo)).toBe(novo);
    expect(manterSeIgual<typeof novo | null>(null, novo)).toBe(novo);
  });
});

describe('useAtualizacaoPeriodica', () => {
  let estado: DocumentVisibilityState = 'visible';
  beforeAll(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => estado });
  });
  beforeEach(() => {
    jest.useFakeTimers();
    estado = 'visible';
  });
  afterEach(() => jest.useRealTimers());

  it('atualiza a cada intervalo com a página visível', () => {
    const fn = jest.fn();
    renderHook(() => useAtualizacaoPeriodica(fn, 8000));
    act(() => jest.advanceTimersByTime(16000));
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('não busca com a aba escondida e atualiza na hora ao voltar', () => {
    const fn = jest.fn();
    renderHook(() => useAtualizacaoPeriodica(fn, 8000));
    estado = 'hidden';
    act(() => jest.advanceTimersByTime(24000));
    expect(fn).not.toHaveBeenCalled();
    estado = 'visible';
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('desligado não chama nada', () => {
    const fn = jest.fn();
    renderHook(() => useAtualizacaoPeriodica(fn, 8000, false));
    act(() => jest.advanceTimersByTime(16000));
    expect(fn).not.toHaveBeenCalled();
  });
});
