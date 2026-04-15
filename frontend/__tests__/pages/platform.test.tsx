/**
 * Tests for platform pages
 * Testing: index, tenants, users_global, audit_consolidated, layout
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material/styles';

// Mock next/router
jest.mock('next/router', () => ({
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
    pathname: '/platform',
    query: {},
    asPath: '/platform',
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

// Mock @mui/lab for TabContext/TabList/TabPanel
jest.mock('@mui/lab', () => ({
  TabContext: ({ children }: any) => <div>{children}</div>,
  TabList: ({ children }: any) => <div>{children}</div>,
  TabPanel: ({ children }: any) => <div>{children}</div>,
}));

const theme = createTheme();

function renderWithTheme(ui: React.ReactElement) {
  return render(<ThemeProvider theme={theme}>{ui}</ThemeProvider>);
}

describe('Platform Dashboard', () => {
  it('renders without crashing', () => {
    const { apiClient } = require('@/services/api_client');
    apiClient.get.mockResolvedValue({
      data: {
        tenants: { total: 5, active: 4, inactive: 1, trial: 1, new_30d: 2 },
        user_count: 50,
        tickets: { total: 200, last_30d: 80, last_7d: 20 },
        mrr: 490.0,
        plans_distribution: [{ plan: 'basic', count: 3 }, { plan: 'pro', count: 1 }],
        daily_tickets: [],
        tenant_growth: [],
        top_tenants: [],
        generated_at: new Date().toISOString(),
      },
    });

    const PlatformDashboard = require('@/pages/platform/index').default;
    const { container } = renderWithTheme(<PlatformDashboard />);
    expect(container).toBeTruthy();
  });
});

describe('Platform Tenants', () => {
  it('renders without crashing', () => {
    const { apiClient } = require('@/services/api_client');
    apiClient.get.mockResolvedValue({ data: { tenants: [], total: 0 } });

    const PlatformTenants = require('@/pages/platform/tenants').default;
    const { container } = renderWithTheme(<PlatformTenants />);
    expect(container).toBeTruthy();
  });
});

describe('Platform Tenant Detail', () => {
  it('renders without crashing', () => {
    const { apiClient } = require('@/services/api_client');
    apiClient.get.mockResolvedValue({
      data: {
        id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
        slug: 'test',
        name: 'Test Tenant',
        description: null,
        is_active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    });

    const TenantDetailPage = require('@/pages/platform/tenants/[id]').default;
    const { container } = renderWithTheme(<TenantDetailPage />);
    expect(container).toBeTruthy();
  });
});

describe('Platform Users Global', () => {
  it('renders without crashing', () => {
    const { apiClient } = require('@/services/api_client');
    apiClient.get.mockResolvedValue({ data: { users: [], total: 0 } });

    const PlatformUsersGlobal = require('@/pages/platform/users_global').default;
    const { container } = renderWithTheme(<PlatformUsersGlobal />);
    expect(container).toBeTruthy();
  });
});

describe('Platform Audit Consolidated', () => {
  it('renders without crashing', () => {
    const { apiClient } = require('@/services/api_client');
    apiClient.get.mockResolvedValue({ data: { logs: [], total: 0 } });

    const PlatformAudit = require('@/pages/platform/audit_consolidated').default;
    const { container } = renderWithTheme(<PlatformAudit />);
    expect(container).toBeTruthy();
  });
});

describe('Platform Layout', () => {
  it('renders children', () => {
    const PlatformLayout = require('@/pages/platform/layout').default;
    renderWithTheme(
      <PlatformLayout>
        <div data-testid="platform-child">Platform Content</div>
      </PlatformLayout>
    );
    expect(screen.getByTestId('platform-child')).toBeInTheDocument();
  });
});
