/**
 * /admin/config — aba "Área do Médium" (AM-10): só aparece com a feature `area_medium`
 * (plano Basic+ e chave do piloto liberada), sem PlanLocked; sem CONFIGURACOES:view a tela
 * inteira mostra PermissionDenied.
 */
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';

jest.mock('next/router', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), pathname: '/admin/config', query: {}, asPath: '/admin/config' }),
}));
jest.mock('next/link', () => ({ children, href }: any) => <a href={href}>{children}</a>);

const mockGet = jest.fn();
jest.mock('@/services/api_client', () => ({
  apiClient: { get: (...a: unknown[]) => mockGet(...a), post: jest.fn(), put: jest.fn(), delete: jest.fn() },
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
const mockGroupCan = jest.fn((_f: string, _a: string) => true);
jest.mock('@/hooks/usePermissions', () => ({
  usePermissions: () => ({ can: mockGroupCan, permissions: null, loading: false, refresh: jest.fn() }),
}));
jest.mock('@/providers/ThemeProvider', () => ({ dispatchTenantBrandingUpdated: jest.fn() }));

const TENANT_CONFIG = {
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

const AREA_CONFIG = {
  ativa: true,
  boas_vindas: 'Axé!',
  whatsapp: null,
  modulos: { agenda: true, avisos: true, mensalidade: true },
  mensalidade_no_plano: true,
};

describe('Configurações — aba Área do Médium', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPlanCan.mockImplementation(() => true);
    mockGroupCan.mockImplementation(() => true);
    mockGet.mockImplementation((url: string) =>
      Promise.resolve({ data: url === '/api/v1/admin/config/area-medium' ? AREA_CONFIG : TENANT_CONFIG }),
    );
  });

  it('sem a feature area_medium a aba não aparece (nem oferta de upgrade)', async () => {
    mockPlanCan.mockImplementation((f: string) => f !== 'area_medium');
    const AdminConfig = require('@/pages/admin/config').default;
    render(<AdminConfig />);
    await screen.findByDisplayValue('Terreiro Teste');
    expect(screen.queryByRole('tab', { name: /Área do Médium/ })).not.toBeInTheDocument();
    expect(mockGet).not.toHaveBeenCalledWith('/api/v1/admin/config/area-medium');
  });

  it('com a feature a aba abre a configuração da Área', async () => {
    const AdminConfig = require('@/pages/admin/config').default;
    render(<AdminConfig />);
    await screen.findByDisplayValue('Terreiro Teste');
    const tab = screen.getByRole('tab', { name: /Área do Médium/ });
    fireEvent.mouseDown(tab);
    fireEvent.click(tab);
    expect(await screen.findByDisplayValue('Axé!')).toBeInTheDocument();
    expect(mockGet).toHaveBeenCalledWith('/api/v1/admin/config/area-medium');
    expect(screen.getByRole('button', { name: /Salvar Área do Médium/ })).toBeInTheDocument();
  });

  it('sem CONFIGURACOES:edit a aba fica só leitura', async () => {
    mockGroupCan.mockImplementation((_f: string, a: string) => a === 'view');
    const AdminConfig = require('@/pages/admin/config').default;
    render(<AdminConfig />);
    await screen.findByDisplayValue('Terreiro Teste');
    const tab = screen.getByRole('tab', { name: /Área do Médium/ });
    fireEvent.mouseDown(tab);
    fireEvent.click(tab);
    await screen.findByDisplayValue('Axé!');
    expect(screen.queryByRole('button', { name: /Salvar Área do Médium/ })).not.toBeInTheDocument();
  });

  it('sem CONFIGURACOES:view a tela não carrega nada', () => {
    mockGroupCan.mockImplementation(() => false);
    const AdminConfig = require('@/pages/admin/config').default;
    render(<AdminConfig />);
    expect(screen.getByText(/não tem permissão/i)).toBeInTheDocument();
    expect(mockGet).not.toHaveBeenCalledWith('/api/v1/admin/config/area-medium');
  });
});
