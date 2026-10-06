/**
 * /admin/config — marca do terreiro:
 * - fora do plano com tema_personalizado o envio de logo some e o PUT não leva cores
 *   (o backend recusa mudança de cor/logo fora do plano, mas aceita o resto);
 * - a prévia usa pickForeground (mesma regra do applyBrand) — prévia = painel.
 */
import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';

jest.mock('next/router', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), pathname: '/admin/config', query: {}, asPath: '/admin/config' }),
}));
jest.mock('next/link', () => ({ children, href }: any) => <a href={href}>{children}</a>);

jest.mock('@/services/api_client', () => ({
  apiClient: { get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn() },
  extractApiErrorMessage: (_e: unknown, fallback: string) => fallback,
}));

jest.mock('@/pages/admin/admin_layout', () => ({
  __esModule: true,
  default: ({ children }: any) => <div>{children}</div>,
}));

const mockPlanCan = jest.fn((_f: string) => true);
jest.mock('@/hooks/useSubscription', () => ({
  useSubscription: () => ({ can: mockPlanCan, subscription: { plan: 'basic' }, loading: false }),
}));
jest.mock('@/hooks/usePermissions', () => ({
  usePermissions: () => ({ can: () => true, permissions: null, loading: false, refresh: jest.fn() }),
}));
jest.mock('@/providers/ThemeProvider', () => ({ dispatchTenantBrandingUpdated: jest.fn() }));

const BASE_CONFIG = {
  tenant_nome: 'Terreiro Teste',
  logo_url: null,
  primary_color: '#4F46E5',
  secondary_color: '#818CF8',
  endereco: '',
  custom_settings: { font_color: '#FFFFFF' },
  enable_analytics: false,
  enable_walk_in: false,
  validate_associado_on_emit: false,
  enable_estoque_log: true,
  enable_mensalidade_associado: false,
  enable_waitlist: false,
  enable_time_slot_scheduling: false,
  sponsor_priority_mode: 'first',
};

function mockConfig(overrides: Record<string, unknown> = {}) {
  const { apiClient } = require('@/services/api_client');
  const data = { ...BASE_CONFIG, ...overrides };
  apiClient.get.mockResolvedValue({ data });
  apiClient.put.mockResolvedValue({ data });
}

describe('Configurações — marca do terreiro', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPlanCan.mockImplementation(() => true);
  });

  it('sem o plano de tema: não oferece envio de logo e o PUT não leva as cores', async () => {
    mockPlanCan.mockImplementation((f: string) => f !== 'tema_personalizado');
    mockConfig();
    const AdminConfig = require('@/pages/admin/config').default;
    render(<AdminConfig />);

    await screen.findByDisplayValue('Terreiro Teste');
    expect(screen.queryByText(/Clique ou arraste para enviar o logo/)).not.toBeInTheDocument();
    expect(screen.getByText(/Logo próprio a partir do plano/)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Endereço'), { target: { value: 'Rua Nova, 1' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /^Salvar$/ }));
    });

    const { apiClient } = require('@/services/api_client');
    await waitFor(() => expect(apiClient.put).toHaveBeenCalled());
    const payload = apiClient.put.mock.calls[0][1];
    expect(payload.endereco).toBe('Rua Nova, 1');
    expect(payload).not.toHaveProperty('primary_color');
    expect(payload).not.toHaveProperty('secondary_color');
    expect(payload).not.toHaveProperty('custom_settings');
  });

  it('com o plano de tema: oferece envio de logo e o PUT leva as cores', async () => {
    mockConfig();
    const AdminConfig = require('@/pages/admin/config').default;
    render(<AdminConfig />);

    await screen.findByDisplayValue('Terreiro Teste');
    expect(screen.getByText(/Clique ou arraste para enviar o logo/)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Endereço'), { target: { value: 'Rua Nova, 1' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /^Salvar$/ }));
    });
    const { apiClient } = require('@/services/api_client');
    await waitFor(() => expect(apiClient.put).toHaveBeenCalled());
    expect(apiClient.put.mock.calls[0][1].primary_color).toBe('#4F46E5');
  });

  it('prévia troca a cor do texto sem contraste, como o painel faz', async () => {
    // Texto branco sobre amarelo não passa AA: o applyBrand usa preto.
    mockConfig({ primary_color: '#FFFF00', custom_settings: { font_color: '#FFFFFF' } });
    const AdminConfig = require('@/pages/admin/config').default;
    render(<AdminConfig />);

    await screen.findByDisplayValue('Terreiro Teste');
    expect(screen.getByTestId('font-color-adjusted')).toHaveTextContent('preto');
    expect(screen.getByText('Terreiro Teste', { selector: 'p' })).toHaveStyle({ color: '#000000' });
  });

  it('descreve o que o "Conferir e-mail de associado" realmente faz', async () => {
    mockConfig();
    const AdminConfig = require('@/pages/admin/config').default;
    render(<AdminConfig />);
    await screen.findByDisplayValue('Terreiro Teste');
    fireEvent.mouseDown(screen.getByRole('tab', { name: /Funções/ }));
    fireEvent.click(screen.getByRole('tab', { name: /Funções/ }));
    expect(await screen.findByText('Conferir e-mail de associado')).toBeInTheDocument();
    expect(screen.queryByText('Só associado pega senha')).not.toBeInTheDocument();
  });
});
