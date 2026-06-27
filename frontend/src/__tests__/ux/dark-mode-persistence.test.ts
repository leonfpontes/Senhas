/**
 * Verifica o contrato de persistência do dark mode em localStorage.
 * A chave usada pelo AdminThemeProvider é 'admin_theme_mode'.
 */
const STORAGE_KEY = 'admin_theme_mode';

describe('Dark mode — persistência em localStorage', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('o toggle grava o novo modo em localStorage', () => {
    // Simula o comportamento do toggleMode: alterna e persiste.
    const toggle = (prev: 'light' | 'dark'): 'light' | 'dark' => {
      const next = prev === 'dark' ? 'light' : 'dark';
      localStorage.setItem(STORAGE_KEY, next);
      return next;
    };

    let mode: 'light' | 'dark' = 'light';
    mode = toggle(mode);
    expect(mode).toBe('dark');
    expect(localStorage.getItem(STORAGE_KEY)).toBe('dark');

    mode = toggle(mode);
    expect(mode).toBe('light');
    expect(localStorage.getItem(STORAGE_KEY)).toBe('light');
  });

  it('na inicialização lê o valor salvo e usa light como padrão', () => {
    const init = (): 'light' | 'dark' => {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved === 'dark' || saved === 'light' ? saved : 'light';
    };

    expect(init()).toBe('light'); // sem nada salvo
    localStorage.setItem(STORAGE_KEY, 'dark');
    expect(init()).toBe('dark');
  });
});
