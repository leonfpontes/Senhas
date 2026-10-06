/**
 * TenantAwareThemeProvider → applyBrand: cores do terreiro viram tokens CSS em <html>.
 */
import React from 'react';
import { render, waitFor } from '@testing-library/react';
import { TenantAwareThemeProvider, dispatchTenantBrandingUpdated } from '@/providers/ThemeProvider';

jest.mock('@/services/api_client', () => ({
  apiClient: { get: jest.fn() },
}));

const root = document.documentElement;
const token = (name: string) => root.style.getPropertyValue(name);

describe('TenantAwareThemeProvider — applyBrand', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    jest.clearAllMocks();
    root.removeAttribute('style');
  });

  it('sem sessão aplica as cores padrão', async () => {
    const { apiClient } = require('@/services/api_client');
    render(
      <TenantAwareThemeProvider>
        <div />
      </TenantAwareThemeProvider>,
    );
    await waitFor(() => expect(token('--primary')).toBe('#4f46e5'));
    expect(token('--secondary')).toBe('#ec4899');
    // #4f46e5 (default do backend) + branco dá 6,3 (≥ 4,5) → mantém o branco, igual ao MUI.
    // Fase 1: o default antigo #6366f1 dava 4,47 e caía para preto — por isso foi alinhado.
    expect(token('--primary-foreground').toLowerCase()).toBe('#ffffff');
    expect(apiClient.get).not.toHaveBeenCalled();
  });

  it('com sessão aplica as cores do tenant e reage ao evento tenant-branding-updated', async () => {
    const { apiClient } = require('@/services/api_client');
    localStorage.setItem('user', JSON.stringify({ tenant_id: 't1', tenant_name: 'Casa de Oxum' }));
    apiClient.get.mockResolvedValue({
      data: { tenant_nome: 'Casa de Oxum', primary_color: '#4f46e5', secondary_color: '#0f766e', font_color: '#ffffff' },
    });

    render(
      <TenantAwareThemeProvider>
        <div />
      </TenantAwareThemeProvider>,
    );

    await waitFor(() => expect(token('--primary')).toBe('#4f46e5'));
    expect(token('--primary-foreground').toLowerCase()).toBe('#ffffff');
    expect(token('--secondary')).toBe('#0f766e');
    expect(token('--secondary-foreground')).toBe('#ffffff');
    expect(token('--ring')).toBe('#4f46e5');
    expect(token('--sidebar-primary')).toBe('#4f46e5');

    // Segundo terreiro: amarelo com fonte branca configurada → contraste insuficiente, cai para preto.
    apiClient.get.mockResolvedValue({
      data: { tenant_nome: 'Tenda do Caboclo', primary_color: '#facc15', secondary_color: '#1e293b', font_color: '#ffffff' },
    });
    dispatchTenantBrandingUpdated();

    await waitFor(() => expect(token('--primary')).toBe('#facc15'));
    expect(token('--primary-foreground')).toBe('#000000');
    expect(token('--secondary-foreground')).toBe('#ffffff');
  });
});
