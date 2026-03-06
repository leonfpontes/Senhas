/**
 * Tests for ThemeProvider
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import {
  TenantAwareThemeProvider,
  useTenant,
  TenantThemeConfig,
} from '@/providers/ThemeProvider';

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
  it('renders children', () => {
    render(
      <TenantAwareThemeProvider>
        <div data-testid="child">Hello</div>
      </TenantAwareThemeProvider>
    );
    expect(screen.getByTestId('child')).toBeInTheDocument();
  });

  it('provides tenant context to children', () => {
    const config: TenantThemeConfig = {
      tenantId: 'test-id',
      tenantName: 'Test Terreiro',
      colors: {
        primary: '#FF0000',
        secondary: '#00FF00',
      },
      logoUrl: 'https://example.com/logo.png',
    };

    render(
      <TenantAwareThemeProvider tenantConfig={config}>
        <TenantDisplay />
      </TenantAwareThemeProvider>
    );

    expect(screen.getByTestId('tenant-id')).toHaveTextContent('test-id');
    expect(screen.getByTestId('tenant-name')).toHaveTextContent('Test Terreiro');
    expect(screen.getByTestId('tenant-logo')).toHaveTextContent('https://example.com/logo.png');
  });

  it('provides defaults when no config', () => {
    render(
      <TenantAwareThemeProvider>
        <TenantDisplay />
      </TenantAwareThemeProvider>
    );

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
