import React from 'react';
import { render, screen, act } from '@testing-library/react';
import { AdminThemeProvider, useAdminTheme } from '@/providers/AdminThemeProvider';

// TenantAwareThemeProvider is the outer layer; AdminThemeProvider reads from it.
// Provide a minimal mock so we don't trigger real API calls.
jest.mock('@/providers/ThemeProvider', () => ({
  useTenant: () => ({
    config: { colors: { primary: '#6366F1', secondary: '#EC4899' } },
    tenantId: null,
    tenantName: null,
    logoUrl: null,
  }),
}));

jest.mock('@/services/api_client', () => ({
  apiClient: { get: jest.fn().mockResolvedValue({ data: {} }) },
}));

// ── Helper component that reads context values ──────────────────────────────

function ThemeConsumer() {
  const { mode, isDark, tokens, toggleMode } = useAdminTheme();
  return (
    <div>
      <span data-testid="mode">{mode}</span>
      <span data-testid="is-dark">{String(isDark)}</span>
      <span data-testid="page-bg">{tokens.pageBg}</span>
      <button data-testid="toggle" onClick={toggleMode}>Toggle</button>
    </div>
  );
}

function WrappedConsumer() {
  return (
    <AdminThemeProvider>
      <ThemeConsumer />
    </AdminThemeProvider>
  );
}

beforeEach(() => {
  localStorage.clear();
  jest.clearAllMocks();
});

describe('AdminThemeProvider', () => {
  it('renders children', () => {
    render(
      <AdminThemeProvider>
        <div data-testid="child">Hello</div>
      </AdminThemeProvider>
    );
    expect(screen.getByTestId('child')).toBeInTheDocument();
  });

  it('defaults to light mode', () => {
    render(<WrappedConsumer />);
    expect(screen.getByTestId('mode')).toHaveTextContent('light');
    expect(screen.getByTestId('is-dark')).toHaveTextContent('false');
  });

  it('light tokens have correct pageBg', () => {
    render(<WrappedConsumer />);
    expect(screen.getByTestId('page-bg')).toHaveTextContent('#F8FAFC');
  });

  it('toggles to dark mode on button click', () => {
    render(<WrappedConsumer />);
    act(() => {
      screen.getByTestId('toggle').click();
    });
    expect(screen.getByTestId('mode')).toHaveTextContent('dark');
    expect(screen.getByTestId('is-dark')).toHaveTextContent('true');
  });

  it('dark tokens differ from light tokens (pageBg)', () => {
    render(<WrappedConsumer />);
    // Start light
    expect(screen.getByTestId('page-bg')).toHaveTextContent('#F8FAFC');
    act(() => {
      screen.getByTestId('toggle').click();
    });
    // Dark pageBg
    expect(screen.getByTestId('page-bg')).toHaveTextContent('#0F172A');
  });

  it('persists mode to localStorage on toggle', () => {
    render(<WrappedConsumer />);
    act(() => {
      screen.getByTestId('toggle').click();
    });
    expect(localStorage.getItem('admin_theme_mode')).toBe('dark');
  });

  it('toggles back to light mode on second click', () => {
    render(<WrappedConsumer />);
    act(() => { screen.getByTestId('toggle').click(); });
    act(() => { screen.getByTestId('toggle').click(); });
    expect(screen.getByTestId('mode')).toHaveTextContent('light');
    expect(localStorage.getItem('admin_theme_mode')).toBe('light');
  });

  it('restores dark mode from localStorage', () => {
    localStorage.setItem('admin_theme_mode', 'dark');
    render(<WrappedConsumer />);
    expect(screen.getByTestId('mode')).toHaveTextContent('dark');
  });

  it('ignores invalid localStorage value and defaults to light', () => {
    localStorage.setItem('admin_theme_mode', 'invalid');
    render(<WrappedConsumer />);
    expect(screen.getByTestId('mode')).toHaveTextContent('light');
  });
});

describe('useAdminTheme outside provider', () => {
  it('returns default light context values', () => {
    render(<ThemeConsumer />);
    // Context default values: mode=light, isDark=false
    expect(screen.getByTestId('mode')).toHaveTextContent('light');
    expect(screen.getByTestId('is-dark')).toHaveTextContent('false');
  });
});
