import React from 'react';
import { render, screen } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import { KpiCard } from '@/components/admin/KpiCard';

const theme = createTheme();

function wrap(ui: React.ReactElement) {
  return render(<ThemeProvider theme={theme}>{ui}</ThemeProvider>);
}

const MockIcon = () => <svg data-testid="mock-icon" />;

describe('KpiCard', () => {
  it('renders label and value', () => {
    wrap(<KpiCard label="Total Tickets" value={42} icon={<MockIcon />} color="#6366f1" />);
    expect(screen.getByText('Total Tickets')).toBeInTheDocument();
    expect(screen.getByText('42')).toBeInTheDocument();
  });

  it('renders string value', () => {
    wrap(<KpiCard label="Status" value="Ativo" icon={<MockIcon />} color="#10b981" />);
    expect(screen.getByText('Ativo')).toBeInTheDocument();
  });

  it('renders icon', () => {
    wrap(<KpiCard label="Test" value={0} icon={<MockIcon />} color="#f59e0b" />);
    expect(screen.getByTestId('mock-icon')).toBeInTheDocument();
  });

  it('shows skeleton when loading', () => {
    wrap(<KpiCard label="Test" value={99} icon={<MockIcon />} color="#ef4444" loading />);
    // Value should NOT be visible while loading
    expect(screen.queryByText('99')).not.toBeInTheDocument();
  });

  it('hides skeleton when not loading', () => {
    wrap(<KpiCard label="Test" value={99} icon={<MockIcon />} color="#ef4444" loading={false} />);
    expect(screen.getByText('99')).toBeInTheDocument();
  });

  it('renders subtitle when provided', () => {
    wrap(
      <KpiCard label="Receita" value="R$ 1.200" icon={<MockIcon />} color="#6366f1" subtitle="+12% este mês" />
    );
    expect(screen.getByText('+12% este mês')).toBeInTheDocument();
  });

  it('does not render subtitle when omitted', () => {
    const { container } = wrap(
      <KpiCard label="Receita" value="R$ 1.200" icon={<MockIcon />} color="#6366f1" />
    );
    // subtitle Typography is absent
    const captions = container.querySelectorAll('.MuiTypography-caption');
    // Only the label caption; no subtitle caption
    expect(captions.length).toBe(1);
  });

  it('renders zero value correctly', () => {
    wrap(<KpiCard label="Erros" value={0} icon={<MockIcon />} color="#ef4444" />);
    expect(screen.getByText('0')).toBeInTheDocument();
  });
});
