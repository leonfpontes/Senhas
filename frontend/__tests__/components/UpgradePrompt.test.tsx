import React from 'react';
import { render, screen } from '@testing-library/react';
import UpgradePrompt from '@/components/UpgradePrompt';
import { PlanLocked } from '@/components/gates';

jest.mock('@/hooks/useSubscription', () => ({
  useSubscription: () => ({ planLabel: 'Básico' }),
}));

describe('UpgradePrompt', () => {
  it('explica o bloqueio com o plano atual e o mínimo', () => {
    render(<UpgradePrompt feature="Estoque" minPlan="Pro" />);
    expect(screen.getByRole('heading', { name: 'Recurso indisponível' })).toBeInTheDocument();
    expect(screen.getByText(/não está incluso no plano/)).toHaveTextContent('Estoque não está incluso no plano Básico.');
    expect(screen.getByText(/Disponível a partir do plano/)).toHaveTextContent('Pro');
  });

  it('o CTA é um link para /admin/billing?plan=<minPlan em minúsculas>', () => {
    render(<UpgradePrompt feature="Analytics" minPlan="Premium" />);
    const link = screen.getByRole('link', { name: 'Ver Planos' });
    expect(link).toHaveAttribute('href', '/admin/billing?plan=premium');
  });

  it('PlanLocked é um atalho para o UpgradePrompt', () => {
    render(<PlanLocked feature="Cursos" minPlan="Pro" />);
    expect(screen.getByRole('link', { name: 'Ver Planos' })).toHaveAttribute('href', '/admin/billing?plan=pro');
  });
});
