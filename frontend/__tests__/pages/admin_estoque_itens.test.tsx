/**
 * /admin/estoque/itens — regra de saldo, filtro "Críticos" (inclusive ?criticos=1 vindo do
 * antigo relatório), guards de ação e redirecionamento de /admin/estoque/relatorio.
 */
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

let mockQuery: Record<string, string> = {};
const mockReplace = jest.fn();
jest.mock('next/router', () => ({
  useRouter: () => ({ push: jest.fn(), replace: mockReplace, pathname: '/admin/estoque/itens', query: mockQuery, isReady: true }),
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
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

jest.mock('@/hooks/useSubscription', () => ({
  useSubscription: () => ({ can: () => true, loading: false }),
}));

let mockPerms: Record<string, boolean> = {};
jest.mock('@/hooks/usePermissions', () => ({
  usePermissions: () => ({ can: (_f: string, action: string) => !!mockPerms[action] }),
}));

jest.mock('@/contexts/SnackbarContext', () => {
  const s = { showSuccess: jest.fn(), showError: jest.fn(), showInfo: jest.fn() };
  return { useSnackbar: () => s };
});

import AdminEstoqueItensPage, { saldoStatus } from '@/pages/admin/estoque/itens';
import EstoqueRelatorioRedirectPage from '@/pages/admin/estoque/relatorio';

const base = { grupo_id: null, grupo_nome: null, descricao: null, unidade_medida: 'UN', custo_unitario: null, observacoes: null, tem_foto: false };
const ITENS = [
  { ...base, id: 'i1', nome: 'Vela branca', estoque_minimo: 10, saldo: 50 },
  { ...base, id: 'i2', nome: 'Pemba', estoque_minimo: 5, saldo: 0 },
  { ...base, id: 'i3', nome: 'Defumador', estoque_minimo: 10, saldo: 4 },
];

describe('Estoque — Itens', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockQuery = {};
    mockPerms = { view: true, insert: true, edit: true, delete: true };
    mockGet.mockImplementation((url: string) =>
      Promise.resolve({ data: url === '/api/v1/admin/estoque/itens' ? ITENS : [] }),
    );
  });

  it('saldoStatus: crítico (negativo ou zerado com mínimo), atenção (abaixo do mínimo), ok', () => {
    expect(saldoStatus(-1, 0)).toBe('critico');
    expect(saldoStatus(0, 5)).toBe('critico');
    expect(saldoStatus(0, 0)).toBe('ok');
    expect(saldoStatus(4, 10)).toBe('atencao');
    expect(saldoStatus(10, 10)).toBe('ok');
  });

  it('filtro "Críticos" esconde os itens em dia', async () => {
    render(<AdminEstoqueItensPage />);
    expect(await screen.findByText('Vela branca')).toBeInTheDocument();
    expect(screen.getByText('Pemba')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Mostrar só itens críticos ou em atenção' }));

    expect(screen.queryByText('Vela branca')).not.toBeInTheDocument();
    expect(screen.getByText('Pemba')).toBeInTheDocument();
    expect(screen.getByText('Defumador')).toBeInTheDocument();
  });

  it('?criticos=1 já abre filtrado', async () => {
    mockQuery = { criticos: '1' };
    render(<AdminEstoqueItensPage />);
    expect(await screen.findByText('Pemba')).toBeInTheDocument();
    expect(screen.queryByText('Vela branca')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Mostrar só itens críticos ou em atenção' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('sem insert/edit: sem "Novo item" e sem "Movimentar"', async () => {
    mockPerms = { view: true };
    render(<AdminEstoqueItensPage />);
    await screen.findByText('Vela branca');
    expect(screen.queryByRole('button', { name: /Novo item/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Movimentar/ })).not.toBeInTheDocument();
  });

  it('sem permissão de visualização: estado padrão', async () => {
    mockPerms = {};
    render(<AdminEstoqueItensPage />);
    expect(await screen.findByText('Sem permissão')).toBeInTheDocument();
  });

  it('/admin/estoque/relatorio redireciona para itens, repassando ?criticos=1', async () => {
    mockQuery = { criticos: '1' };
    render(<EstoqueRelatorioRedirectPage />);
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/admin/estoque/itens?criticos=1'));
  });
});
