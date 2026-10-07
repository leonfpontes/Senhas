/**
 * Banner de cookies: aparece sem escolha, recusar e aceitar têm o mesmo peso, "Personalizar" abre o
 * painel com as categorias (necessários travados) e a escolha some com o banner.
 */
import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { CookieConsent } from '@/components/shared/CookieConsent';
import { abrirPreferenciasDeCookies, lerConsentimento } from '@/lib/consent';

let mockPathname = '/';
jest.mock('next/router', () => ({ useRouter: () => ({ pathname: mockPathname, asPath: mockPathname }) }));
jest.mock('next/font/google', () => ({ Fraunces: () => ({ variable: 'font-fraunces' }) }));

function limparCookies() {
  for (const c of document.cookie.split(';')) {
    const nome = c.trim().split('=')[0];
    if (nome) document.cookie = `${nome}=; Max-Age=0; Path=/`;
  }
}

beforeEach(() => {
  limparCookies();
  mockPathname = '/';
});

describe('<CookieConsent />', () => {
  it('mostra o aviso sem escolha registrada e grava a recusa', async () => {
    render(<CookieConsent />);
    expect(await screen.findByRole('region', { name: 'Aviso de cookies' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Política de Cookies' })).toHaveAttribute('href', '/cookies');
    fireEvent.click(screen.getByRole('button', { name: 'Recusar opcionais' }));
    expect(lerConsentimento()).toMatchObject({ estatisticas: false, marketing: false });
    await waitFor(() => expect(screen.queryByRole('region', { name: 'Aviso de cookies' })).not.toBeInTheDocument());
  });

  it('aceitar todos liga estatísticas e marketing', async () => {
    render(<CookieConsent />);
    fireEvent.click(await screen.findByRole('button', { name: 'Aceitar todos' }));
    expect(lerConsentimento()).toMatchObject({ estatisticas: true, marketing: true });
  });

  it('personalizar: opcionais começam desligados e a escolha é salva', async () => {
    render(<CookieConsent />);
    fireEvent.click(await screen.findByRole('button', { name: 'Personalizar' }));
    expect(await screen.findByRole('dialog', { name: 'Preferências de cookies' })).toBeInTheDocument();
    expect(screen.getByText('Sempre ativo')).toBeInTheDocument();
    const estatisticas = screen.getByRole('switch', { name: 'Estatísticas' });
    const marketing = screen.getByRole('switch', { name: 'Marketing' });
    expect(estatisticas).toHaveAttribute('aria-checked', 'false');
    expect(marketing).toHaveAttribute('aria-checked', 'false');
    fireEvent.click(estatisticas);
    fireEvent.click(screen.getByRole('button', { name: 'Salvar escolhas' }));
    expect(lerConsentimento()).toMatchObject({ estatisticas: true, marketing: false });
  });

  it('não aparece na Porta em modo quiosque, mas o painel ainda reabre pelo evento', async () => {
    mockPathname = '/admin/porta/kiosk';
    render(<CookieConsent />);
    await act(async () => {});
    expect(screen.queryByRole('region', { name: 'Aviso de cookies' })).not.toBeInTheDocument();
    act(() => abrirPreferenciasDeCookies());
    expect(await screen.findByRole('dialog', { name: 'Preferências de cookies' })).toBeInTheDocument();
  });
});
