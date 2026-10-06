/**
 * Jornadas "Casa e pessoas": médiuns, associados, mensalidades e o espelho nos lançamentos.
 */
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const mockGet = jest.fn();
const mockPost = jest.fn();
const mockPut = jest.fn();
const mockPatch = jest.fn();
const mockRefresh = jest.fn();
let mockFeatures: Record<string, boolean> = {};
let mockPerm: (feature: string, action: string) => boolean = () => true;

jest.mock('../../pages/admin/admin_layout', () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
jest.mock('../../services/api_client', () => ({
  apiClient: {
    get: (...a: unknown[]) => mockGet(...a),
    post: (...a: unknown[]) => mockPost(...a),
    put: (...a: unknown[]) => mockPut(...a),
    patch: (...a: unknown[]) => mockPatch(...a),
    delete: jest.fn(),
  },
  extractApiErrorMessage: (_e: unknown, fallback: string) => fallback,
}));
jest.mock('../../hooks/useSubscription', () => ({
  useSubscription: () => ({
    can: (f: string) => !!mockFeatures[f],
    loading: false,
    subscription: { plan: 'premium', max_mediuns: 9999999, current_mediuns: 0 },
    canCreateMedium: () => true,
    refresh: mockRefresh,
  }),
}));
jest.mock('../../hooks/usePermissions', () => ({
  usePermissions: () => ({ can: (f: string, a: string) => mockPerm(f, a) }),
}));
jest.mock('@/providers/AdminThemeProvider', () => ({ useAdminTheme: () => ({ isDark: false }) }));
jest.mock('next/router', () => ({
  useRouter: () => ({ query: { tipo: 'receber' }, pathname: '/admin/financeiro/lancamentos', isReady: true, replace: jest.fn(), push: jest.fn() }),
}));

import {
  cobrancaSelecionavelNoLote,
  computeCobrancaKpis,
  type CobrancaItem,
} from '@/components/financeiro/CobrancaMensal';
import { montarFormPagamento } from '@/components/financeiro/comprovante';
import AdminAssociadosPage, { ASSOCIADOS_PAGE_SIZE, fetchTodosAssociados } from '../../pages/admin/associados';
import AdminMediunsPage from '../../pages/admin/mediuns';
import MensalidadesPage from '../../pages/admin/financeiro/mensalidades';
import FinanceiroConfigPage from '../../pages/admin/financeiro/config';
import LancamentosPage from '../../pages/admin/financeiro/lancamentos';

const item = (over: Partial<CobrancaItem> = {}): CobrancaItem => ({
  id: 'i1',
  nome: 'Pessoa',
  status: null,
  data_pagamento: null,
  valor_vigente: null,
  valor_pago: null,
  comprovante_filename: null,
  observacao: null,
  ...over,
});

beforeEach(() => {
  mockGet.mockReset();
  mockPost.mockReset();
  mockPut.mockReset();
  mockPatch.mockReset();
  mockRefresh.mockReset();
  mockFeatures = {};
  mockPerm = () => true;
});

// ── Regras puras ──────────────────────────────────────────────────────────────

describe('CobrancaMensal — regras', () => {
  it('KPIs usam o dia de vencimento de cada grupo (associados ≠ médiuns)', () => {
    // Hoje 12/03: médiuns vencem dia 10 (já inadimplentes), associados dia 15 (ainda pendentes).
    const kpis = computeCobrancaKpis(
      [
        { items: [item()], valor: 100, diaVencimento: 10 },
        { items: [item({ id: 'a1' })], valor: 50, diaVencimento: 15 },
      ],
      '2026-03',
      undefined,
      '2026-03-12',
    );
    expect(kpis.esperado).toBe(150);
    expect(kpis.inadimplentes).toBe(1); // só o médium; o associado ainda não venceu
    expect(kpis.emAberto).toBe(150);
  });

  it('lote só seleciona pendente/inadimplente', () => {
    expect(cobrancaSelecionavelNoLote(item(), '2026-03', 10, '2026-03-12')).toBe(true);
    expect(cobrancaSelecionavelNoLote(item({ status: 'PAGO' }), '2026-03', 10, '2026-03-12')).toBe(false);
    expect(cobrancaSelecionavelNoLote(item({ status: 'ISENTO' }), '2026-03', 10, '2026-03-12')).toBe(false);
    expect(cobrancaSelecionavelNoLote(item({ isentoPermanente: true }), '2026-03', 10, '2026-03-12')).toBe(false);
  });

  it('formulário: observação ausente não vai; null vai vazio (limpa)', () => {
    const lote = montarFormPagamento({ status: 'PAGO', valor_pago: 50 });
    expect(lote.has('observacao')).toBe(false);
    const limpa = montarFormPagamento({ status: 'PAGO', observacao: null });
    expect(limpa.get('observacao')).toBe('');
    const texto = montarFormPagamento({ status: 'PAGO', observacao: 'ok' });
    expect(texto.get('observacao')).toBe('ok');
  });
});

// ── Associados ────────────────────────────────────────────────────────────────

const assoc = (i: number) => ({
  id: `a${i}`,
  nome: `Associado ${String(i).padStart(3, '0')}`,
  email: `a${i}@example.com`,
  telefone: null,
  mensalidade_isento: false,
  created_at: '2026-01-01T00:00:00Z',
});

describe('Associados', () => {
  it('busca todas as páginas da API', async () => {
    const pagina1 = Array.from({ length: ASSOCIADOS_PAGE_SIZE }, (_, i) => assoc(i));
    const pagina2 = [assoc(900), assoc(901)];
    mockGet.mockImplementation((_url: string, cfg: { params: { skip: number } }) =>
      Promise.resolve({ data: cfg.params.skip === 0 ? pagina1 : pagina2 }),
    );
    const todos = await fetchTodosAssociados();
    expect(todos).toHaveLength(ASSOCIADOS_PAGE_SIZE + 2);
    expect(mockGet).toHaveBeenCalledTimes(2);
  });

  it('a busca local encontra associado da segunda página e a edição limpa o telefone', async () => {
    mockFeatures = { associados: true };
    const pagina1 = Array.from({ length: ASSOCIADOS_PAGE_SIZE }, (_, i) => assoc(i));
    const ultimo = { ...assoc(999), nome: 'Zélia da Segunda Página', telefone: '11988887777' };
    mockGet.mockImplementation((_url: string, cfg: { params: { skip: number } }) =>
      Promise.resolve({ data: cfg.params.skip === 0 ? pagina1 : [ultimo] }),
    );
    mockPut.mockResolvedValue({ data: {} });

    render(<AdminAssociadosPage />);
    const busca = await screen.findByLabelText('Buscar associado');
    await waitFor(() => expect(mockGet).toHaveBeenCalledTimes(2));
    fireEvent.change(busca, { target: { value: 'Zélia' } });
    expect((await screen.findAllByText('Zélia da Segunda Página')).length).toBeGreaterThan(0);

    await userEvent.click(screen.getAllByRole('button', { name: /Ações de Zélia/ })[0]);
    await userEvent.click(await screen.findByRole('menuitem', { name: /Editar/ }));
    const tel = await screen.findByLabelText('Telefone');
    fireEvent.change(tel, { target: { value: '' } });
    expect(screen.getByLabelText('Isento de mensalidade')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    await waitFor(() => expect(mockPut).toHaveBeenCalled());
    expect(mockPut.mock.calls[0][1]).toMatchObject({ telefone: null, mensalidade_isento: false });
  });
});

// ── Médiuns ───────────────────────────────────────────────────────────────────

describe('Médiuns', () => {
  it('criar envia o isento e atualiza a cota do plano', async () => {
    mockFeatures = { mediuns: true };
    mockGet.mockResolvedValue({ data: [] });
    mockPost.mockResolvedValue({ data: {} });

    render(<AdminMediunsPage />);
    fireEvent.click(await screen.findByRole('button', { name: /Novo/ }));
    fireEvent.change(await screen.findByLabelText(/Nome/), { target: { value: 'Pai Joaquim' } });
    fireEvent.click(screen.getByLabelText('Isento de mensalidade'));
    fireEvent.click(screen.getByRole('button', { name: 'Criar' }));

    await waitFor(() => expect(mockPost).toHaveBeenCalled());
    expect(mockPost.mock.calls[0][1]).toMatchObject({ nome: 'Pai Joaquim', mensalidade_isento: true });
    await waitFor(() => expect(mockRefresh).toHaveBeenCalled());
  });
});

// ── Mensalidades ──────────────────────────────────────────────────────────────

const mensalidadeGet = (url: string) => {
  if (url === '/api/v1/admin/financeiro/config') {
    return Promise.resolve({ data: { valor_mensal: 100, dia_vencimento: 10, ativo: true } });
  }
  if (url.startsWith('/api/v1/admin/financeiro/mensalidades')) {
    return Promise.resolve({
      data: [
        {
          mediun_id: 'm1',
          mediun_nome: 'Mãe Maria',
          mensalidade_isento: false,
          pagamento_id: null,
          status: null,
          data_pagamento: null,
          valor_vigente: null,
          valor_pago: null,
          comprovante_filename: null,
          observacao: null,
        },
      ],
    });
  }
  return Promise.resolve({ data: null });
};

describe('Mensalidades', () => {
  it('sem "insert" no grupo não mostra "Registrar" (o POST exige insert)', async () => {
    mockFeatures = { mensalidade_mediun: true };
    mockPerm = (_f, a) => a !== 'insert';
    mockGet.mockImplementation(mensalidadeGet);

    render(<MensalidadesPage />);
    expect((await screen.findAllByText('Mãe Maria')).length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: /Registrar pagamento de Mãe Maria/ })).not.toBeInTheDocument();
  });

  it('com "insert" mostra "Registrar"', async () => {
    mockFeatures = { mensalidade_mediun: true };
    mockGet.mockImplementation(mensalidadeGet);

    render(<MensalidadesPage />);
    expect((await screen.findAllByRole('button', { name: /Registrar pagamento de Mãe Maria/ })).length).toBeGreaterThan(0);
  });
});

// ── Financeiro → Configuração → Mensalidade ──────────────────────────────────

describe('Configuração da mensalidade', () => {
  it('sem toggle de relatório por e-mail e aceita valor 0 para associados', async () => {
    mockFeatures = { mensalidade_mediun: true, mensalidade_associado: true };
    mockGet.mockImplementation((url: string) => {
      if (url === '/api/v1/admin/financeiro/config') {
        return Promise.resolve({
          data: {
            valor_mensal: 100,
            dia_vencimento: 10,
            enable_mensalidade_associado: true,
            valor_mensal_associado: 30,
            dia_vencimento_associado: 15,
          },
        });
      }
      return Promise.resolve({ data: [] });
    });
    mockPut.mockResolvedValue({ data: {} });

    render(<FinanceiroConfigPage />);
    await userEvent.click(screen.getByRole('tab', { name: 'Mensalidade' }));
    const valorAssoc = await screen.findByLabelText('Valor mensal (associados)');
    expect(screen.queryByText(/Enviar relatório por e-mail/)).not.toBeInTheDocument();

    fireEvent.change(valorAssoc, { target: { value: '0' } });
    fireEvent.click(screen.getByRole('button', { name: /Salvar configuração/ }));
    await waitFor(() => expect(mockPut).toHaveBeenCalled());
    expect(mockPut.mock.calls[0][1]).toMatchObject({ valor_mensal_associado: 0 });
    expect(mockPut.mock.calls[0][1]).not.toHaveProperty('email_relatorio_ativo');
  });
});

// ── Lançamentos: espelho da mensalidade é somente leitura ───────────────────

describe('Lançamentos', () => {
  it('conta gerada pela mensalidade não tem baixa nem menu — aponta para Mensalidades', async () => {
    mockFeatures = { contas_financeiras: true };
    const base = {
      tipo: 'receber',
      valor: 100,
      data_vencimento: '2026-10-10',
      data_competencia: null,
      status: 'pendente',
      data_pagamento: null,
      valor_pago: null,
      categoria_id: null,
      categoria_nome: null,
      conta_bancaria_id: null,
      conta_bancaria_nome: null,
      recorrencia: null,
      observacoes: null,
      created_at: '2026-10-01T00:00:00Z',
    };
    mockGet.mockImplementation((url: string) => {
      if (url === '/api/v1/admin/financeiro/contas') {
        return Promise.resolve({
          data: [
            { ...base, id: 'c1', descricao: 'Mensalidade — Mãe Maria — 10/2026', origem_mensalidade: true },
            { ...base, id: 'c2', descricao: 'Doação avulsa', origem_mensalidade: false },
          ],
        });
      }
      if (url === '/api/v1/admin/financeiro/contas/resumo') return Promise.resolve({ data: {} });
      return Promise.resolve({ data: [] });
    });

    render(<LancamentosPage />);
    expect((await screen.findAllByText('Doação avulsa')).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('link', { name: 'Editar em Mensalidades' }).length).toBeGreaterThan(0);
    expect(screen.queryAllByRole('button', { name: /Mais ações de Mensalidade/ })).toHaveLength(0);
    const menusComuns = screen.getAllByRole('button', { name: /Mais ações de Doação avulsa/ });
    expect(menusComuns.length).toBeGreaterThan(0);
    // "Dar baixa" só para a conta comum (uma por renderização dela), nunca para o espelho.
    expect(screen.getAllByRole('button', { name: /Dar baixa/ })).toHaveLength(menusComuns.length);
  });
});
