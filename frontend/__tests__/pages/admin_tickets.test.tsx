/**
 * Senhas: gira de hoje pré-selecionada, número sem cerquilha, detalhe em Sheet e guards de grupo.
 */
import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';

const mockRouter: any = {
  push: jest.fn(),
  replace: jest.fn(),
  pathname: '/admin/tickets',
  query: {},
  asPath: '/admin/tickets',
  isReady: true,
  events: { on: jest.fn(), off: jest.fn() },
};
jest.mock('next/router', () => ({ useRouter: () => mockRouter }));

jest.mock('@/services/api_client', () => ({
  apiClient: { get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn(), patch: jest.fn() },
  extractApiErrorMessage: (_e: unknown, fallback: string) => fallback,
}));

jest.mock('@/pages/admin/admin_layout', () => ({
  __esModule: true,
  default: ({ children }: any) => <div data-testid="admin-layout">{children}</div>,
}));

const mockCan = jest.fn((_f: string, _a: string) => true);
jest.mock('@/hooks/usePermissions', () => ({
  usePermissions: () => ({ can: mockCan, permissions: null, loading: false, refresh: jest.fn() }),
}));

const mockPlanCan = jest.fn((_f: string) => true);
jest.mock('@/hooks/useSubscription', () => ({
  useSubscription: () => ({ can: mockPlanCan, subscription: null, loading: false, canCreateGira: () => true, refresh: jest.fn() }),
}));

jest.mock('@/components/admin/TicketEmailPanel', () => ({
  TicketEmailPanel: ({ ticketId }: { ticketId: string }) => <div data-testid="email-panel">{ticketId}</div>,
}));

jest.mock('sonner', () => ({ toast: Object.assign(jest.fn(), { success: jest.fn(), error: jest.fn(), info: jest.fn() }) }));

const today = new Date();
today.setHours(20, 0, 0, 0);
const GIRA_HOJE = { id: 'hoje', nome: 'Gira de Pretos Velhos', data_inicio: today.toISOString(), is_active: true };
const GIRA_ANTIGA = { id: 'antiga', nome: 'Gira antiga', data_inicio: '2025-01-01T20:00:00Z', is_active: true };

const TICKET = {
  id: 't1',
  numero: 42,
  status: 'emitted',
  consulente_nome: 'Maria Souza',
  consulente_email: 'maria@ex.com',
  consulente_telefone: '(11) 98888-7777',
  created_at: '2026-10-06T10:00:00Z',
};

function mockApi() {
  const { apiClient } = require('@/services/api_client');
  apiClient.get.mockImplementation((url: string) => {
    if (url.startsWith('/api/v1/admin/giras?')) return Promise.resolve({ data: [GIRA_ANTIGA, GIRA_HOJE] });
    if (url.includes('/tickets?')) return Promise.resolve({ data: { items: [TICKET], total: 1 } });
    if (url.endsWith('/waitlist')) return Promise.resolve({ data: [] });
    return Promise.resolve({ data: {} });
  });
  return apiClient;
}

async function renderPage() {
  const Page = require('@/pages/admin/tickets').default;
  render(<Page />);
  await waitFor(() => expect(screen.getAllByText('0042').length).toBeGreaterThan(0));
}

describe('Senhas', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCan.mockImplementation(() => true);
    mockPlanCan.mockImplementation(() => true);
    mockRouter.query = {};
    window.sessionStorage.clear();
    document.cookie = 'auth_state=1';
  });

  it('pré-seleciona a gira de hoje e mostra a senha sem cerquilha, com o status em palavras', async () => {
    const api = mockApi();
    await renderPage();
    expect(api.get).toHaveBeenCalledWith(expect.stringMatching(/^\/api\/v1\/admin\/giras\/hoje\/tickets\?skip=0&limit=50/));
    expect(screen.queryByText('#0042')).not.toBeInTheDocument();
    expect(screen.getAllByText('Aguardando').length).toBeGreaterThan(0);
    expect(screen.getByRole('link', { name: /WhatsApp de Maria Souza/ })).toHaveAttribute('href', 'https://wa.me/5511988887777');
  });

  it('?gira= vence a gira de hoje', async () => {
    mockRouter.query = { gira: 'antiga' };
    const api = mockApi();
    await renderPage();
    expect(api.get).toHaveBeenCalledWith(expect.stringMatching(/^\/api\/v1\/admin\/giras\/antiga\/tickets\?/));
  });

  it('clicar na senha abre o detalhe com ações e o rastreio do e-mail', async () => {
    mockApi();
    await renderPage();
    fireEvent.click(screen.getByText('Maria Souza'));
    const sheet = await screen.findByTestId('ticket-detail-sheet');
    expect(within(sheet).getByRole('button', { name: /Editar atendimento/ })).toBeInTheDocument();
    expect(within(sheet).getByRole('button', { name: /Excluir senha/ })).toBeInTheDocument();
    expect(within(sheet).getByTestId('email-panel')).toHaveTextContent('t1');
  });

  it('sem editar/excluir: sem seleção em lote e sem ações no detalhe', async () => {
    mockCan.mockImplementation((_f: string, action: string) => action === 'view');
    mockPlanCan.mockImplementation(() => false);
    mockApi();
    await renderPage();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('Maria Souza'));
    const sheet = await screen.findByTestId('ticket-detail-sheet');
    expect(within(sheet).queryByRole('button', { name: /Editar atendimento/ })).not.toBeInTheDocument();
    expect(within(sheet).queryByRole('button', { name: /Excluir senha/ })).not.toBeInTheDocument();
    expect(within(sheet).queryByTestId('email-panel')).not.toBeInTheDocument();
  });

  it('sem permissão de ver senhas mostra o aviso padrão e não chama a API', () => {
    mockCan.mockImplementation(() => false);
    const api = mockApi();
    const Page = require('@/pages/admin/tickets').default;
    render(<Page />);
    expect(screen.getByText('Você não tem permissão para visualizar este módulo.')).toBeInTheDocument();
    expect(api.get).not.toHaveBeenCalled();
  });
});
