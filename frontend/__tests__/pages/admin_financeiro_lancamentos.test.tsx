/**
 * /admin/financeiro/lancamentos — ToggleGroup Entrada/Saída via ?tipo=, "Dar baixa" só com edit,
 * gate de permissão e redirecionamentos de contas-pagar / contas-receber.
 */
import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';

let mockQuery: Record<string, string> = {};
const mockReplace = jest.fn();
jest.mock('next/router', () => ({
  useRouter: () => ({
    push: jest.fn(),
    replace: mockReplace,
    pathname: '/admin/financeiro/lancamentos',
    query: mockQuery,
    isReady: true,
  }),
}));

const mockGet = jest.fn();
jest.mock('@/services/api_client', () => ({
  apiClient: {
    get: (...a: unknown[]) => mockGet(...a),
    post: jest.fn().mockResolvedValue({ data: {} }),
    put: jest.fn().mockResolvedValue({ data: {} }),
    delete: jest.fn().mockResolvedValue({ data: {} }),
  },
  extractApiErrorMessage: (_e: unknown, f: string) => f,
}));

jest.mock('@/pages/admin/admin_layout', () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => <div data-testid="admin-layout">{children}</div>,
}));

jest.mock('@/hooks/useSubscription', () => ({
  useSubscription: () => ({ can: () => true, loading: false }),
}));

let mockPerms: Record<string, boolean> = {};
jest.mock('@/hooks/usePermissions', () => ({
  usePermissions: () => ({ can: (_f: string, action: string) => !!mockPerms[action] }),
}));

const mockShowError = jest.fn();
const mockShowSuccess = jest.fn();
jest.mock('@/contexts/SnackbarContext', () => ({
  useSnackbar: () => ({ showSuccess: mockShowSuccess, showError: mockShowError, showInfo: jest.fn() }),
}));

import LancamentosPage, { parseTipo, rotuloMes } from '@/pages/admin/financeiro/lancamentos';
import { apiClient } from '@/services/api_client';
import ContasPagarRedirectPage from '@/pages/admin/financeiro/contas-pagar';
import ContasReceberRedirectPage from '@/pages/admin/financeiro/contas-receber';

const CONTAS = [
  {
    id: 'c1', tipo: 'receber', descricao: 'Doação mensal', valor: 200, data_vencimento: '2026-10-10',
    data_competencia: null, status: 'pendente', data_pagamento: null, valor_pago: null, categoria_id: null,
    categoria_nome: null, conta_bancaria_id: null, conta_bancaria_nome: null, recorrencia: null,
    observacoes: null, created_at: '2026-10-01T00:00:00Z',
  },
  {
    id: 'c2', tipo: 'receber', descricao: 'Aluguel do espaço', valor: 300, data_vencimento: '2026-10-05',
    data_competencia: null, status: 'pago', data_pagamento: '2026-10-05', valor_pago: 300, categoria_id: null,
    categoria_nome: null, conta_bancaria_id: null, conta_bancaria_nome: null, recorrencia: null,
    observacoes: null, created_at: '2026-10-01T00:00:00Z',
  },
];

function routeGet(url: string) {
  if (url === '/api/v1/admin/financeiro/contas') return Promise.resolve({ data: CONTAS });
  if (url === '/api/v1/admin/financeiro/contas/resumo') {
    return Promise.resolve({
      data: {
        total_pagar_pendente: 0, total_pagar_vencido: 0, total_pagar_pago_mes: 0,
        total_receber_pendente: 200, total_receber_vencido: 0, total_receber_pago_mes: 300,
      },
    });
  }
  return Promise.resolve({ data: [] });
}

describe('Lançamentos', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockQuery = { tipo: 'receber' };
    mockPerms = { view: true, insert: true, edit: true, delete: true };
    mockGet.mockImplementation(routeGet);
  });

  it('parseTipo cai em "pagar" para qualquer valor desconhecido', () => {
    expect(parseTipo('receber')).toBe('receber');
    expect(parseTipo('pagar')).toBe('pagar');
    expect(parseTipo(undefined)).toBe('pagar');
    expect(parseTipo(['receber'])).toBe('pagar');
  });

  it('?tipo=receber seleciona Entradas e busca as contas do tipo', async () => {
    render(<LancamentosPage />);
    expect(await screen.findByText('Doação mensal')).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /Entradas/ })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radio', { name: /Saídas/ })).toHaveAttribute('aria-checked', 'false');
    const call = mockGet.mock.calls.find((c) => c[0] === '/api/v1/admin/financeiro/contas');
    expect(call?.[1]).toMatchObject({ params: { tipo: 'receber' } });
  });

  it('"Dar baixa" aparece só para lançamento pendente e com permissão de edição', async () => {
    render(<LancamentosPage />);
    await screen.findByText('Doação mensal');
    expect(screen.getAllByRole('button', { name: /Dar baixa/ })).toHaveLength(1);
    expect(screen.getByRole('button', { name: /Novo lançamento/ })).toBeInTheDocument();
  });

  it('somente leitura: sem "Dar baixa" e sem "Novo lançamento"', async () => {
    mockPerms = { view: true };
    render(<LancamentosPage />);
    await screen.findByText('Doação mensal');
    expect(screen.queryByRole('button', { name: /Dar baixa/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Novo lançamento/ })).not.toBeInTheDocument();
  });

  it('sem permissão de visualização mostra o estado padrão e não chama a API', async () => {
    mockPerms = {};
    render(<LancamentosPage />);
    expect(await screen.findByText('Sem permissão')).toBeInTheDocument();
    expect(mockGet).not.toHaveBeenCalled();
  });

  it('KPIs rotulados pelo mês filtrado, não "mês corrente"', async () => {
    expect(rotuloMes('3', '2027')).toBe('março de 2027');
    render(<LancamentosPage />);
    await screen.findByText('Doação mensal');
    expect(screen.queryByText('mês corrente')).not.toBeInTheDocument();
    expect(screen.getByText('Recebido no mês')).toBeInTheDocument();
  });

  async function abrirMenu(descricao: string) {
    fireEvent.keyDown(screen.getAllByRole('button', { name: `Mais ações de ${descricao}` })[0], { key: 'Enter' });
    return screen.findByRole('menu');
  }

  it('"Cancelar lançamento" pede confirmação e chama /cancelar', async () => {
    render(<LancamentosPage />);
    await screen.findByText('Doação mensal');
    const menu = await abrirMenu('Doação mensal');
    expect(within(menu).queryByRole('menuitem', { name: /Estornar baixa/ })).not.toBeInTheDocument();
    fireEvent.click(within(menu).getByRole('menuitem', { name: /Cancelar lançamento/ }));
    const dialog = await screen.findByRole('alertdialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancelar lançamento' }));
    await waitFor(() => expect(apiClient.post).toHaveBeenCalledWith('/api/v1/admin/financeiro/contas/c1/cancelar'));
  });

  it('lançamento pago oferece "Estornar baixa" (chama /reabrir), não "Cancelar"', async () => {
    render(<LancamentosPage />);
    await screen.findByText('Aluguel do espaço');
    const menu = await abrirMenu('Aluguel do espaço');
    expect(within(menu).queryByRole('menuitem', { name: /Cancelar lançamento/ })).not.toBeInTheDocument();
    fireEvent.click(within(menu).getByRole('menuitem', { name: /Estornar baixa/ }));
    const dialog = await screen.findByRole('alertdialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Confirmar' }));
    await waitFor(() => expect(apiClient.post).toHaveBeenCalledWith('/api/v1/admin/financeiro/contas/c2/reabrir'));
  });

  it('contas-pagar e contas-receber redirecionam com ?tipo=', async () => {
    render(<ContasPagarRedirectPage />);
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/admin/financeiro/lancamentos?tipo=pagar'));
    render(<ContasReceberRedirectPage />);
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/admin/financeiro/lancamentos?tipo=receber'));
  });

  it('redirecionamento sem permissão não redireciona', () => {
    mockPerms = {};
    render(<ContasPagarRedirectPage />);
    expect(screen.getByText('Sem permissão')).toBeInTheDocument();
    expect(mockReplace).not.toHaveBeenCalled();
  });
});
