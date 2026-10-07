/**
 * /admin/financeiro/config — ativar/desativar categoria e conta bancária, texto correto da
 * exclusão (soft delete), Mensalidade bloqueada quando o GET da config falha e a chave PIX
 * (AM-10) dentro da aba Mensalidade.
 */
import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';

jest.mock('next/router', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), pathname: '/admin/financeiro/config', query: {}, isReady: true }),
}));

const mockGet = jest.fn();
const mockPut = jest.fn().mockResolvedValue({ data: {} });
jest.mock('@/services/api_client', () => ({
  apiClient: {
    get: (...a: unknown[]) => mockGet(...a),
    put: (...a: unknown[]) => mockPut(...a),
    post: jest.fn().mockResolvedValue({ data: {} }),
    delete: jest.fn().mockResolvedValue({ data: {} }),
  },
  extractApiErrorMessage: (_e: unknown, f: string) => f,
}));
jest.mock('@/pages/admin/admin_layout', () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
jest.mock('@/hooks/useSubscription', () => ({ useSubscription: () => ({ can: () => true, loading: false }) }));
jest.mock('@/hooks/usePermissions', () => ({ usePermissions: () => ({ can: () => true }) }));
jest.mock('@/contexts/SnackbarContext', () => ({
  useSnackbar: () => ({ showSuccess: jest.fn(), showError: jest.fn(), showInfo: jest.fn() }),
}));

import FinanceiroConfigPage from '@/pages/admin/financeiro/config';

const CATEGORIAS = [
  { id: 'cat1', nome: 'Velas', tipo: 'pagar', cor: '#1D9E75', ativo: true },
  { id: 'cat2', nome: 'Antiga', tipo: 'pagar', cor: null, ativo: false },
];

describe('Configuração financeira', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGet.mockImplementation((url: string) => {
      if (url === '/api/v1/admin/financeiro/categorias') return Promise.resolve({ data: CATEGORIAS });
      return Promise.resolve({ data: [] });
    });
  });

  it('lista categorias inativas (incluir_inativos) e permite reativar', async () => {
    render(<FinanceiroConfigPage />);
    expect(await screen.findByText('Antiga')).toBeInTheDocument();
    expect(mockGet).toHaveBeenCalledWith('/api/v1/admin/financeiro/categorias', { params: { incluir_inativos: true } });
    expect(screen.getByText('Inativa')).toBeInTheDocument();

    fireEvent.keyDown(screen.getByRole('button', { name: 'Ações de Antiga' }), { key: 'Enter' });
    const menu = await screen.findByRole('menu');
    fireEvent.click(within(menu).getByRole('menuitem', { name: /Reativar/ }));
    await waitFor(() => expect(mockPut).toHaveBeenCalledWith('/api/v1/admin/financeiro/categorias/cat2', { ativo: true }));
  });

  it('excluir categoria não promete exclusão permanente (é soft delete)', async () => {
    render(<FinanceiroConfigPage />);
    await screen.findByText('Velas');
    fireEvent.keyDown(screen.getByRole('button', { name: 'Ações de Velas' }), { key: 'Enter' });
    const menu = await screen.findByRole('menu');
    fireEvent.click(within(menu).getByRole('menuitem', { name: /Excluir/ }));
    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).not.toHaveTextContent(/permanentemente/);
    expect(dialog).toHaveTextContent(/continuam com ela/);
  });

  it('Mensalidade: erro ao carregar a config bloqueia o salvar', async () => {
    mockGet.mockImplementation((url: string) => {
      if (url === '/api/v1/admin/financeiro/config') return Promise.reject(new Error('500'));
      return Promise.resolve({ data: [] });
    });
    render(<FinanceiroConfigPage />);
    const tab = screen.getByRole('tab', { name: 'Mensalidade' });
    fireEvent.mouseDown(tab);
    fireEvent.click(tab);
    expect(await screen.findByText(/Não foi possível carregar a configuração de mensalidade/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Salvar configuração/ })).not.toBeInTheDocument();
    expect(mockPut).not.toHaveBeenCalled();
  });

  it('Mensalidade mostra a chave PIX (AM-10)', async () => {
    mockGet.mockImplementation((url: string) => {
      if (url === '/api/v1/admin/financeiro/config') return Promise.resolve({ data: { valor_mensal: 50, dia_vencimento: 10 } });
      if (url === '/api/v1/admin/financeiro/config/pix') {
        return Promise.resolve({
          data: {
            configurada: true,
            tipo: 'email',
            chave_mascarada: 't***@example.com',
            chave: 'tesouraria@example.com',
            nome_recebedor: 'Casa',
            cidade: 'Rio',
            instrucoes: null,
            alterado_em: null,
            brcode_previa: null,
            valor_previa: null,
          },
        });
      }
      return Promise.resolve({ data: [] });
    });
    render(<FinanceiroConfigPage />);
    const tab = screen.getByRole('tab', { name: 'Mensalidade' });
    fireEvent.mouseDown(tab);
    fireEvent.click(tab);
    expect(await screen.findByText('Chave PIX da mensalidade')).toBeInTheDocument();
    expect(await screen.findByTestId('pix-chave-atual')).toHaveTextContent('tesouraria@example.com');
    expect(mockGet).toHaveBeenCalledWith('/api/v1/admin/financeiro/config/pix');
  });
});
