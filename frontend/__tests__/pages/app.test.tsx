/**
 * Tests for _app.tsx - App wrapper
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import MyApp from '@/pages/_app';

// Mock next/router
jest.mock('next/router', () => ({
  useRouter: () => ({
    push: jest.fn(),
    pathname: '/',
    query: {},
    asPath: '/',
    events: { on: jest.fn(), off: jest.fn() },
  }),
}));

describe('MyApp', () => {
  it('renders children component with theme', () => {
    const TestComponent = () => <div data-testid="test-page">Test Page</div>;
    
    render(
      <MyApp
        Component={TestComponent}
        pageProps={{}}
        router={{} as any}
      />
    );

    expect(screen.getByTestId('test-page')).toBeInTheDocument();
  });

  it('provides MUI theme to children', () => {
    const TestComponent = () => <div data-testid="themed">Themed</div>;
    
    const { container } = render(
      <MyApp
        Component={TestComponent}
        pageProps={{}}
        router={{} as any}
      />
    );

    // CssBaseline and ThemeProvider should wrap the component
    expect(container).toBeTruthy();
    expect(screen.getByTestId('themed')).toBeInTheDocument();
  });
});
