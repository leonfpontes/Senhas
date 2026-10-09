/**
 * Relatório da gira: o filtro padrão é "Concluídos". Numa gira em que a casa chama as senhas
 * mas nunca finaliza o atendimento, isso dava tela vazia — agora mostra todas as senhas e avisa.
 */
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';

jest.mock('next/router', () => ({
  useRouter: () => ({ pathname: '/admin/relatorio-gira', asPath: '/admin/relatorio-gira', query: {}, isReady: true, push: jest.fn(), replace: jest.fn() }),
}));
jest.mock('@/pages/admin/admin_layout', () => ({
  __esModule: true,
  default: ({ children }: any) => <div data-testid="admin-layout">{children}</div>,
}));
const mockPerms = { can: () => true, permissions: null, loading: false, refresh: jest.fn() };
const mockSub = { can: () => true, subscription: { plan: 'premium' }, loading: false, refresh: jest.fn() };
const mockTenant = { tenantName: 'Casa Luz', logoUrl: null, config: null };
const mockPdf = { generate: jest.fn(), loading: false };
jest.mock('../../src/hooks/usePermissions', () => ({ usePermissions: () => mockPerms }));
jest.mock('../../src/hooks/useSubscription', () => ({ useSubscription: () => mockSub }));
jest.mock('../../src/providers/ThemeProvider', () => ({ useTenant: () => mockTenant }));
jest.mock('../../src/hooks/useRelatorioPDF', () => ({ useRelatorioPDF: () => mockPdf }));
const mockSnack = { showError: jest.fn(), showSuccess: jest.fn(), showInfo: jest.fn() };
jest.mock('@/contexts/SnackbarContext', () => ({ useSnackbar: () => mockSnack }));
jest.mock('../../src/contexts/SnackbarContext', () => ({ useSnackbar: () => mockSnack }));

const ontem = new Date(Date.now() - 86400000).toISOString();
const GIRAS = [{ id: 'g1', nome: 'Gira de Pretos Velhos', data_inicio: ontem, is_active: true }];
const senha = (id: string, numero: number, status: string, nome: string) => ({
  id, numero, status, consulente_nome: nome, created_at: ontem,
});
let concluidas: any[] = [];
const TODAS = [senha('t1', 1, 'emitted', 'Maria Aparecida'), senha('t2', 2, 'no_show', 'José Carlos')];

const mockGet = jest.fn((url: string) => {
  if (url.startsWith('/api/v1/admin/giras?')) return Promise.resolve({ data: GIRAS });
  if (url.includes('/door/stats')) return Promise.resolve({ data: { total: 2, checked_in: 0, awaiting: 1, in_progress: 0, completed: 0, no_show: 1, walk_in: 0, preferenciais: 0 } });
  if (url.includes('/tickets')) {
    return Promise.resolve({ data: { items: url.includes('status_filter=completed') ? concluidas : TODAS } });
  }
  return Promise.resolve({ data: [] });
});
jest.mock('../../src/services/api_client', () => ({
  apiClient: { get: (url: string) => mockGet(url), post: jest.fn(), put: jest.fn(), delete: jest.fn() },
}));

function renderPage() {
  const Page = require('@/pages/admin/relatorio-gira').default;
  return render(<Page />);
}

beforeEach(() => {
  mockGet.mockClear();
  document.cookie = 'auth_state=1';
});

it('gira sem nenhum atendimento concluído mostra todas as senhas com o aviso', async () => {
  concluidas = [];
  renderPage();
  expect(await screen.findByTestId('relatorio-sem-concluidos')).toHaveTextContent(
    'Nenhum atendimento foi marcado como concluído nesta gira. Mostrando todas as senhas.',
  );
  expect((await screen.findAllByText('Maria Aparecida')).length).toBeGreaterThan(0);
});

it('gira com atendimentos concluídos continua mostrando só os concluídos, sem aviso', async () => {
  concluidas = [senha('t9', 9, 'completed', 'Ana Paula')];
  renderPage();
  expect((await screen.findAllByText('Ana Paula')).length).toBeGreaterThan(0);
  await waitFor(() => expect(screen.queryByTestId('relatorio-sem-concluidos')).not.toBeInTheDocument());
  expect(screen.queryByText('Maria Aparecida')).not.toBeInTheDocument();
});

