/**
 * /admin/config › Atendimento — ordem de atendimento da fila da Porta (número ou chegada):
 * - aparece em todos os planos (a aba não depende mais do plano de associados);
 * - a prioridade dos associados só aparece com o plano de associados;
 * - o PUT leva queue_order_mode.
 */
import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';

jest.mock('next/router', () => ({
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
    pathname: '/admin/config',
    query: { aba: 'atendimento' },
    asPath: '/admin/config?aba=atendimento',
  }),
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
  queue_order_mode: 'numero',
};

function mockConfig(overrides: Record<string, unknown> = {}) {
  const { apiClient } = require('@/services/api_client');
  const data = { ...BASE_CONFIG, ...overrides };
  apiClient.get.mockResolvedValue({ data });
  apiClient.put.mockResolvedValue({ data });
}

describe('Configurações — ordem de atendimento', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPlanCan.mockImplementation(() => true);
  });

  it('sem o plano de associados: mostra a ordem de atendimento e esconde a prioridade dos associados', async () => {
    mockPlanCan.mockImplementation((f: string) => f !== 'associados');
    mockConfig();
    const AdminConfig = require('@/pages/admin/config').default;
    render(<AdminConfig />);

    expect(await screen.findByText('Ordem de atendimento')).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /Pelo número da senha/ })).toBeChecked();
    expect(screen.queryByText('Prioridade dos associados')).not.toBeInTheDocument();
  });

  it('com o plano de associados: mostra as duas regras', async () => {
    mockConfig();
    const AdminConfig = require('@/pages/admin/config').default;
    render(<AdminConfig />);

    expect(await screen.findByText('Ordem de atendimento')).toBeInTheDocument();
    expect(screen.getByText('Prioridade dos associados')).toBeInTheDocument();
  });

  it('escolher "Pela ordem de chegada" e salvar leva queue_order_mode no PUT', async () => {
    mockConfig();
    const AdminConfig = require('@/pages/admin/config').default;
    render(<AdminConfig />);

    const chegada = await screen.findByRole('radio', { name: /Pela ordem de chegada/ });
    fireEvent.click(chegada);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /^Salvar$/ }));
    });

    const { apiClient } = require('@/services/api_client');
    await waitFor(() => expect(apiClient.put).toHaveBeenCalled());
    expect(apiClient.put.mock.calls[0][1].queue_order_mode).toBe('chegada');
  });
});
