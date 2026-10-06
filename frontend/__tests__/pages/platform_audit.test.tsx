/**
 * /platform/audit_consolidated — filtro de terreiro preenchido a partir da lista (array simples),
 * feed com nome do terreiro como link e exportação com toast.
 */
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

const mockRouter = { push: jest.fn(), replace: jest.fn(), pathname: '/platform/audit_consolidated', query: {}, asPath: '/platform/audit_consolidated', isReady: true, events: { on: jest.fn(), off: jest.fn() } };
jest.mock('next/router', () => ({ useRouter: () => mockRouter }));

const mockGet = jest.fn();
jest.mock('@/services/api_client', () => ({
  apiClient: { get: (...a: unknown[]) => mockGet(...a) },
  extractApiErrorMessage: (_e: unknown, fb: string) => fb,
}));
jest.mock('@/hooks/useProfile', () => ({ useProfile: () => ({ profile: null, loading: false, refresh: jest.fn() }) }));
jest.mock('@/components/support/usePlatformSupportUnread', () => ({ usePlatformSupportUnread: () => 0 }));
jest.mock('sonner', () => ({ toast: { success: jest.fn(), error: jest.fn(), info: jest.fn() } }));

import { toast } from 'sonner';
import AuditPage from '@/pages/platform/audit_consolidated';

const mockToast = toast as unknown as { success: jest.Mock; error: jest.Mock; info: jest.Mock };

const TENANTS = [
  { id: 't1', name: 'Casa Alfa', slug: 'casa-alfa' },
  { id: 't2', name: 'Casa Beta', slug: 'casa-beta' },
];
const FEED = [
  { id: 'e1', tenant_id: 't1', tenant_name: 'Casa Alfa', tenant_slug: 'casa-alfa', user_id: 'u1', user_email: 'adm@casa.com', user_username: 'adm', action: 'update', resource_type: 'Gira', resource_id: 'g1', details: { previous_state: { nome: 'Gira A' }, new_state: { nome: 'Gira B' } }, created_at: '2026-10-05T12:00:00Z' },
  { id: 'e2', tenant_id: null, tenant_name: 'Platform', tenant_slug: '', user_id: null, user_email: null, user_username: null, action: 'login', resource_type: 'User', resource_id: null, details: { success: false, ip_address: '1.2.3.4' }, created_at: '2026-10-05T11:00:00Z' },
  { id: 'e3', tenant_id: 't3', tenant_name: 'Casa Gama', tenant_slug: 'casa-gama', user_id: 'root', user_email: 'root@girahub.com.br', user_username: 'root', action: 'login', resource_type: 'User', resource_id: 'u1', details: { platform_action: 'impersonation_start', description: 'Super-admin root@girahub.com.br entrou como adm@casa.com (impersonação, 1h)' }, created_at: '2026-10-05T10:00:00Z' },
  { id: 'e4', tenant_id: 't3', tenant_name: 'Casa Gama', tenant_slug: 'casa-gama', user_id: 'root', user_email: 'root@girahub.com.br', user_username: 'root', action: 'update', resource_type: 'subscription', resource_id: null, details: { platform_action: 'subscription_plan_change', description: 'Plano alterado pela plataforma: basic → pro', previous_values: { plan: 'basic' }, new_values: { plan: 'pro' } }, created_at: '2026-10-05T09:00:00Z' },
];
const SUMMARY = {
  total: 2,
  by_tenant: { t1: 1, None: 1 },
  by_action: { update: 1, login: 1 },
  by_user: {},
  period: {},
  statistics: { most_common_action: 'update', most_active_tenant: 't1', most_active_tenant_name: 'Casa Alfa' },
  by_tenant_name: { t1: 'Casa Alfa' },
  by_tenant_slug: { t1: 'casa-alfa' },
};

describe('Platform — Auditoria consolidada', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.setItem('user', JSON.stringify({ role: 'super_admin' }));
    mockGet.mockImplementation((url: string) => {
      if (url === '/api/v1/platform/tenants') return Promise.resolve({ data: TENANTS });
      if (url === '/api/v1/platform/audit-logs') return Promise.resolve({ data: SUMMARY });
      if (url === '/api/v1/platform/audit-logs/feed') return Promise.resolve({ data: FEED });
      return Promise.resolve({ data: [] });
    });
  });
  afterEach(() => localStorage.clear());

  it('preenche o filtro de terreiro com a lista (array) e mostra o feed com rótulos acentuados', async () => {
    render(<AuditPage />);
    expect(await screen.findByRole('link', { name: 'Casa Alfa' })).toHaveAttribute('href', '/platform/tenants/t1');
    expect(screen.getAllByText('Atualização').length).toBeGreaterThan(0);
    expect(screen.getByText('Gira B')).toBeInTheDocument();
    // Ações do super-admin (platform_audit.py) aparecem com a frase pronta, não como login comum.
    expect(screen.getByText(/entrou como adm@casa.com \(impersonação, 1h\)/)).toBeInTheDocument();
    expect(screen.getAllByText('FALHA')).toHaveLength(1);
    expect(screen.getByText('Plano: basic → pro')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('combobox', { name: /Terreiro/ }));
    expect(await screen.findByText('Casa Beta')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Casa Beta'));
    await waitFor(() => {
      const feedCalls = mockGet.mock.calls.filter((c) => c[0] === '/api/v1/platform/audit-logs/feed');
      expect(feedCalls.at(-1)?.[1]?.params?.tenant_id).toBe('t2');
    });
  });

  it('exporta com toast de sucesso', async () => {
    const createObjectURL = jest.fn(() => 'blob:x');
    const revokeObjectURL = jest.fn();
    Object.defineProperty(URL, 'createObjectURL', { value: createObjectURL, configurable: true });
    Object.defineProperty(URL, 'revokeObjectURL', { value: revokeObjectURL, configurable: true });
    const click = jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    render(<AuditPage />);
    await screen.findByRole('link', { name: 'Casa Alfa' });
    fireEvent.click(screen.getByRole('button', { name: /Exportar JSON/ }));
    await waitFor(() => expect(mockToast.success).toHaveBeenCalledWith('Exportação concluída: 4 eventos.'));
    expect(click).toHaveBeenCalled();
    click.mockRestore();
  });
});
