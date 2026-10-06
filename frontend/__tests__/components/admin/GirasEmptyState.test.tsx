/**
 * Tests for GirasEmptyState — tela de giras sem nenhuma gira cadastrada.
 */
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import GirasEmptyState from '@/components/admin/GirasEmptyState';
import { trackEvent } from '@/services/analytics';

jest.mock('@/services/analytics', () => ({ trackEvent: jest.fn(), setAnalyticsTag: jest.fn() }));

describe('GirasEmptyState', () => {
  beforeEach(() => jest.clearAllMocks());

  it('explica o ciclo e cria a primeira gira', () => {
    const onCreate = jest.fn();
    render(<GirasEmptyState canInsert canCreateGira onCreate={onCreate} />);
    expect(screen.getByText('Nenhuma gira cadastrada ainda')).toBeInTheDocument();
    expect(screen.getByText(/Compartilhe o link do terreiro/)).toBeInTheDocument();
    expect(screen.getByText(/use a Porta/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Criar primeira gira/ }));
    expect(onCreate).toHaveBeenCalledTimes(1);
    expect(trackEvent).toHaveBeenCalledWith('giras_empty_create');
  });

  it('bloqueado pelo plano: mostra o motivo e leva aos planos, sem botão de criar', () => {
    render(
      <GirasEmptyState
        canInsert
        canCreateGira={false}
        blockedReason="Sem assinatura ativa. Faça upgrade do plano."
        onCreate={jest.fn()}
      />,
    );
    expect(screen.queryByRole('button', { name: /Criar primeira gira/ })).not.toBeInTheDocument();
    expect(screen.getByText('Sem assinatura ativa. Faça upgrade do plano.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ver planos' })).toHaveAttribute('href', '/admin/billing');
  });

  it('sem permissão de grupo: orienta a pedir ao administrador', () => {
    render(<GirasEmptyState canInsert={false} canCreateGira onCreate={jest.fn()} />);
    expect(screen.queryByRole('button', { name: /Criar primeira gira/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Ver planos' })).not.toBeInTheDocument();
    expect(screen.getByText(/Peça a um administrador/)).toBeInTheDocument();
  });
});
