import React from 'react';
import { render, screen } from '@testing-library/react';
import { KpiCard } from '@/components/admin/KpiCard';
import { KpiCard as PlatformKpiCard } from '@/components/platform';

const MockIcon = () => <svg data-testid="mock-icon" />;

describe('KpiCard', () => {
  it('renders label and value', () => {
    render(<KpiCard label="Total Tickets" value={42} icon={<MockIcon />} color="#6366f1" />);
    expect(screen.getByText('Total Tickets')).toBeInTheDocument();
    expect(screen.getByText('42')).toBeInTheDocument();
  });

  it('renders string value', () => {
    render(<KpiCard label="Status" value="Ativo" icon={<MockIcon />} color="#10b981" />);
    expect(screen.getByText('Ativo')).toBeInTheDocument();
  });

  it('renders icon', () => {
    render(<KpiCard label="Test" value={0} icon={<MockIcon />} color="#f59e0b" />);
    expect(screen.getByTestId('mock-icon')).toBeInTheDocument();
  });

  it('icon and color are optional', () => {
    render(<KpiCard label="Só número" value={7} />);
    expect(screen.getByText('Só número')).toBeInTheDocument();
    expect(screen.getByText('7')).toBeInTheDocument();
  });

  it('shows skeleton when loading', () => {
    render(<KpiCard label="Test" value={99} icon={<MockIcon />} color="#ef4444" loading />);
    expect(screen.queryByText('99')).not.toBeInTheDocument();
    expect(screen.getByTestId('kpi-skeleton')).toBeInTheDocument();
  });

  it('hides skeleton when not loading', () => {
    render(<KpiCard label="Test" value={99} icon={<MockIcon />} color="#ef4444" loading={false} />);
    expect(screen.getByText('99')).toBeInTheDocument();
    expect(screen.queryByTestId('kpi-skeleton')).not.toBeInTheDocument();
  });

  it('renders subtitle when provided', () => {
    render(
      <KpiCard label="Receita" value="R$ 1.200" icon={<MockIcon />} color="#6366f1" subtitle="+12% este mês" />
    );
    expect(screen.getByText('+12% este mês')).toBeInTheDocument();
  });

  it('does not render subtitle when omitted', () => {
    render(<KpiCard label="Receita" value="R$ 1.200" icon={<MockIcon />} color="#6366f1" />);
    // Só rótulo e valor — nenhum parágrafo além dos dois
    expect(screen.getAllByText(/./, { selector: 'p' })).toHaveLength(2);
  });

  it('accepts the legacy platform `sub` prop as subtitle', () => {
    render(<KpiCard label="Tenants" value={3} sub="+1 nos últimos 30d" />);
    expect(screen.getByText('+1 nos últimos 30d')).toBeInTheDocument();
  });

  it('renders zero value correctly', () => {
    render(<KpiCard label="Erros" value={0} icon={<MockIcon />} color="#ef4444" />);
    expect(screen.getByText('0')).toBeInTheDocument();
  });

  it('platform barrel re-exports the same component', () => {
    expect(PlatformKpiCard).toBe(KpiCard);
  });
});
