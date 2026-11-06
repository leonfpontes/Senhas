/**
 * Senhas no celular (J12 v2 · 04-06): filtros numa gaveta de baixo com o total do servidor e o
 * "…" do cartão abrindo o menu da senha, com o excluir que devolve a vaga.
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
jest.mock('@/hooks/use-mobile', () => ({ useIsMobile: () => true }));
jest.mock('@/hooks/useMediaQuery', () => ({ useMediaQuery: () => true }));

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

let mockProfile: { role: string } = { role: 'admin' };
jest.mock('@/hooks/useProfile', () => ({
  useProfile: () => ({ profile: mockProfile, loading: false, refresh: jest.fn() }),
}));

jest.mock('@/components/admin/TicketEmailPanel', () => ({
  TicketEmailPanel: ({ ticketId }: { ticketId: string }) => <div data-testid="email-panel">{ticketId}</div>,
}));

const mockGerarPdf = jest.fn((..._args: unknown[]) => Promise.resolve());
jest.mock('@/lib/pdf/listagemSenhasPdf', () => ({
  gerarListagemSenhasPdf: (...args: unknown[]) => mockGerarPdf(...args),
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

describe('Senhas no celular', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCan.mockImplementation(() => true);
    mockPlanCan.mockImplementation(() => true);
    mockProfile = { role: 'admin' };
    mockRouter.query = {};
    window.sessionStorage.clear();
    document.cookie = 'auth_state=1';
  });

  it('Filtros abre a gaveta com as situações e "Ver 1 senha" (total do servidor)', async () => {
    mockApi();
    await renderPage();
    fireEvent.click(screen.getByRole('button', { name: /^Filtros/ }));
    const gaveta = await screen.findByRole('dialog');
    expect(within(gaveta).getByText('Senhas da gira')).toBeInTheDocument();
    expect(within(gaveta).getByRole('radio', { name: 'Todos' })).toBeInTheDocument();
    expect(within(gaveta).getByRole('button', { name: 'Ver 1 senha' })).toBeInTheDocument();
  });

  it('o "…" abre o menu da senha com Médium e cambone e o excluir que devolve a vaga', async () => {
    mockApi();
    await renderPage();
    fireEvent.click(screen.getAllByRole('button', { name: 'Ações da senha 0042' })[0]);
    const menu = await screen.findByRole('dialog');
    expect(within(menu).getByText(/Senha 0042 · Maria Souza/)).toBeInTheDocument();
    expect(within(menu).getByRole('button', { name: /Médium e cambone/ })).toBeInTheDocument();
    expect(within(menu).getByRole('button', { name: /Excluir a senha/ })).toBeInTheDocument();
    expect(within(menu).getByText('Excluir devolve a vaga para a gira e pede confirmação.')).toBeInTheDocument();
  });

  it('sem permissão de excluir, o menu não oferece Excluir', async () => {
    mockCan.mockImplementation((_f: string, a: string) => a !== 'delete');
    mockApi();
    await renderPage();
    fireEvent.click(screen.getAllByRole('button', { name: 'Ações da senha 0042' })[0]);
    const menu = await screen.findByRole('dialog');
    expect(within(menu).queryByRole('button', { name: /Excluir a senha/ })).not.toBeInTheDocument();
  });
});
