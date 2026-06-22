import React from 'react';
import { render, screen } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import { PageHeader } from '@/components/admin/PageHeader';

const theme = createTheme();

function wrap(ui: React.ReactElement) {
  return render(<ThemeProvider theme={theme}>{ui}</ThemeProvider>);
}

describe('PageHeader', () => {
  it('renders the title', () => {
    wrap(<PageHeader title="Usuários" />);
    expect(screen.getByText('Usuários')).toBeInTheDocument();
  });

  it('renders subtitle when provided', () => {
    wrap(<PageHeader title="Usuários" subtitle="Gerencie todos os usuários" />);
    expect(screen.getByText('Gerencie todos os usuários')).toBeInTheDocument();
  });

  it('does not render subtitle element when omitted', () => {
    wrap(<PageHeader title="Usuários" />);
    expect(screen.queryByText(/Gerencie/)).not.toBeInTheDocument();
  });

  it('renders actions slot when provided', () => {
    wrap(
      <PageHeader
        title="Giras"
        actions={<button data-testid="add-btn">Nova Gira</button>}
      />
    );
    expect(screen.getByTestId('add-btn')).toBeInTheDocument();
    expect(screen.getByText('Nova Gira')).toBeInTheDocument();
  });

  it('does not render actions container when actions prop is absent', () => {
    const { container } = wrap(<PageHeader title="Giras" />);
    // No buttons in the header
    expect(container.querySelector('button')).toBeNull();
  });

  it('renders title as h5 variant', () => {
    wrap(<PageHeader title="Dashboard" />);
    const heading = screen.getByText('Dashboard');
    expect(heading.tagName).toBe('H5');
  });
});
