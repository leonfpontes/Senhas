/**
 * Tests for public pages
 * Testing: [tenant], gira_details, emit_form, public_layout
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material/styles';

// Mock next/router
jest.mock('next/router', () => ({
  useRouter: () => ({
    push: jest.fn(),
    pathname: '/public/test-tenant',
    query: { tenant: 'test-tenant' },
    asPath: '/public/test-tenant',
    isReady: true,
    events: { on: jest.fn(), off: jest.fn() },
  }),
}));

// Mock API client
jest.mock('@/services/api_client', () => ({
  apiClient: {
    get: jest.fn().mockResolvedValue({ data: {} }),
    post: jest.fn().mockResolvedValue({ data: {} }),
  },
}));

// Mock useGiraCountdown
jest.mock('@/hooks/useGiraCountdown', () => ({
  useGiraCountdown: () => ({
    timeRemaining: 3600,
    isOpen: true,
    isClosed: false,
    percentRemaining: 50,
    status: 'open' as const,
  }),
}));

// Mock CSS modules
jest.mock('@/pages/public/gira_details.module.css', () => ({}), { virtual: true });
jest.mock('@/pages/public/emit_form.module.css', () => ({}), { virtual: true });
jest.mock('@/pages/public/public_layout.module.css', () => ({}), { virtual: true });
jest.mock('@/pages/public/public_page.module.css', () => ({}), { virtual: true });

// Mock ThemeProvider
jest.mock('@/providers/ThemeProvider', () => ({
  useTenant: () => ({
    tenantId: 'test-id',
    tenantName: 'Test Terreiro',
    logoUrl: undefined,
    config: undefined,
  }),
  TenantAwareThemeProvider: ({ children }: any) => <div>{children}</div>,
}));

const theme = createTheme();

function renderWithTheme(ui: React.ReactElement) {
  return render(<ThemeProvider theme={theme}>{ui}</ThemeProvider>);
}

describe('PublicLayout', () => {
  it('renders tenant name', () => {
    const PublicLayout = require('@/pages/public/public_layout').default;
    render(
      <PublicLayout tenantName="Test Terreiro" tenantColor="#2E7D32">
        <div data-testid="child">Content</div>
      </PublicLayout>
    );
    expect(screen.getByText('Test Terreiro')).toBeInTheDocument();
    expect(screen.getByTestId('child')).toBeInTheDocument();
  });

  it('renders logo when provided', () => {
    const PublicLayout = require('@/pages/public/public_layout').default;
    render(
      <PublicLayout
        tenantName="Test"
        tenantLogoUrl="https://example.com/logo.png"
      >
        <div>Content</div>
      </PublicLayout>
    );
    const logo = screen.getByAltText('Test');
    expect(logo).toBeInTheDocument();
    expect(logo).toHaveAttribute('src', 'https://example.com/logo.png');
  });
});

describe('GiraDetails', () => {
  // Espelha o payload real de GET /api/v1/public/next-gira (GiraPublic)
  const giraData = {
    id: 'gira-1',
    nome: 'Gira de Oxalá',
    descricao: 'Trabalho espiritual mensal.',
    data_inicio: new Date(Date.now() + 86400000).toISOString(),
    local: 'Terreiro Central',
    release_start_at: new Date(Date.now() - 1800000).toISOString(),
    release_end_at: new Date(Date.now() + 1800000).toISOString(),
    max_tickets: 100,
    current_tickets: 42,
    tickets_available: 58,
    is_open: true,
    is_exhausted: false,
    waitlist_available: false,
    is_sponsor: false,
    tenant_slug: 'test-tenant',
    tenant_name: 'Test Terreiro',
    use_time_slots: false,
    time_slots: [],
    allow_acompanhantes: false,
    max_acompanhantes: 0,
  };

  it('renders gira name', () => {
    const GiraDetails = require('@/pages/public/gira_details').default;
    render(<GiraDetails giraData={giraData} />);
    expect(screen.getByText('Gira de Oxalá')).toBeInTheDocument();
  });

  it('renders location', () => {
    const GiraDetails = require('@/pages/public/gira_details').default;
    render(<GiraDetails giraData={giraData} />);
    expect(screen.getByText(/Terreiro Central/)).toBeInTheDocument();
  });

  it('renders event date', () => {
    const GiraDetails = require('@/pages/public/gira_details').default;
    render(<GiraDetails giraData={giraData} />);
    expect(screen.getByText(/🗓️/)).toBeInTheDocument();
  });

  it('does not render sold-out banner for uncapped gira', () => {
    const GiraDetails = require('@/pages/public/gira_details').default;
    // Gira sem limite: backend envia tickets_available: 0 e is_exhausted: false
    render(
      <GiraDetails
        giraData={{ ...giraData, max_tickets: null, tickets_available: 0, is_exhausted: false }}
      />
    );
    expect(screen.queryByText(/Todas as senhas/)).not.toBeInTheDocument();
  });

  it('renders sold-out banner when exhausted', () => {
    const GiraDetails = require('@/pages/public/gira_details').default;
    render(
      <GiraDetails
        giraData={{ ...giraData, tickets_available: 0, is_exhausted: true }}
      />
    );
    expect(screen.getByText(/Todas as senhas/)).toBeInTheDocument();
  });

  it('renders with custom tenant color', () => {
    const GiraDetails = require('@/pages/public/gira_details').default;
    const { container } = render(
      <GiraDetails giraData={giraData} tenantColor="#FF0000" />
    );
    expect(container).toBeTruthy();
  });
});

describe('Tenant Public Page', () => {
  it('renders without crashing', () => {
    const { apiClient } = require('@/services/api_client');
    apiClient.get.mockResolvedValue({
      data: {
        id: 'gira-1',
        nome: 'Test Gira',
        data_inicio: new Date(Date.now() + 86400000).toISOString(),
        local: 'Test Location',
        release_start_at: new Date().toISOString(),
        release_end_at: new Date(Date.now() + 3600000).toISOString(),
        max_tickets: 100,
        current_tickets: 0,
        tickets_available: 100,
        is_open: true,
        is_exhausted: false,
        tenant_slug: 'test-tenant',
        tenant_name: 'Test Terreiro',
        use_time_slots: false,
        time_slots: [],
      },
    });

    const TenantPage = require('@/pages/public/[tenant]').default;
    const { container } = renderWithTheme(<TenantPage />);
    expect(container).toBeTruthy();
  });
});
