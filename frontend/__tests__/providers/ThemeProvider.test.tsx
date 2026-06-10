/**
 * Tests for ThemeProvider
 */
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import {
  TenantAwareThemeProvider,
  useTenant,
} from '@/providers/ThemeProvider';

// Mock API client
jest.mock('@/services/api_client', () => ({
  apiClient: {
    get: jest.fn().mockResolvedValue({ data: {} }),
  },
}));

// Test component that reads tenant context
function TenantDisplay() {
  const { tenantId, tenantName, logoUrl } = useTenant();
  return (
    <div>
      <span data-testid="tenant-id">{tenantId || 'none'}</span>
      <span data-testid="tenant-name">{tenantName || 'none'}</span>
      <span data-testid="tenant-logo">{logoUrl || 'none'}</span>
    </div>
  );
}

describe('TenantAwareThemeProvider', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    jest.clearAllMocks();
  });

  it('renders children', () => {
    render(
      <TenantAwareThemeProvider>
        <div data-testid="child">Hello</div>
      </TenantAwareThemeProvider>
    );
    expect(screen.getByTestId('child')).toBeInTheDocument();
  });

  it('provides tenant context to children', async () => {
    const { apiClient } = require('@/services/api_client');
    
    // Set token to bypass hasToken guard
    localStorage.setItem('access_token', 'fake-token');
    
    // Mock user in storage
    localStorage.setItem('user', JSON.stringify({
      tenant_id: 'test-id',
      tenant_name: 'Test Terreiro'
    }));

    // Mock response for tenant config API
    apiClient.get.mockResolvedValue({
      data: {
        tenant_nome: 'Test Terreiro',
        logo_url: 'https://example.com/logo.png',
        primary_color: '#FF0000',
        secondary_color: '#00FF00',
      }
    });

    render(
      <TenantAwareThemeProvider>
        <TenantDisplay />
      </TenantAwareThemeProvider>
    );

    // Since API call is async, wait for details to render
    await waitFor(() => {
      expect(screen.getByTestId('tenant-id')).toHaveTextContent('test-id');
    });
    expect(screen.getByTestId('tenant-name')).toHaveTextContent('Test Terreiro');
    expect(screen.getByTestId('tenant-logo')).toHaveTextContent('https://example.com/logo.png');
  });

  it('provides defaults when no config', async () => {
    render(
      <TenantAwareThemeProvider>
        <TenantDisplay />
      </TenantAwareThemeProvider>
    );

    // Should load defaults immediately when no token
    expect(screen.getByTestId('tenant-id')).toHaveTextContent('none');
    expect(screen.getByTestId('tenant-name')).toHaveTextContent('none');
  });
});

describe('useTenant', () => {
  it('returns defaults when used outside provider', () => {
    render(<TenantDisplay />);
    expect(screen.getByTestId('tenant-id')).toHaveTextContent('none');
  });
});
