/** C-06 — /platform/parceiros: lista por status com contagem, drawer para status, cupom e observações. */
import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';

const mockRouter = {
  push: jest.fn(),
  replace: jest.fn(),
  pathname: '/platform/parceiros',
  query: {} as Record<string, string>,
  asPath: '/platform/parceiros',
  isReady: true,
  events: { on: jest.fn(), off: jest.fn() },
};
jest.mock('next/router', () => ({ useRouter: () => mockRouter }));

const mockGet = jest.fn();
const mockPatch = jest.fn();
jest.mock('@/services/api_client', () => ({
  apiClient: {
    get: (...a: unknown[]) => mockGet(...a),
    post: jest.fn(),
    patch: (...a: unknown[]) => mockPatch(...a),
  },
  extractApiErrorMessage: (_e: unknown, fb: string) => fb,
}));
jest.mock('@/hooks/useProfile', () => ({ useProfile: () => ({ profile: null, loading: false, refresh: jest.fn() }) }));
jest.mock('@/components/support/usePlatformSupportUnread', () => ({ usePlatformSupportUnread: () => 0 }));
jest.mock('sonner', () => ({ toast: { success: jest.fn(), error: jest.fn(), info: jest.fn() } }));

import PlatformParceirosPage from '@/pages/platform/parceiros';

const PEDIDO = {
  id: 'p1',
  nome: 'Maria das Ervas',
  tipo: 'loja',
  nome_negocio: 'Casa Pai Joaquim',
  cidade: 'Niterói',
  uf: 'RJ',
  whatsapp: '21998765432',
  email: 'maria@exemplo.com',
  como_divulgar: 'Display no balcão',
  aceite_regulamento_em: '2026-10-08T12:00:00Z',
  status: 'novo',
  cupom: null,
  observacoes: null,
  created_at: '2026-10-08T12:00:00Z',
  updated_at: '2026-10-08T12:00:00Z',
};

beforeEach(() => {
  jest.clearAllMocks();
  mockRouter.query = {};
  localStorage.setItem('user', JSON.stringify({ role: 'super_admin' }));
  mockGet.mockImplementation((url: string) => {
    if (url === '/api/v1/platform/parceiros')
      return Promise.resolve({
        data: { items: [PEDIDO], total: 1, counts: { novo: 1, em_contato: 0, aprovado: 2, recusado: 0 } },
      });
    if (url === '/api/v1/platform/parceiros/p1') return Promise.resolve({ data: PEDIDO });
    return Promise.resolve({ data: [] });
  });
  mockPatch.mockResolvedValue({ data: { ...PEDIDO, status: 'aprovado', cupom: 'MARIA20' } });
});
afterEach(() => localStorage.clear());

describe('Platform — Parceiros', () => {
  it('lista os novos por padrão, com a contagem por status', async () => {
    render(<PlatformParceirosPage />);
    expect((await screen.findAllByText('Maria das Ervas')).length).toBeGreaterThan(0);
    expect(mockGet).toHaveBeenCalledWith('/api/v1/platform/parceiros', { params: { limit: 200, status: 'novo' } });
    expect(screen.getByRole('tab', { name: 'Novo (1)' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Aprovado (2)' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Todos (3)' })).toBeInTheDocument();
  });

  it('abre o pedido no drawer e salva status, cupom e observações', async () => {
    render(<PlatformParceirosPage />);
    fireEvent.click((await screen.findAllByText('Maria das Ervas'))[0]);
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByRole('link', { name: /21998765432/ })).toHaveAttribute('href', 'https://wa.me/5521998765432');

    fireEvent.click(within(dialog).getByRole('combobox', { name: 'Status' }));
    fireEvent.click(await screen.findByRole('option', { name: 'Aprovado' }));
    fireEvent.change(within(dialog).getByLabelText('Cupom'), { target: { value: 'maria20' } });
    fireEvent.change(within(dialog).getByLabelText('Observações da equipe'), { target: { value: 'Display enviado' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Salvar' }));

    await waitFor(() =>
      expect(mockPatch).toHaveBeenCalledWith('/api/v1/platform/parceiros/p1', {
        status: 'aprovado',
        cupom: 'MARIA20',
        observacoes: 'Display enviado',
      }),
    );
  });

  it('?pedido= abre o pedido direto (link do e-mail de aviso)', async () => {
    mockRouter.query = { pedido: 'p1' };
    render(<PlatformParceirosPage />);
    await waitFor(() => expect(mockGet).toHaveBeenCalledWith('/api/v1/platform/parceiros/p1'));
    expect(await screen.findByRole('dialog')).toHaveTextContent('Display no balcão');
  });
});
