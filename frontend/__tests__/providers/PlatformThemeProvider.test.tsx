import React from 'react';
import { render, screen, act } from '@testing-library/react';
import { PlatformThemeProvider, usePlatformTheme } from '@/providers/PlatformThemeProvider';

function Consumer() {
  const { mode, toggleMode } = usePlatformTheme();
  return (
    <div>
      <span data-testid="mode">{mode}</span>
      <button data-testid="toggle" onClick={toggleMode}>Toggle</button>
    </div>
  );
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  document.documentElement.classList.remove('dark');
});

describe('PlatformThemeProvider — classe `dark` em <html>', () => {
  it('começa claro e alterna a classe na raiz junto com o modo', () => {
    render(
      <PlatformThemeProvider>
        <Consumer />
      </PlatformThemeProvider>,
    );
    expect(screen.getByTestId('mode')).toHaveTextContent('light');
    expect(document.documentElement.classList.contains('dark')).toBe(false);

    act(() => { screen.getByTestId('toggle').click(); });
    expect(screen.getByTestId('mode')).toHaveTextContent('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(localStorage.getItem('platform_theme_mode')).toBe('dark');
  });

  it('restaura do localStorage no mount e remove a classe no unmount', () => {
    localStorage.setItem('platform_theme_mode', 'dark');
    const { unmount } = render(
      <PlatformThemeProvider>
        <Consumer />
      </PlatformThemeProvider>,
    );
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    unmount();
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });
});
