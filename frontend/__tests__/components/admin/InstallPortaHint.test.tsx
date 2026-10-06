/**
 * Dica "Instalar a Porta na tela inicial" (P-01): aparece com `beforeinstallprompt`, some ao
 * dispensar (e continua dispensada), não aparece no app instalado; no iOS mostra o passo a passo.
 */
import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import InstallPortaHint from '@/components/admin/InstallPortaHint';

const LABEL = 'Instalar a Porta na tela inicial';
const DISMISS_KEY = 'girahub:porta-instalar-dispensado';
const originalMatchMedia = window.matchMedia;
const originalUserAgent = window.navigator.userAgent;

function setStandalone(standalone: boolean) {
  window.matchMedia = ((query: string) => ({
    matches: standalone && query.includes('standalone'),
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

function setUserAgent(ua: string) {
  Object.defineProperty(window.navigator, 'userAgent', { configurable: true, get: () => ua });
}

function fireInstallPrompt() {
  const event = new Event('beforeinstallprompt', { cancelable: true }) as Event & {
    prompt: jest.Mock;
    userChoice: Promise<{ outcome: string }>;
  };
  event.prompt = jest.fn(() => Promise.resolve());
  event.userChoice = Promise.resolve({ outcome: 'accepted' });
  act(() => {
    window.dispatchEvent(event);
  });
  return event;
}

function renderHint() {
  return render(<InstallPortaHint />);
}

describe('InstallPortaHint', () => {
  beforeEach(() => {
    // O prompt guardado por lib/pwa fica no window: não deixa vazar entre testes.
    const state = (window as any).__girahubInstall;
    if (state) state.prompt = null;
    window.localStorage.clear();
    setStandalone(false);
    setUserAgent('Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/129 Mobile Safari/537.36');
  });

  afterAll(() => {
    window.matchMedia = originalMatchMedia;
    setUserAgent(originalUserAgent);
  });

  it('não aparece enquanto o navegador não oferece a instalação', () => {
    renderHint();
    expect(screen.queryByRole('button', { name: LABEL })).not.toBeInTheDocument();
  });

  it('aparece com beforeinstallprompt e abre o diálogo nativo', async () => {
    renderHint();
    const event = fireInstallPrompt();
    expect(event.defaultPrevented).toBe(true);
    const button = screen.getByRole('button', { name: LABEL });
    await act(async () => {
      fireEvent.click(button);
    });
    expect(event.prompt).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('button', { name: LABEL })).not.toBeInTheDocument();
  });

  it('some ao dispensar e continua dispensada neste navegador', () => {
    const { unmount } = renderHint();
    fireInstallPrompt();
    fireEvent.click(screen.getByRole('button', { name: 'Dispensar dica de instalação' }));
    expect(screen.queryByRole('button', { name: LABEL })).not.toBeInTheDocument();
    expect(window.localStorage.getItem(DISMISS_KEY)).toBe('1');
    unmount();

    renderHint();
    fireInstallPrompt();
    expect(screen.queryByRole('button', { name: LABEL })).not.toBeInTheDocument();
  });

  it('não aparece quando a Porta já está aberta como app instalado', () => {
    setStandalone(true);
    renderHint();
    fireInstallPrompt();
    expect(screen.queryByRole('button', { name: LABEL })).not.toBeInTheDocument();
  });

  it('no iPhone mostra o passo a passo Compartilhar → Adicionar à Tela de Início', async () => {
    setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1');
    renderHint();
    fireEvent.click(screen.getByRole('button', { name: LABEL }));
    expect(await screen.findByText('Adicionar à Tela de Início')).toBeInTheDocument();
    expect(screen.getByText('Compartilhar')).toBeInTheDocument();
  });

  it('com localStorage bloqueado ainda funciona (só não lembra a dispensa)', () => {
    const getItem = jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    const setItem = jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    try {
      renderHint();
      fireInstallPrompt();
      fireEvent.click(screen.getByRole('button', { name: 'Dispensar dica de instalação' }));
      expect(screen.queryByRole('button', { name: LABEL })).not.toBeInTheDocument();
    } finally {
      getItem.mockRestore();
      setItem.mockRestore();
    }
  });
});
