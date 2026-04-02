/**
 * Tests for admin pages
 * Testing: dashboard, giras, tickets, analytics, audit_trail, config, admin_layout
 */
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material/styles';

// Mock next/router
jest.mock('next/router', () => ({
  useRouter: () => ({
    push: jest.fn(),
    pathname: '/admin/dashboard',
    query: {},
    asPath: '/admin/dashboard',
    events: { on: jest.fn(), off: jest.fn() },
  }),
}));

// Mock next/link
jest.mock('next/link', () => {
  return ({ children, href }: any) => <a href={href}>{children}</a>;
});

// Mock API client
jest.mock('@/services/api_client', () => ({
  apiClient: {
    get: jest.fn().mockResolvedValue({ data: {} }),
    post: jest.fn().mockResolvedValue({ data: {} }),
    put: jest.fn().mockResolvedValue({ data: {} }),
    delete: jest.fn().mockResolvedValue({ data: {} }),
  },
}));

// Mock recharts (it causes issues in jsdom)
jest.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: any) => <div data-testid="responsive-container">{children}</div>,
  BarChart: ({ children }: any) => <div data-testid="bar-chart">{children}</div>,
  Bar: () => <div />,
  LineChart: ({ children }: any) => <div data-testid="line-chart">{children}</div>,
  Line: () => <div />,
  PieChart: ({ children }: any) => <div data-testid="pie-chart">{children}</div>,
  Pie: () => <div />,
  Cell: () => <div />,
  XAxis: () => <div />,
  YAxis: () => <div />,
  CartesianGrid: () => <div />,
  Tooltip: () => <div />,
  Legend: () => <div />,
}));

const theme = createTheme();

function renderWithTheme(ui: React.ReactElement) {
  return render(<ThemeProvider theme={theme}>{ui}</ThemeProvider>);
}

describe('Admin Dashboard', () => {
  it('renders without crashing', async () => {
    const { apiClient } = require('@/services/api_client');
    apiClient.get.mockResolvedValue({
      data: {
        total_tickets: 100,
        tickets_today: 5,
        total_giras: 10,
        total_consulentes: 50,
      },
    });

    const AdminDashboard = require('@/pages/admin/dashboard').default;
    const { container } = renderWithTheme(<AdminDashboard />);
    expect(container).toBeTruthy();
  });

  it('shows loading state', () => {
    const AdminDashboard = require('@/pages/admin/dashboard').default;
    renderWithTheme(<AdminDashboard />);
    // Should have some content or loading indicator
    expect(document.body).toBeTruthy();
  });
});

describe('Admin Giras', () => {
  it('renders without crashing', () => {
    const { apiClient } = require('@/services/api_client');
    apiClient.get.mockResolvedValue({ data: [] });

    const AdminGiras = require('@/pages/admin/giras').default;
    const { container } = renderWithTheme(<AdminGiras />);
    expect(container).toBeTruthy();
  });
});

describe('Admin Tickets', () => {
  it('renders without crashing', () => {
    const { apiClient } = require('@/services/api_client');
    apiClient.get.mockResolvedValue({ data: { tickets: [], total: 0 } });

    const AdminTickets = require('@/pages/admin/tickets').default;
    const { container } = renderWithTheme(<AdminTickets />);
    expect(container).toBeTruthy();
  });
});

describe('Admin Analytics', () => {
  it('renders without crashing', () => {
    const { apiClient } = require('@/services/api_client');
    apiClient.get.mockResolvedValue({
      data: {
        tickets_by_status: [],
        tickets_by_day: [],
        total_tickets: 0,
      },
    });

    const AdminAnalytics = require('@/pages/admin/analytics').default;
    const { container } = renderWithTheme(<AdminAnalytics />);
    expect(container).toBeTruthy();
  });
});

describe('Admin Audit Trail', () => {
  it('renders without crashing', () => {
    const { apiClient } = require('@/services/api_client');
    apiClient.get.mockResolvedValue({ data: { logs: [], total: 0 } });

    const AdminAuditTrail = require('@/pages/admin/audit_trail').default;
    const { container } = renderWithTheme(<AdminAuditTrail />);
    expect(container).toBeTruthy();
  });
});

describe('Admin Config', () => {
  it('renders without crashing', () => {
    const { apiClient } = require('@/services/api_client');
    apiClient.get.mockResolvedValue({
      data: {
        primary_color: '#6366f1',
        secondary_color: '#ec4899',
        enable_bulk_operations: true,
        enable_analytics: true,
      },
    });

    const AdminConfig = require('@/pages/admin/config').default;
    const { container } = renderWithTheme(<AdminConfig />);
    expect(container).toBeTruthy();
  });
});

describe('Admin Layout', () => {
  afterEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('renders children', () => {
    const AdminLayout = require('@/pages/admin/admin_layout').default;
    renderWithTheme(
      <AdminLayout>
        <div data-testid="child-content">Test Content</div>
      </AdminLayout>
    );
    expect(screen.getByTestId('child-content')).toBeInTheDocument();
  });

  it('does NOT overwrite localStorage.user when impersonating', async () => {
    const { apiClient } = require('@/services/api_client');

    // Superadmin stored in localStorage (the real session)
    const superAdminUser = { role: 'super_admin', email: 'super@test.com', id: 'sa-1' };
    localStorage.setItem('user', JSON.stringify(superAdminUser));

    // Impersonation flag is set (as done by /admin/impersonate landing page)
    sessionStorage.setItem('impersonating', 'true');

    // Profile API returns the tenant user's data (via the impersonation token)
    apiClient.get.mockResolvedValue({
      data: { role: 'admin', email: 'tenant@test.com', id: 'tu-1' },
    });

    const AdminLayout = require('@/pages/admin/admin_layout').default;
    renderWithTheme(
      <AdminLayout>
        <div>Content</div>
      </AdminLayout>
    );

    await waitFor(() => expect(apiClient.get).toHaveBeenCalledWith('/api/v1/auth/profile'));

    // localStorage must still contain the superadmin — not the tenant user
    const stored = JSON.parse(localStorage.getItem('user') || '{}');
    expect(stored.role).toBe('super_admin');
    expect(stored.email).toBe('super@test.com');
  });

  it('updates localStorage.user when NOT impersonating', async () => {
    const { apiClient } = require('@/services/api_client');

    // Superadmin stored in localStorage with stale email
    const superAdminUser = { role: 'super_admin', email: 'old@test.com', id: 'sa-1' };
    localStorage.setItem('user', JSON.stringify(superAdminUser));

    // No impersonation flag
    sessionStorage.removeItem('impersonating');

    // Profile API returns updated superadmin data
    apiClient.get.mockResolvedValue({
      data: { role: 'super_admin', email: 'updated@test.com', id: 'sa-1' },
    });

    const AdminLayout = require('@/pages/admin/admin_layout').default;
    renderWithTheme(
      <AdminLayout>
        <div>Content</div>
      </AdminLayout>
    );

    await waitFor(() => expect(apiClient.get).toHaveBeenCalledWith('/api/v1/auth/profile'));

    // localStorage must reflect the updated profile
    const stored = JSON.parse(localStorage.getItem('user') || '{}');
    expect(stored.email).toBe('updated@test.com');
    expect(stored.role).toBe('super_admin');
  });
});
