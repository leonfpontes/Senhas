/**
 * /platform/tenants/[id] — Tenant 360: cabeçalho, abas por query, estado 404, terreiro excluído
 * (desativado pelo próprio) com exclusão definitiva, giras do próprio terreiro, limpar descrição e
 * drawer de assinatura sem refetch a cada render.
 */
import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';

const mockRouter = {
  push: jest.fn(),
  replace: jest.fn(),
  pathname: '/platform/tenants/[id]',
  query: { id: 't1' } as Record<string, string>,
  asPath: '/platform/tenants/t1',
  isReady: true,
  events: { on: jest.fn(), off: jest.fn() },
};
jest.mock('next/router', () => ({ useRouter: () => mockRouter }));

const mockGet = jest.fn();
const mockPut = jest.fn();
const mockDelete = jest.fn();
jest.mock('@/services/api_client', () => ({
  apiClient: {
    get: (...a: unknown[]) => mockGet(...a),
    post: jest.fn(),
    put: (...a: unknown[]) => mockPut(...a),
    patch: jest.fn(),
    delete: (...a: unknown[]) => mockDelete(...a),
  },
  extractApiErrorMessage: (_e: unknown, fb: string) => fb,
}));
jest.mock('@/hooks/useProfile', () => ({ useProfile: () => ({ profile: null, loading: false, refresh: jest.fn() }) }));
jest.mock('@/components/support/usePlatformSupportUnread', () => ({ usePlatformSupportUnread: () => 0 }));
jest.mock('sonner', () => ({ toast: { success: jest.fn(), error: jest.fn(), info: jest.fn() } }));

import TenantDetailPage from '@/pages/platform/tenants/[id]';

const TENANT = { id: 't1', slug: 'casa-alfa', name: 'Casa Alfa', description: 'Terreiro de teste', is_active: true, created_at: '2026-09-01T00:00:00Z', updated_at: '2026-09-02T00:00:00Z', plan: 'pro', subscription_status: 'active', is_bonus: true };
const USERS = [
  { id: 'u1', email: 'adm@casa.com', username: 'adm', role: 'ADMIN', is_active: true, created_at: '2026-09-01T00:00:00Z' },
  { id: 'u2', email: 'op@casa.com', username: 'op', role: 'OPERATOR', is_active: false, created_at: '2026-09-01T00:00:00Z' },
];
const SUB = { plan: 'pro', status: 'active', max_users: 10, max_giras_per_month: 15, current_users: 2, monthly_price: 79, is_trial: true, trial_ends_at: new Date(Date.now() + 5 * 86_400_000).toISOString(), is_bonus: true, billing_category: 'bonificado', mrr: 0, potential_mrr: 0 };

const GIRA = { id: 'g1', nome: 'Gira de Pretos Velhos', data_inicio: '2026-10-10T22:00:00Z', max_tickets: 40, tickets_emitidos: 10, ocupacao_pct: 25, is_active: true, tenant_id: 't1', public_link: 'https://girahub.test/public/gira/g1' };

function install(notFound = false, tenant: Record<string, unknown> = TENANT) {
  mockGet.mockImplementation((url: string) => {
    if (url === '/api/v1/platform/tenants/t1') {
      return notFound ? Promise.reject({ response: { status: 404 } }) : Promise.resolve({ data: tenant });
    }
    if (url === '/api/v1/platform/tenant-observatory/tenants/t1/giras') return Promise.resolve({ data: [GIRA] });
    if (url === '/api/v1/platform/tenants/t1/users') return Promise.resolve({ data: USERS });
    if (url === '/api/v1/platform/subscriptions/t1') return Promise.resolve({ data: SUB });
    if (url.endsWith('/tenant-observatory')) return Promise.resolve({ data: { activation: { tenants: [] }, upcoming_giras: [], retention: [], errors_by_tenant: [] } });
    if (url.endsWith('/support-chat/conversations')) return Promise.resolve({ data: [] });
    if (url.endsWith('/audit-logs/feed')) return Promise.resolve({ data: [] });
    return Promise.resolve({ data: [] });
  });
}

describe('Platform — Tenant 360', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRouter.query = { id: 't1' };
    localStorage.setItem('user', JSON.stringify({ role: 'super_admin' }));
    install();
  });
  afterEach(() => localStorage.clear());

  it('mostra cabeçalho com plano, bônus, trial, MRR, ações e as seis abas', async () => {
    render(<TenantDetailPage />);
    expect(await screen.findByRole('heading', { level: 1, name: 'Casa Alfa' })).toBeInTheDocument();
    expect(screen.getByText('casa-alfa', { selector: 'span' })).toBeInTheDocument();
    expect(await screen.findByText('Trial: 5 dias restantes')).toBeInTheDocument();
    // Bonificado não é receita: MRR zero, mesmo com plano de R$ 79.
    expect(screen.getByText('R$ 0,00', { selector: 'strong' })).toBeInTheDocument();
    expect(screen.getByText('Bonificado')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Acesso bonificado' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Mensagem/ })).toHaveAttribute('href', '/platform/suporte?tenant=t1');
    expect(screen.getByRole('button', { name: /Entrar como admin/ })).toBeInTheDocument();
    for (const tab of ['Visão geral', 'Usuários', 'Giras', 'Suporte', 'Auditoria', 'Assinatura']) {
      expect(screen.getByRole('tab', { name: new RegExp(tab) })).toBeInTheDocument();
    }
    expect(screen.getByText('Terreiro de teste')).toBeInTheDocument();
  });

  it('aba Usuários vem da query e lista redefinir senha / impersonar', async () => {
    mockRouter.query = { id: 't1', tab: 'usuarios' };
    render(<TenantDetailPage />);
    expect(await screen.findByText('adm@casa.com')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Redefinir senha de adm@casa.com' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Impersonar adm@casa.com' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Impersonar op@casa.com' })).toBeDisabled();
    expect(screen.getByText('Operador')).toBeInTheDocument();
  });

  it('trocar de aba atualiza a query (shallow)', async () => {
    render(<TenantDetailPage />);
    await screen.findByRole('heading', { level: 1, name: 'Casa Alfa' });
    const tab = screen.getByRole('tab', { name: /Auditoria/ });
    fireEvent.mouseDown(tab);
    fireEvent.click(tab);
    await waitFor(() =>
      expect(mockRouter.replace).toHaveBeenCalledWith({ pathname: '/platform/tenants/[id]', query: { id: 't1', tab: 'auditoria' } }, undefined, { shallow: true }),
    );
  });

  it('aba Giras busca as giras do próprio terreiro (não o top 50 global)', async () => {
    mockRouter.query = { id: 't1', tab: 'giras' };
    render(<TenantDetailPage />);
    expect(await screen.findByText('Gira de Pretos Velhos')).toBeInTheDocument();
    expect(mockGet).toHaveBeenCalledWith('/api/v1/platform/tenant-observatory/tenants/t1/giras');
  });

  it('terreiro desativado pelo próprio abre com aviso e permite a exclusão definitiva', async () => {
    install(false, { ...TENANT, is_active: false, deleted_at: '2026-10-01T12:00:00Z', self_deactivated_at: '2026-10-01T12:00:00Z' });
    mockDelete.mockResolvedValue({});
    render(<TenantDetailPage />);
    const alert = await screen.findByTestId('tenant-deleted-alert');
    expect(alert).toHaveTextContent('Desativado pelo próprio terreiro em 01/10/2026');
    expect(screen.getByText('Desativado pelo terreiro')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Entrar como admin/ })).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: /Excluir permanentemente/ }));
    const dialog = await screen.findByRole('alertdialog');
    fireEvent.change(within(dialog).getByLabelText(/Digite o slug/), { target: { value: 'casa-alfa' } });
    fireEvent.click(within(dialog).getByRole('checkbox'));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Excluir permanentemente' }));
    await waitFor(() => expect(mockDelete).toHaveBeenCalledWith('/api/v1/platform/tenants/t1', { data: { confirm_slug: 'casa-alfa' } }));
    await waitFor(() => expect(mockRouter.push).toHaveBeenCalledWith('/platform/tenants'));
  });

  it('limpar a descrição envia null (o backend agora aplica)', async () => {
    mockPut.mockResolvedValue({ data: {} });
    render(<TenantDetailPage />);
    await screen.findByText('Terreiro de teste');
    fireEvent.click(screen.getByRole('button', { name: /Editar/ }));
    const desc = await screen.findByLabelText('Descrição');
    fireEvent.change(desc, { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: /Salvar/ }));
    await waitFor(() =>
      expect(mockPut).toHaveBeenCalledWith('/api/v1/platform/tenants/t1', { name: 'Casa Alfa', description: null, is_active: true }),
    );
  });

  it('drawer de assinatura não refaz o fetch quando a página re-renderiza', async () => {
    const { rerender } = render(<TenantDetailPage />);
    await screen.findByRole('heading', { level: 1, name: 'Casa Alfa' });
    const subCalls = () => mockGet.mock.calls.filter(([u]) => u === '/api/v1/platform/subscriptions/t1').length;
    await waitFor(() => expect(subCalls()).toBe(1)); // carga da página
    fireEvent.click(screen.getAllByRole('button', { name: /Assinatura/ })[0]);
    await waitFor(() => expect(subCalls()).toBe(2)); // o drawer abriu e buscou uma vez
    rerender(<TenantDetailPage />);
    rerender(<TenantDetailPage />);
    await new Promise((r) => setTimeout(r, 50));
    expect(subCalls()).toBe(2);
  });

  it('404 mostra "Terreiro não encontrado" com volta para a lista', async () => {
    install(true);
    render(<TenantDetailPage />);
    expect(await screen.findByText('Terreiro não encontrado')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Voltar para Terreiros/ })).toHaveAttribute('href', '/platform/tenants');
  });
});
