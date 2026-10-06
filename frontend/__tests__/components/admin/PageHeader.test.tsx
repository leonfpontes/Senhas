import React from 'react';
import { render, screen } from '@testing-library/react';
import { PageHeader } from '@/components/admin/PageHeader';

describe('PageHeader', () => {
  it('renders the title as the page heading', () => {
    render(<PageHeader title="Usuários" />);
    expect(screen.getByRole('heading', { level: 1, name: 'Usuários' })).toBeInTheDocument();
  });

  it('renders subtitle when provided', () => {
    render(<PageHeader title="Usuários" subtitle="Gerencie todos os usuários" />);
    expect(screen.getByText('Gerencie todos os usuários')).toBeInTheDocument();
  });

  it('does not render subtitle element when omitted', () => {
    render(<PageHeader title="Usuários" />);
    expect(screen.queryByText(/Gerencie/)).not.toBeInTheDocument();
  });

  it('renders actions slot when provided', () => {
    render(
      <PageHeader
        title="Giras"
        actions={<button data-testid="add-btn">Nova Gira</button>}
      />
    );
    expect(screen.getByTestId('add-btn')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Nova Gira' })).toBeInTheDocument();
  });

  it('does not render actions container when actions prop is absent', () => {
    render(<PageHeader title="Giras" />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('renders inside a <header> landmark', () => {
    render(<PageHeader title="Dashboard" />);
    expect(screen.getByRole('banner')).toContainElement(screen.getByRole('heading', { name: 'Dashboard' }));
  });
});
