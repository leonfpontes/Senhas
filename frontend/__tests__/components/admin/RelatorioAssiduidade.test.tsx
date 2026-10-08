/**
 * AM-26 — Aba "Relatórios" de Atividades e escalas: tabela de assiduidade por médium, toggle
 * "Por grupo" (PlanLocked sem o plano `escalas`), filtros, cartões no celular, detalhe com o
 * motivo das faltas (só na tela) e o PDF gerado SEM o texto da justificativa.
 */
import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

jest.mock('next/router', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), pathname: '/admin/atividades', query: {} }),
}));
jest.mock('next/link', () => ({ children, href }: any) => <a href={href}>{children}</a>);

const mockGet = jest.fn();
jest.mock('@/services/api_client', () => ({
  apiClient: {
    get: (...a: unknown[]) => mockGet(...a),
    post: jest.fn(() => Promise.resolve({ data: {} })),
    put: jest.fn(),
    delete: jest.fn(),
  },
  extractApiErrorMessage: (_e: unknown, fallback: string) => fallback,
}));
jest.mock('@/pages/admin/admin_layout', () => ({
  __esModule: true,
  default: ({ children }: any) => <div>{children}</div>,
}));
const mockPlanCan = jest.fn((_f: string) => true);
jest.mock('@/hooks/useSubscription', () => ({
  useSubscription: () => ({ can: mockPlanCan, subscription: { plan: 'basic' }, planLabel: 'Basic', loading: false }),
}));
const mockGroupCan = jest.fn((_f: string, _a: string) => true);
jest.mock('@/hooks/usePermissions', () => ({
  usePermissions: () => ({ can: mockGroupCan, permissions: null, loading: false, refresh: jest.fn() }),
}));
jest.mock('@/contexts/SnackbarContext', () => ({
  useSnackbar: () => ({ showSuccess: jest.fn(), showError: jest.fn() }),
}));
jest.mock('@/providers/ThemeProvider', () => ({
  useTenant: () => ({ tenantName: 'Terreiro Luz', logoUrl: 'https://cdn/logo.png', config: { colors: { primary: '#123456' } } }),
}));
const mockGerarPdf = jest.fn((..._a: unknown[]) => Promise.resolve());
jest.mock('@/lib/pdf/assiduidadePdf', () => ({
  gerarAssiduidadePdf: (...a: unknown[]) => mockGerarPdf(...a),
}));

const BASE = '/api/v1/admin/atividades';
const URL = `${BASE}/assiduidade`;
const JUSTIFICATIVA = 'Internação no hospital';

const numeros = (conv: number, pres: number, just: number, sem: number, semChamada = 0, pct: number | null = null) => ({
  convocacoes: conv,
  presencas: pres,
  ausencias_justificadas: just,
  ausencias_sem_justificativa: sem,
  sem_chamada: semChamada,
  dispensados: 0,
  avulsos: 0,
  percentual: pct,
});

const POR_MEDIUM = {
  inicio: '2026-10-01',
  fim: '2026-10-31',
  agrupar: 'medium',
  tipo: null,
  grupo: null,
  atividades_com_chamada: 4,
  atividades_sem_chamada: 1,
  totais: numeros(7, 4, 2, 1, 1, 57),
  linhas: [
    { id: 'm-ana', nome: 'Ana Paula', ativo: true, ...numeros(2, 1, 1, 0, 1, 50) },
    { id: 'm-beto', nome: 'Beto Souza', ativo: true, ...numeros(3, 3, 0, 0, 0, 100) },
    { id: 'm-caio', nome: 'Caio Lima', ativo: false, ...numeros(2, 0, 1, 1, 0, 0) },
  ],
};
const POR_GRUPO = {
  ...POR_MEDIUM,
  agrupar: 'grupo',
  linhas: [
    { id: 'g-1', nome: 'G1', cor: 'petroleo', membros: 2, ...numeros(5, 4, 1, 0, 1, 80) },
    { id: 'g-2', nome: 'G2', cor: 'vinho', membros: 2, ...numeros(5, 3, 1, 1, 0, 60) },
  ],
};
const DETALHE_ANA = {
  medium: { id: 'm-ana', nome: 'Ana Paula', ativo: true },
  inicio: '2026-10-01',
  fim: '2026-10-31',
  tipo: null,
  resumo: numeros(2, 1, 1, 0, 1, 50),
  itens: [
    {
      atividade_id: 'a3', origem: 'atividade', ref_id: 'a3', titulo: 'Reunião extra', inicio: '2026-10-20T22:00:00Z',
      tipo: { id: 't-reuniao', nome: 'Reunião', icone: 'reuniao', cor: 'ambar' }, situacao: 'presente',
      categoria: 'sem_chamada', conta_no_percentual: false, chamada_encerrada: false, cancelada: false,
      tem_justificativa: false, justificativa: null,
    },
    {
      atividade_id: 'a2', origem: 'atividade', ref_id: 'a2', titulo: 'Reunião geral', inicio: '2026-10-10T22:00:00Z',
      tipo: { id: 't-reuniao', nome: 'Reunião', icone: 'reuniao', cor: 'ambar' }, situacao: 'ausente_justificado',
      categoria: 'ausente_justificado', conta_no_percentual: true, chamada_encerrada: true, cancelada: false,
      tem_justificativa: true, justificativa: JUSTIFICATIVA,
    },
  ],
};
const TIPOS = [
  { id: 't-reuniao', nome: 'Reunião', controla_presenca: true, arquivado_em: null },
  { id: 't-curso', nome: 'Preparação de curso', controla_presenca: false, arquivado_em: null },
];
const GRUPOS = [{ id: 'g-1', nome: 'G1', cor: 'petroleo', total_membros: 2 }];

function setup() {
  mockGet.mockImplementation((url: string, config?: { params?: Record<string, string> }) => {
    if (url === URL) return Promise.resolve({ data: config?.params?.agrupar === 'grupo' ? POR_GRUPO : POR_MEDIUM });
    if (url === `${URL}/medium/m-ana`) return Promise.resolve({ data: DETALHE_ANA });
    if (url === `${BASE}/tipos`) return Promise.resolve({ data: TIPOS });
    if (url === '/api/v1/admin/corrente-grupos/opcoes') return Promise.resolve({ data: GRUPOS });
    return Promise.resolve({ data: [] });
  });
  const { RelatorioAssiduidade } = require('@/components/admin/atividades/RelatorioAssiduidade');
  return render(<RelatorioAssiduidade />);
}

const chamadasDoRelatorio = () => mockGet.mock.calls.filter(([url]) => url === URL);

beforeEach(() => {
  jest.clearAllMocks();
  mockPlanCan.mockImplementation(() => true);
  mockGroupCan.mockImplementation(() => true);
});

describe('Relatório de assiduidade — tabela', () => {
  it('busca o mês por médium e mostra os números com o percentual (maior primeiro)', async () => {
    setup();
    const tabela = await screen.findByTestId('assiduidade-tabela');
    await within(tabela).findByText('Ana Paula');
    const [, config] = chamadasDoRelatorio()[0];
    expect(config.params).toEqual(expect.objectContaining({ agrupar: 'medium' }));
    expect(config.params.inicio).toMatch(/^\d{4}-\d{2}-01$/);
    const linhas = within(tabela).getAllByRole('row').slice(1);
    expect(linhas.map((r) => within(r).getAllByRole('cell')[0].textContent)).toEqual([
      'Beto Souza',
      'Ana Paula',
      'Caio LimaInativo',
    ]);
    expect(within(linhas[0]).getByText('100%')).toBeInTheDocument();
    expect(screen.getByTestId('assiduidade-resumo')).toHaveTextContent('Presença geral 57%');
    expect(screen.getByTestId('assiduidade-resumo')).toHaveTextContent('1 sem chamada (fora do percentual)');
    // Clicar no cabeçalho inverte a ordem.
    fireEvent.click(within(tabela).getByRole('button', { name: /^Presença$/ }));
    const invertida = within(tabela).getAllByRole('row').slice(1);
    expect(within(invertida[0]).getAllByRole('cell')[0]).toHaveTextContent('Caio Lima');
  });

  it('filtros de tipo (só os que controlam presença) e de grupo vão para a API', async () => {
    const user = userEvent.setup();
    setup();
    await screen.findByText('Ana Paula');
    await user.click(screen.getByRole('combobox', { name: 'Tipo de atividade' }));
    expect(screen.queryByRole('option', { name: 'Preparação de curso' })).not.toBeInTheDocument();
    await user.click(await screen.findByRole('option', { name: 'Reunião' }));
    await waitFor(() => expect(chamadasDoRelatorio().at(-1)![1].params.tipo_id).toBe('t-reuniao'));
    await user.click(screen.getByRole('combobox', { name: 'Grupo da corrente' }));
    await user.click(await screen.findByRole('option', { name: 'G1' }));
    await waitFor(() => expect(chamadasDoRelatorio().at(-1)![1].params.grupo_id).toBe('g-1'));
    await user.click(screen.getByRole('combobox', { name: 'Período' }));
    await user.click(await screen.findByRole('option', { name: 'Este ano' }));
    await waitFor(() => {
      const p = chamadasDoRelatorio().at(-1)![1].params;
      expect(p.inicio).toMatch(/^\d{4}-01-01$/);
      expect(p.fim).toMatch(/^\d{4}-12-31$/);
    });
  });

  it('sem ESCALAS:view: PermissionDenied e nenhuma busca', async () => {
    mockGroupCan.mockImplementation(() => false);
    setup();
    expect(await screen.findByText('Você não tem permissão para visualizar este módulo.')).toBeInTheDocument();
    expect(mockGet).not.toHaveBeenCalled();
  });
});

describe('Relatório de assiduidade — por grupo', () => {
  it('no Pro: "Por grupo" busca com agrupar=grupo e mostra os grupos', async () => {
    const user = userEvent.setup();
    setup();
    await screen.findByText('Ana Paula');
    await user.click(screen.getByRole('radio', { name: /Por grupo/ }));
    expect(await screen.findByText('G2')).toBeInTheDocument();
    expect(chamadasDoRelatorio().at(-1)![1].params.agrupar).toBe('grupo');
    expect(screen.getAllByText('2 membros').length).toBe(2);
  });

  it('sem o plano escalas: PlanLocked com o plano mínimo do catálogo e sem buscar por grupo', async () => {
    mockPlanCan.mockImplementation((f: string) => f !== 'escalas');
    const user = userEvent.setup();
    setup();
    await screen.findByText('Ana Paula');
    await user.click(screen.getByRole('radio', { name: /Por grupo/ }));
    expect(await screen.findByText('Relatório por grupo')).toBeInTheDocument();
    expect(screen.getByText('Pro')).toBeInTheDocument();
    expect(chamadasDoRelatorio().every(([, c]) => c.params.agrupar === 'medium')).toBe(true);
    expect(screen.queryByRole('button', { name: /Baixar PDF/ })).not.toBeInTheDocument();
  });
});

describe('Relatório de assiduidade — detalhe e PDF', () => {
  it('detalhe do médium mostra o motivo só na tela; o PDF recebe só contagens', async () => {
    setup();
    fireEvent.click(await screen.findByText('Ana Paula'));
    const sheet = await screen.findByRole('dialog');
    expect(await within(sheet).findByText(JUSTIFICATIVA)).toBeInTheDocument();
    expect(within(sheet).getByText('Ausente com motivo')).toBeInTheDocument();
    expect(within(sheet).getByText('Sem chamada encerrada — fora do percentual')).toBeInTheDocument();
    expect(mockGet).toHaveBeenCalledWith(
      `${URL}/medium/m-ana`,
      expect.objectContaining({ params: expect.objectContaining({ inicio: expect.any(String), fim: expect.any(String) }) }),
    );
    fireEvent.keyDown(sheet, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /Baixar PDF/ }));
    await waitFor(() => expect(mockGerarPdf).toHaveBeenCalledTimes(1));
    const [dados, marca] = mockGerarPdf.mock.calls[0] as [any, any];
    expect(JSON.stringify(dados)).not.toContain(JUSTIFICATIVA);
    expect(JSON.stringify(dados)).not.toMatch(/"justificativa"/);
    expect(dados.linhas.map((l: { nome: string }) => l.nome)).toEqual(['Beto Souza', 'Ana Paula', 'Caio Lima']);
    expect(dados.linhas[1]).toEqual({ nome: 'Ana Paula', ...numeros(2, 1, 1, 0, 1, 50) });
    expect(dados.totais.percentual).toBe(57);
    expect(Object.keys(dados.linhas[0]).sort()).toEqual(
      ['avulsos', 'ausencias_justificadas', 'ausencias_sem_justificativa', 'convocacoes', 'dispensados', 'nome', 'percentual', 'presencas', 'sem_chamada'].sort(),
    );
    expect(marca).toEqual({ nome: 'Terreiro Luz', logoUrl: 'https://cdn/logo.png', primaryColor: '#123456' });
  });

  it('dadosDoPdf copia campo a campo (um texto que viesse na resposta não passa)', () => {
    const { dadosDoPdf } = require('@/constants/assiduidade');
    const resp = {
      ...POR_MEDIUM,
      tipo: { id: 't', nome: 'Faxina', icone: 'faxina', cor: null },
      grupo: { id: 'g', nome: 'G1', cor: 'petroleo' },
      linhas: [{ ...POR_MEDIUM.linhas[0], justificativa: JUSTIFICATIVA }],
    };
    const dados = dadosDoPdf(resp);
    expect(JSON.stringify(dados)).not.toContain(JUSTIFICATIVA);
    expect(dados.filtros).toEqual(['Tipo: Faxina', 'Grupo: G1']);
  });
});

describe('Relatório de assiduidade — celular', () => {
  const original = window.matchMedia;
  beforeEach(() => {
    window.matchMedia = ((query: string) => ({
      matches: query.includes('max-width: 639px'),
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    })) as unknown as typeof window.matchMedia;
  });
  afterEach(() => {
    window.matchMedia = original;
  });

  it('vira cartões com o percentual e o resumo; tocar abre o detalhe', async () => {
    setup();
    const cartoes = await screen.findAllByTestId('assiduidade-cartao');
    expect(cartoes).toHaveLength(3);
    expect(cartoes[1]).toHaveTextContent('Ana Paula');
    expect(cartoes[1]).toHaveTextContent('50%');
    expect(cartoes[1]).toHaveTextContent('2 convocações · 1 presença · 1 falta com justificativa · 1 sem chamada');
    fireEvent.click(cartoes[1]);
    expect(await within(await screen.findByRole('dialog')).findByText(JUSTIFICATIVA)).toBeInTheDocument();
  });
});

describe('Atividades e escalas — aba Relatórios', () => {
  it('a página tem a aba "Relatórios" e só busca o relatório quando ela abre', async () => {
    const user = userEvent.setup();
    mockGet.mockImplementation((url: string) => {
      if (url === `${BASE}/calendario`) return Promise.resolve({ data: { inicio: '2026-10-01', fim: '2026-10-31', itens: [] } });
      if (url === URL) return Promise.resolve({ data: POR_MEDIUM });
      if (url === `${BASE}/tipos`) return Promise.resolve({ data: TIPOS });
      return Promise.resolve({ data: [] });
    });
    const Page = require('@/pages/admin/atividades').default;
    render(<Page />);
    const aba = await screen.findByRole('tab', { name: 'Relatórios' });
    expect(chamadasDoRelatorio()).toHaveLength(0);
    await user.click(aba);
    expect(await screen.findByText('Beto Souza')).toBeInTheDocument();
    expect(chamadasDoRelatorio().length).toBeGreaterThan(0);
  }, 20000); // a página inteira é pesada para montar no jsdom
});
