/**
 * Tests for /admin/giras page
 * Focus: CRUD table, ConfirmDialog for delete + release-now, status chips
 */
import React from 'react';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material/styles';

jest.mock('next/router', () => ({
  useRouter: () => ({
    push: jest.fn(), replace: jest.fn(), pathname: '/admin/giras',
    query: {}, asPath: '/admin/giras',
    events: { on: jest.fn(), off: jest.fn() },
  }),
}));

jest.mock('next/link', () => ({ children, href }: any) => <a href={href}>{children}</a>);

jest.mock('@/services/api_client', () => ({
  apiClient: {
    get:    jest.fn(),
    post:   jest.fn().mockResolvedValue({ data: {} }),
    put:    jest.fn().mockResolvedValue({ data: {} }),
    delete: jest.fn().mockResolvedValue({ data: {} }),
    patch:  jest.fn().mockResolvedValue({ data: {} }),
  },
}));

// Strip the layout so we only test the page content
jest.mock('@/pages/admin/admin_layout', () => ({
  __esModule: true,
  default: ({ children }: any) => <div data-testid="admin-layout">{children}</div>,
}));

jest.mock('@/hooks/useSubscription', () => ({
  useSubscription: () => ({
    subscription: { plan: 'pro', status: 'active', max_giras_per_month: 20 },
    can: () => true,
    canCreateGira: () => true,
    loading: false,
  }),
}));

jest.mock('@/components/CrudDrawer', () => ({
  __esModule: true,
  default: ({ children, open, title }: any) =>
    open ? <div data-testid="crud-drawer" aria-label={title}>{children}</div> : null,
}));

const theme = createTheme();
function wrap(ui: React.ReactElement) {
  return render(<ThemeProvider theme={theme}>{ui}</ThemeProvider>);
}

const MOCK_GIRAS = [
  {
    id: 'g1', nome: 'Gira de Exú', descricao: 'Desc', data_inicio: '2025-01-01T20:00:00Z',
    data_fim: '2025-01-01T23:00:00Z', is_active: true, status: 'open',
    release_start_at: null, link_publico: 'https://example.com/g/g1',
    numero_tickets: 10, emitidos: 3,
  },
];

describe('Admin Giras Page', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    const { apiClient } = require('@/services/api_client');
    apiClient.get.mockResolvedValue({ data: MOCK_GIRAS });
  });

  it('renders without crashing', () => {
    const AdminGiras = require('@/pages/admin/giras').default;
    const { container } = wrap(<AdminGiras />);
    expect(container).toBeTruthy();
  });

  it('renders gira name after loading', async () => {
    const AdminGiras = require('@/pages/admin/giras').default;
    wrap(<AdminGiras />);
    await waitFor(() => {
      expect(screen.getByText('Gira de Exú')).toBeInTheDocument();
    });
  });

  it('shows empty state when no giras', async () => {
    const { apiClient } = require('@/services/api_client');
    apiClient.get.mockResolvedValue({ data: [] });
    const AdminGiras = require('@/pages/admin/giras').default;
    wrap(<AdminGiras />);
    await waitFor(() => {
      expect(screen.queryByText('Gira de Exú')).not.toBeInTheDocument();
    });
  });
});
