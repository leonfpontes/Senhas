/**
 * Página /offline (P-01) — devolvida pelo service worker quando a navegação falha sem rede.
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import OfflinePage, { paginaDeOrigem } from '@/pages/offline';

jest.mock('next/head', () => ({ __esModule: true, default: ({ children }: any) => <>{children}</> }));

describe('Página offline', () => {
  it('explica que está sem conexão e que a Porta volta sozinha', () => {
    render(<OfflinePage />);
    expect(screen.getByRole('heading', { name: 'Sem conexão' })).toBeInTheDocument();
    expect(
      screen.getByText('Sem conexão. A Porta volta a atualizar sozinha quando a internet voltar.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tentar de novo' })).toBeInTheDocument();
  });

  it('volta só para página da própria origem (?de=)', () => {
    expect(paginaDeOrigem('?de=%2Fpublic%2Ftenda%2Fsenha%3Fx%3D1')).toBe('/public/tenda/senha?x=1');
    expect(paginaDeOrigem('?de=%2Fadmin%2Fporta')).toBe('/admin/porta');
    expect(paginaDeOrigem('')).toBeNull();
    expect(paginaDeOrigem('?de=https%3A%2F%2Fevil.com')).toBeNull();
    expect(paginaDeOrigem('?de=%2F%2Fevil.com')).toBeNull();
    expect(paginaDeOrigem('?de=%2F%5Cevil.com')).toBeNull();
  });
});
