/**
 * /admin/financeiro/por-categoria — busca pelo período (padrão e `?inicio=&fim=`), Entradas/Saídas
 * via `?lado=`, colunas por mês, CSV, PDF e gate de permissão.
 */
import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';

let mockQuery: Record<string, string> = {};
const mockReplace = jest.fn();
jest.mock('next/router', () => ({
  useRouter: () => ({
    push: jest.fn(),
    replace: mockReplace,
    pathname: '/admin/financeiro/por-categoria',
    query: mockQuery,
    isReady: true,
  }),
}));

const mockGet = jest.fn();
jest.mock('@/services/api_client', () => ({
  apiClient: { get: (...a: unknown[]) => mockGet(...a) },
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

jest.mock('@/providers/ThemeProvider', () => ({
  useTenant: () => ({ tenantName: 'Tenda Luz da Mata', logoUrl: null, config: { colors: { primary: '#123456' } } }),
}));

const mockShowError = jest.fn();
jest.mock('@/contexts/SnackbarContext', () => ({
  useSnackbar: () => ({ showSuccess: jest.fn(), showError: mockShowError, showInfo: jest.fn() }),
}));

const mockGerarPdf = jest.fn().mockResolvedValue(undefined);
jest.mock('@/lib/pdf/porCategoriaPdf', () => ({ gerarPorCategoriaPdf: (...a: unknown[]) => mockGerarPdf(...a) }));

import PorCategoriaPage from '@/pages/admin/financeiro/por-categoria';
import { porCategoriaCsv, type PorCategoriaResponse } from '@/lib/financeiroPorCategoria';

const DADOS: PorCategoriaResponse = {
  data_inicio: '2026-09-01',
  data_fim: '2026-10-31',
  meses: [
    { ano: 2026, mes: 9, mes_label: 'Set/26' },
    { ano: 2026, mes: 10, mes_label: 'Out/26' },
  ],
  receitas: [
    { categoria_id: 'cat-m', nome: 'Mensalidades', cor: '#1D9E75', realizado: 190, qtd_realizado: 2, em_aberto: 100, qtd_em_aberto: 1, percentual: 86.4, por_mes: [100, 90] },
    { categoria_id: null, nome: 'Sem categoria', cor: null, realizado: 30, qtd_realizado: 1, em_aberto: 0, qtd_em_aberto: 0, percentual: 13.6, por_mes: [0, 30] },
  ],
  despesas: [
    { categoria_id: 'cat-v', nome: 'Velas; e "ervas"', cor: null, realizado: 40, qtd_realizado: 1, em_aberto: 70, qtd_em_aberto: 1, percentual: 100, por_mes: [40, 0] },
  ],
  total_receitas: 220,
  total_despesas: 40,
  total_a_receber: 100,
  total_a_pagar: 70,
};

describe('Financeiro por categoria', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockQuery = {};
    mockPerms = { view: true };
    mockGet.mockResolvedValue({ data: DADOS });
  });

  it('busca o mês atual por padrão e mostra as entradas por categoria', async () => {
    render(<PorCategoriaPage />);
    const tabela = await screen.findByTestId('tabela-por-categoria');
    expect(await within(tabela).findAllByText('Mensalidades')).not.toHaveLength(0);
    expect(within(tabela).getAllByText('Sem categoria')).not.toHaveLength(0);
    expect(within(tabela).queryByText(/Velas/)).not.toBeInTheDocument();
    const [url, opts] = mockGet.mock.calls[0];
    expect(url).toBe('/api/v1/admin/financeiro/por-categoria');
    expect(opts.params.data_inicio).toMatch(/^\d{4}-\d{2}-01$/);
    expect(screen.getByTestId('total-lado')).toHaveTextContent(/Total:\s*R\$\s*220,00 em 3 lançamentos/);
    // período com 2 meses: uma coluna por mês
    expect(within(tabela).getAllByText('Set/26').length).toBeGreaterThan(0);
  });

  it('?inicio=&fim= abre no período do link e ?lado=despesas mostra as saídas', async () => {
    mockQuery = { inicio: '2026-09-01', fim: '2026-10-31', lado: 'despesas' };
    render(<PorCategoriaPage />);
    const tabela = await screen.findByTestId('tabela-por-categoria');
    expect(await within(tabela).findAllByText('Velas; e "ervas"')).not.toHaveLength(0);
    await waitFor(() =>
      expect(mockGet).toHaveBeenCalledWith('/api/v1/admin/financeiro/por-categoria', {
        params: { data_inicio: '2026-09-01', data_fim: '2026-10-31' },
      }),
    );
    expect(screen.getByRole('radio', { name: /Saídas/ })).toHaveAttribute('aria-checked', 'true');
    fireEvent.click(screen.getByRole('radio', { name: /Entradas/ }));
    expect(mockReplace).toHaveBeenCalledWith(
      expect.objectContaining({ query: expect.objectContaining({ lado: 'receitas' }) }),
      undefined,
      { shallow: true },
    );
  });

  it('"Baixar PDF" gera o relatório com a marca do terreiro', async () => {
    render(<PorCategoriaPage />);
    await screen.findByTestId('total-lado');
    fireEvent.click(screen.getByRole('button', { name: /Baixar PDF/ }));
    await waitFor(() =>
      expect(mockGerarPdf).toHaveBeenCalledWith(DADOS, { nome: 'Tenda Luz da Mata', logoUrl: undefined, primaryColor: '#123456' }),
    );
  });

  it('sem permissão de visualização mostra o estado padrão e não chama a API', async () => {
    mockPerms = {};
    render(<PorCategoriaPage />);
    expect(await screen.findByText('Sem permissão')).toBeInTheDocument();
    expect(mockGet).not.toHaveBeenCalled();
  });

  it('CSV separado por ";", com total por lado e coluna por mês', () => {
    const linhas = porCategoriaCsv(DADOS).split('\r\n');
    expect(linhas[0]).toBe('Tipo;Categoria;Lançamentos pagos;Realizado (R$);% do total;Em aberto (R$);Set/26;Out/26');
    expect(linhas[1]).toBe('Entradas;Mensalidades;2;190,00;86,4;100,00;100,00;90,00');
    expect(linhas[3]).toBe('Entradas;Total;3;220,00;100,0;100,00;100,00;120,00');
    expect(linhas[4]).toBe('Saídas;"Velas; e ""ervas""";1;40,00;100,0;70,00;40,00;0,00');
    expect(linhas[5]).toBe('Saídas;Total;1;40,00;100,0;70,00;40,00;0,00');
  });
});
