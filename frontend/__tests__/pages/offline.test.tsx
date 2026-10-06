/**
 * Página /offline (P-01) — devolvida pelo service worker quando a navegação falha sem rede.
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import OfflinePage from '@/pages/offline';

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
});
