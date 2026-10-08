/**
 * AM-08 — /admin/atividades ("Atividades e escalas"): gates (Área sem PlanLocked, plano
 * `atividades_corrente` com PlanLocked, grupo `escalas`), agenda da casa (giras + atividades,
 * botões só com permissão), CrudDrawer da atividade, cancelar com motivo, excluir com confirmação
 * e a aba "Tipos e funções" (tipo Gira sem arquivar, editar opções e grupos, funções).
 * AM-29: "Pôr na escala" com grupos inteiros no painel Confirmações e na criação (tipo "só escalados").
 */
import React from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

jest.mock('next/router', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), pathname: '/admin/atividades', query: {} }),
}));
jest.mock('next/link', () => ({ children, href }: any) => <a href={href}>{children}</a>);

const mockGet = jest.fn();
const mockPost = jest.fn();
const mockPut = jest.fn();
const mockDelete = jest.fn();
jest.mock('@/services/api_client', () => ({
  apiClient: {
    get: (...a: unknown[]) => mockGet(...a),
    post: (...a: unknown[]) => mockPost(...a),
    put: (...a: unknown[]) => mockPut(...a),
    delete: (...a: unknown[]) => mockDelete(...a),
  },
  extractApiErrorMessage: (_e: unknown, fallback: string) => fallback,
}));
jest.mock('@/pages/admin/admin_layout', () => ({
  __esModule: true,
  default: ({ children }: any) => <div>{children}</div>,
}));
const mockPlanCan = jest.fn((_f: string) => true);
jest.mock('@/hooks/useSubscription', () => ({
  useSubscription: () => ({ can: mockPlanCan, subscription: { plan: 'free' }, planLabel: 'Gratuito', loading: false }),
}));
const mockGroupCan = jest.fn((_f: string, _a: string) => true);
jest.mock('@/hooks/usePermissions', () => ({
  usePermissions: () => ({ can: mockGroupCan, permissions: null, loading: false, refresh: jest.fn() }),
}));
const mockSuccess = jest.fn();
jest.mock('@/contexts/SnackbarContext', () => ({
  useSnackbar: () => ({ showSuccess: mockSuccess, showError: jest.fn() }),
}));

const BASE = '/api/v1/admin/atividades';
const tipoBase = {
  controla_presenca: true,
  pede_confirmacao: true,
  exige_justificativa: false,
  checkin_pelo_medium: false,
  checkin_antes_min: 60,
  checkin_depois_min: 180,
  elegiveis: 'todos',
  grupos: [],
  convocacao_padrao: 'todos_elegiveis',
  modo_escala: 'nenhuma',
  hora_padrao: null,
  duracao_min: null,
  visibilidade_padrao: 'corrente',
  is_sistema: false,
  visivel_no_site: false,
  arquivado_em: null,
};
const TIPOS = [
  { ...tipoBase, id: 't-gira', nome: 'Gira', natureza: 'gira', icone: 'gira', cor: null, is_sistema: true, visivel_no_site: true, modo_escala: 'funcoes', ordem: 0 },
  { ...tipoBase, id: 't-faxina', nome: 'Faxina', natureza: 'atividade', icone: 'faxina', cor: 'petroleo', convocacao_padrao: 'so_escalados', modo_escala: 'grupos_por_dia', hora_padrao: '09:00', duracao_min: 180, ordem: 1 },
  { ...tipoBase, id: 't-ritual', nome: 'Ritual individual', natureza: 'atividade', icone: 'flor', cor: 'vinho', visibilidade_padrao: 'convocados', ordem: 3 },
];
const CALENDARIO = {
  inicio: '2026-10-01',
  fim: '2026-10-31',
  itens: [
    {
      origem: 'atividade', id: 'a1', tipo: { id: 't-faxina', nome: 'Faxina', icone: 'faxina', cor: 'petroleo' },
      titulo: 'Faxina · G1', inicio: '2026-10-10T12:00:00Z', fim: null, local: 'Terreiro', visibilidade: 'corrente', cancelada: false,
    },
    {
      origem: 'gira', id: 'g1', tipo: { id: 't-gira', nome: 'Gira', icone: 'gira', cor: null },
      titulo: 'Gira de Caboclos', inicio: '2026-10-11T23:00:00Z', fim: null, local: null, visibilidade: null, cancelada: false,
    },
    {
      origem: 'atividade', id: 'a2', tipo: { id: 't-ritual', nome: 'Ritual individual', icone: 'flor', cor: 'vinho' },
      titulo: 'Ritual da Ana', inicio: '2026-10-12T22:00:00Z', fim: null, local: null, visibilidade: 'convocados', cancelada: true,
    },
  ],
};
const ATIVIDADE_A1 = {
  id: 'a1', tipo: { id: 't-faxina', nome: 'Faxina', icone: 'faxina', cor: 'petroleo' }, gira_id: null,
  titulo: 'Faxina · G1', inicio: '2026-10-10T12:00:00Z', fim: '2026-10-10T15:00:00Z', local: 'Terreiro',
  descricao: null, orientacoes: 'Leve luvas', visibilidade: 'corrente', origem: 'manual', cancelada_em: null, cancelamento_motivo: null,
};
const FUNCOES = [
  { id: 'f1', nome: 'Cambone', descricao: null, ordem: 0, arquivado_em: null },
  { id: 'f2', nome: 'Porteiro', descricao: 'Fica na porta', ordem: 1, arquivado_em: null },
];
const GRUPOS = [{ id: 'g-1', nome: 'G1', cor: 'ambar', total_membros: 3 }];

function setup() {
  mockGet.mockImplementation((url: string) => {
    if (url === `${BASE}/calendario`) return Promise.resolve({ data: CALENDARIO });
    if (url === `${BASE}/tipos`) return Promise.resolve({ data: TIPOS });
    if (url === `${BASE}/funcoes`) return Promise.resolve({ data: FUNCOES });
    if (url === `${BASE}/a1`) return Promise.resolve({ data: ATIVIDADE_A1 });
    if (url === '/api/v1/admin/corrente-grupos/opcoes') return Promise.resolve({ data: GRUPOS });
    return Promise.resolve({ data: [] });
  });
  const Page = require('@/pages/admin/atividades').default;
  return render(<Page />);
}

beforeEach(() => {
  jest.clearAllMocks();
  mockPlanCan.mockImplementation(() => true);
  mockGroupCan.mockImplementation(() => true);
  mockPost.mockResolvedValue({ data: {} });
  mockPut.mockResolvedValue({ data: {} });
  mockDelete.mockResolvedValue({ data: {} });
});

describe('Atividades e escalas — gates', () => {
  it('sem area_medium: aviso neutro, sem oferta de plano e sem chamar a API', async () => {
    mockPlanCan.mockImplementation((f: string) => f !== 'area_medium');
    setup();
    expect(await screen.findByText('A Área do Médium ainda não está disponível para este terreiro.')).toBeInTheDocument();
    expect(screen.queryByText(/plano/i)).not.toBeInTheDocument();
    expect(mockGet).not.toHaveBeenCalled();
  });

  it('sem atividades_corrente no plano: PlanLocked com o plano mínimo do catálogo', async () => {
    mockPlanCan.mockImplementation((f: string) => f !== 'atividades_corrente');
    setup();
    expect(await screen.findByText('Recurso indisponível')).toBeInTheDocument();
    expect(screen.getByText('Atividades da casa')).toBeInTheDocument();
    expect(screen.getByText('Basic')).toBeInTheDocument();
    expect(mockGet).not.toHaveBeenCalled();
  });

  it('sem ESCALAS:view mostra PermissionDenied e não busca', async () => {
    mockGroupCan.mockImplementation(() => false);
    setup();
    expect(await screen.findByText('Você não tem permissão para visualizar este módulo.')).toBeInTheDocument();
    expect(mockGet).not.toHaveBeenCalled();
    expect(mockGroupCan).toHaveBeenCalledWith('escalas', 'view');
  });

  it('só view: agenda sem botões de criar, editar, cancelar ou excluir', async () => {
    mockGroupCan.mockImplementation((_f: string, a: string) => a === 'view');
    setup();
    const itens = await screen.findAllByTestId('agenda-item');
    expect(itens).toHaveLength(3);
    expect(screen.queryByRole('button', { name: /Nova atividade/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Editar/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Cancelar/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Excluir/ })).not.toBeInTheDocument();
    // Gira tem link para a tela de Giras (GIRAS:view).
    expect(within(itens[1]).getByRole('link', { name: /Ver em Giras/ })).toHaveAttribute('href', '/admin/giras');
  });
});

describe('Atividades e escalas — agenda da casa', () => {
  it('lista giras e atividades com tipo, cancelada e "só quem estiver na escala"', async () => {
    setup();
    const itens = await screen.findAllByTestId('agenda-item');
    expect(within(itens[0]).getByTestId('tipo-chip')).toHaveTextContent('Faxina');
    expect(within(itens[0]).getByTestId('tipo-chip')).toHaveStyle({ backgroundColor: '#0f766e' });
    expect(within(itens[1]).getByText('Gira de Caboclos')).toBeInTheDocument();
    expect(within(itens[2]).getByText('Cancelada')).toBeInTheDocument();
    expect(within(itens[2]).getByText(/Só quem estiver na escala/)).toBeInTheDocument();
    // Cancelada: desfaz o cancelamento, não edita.
    expect(within(itens[2]).queryByRole('button', { name: /^Editar/ })).not.toBeInTheDocument();
    expect(within(itens[2]).getByRole('button', { name: 'Desfazer cancelamento de Ritual da Ana' })).toBeInTheDocument();
    // Gira não tem as ações de atividade; tem Confirmações e Chamada (AM-17).
    expect(within(itens[1]).queryByRole('button', { name: /^(Editar|Cancelar|Excluir)/ })).not.toBeInTheDocument();
    expect(within(itens[1]).getByRole('button', { name: 'Chamada de Gira de Caboclos' })).toBeInTheDocument();
    expect(within(itens[1]).getByRole('button', { name: 'Confirmações de Gira de Caboclos' })).toBeInTheDocument();
    const cal = mockGet.mock.calls.find((c) => c[0] === `${BASE}/calendario`);
    expect(cal?.[1]?.params).toMatchObject({ inicio: expect.stringMatching(/^\d{4}-\d{2}-01$/) });
  });

  it('filtro por tipo manda o tipo_id', async () => {
    setup();
    await screen.findAllByTestId('agenda-item');
    const filtro = screen.getByRole('group', { name: 'Filtrar por tipo' });
    fireEvent.click(within(filtro).getByRole('button', { name: 'Faxina' }));
    await waitFor(() =>
      expect(mockGet).toHaveBeenCalledWith(`${BASE}/calendario`, {
        params: expect.objectContaining({ tipo_id: 't-faxina' }),
      }),
    );
  });

  it('nova atividade: só tipos de atividade (sem Gira), visibilidade do tipo e POST', async () => {
    setup();
    await screen.findAllByTestId('agenda-item');
    fireEvent.click(screen.getByRole('button', { name: /Nova atividade/ }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).queryByRole('radio', { name: 'Gira' })).not.toBeInTheDocument();
    expect(within(dialog).getByRole('radio', { name: 'Faxina' })).toBeChecked();

    // Sem início não salva.
    await act(async () => {
      fireEvent.click(within(dialog).getByRole('button', { name: 'Criar atividade' }));
    });
    expect(await within(dialog).findByText('Informe o dia e a hora')).toBeInTheDocument();
    expect(mockPost).not.toHaveBeenCalled();

    fireEvent.click(within(dialog).getByRole('radio', { name: 'Ritual individual' }));
    expect(within(dialog).getByRole('radio', { name: /Só quem estiver na escala/ })).toBeChecked();
    fireEvent.change(within(dialog).getByLabelText(/^Título/), { target: { value: 'Ritual da Ana' } });
    fireEvent.change(within(dialog).getByLabelText(/^Início/), { target: { value: '20/10/2026' } });
    let el: HTMLElement | null = within(dialog).getByLabelText(/^Início/);
    while (el && !el.querySelector('input[type="time"]')) el = el.parentElement;
    fireEvent.change((el as HTMLElement).querySelector('input[type="time"]') as HTMLInputElement, {
      target: { value: '19:30' },
    });
    fireEvent.change(within(dialog).getByLabelText(/Orientações para a corrente/), { target: { value: 'Roupa branca' } });
    await act(async () => {
      fireEvent.click(within(dialog).getByRole('button', { name: 'Criar atividade' }));
    });
    await waitFor(() => expect(mockPost).toHaveBeenCalled());
    const [url, body] = mockPost.mock.calls[0];
    expect(url).toBe(BASE);
    expect(body).toMatchObject({
      tipo_id: 't-ritual',
      titulo: 'Ritual da Ana',
      fim: null,
      local: null,
      orientacoes: 'Roupa branca',
      descricao: null,
      visibilidade: 'convocados',
    });
    expect(new Date(body.inicio).toISOString()).toBe(new Date('2026-10-20T19:30').toISOString());
  });

  it('editar busca o detalhe e manda o PUT', async () => {
    setup();
    fireEvent.click(await screen.findByRole('button', { name: 'Editar Faxina · G1' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByDisplayValue('Faxina · G1')).toBeInTheDocument();
    expect(within(dialog).getByDisplayValue('Leve luvas')).toBeInTheDocument();
    fireEvent.change(within(dialog).getByLabelText(/^Local/), { target: { value: 'Quintal' } });
    await act(async () => {
      fireEvent.click(within(dialog).getByRole('button', { name: 'Salvar' }));
    });
    await waitFor(() => expect(mockPut).toHaveBeenCalled());
    expect(mockPut.mock.calls[0][0]).toBe(`${BASE}/a1`);
    expect(mockPut.mock.calls[0][1]).toMatchObject({ tipo_id: 't-faxina', local: 'Quintal', orientacoes: 'Leve luvas' });
  });

  it('cancelar pede o motivo e chama o POST; excluir pede confirmação', async () => {
    setup();
    fireEvent.click(await screen.findByRole('button', { name: 'Cancelar Faxina · G1' }));
    const drawer = await screen.findByRole('dialog');
    await act(async () => {
      fireEvent.click(within(drawer).getByRole('button', { name: 'Cancelar atividade' }));
    });
    expect(await within(drawer).findByText('Conte o motivo do cancelamento')).toBeInTheDocument();
    expect(mockPost).not.toHaveBeenCalled();
    fireEvent.change(within(drawer).getByLabelText(/^Motivo/), { target: { value: 'Chuva forte' } });
    await act(async () => {
      fireEvent.click(within(drawer).getByRole('button', { name: 'Cancelar atividade' }));
    });
    expect(mockPost).toHaveBeenCalledWith(`${BASE}/a1/cancelar`, { motivo: 'Chuva forte' });

    fireEvent.click(screen.getByRole('button', { name: 'Excluir Ritual da Ana' }));
    const confirm = await screen.findByRole('alertdialog');
    await act(async () => {
      fireEvent.click(within(confirm).getByRole('button', { name: 'Excluir' }));
    });
    expect(mockDelete).toHaveBeenCalledWith(`${BASE}/a2`);
  });
});

describe('Atividades e escalas — tipos e funções', () => {
  async function abrirAba() {
    const user = userEvent.setup();
    setup();
    await screen.findAllByTestId('agenda-item');
    await user.click(screen.getByRole('tab', { name: 'Tipos e funções' }));
    return user;
  }

  it('lista os tipos (Gira da casa sem arquivar) e as funções', async () => {
    await abrirAba();
    const tipos = await screen.findAllByTestId('tipo-item');
    expect(tipos).toHaveLength(3);
    expect(within(tipos[0]).getByText('Da casa · vai ao site')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Arquivar Gira' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Arquivar Faxina' })).toBeInTheDocument();
    expect(within(tipos[1]).getByText(/Escala: grupos por dia do mês/)).toBeInTheDocument();
    const funcoes = await screen.findAllByTestId('funcao-item');
    expect(funcoes.map((f) => f.textContent)).toEqual([expect.stringContaining('Cambone'), expect.stringContaining('Porteiro')]);
  });

  it('editar o tipo: ícone, cor, grupos elegíveis e o PUT com as opções', async () => {
    const user = await abrirAba();
    await user.click(await screen.findByRole('button', { name: 'Editar Faxina' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByRole('radio', { name: 'Petróleo' })).toHaveAttribute('aria-checked', 'true');
    await user.click(within(dialog).getByRole('radio', { name: 'Vela' }));
    await user.click(within(dialog).getByRole('radio', { name: 'Cor da casa' }));
    await user.click(within(dialog).getByLabelText('Grupos escolhidos'));
    // Sem grupo escolhido não salva.
    await act(async () => {
      fireEvent.click(within(dialog).getByRole('button', { name: 'Salvar' }));
    });
    expect(await within(dialog).findByText('Escolha pelo menos um grupo')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('combobox', { name: 'Grupos' }));
    await user.click(await screen.findByText('G1', { selector: '[cmdk-item] span' }));
    await act(async () => {
      fireEvent.click(within(dialog).getByRole('button', { name: 'Salvar' }));
    });
    await waitFor(() => expect(mockPut).toHaveBeenCalled());
    expect(mockPut.mock.calls[0][0]).toBe(`${BASE}/tipos/t-faxina`);
    expect(mockPut.mock.calls[0][1]).toMatchObject({
      nome: 'Faxina',
      icone: 'vela',
      cor: null,
      elegiveis: 'grupos',
      grupo_ids: ['g-1'],
      modo_escala: 'grupos_por_dia',
      hora_padrao: '09:00',
      duracao_min: 180,
    });
  });

  it('tipo Gira: sem horário/visibilidade padrão e aviso de que é a gira do site', async () => {
    const user = await abrirAba();
    await user.click(await screen.findByRole('button', { name: 'Editar Gira' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/único tipo que aparece no site/)).toBeInTheDocument();
    expect(within(dialog).queryByLabelText('Horário padrão')).not.toBeInTheDocument();
    fireEvent.change(within(dialog).getByLabelText(/^Nome/), { target: { value: 'Sessão' } });
    await act(async () => {
      fireEvent.click(within(dialog).getByRole('button', { name: 'Salvar' }));
    });
    await waitFor(() => expect(mockPut).toHaveBeenCalled());
    expect(mockPut.mock.calls[0][1]).not.toHaveProperty('visibilidade_padrao');
    expect(mockPut.mock.calls[0][1]).toMatchObject({ nome: 'Sessão' });
  });

  it('nova função e arquivar função', async () => {
    const user = await abrirAba();
    await user.click(await screen.findByRole('button', { name: /Nova função/ }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText(/^Nome da função/), { target: { value: 'Ekedi' } });
    await act(async () => {
      fireEvent.click(within(dialog).getByRole('button', { name: 'Criar função' }));
    });
    expect(mockPost).toHaveBeenCalledWith(`${BASE}/funcoes`, { nome: 'Ekedi', descricao: null });

    fireEvent.click(screen.getByRole('button', { name: 'Arquivar Cambone' }));
    const confirm = await screen.findByRole('alertdialog');
    await act(async () => {
      fireEvent.click(within(confirm).getByRole('button', { name: 'Arquivar' }));
    });
    expect(mockDelete).toHaveBeenCalledWith(`${BASE}/funcoes/f1`);
  });

  it('sem insert/edit/delete: aba sem botões e sem buscar grupos', async () => {
    mockGroupCan.mockImplementation((_f: string, a: string) => a === 'view');
    await abrirAba();
    await screen.findAllByTestId('tipo-item');
    expect(screen.queryByRole('button', { name: /Novo tipo/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Nova função/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Editar/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Arquivar/ })).not.toBeInTheDocument();
    expect(mockGet).not.toHaveBeenCalledWith('/api/v1/admin/corrente-grupos/opcoes');
  });
});

describe('Atividades e escalas — presença (AM-17/AM-28)', () => {
  const CONFIRMACOES = {
    atividade: {
      atividade_id: 'a1', origem: 'atividade', ref_id: 'a1', titulo: 'Faxina · G1', inicio: '2026-10-10T12:00:00Z',
      tipo: { id: 't-faxina', nome: 'Faxina', icone: 'faxina', cor: 'petroleo' }, modo_presenca: 'confianca',
      controla_presenca: true, pede_confirmacao: true, exige_justificativa: true, convocacao_padrao: 'so_escalados',
      cancelada: false, chamada_encerrada_em: null, pode_encerrar: false,
    },
    contadores: { esperados: 2, confirmados: 1, ausencias_avisadas: 1, sem_resposta: 0, presentes: 0, ausentes: 0, sem_registro: 2, dispensados: 0 },
    pessoas: [
      { medium_id: 'm1', nome: 'Ana Paula', convocado: true, origem: 'manual', resposta: 'nao_vou', presenca: 'nao_registrada', situacao: 'ausencia_avisada', tem_justificativa: true, justificativa: 'Viagem a trabalho', dispensado: false },
      { medium_id: 'm2', nome: 'Beto Souza', convocado: true, origem: 'manual', resposta: 'vou', presenca: 'nao_registrada', situacao: 'confirmado', tem_justificativa: false, justificativa: null, dispensado: false },
    ],
    outros_mediuns: [{ id: 'm3', nome: 'Caio Lima' }],
    ver_justificativa: true,
  };

  it('tipo: escolhe como a presença é marcada e manda presenca_modo', async () => {
    const user = userEvent.setup();
    setup();
    await screen.findAllByTestId('agenda-item');
    await user.click(screen.getByRole('tab', { name: 'Tipos e funções' }));
    await user.click(await screen.findByRole('button', { name: 'Editar Faxina' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByRole('radio', { name: /O padrão da casa/ })).toHaveAttribute('aria-checked', 'true');
    await user.click(within(dialog).getByRole('radio', { name: /“Cheguei” com o QR do dia/ }));
    expect(within(dialog).getByLabelText('Minutos antes do início')).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(within(dialog).getByRole('button', { name: 'Salvar' }));
    });
    await waitFor(() => expect(mockPut).toHaveBeenCalled());
    expect(mockPut.mock.calls[0][1]).toMatchObject({ presenca_modo: 'qr', checkin_antes_min: 60 });
    expect(mockPut.mock.calls[0][1]).not.toHaveProperty('checkin_pelo_medium');
  });

  it('confirmações: contadores, o motivo de quem não vai, pôr e tirar da escala', async () => {
    const user = userEvent.setup();
    mockGet.mockImplementation((url: string) => {
      if (url === `${BASE}/calendario`) return Promise.resolve({ data: CALENDARIO });
      if (url === `${BASE}/tipos`) return Promise.resolve({ data: TIPOS });
      if (url === `${BASE}/a1/confirmacoes`) return Promise.resolve({ data: CONFIRMACOES });
      return Promise.resolve({ data: [] });
    });
    mockPost.mockResolvedValue({ data: CONFIRMACOES });
    const Page = require('@/pages/admin/atividades').default;
    render(<Page />);
    await user.click(await screen.findByRole('button', { name: 'Confirmações de Faxina · G1' }));
    const painel = await screen.findByRole('dialog');
    expect(await within(painel).findByText('Motivo: Viagem a trabalho')).toBeInTheDocument();
    const contadores = within(painel).getByTestId('confirmacoes-contadores');
    expect(contadores).toHaveTextContent('1Vão');
    expect(contadores).toHaveTextContent('1Não vão');
    await user.click(within(painel).getByRole('button', { name: 'Tirar Beto Souza da escala' }));
    await waitFor(() => expect(mockPost).toHaveBeenCalledWith(`${BASE}/a1/dispensar`, { medium_ids: ['m2'] }));
    expect(within(painel).getByRole('link', { name: /Abrir a chamada/ })).toHaveAttribute('href', '/admin/atividades/a1/chamada');
  });

  it('confirmações (AM-29): pôr na escala com grupos e médiuns — toast com o resumo', async () => {
    const user = userEvent.setup();
    mockGet.mockImplementation((url: string) => {
      if (url === `${BASE}/calendario`) return Promise.resolve({ data: CALENDARIO });
      if (url === `${BASE}/tipos`) return Promise.resolve({ data: TIPOS });
      if (url === `${BASE}/a1/confirmacoes`) return Promise.resolve({ data: CONFIRMACOES });
      if (url === '/api/v1/admin/corrente-grupos/opcoes') return Promise.resolve({ data: GRUPOS });
      return Promise.resolve({ data: [] });
    });
    mockPost.mockResolvedValue({
      data: {
        ...CONFIRMACOES,
        resultado: { novos: 3, ja_estavam: 1, fora_da_elegibilidade: 1, fora_da_elegibilidade_nomes: ['Dani Reis'] },
      },
    });
    const Page = require('@/pages/admin/atividades').default;
    render(<Page />);
    await user.click(await screen.findByRole('button', { name: 'Confirmações de Faxina · G1' }));
    const painel = await screen.findByRole('dialog');
    const bloco = await within(painel).findByTestId('por-na-escala');
    expect(within(bloco).getByRole('button', { name: /Pôr na escala/ })).toBeDisabled();

    await user.click(within(bloco).getByRole('combobox', { name: 'Grupos' }));
    await user.click(await screen.findByText('G1', { selector: '[cmdk-item] span' }));
    // O grupo escolhido aparece com a etiqueta na cor do grupo.
    expect(within(bloco).getByTestId('grupos-escolhidos')).toHaveTextContent('G1');
    expect(within(within(bloco).getByTestId('grupos-escolhidos')).getByTestId('grupo-chip')).toBeInTheDocument();
    await user.click(within(bloco).getByRole('combobox', { name: 'Médiuns' }));
    await user.click(await screen.findByText('Caio Lima', { selector: '[cmdk-item] span' }));
    await user.keyboard('{Escape}');

    await user.click(within(bloco).getByRole('button', { name: /Pôr na escala/ }));
    await waitFor(() =>
      expect(mockPost).toHaveBeenCalledWith(`${BASE}/a1/convocar`, { medium_ids: ['m3'], grupo_ids: ['g-1'] }),
    );
    expect(mockSuccess).toHaveBeenCalledWith(
      '3 médiuns postos na escala · 1 já estava · 1 fora de quem pode participar: Dani Reis. Eles veem na Área do Médium.',
    );
  });

  it('confirmações sem ESCALAS:insert: sem "Pôr na escala" e sem buscar grupos', async () => {
    const user = userEvent.setup();
    mockGroupCan.mockImplementation((_f: string, a: string) => a !== 'insert');
    mockGet.mockImplementation((url: string) => {
      if (url === `${BASE}/calendario`) return Promise.resolve({ data: CALENDARIO });
      if (url === `${BASE}/tipos`) return Promise.resolve({ data: TIPOS });
      if (url === `${BASE}/a1/confirmacoes`) return Promise.resolve({ data: CONFIRMACOES });
      if (url === '/api/v1/admin/corrente-grupos/opcoes') return Promise.resolve({ data: GRUPOS });
      return Promise.resolve({ data: [] });
    });
    const Page = require('@/pages/admin/atividades').default;
    render(<Page />);
    await user.click(await screen.findByRole('button', { name: 'Confirmações de Faxina · G1' }));
    const painel = await screen.findByRole('dialog');
    expect(await within(painel).findByText('Motivo: Viagem a trabalho')).toBeInTheDocument();
    expect(within(painel).queryByTestId('por-na-escala')).not.toBeInTheDocument();
    expect(mockGet).not.toHaveBeenCalledWith('/api/v1/admin/corrente-grupos/opcoes');
  });

  it('nova atividade "só escalados" (AM-29): escolhe grupos e médiuns e convoca depois de criar', async () => {
    const user = userEvent.setup();
    mockGet.mockImplementation((url: string) => {
      if (url === `${BASE}/calendario`) return Promise.resolve({ data: CALENDARIO });
      if (url === `${BASE}/tipos`) return Promise.resolve({ data: TIPOS });
      if (url === `${BASE}/convocar/mediuns`) return Promise.resolve({ data: [{ id: 'm3', nome: 'Caio Lima' }] });
      if (url === '/api/v1/admin/corrente-grupos/opcoes') return Promise.resolve({ data: GRUPOS });
      return Promise.resolve({ data: [] });
    });
    mockPost.mockImplementation((url: string) =>
      url === BASE
        ? Promise.resolve({ data: { ...ATIVIDADE_A1, id: 'nova-1' } })
        : Promise.resolve({
            data: {
              ...CONFIRMACOES,
              resultado: { novos: 2, ja_estavam: 0, fora_da_elegibilidade: 0, fora_da_elegibilidade_nomes: [] },
            },
          }),
    );
    const Page = require('@/pages/admin/atividades').default;
    render(<Page />);
    await screen.findAllByTestId('agenda-item');
    fireEvent.click(screen.getByRole('button', { name: /Nova atividade/ }));
    const dialog = await screen.findByRole('dialog');
    // Faxina = "só escalados": aparece o "Pôr na escala".
    const bloco = await within(dialog).findByTestId('criar-por-na-escala');
    await user.click(within(bloco).getByRole('combobox', { name: 'Grupos' }));
    await user.click(await screen.findByText('G1', { selector: '[cmdk-item] span' }));
    await user.click(within(bloco).getByRole('combobox', { name: 'Médiuns' }));
    await user.click(await screen.findByText('Caio Lima', { selector: '[cmdk-item] span' }));
    await user.keyboard('{Escape}');

    // Tipo "todos os elegíveis": o bloco some (e nada é convocado).
    fireEvent.click(within(dialog).getByRole('radio', { name: 'Ritual individual' }));
    expect(within(dialog).queryByTestId('criar-por-na-escala')).not.toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('radio', { name: 'Faxina' }));
    expect(await within(dialog).findByTestId('criar-por-na-escala')).toBeInTheDocument();

    fireEvent.change(within(dialog).getByLabelText(/^Início/), { target: { value: '20/10/2026' } });
    let el: HTMLElement | null = within(dialog).getByLabelText(/^Início/);
    while (el && !el.querySelector('input[type="time"]')) el = el.parentElement;
    fireEvent.change((el as HTMLElement).querySelector('input[type="time"]') as HTMLInputElement, {
      target: { value: '09:00' },
    });
    await act(async () => {
      fireEvent.click(within(dialog).getByRole('button', { name: 'Criar atividade' }));
    });
    await waitFor(() => expect(mockPost).toHaveBeenCalledTimes(2));
    expect(mockPost.mock.calls[0][0]).toBe(BASE);
    expect(mockPost.mock.calls[1]).toEqual([`${BASE}/nova-1/convocar`, { medium_ids: ['m3'], grupo_ids: ['g-1'] }]);
    expect(mockSuccess).toHaveBeenCalledTimes(1);
    expect(mockSuccess).toHaveBeenCalledWith('Atividade criada. 2 médiuns postos na escala.');
  });

  it('nova atividade "só escalados" sem escolher ninguém: só cria (um POST, toast de sempre)', async () => {
    setup();
    await screen.findAllByTestId('agenda-item');
    fireEvent.click(screen.getByRole('button', { name: /Nova atividade/ }));
    const dialog = await screen.findByRole('dialog');
    await within(dialog).findByTestId('criar-por-na-escala');
    fireEvent.change(within(dialog).getByLabelText(/^Início/), { target: { value: '20/10/2026' } });
    let el: HTMLElement | null = within(dialog).getByLabelText(/^Início/);
    while (el && !el.querySelector('input[type="time"]')) el = el.parentElement;
    fireEvent.change((el as HTMLElement).querySelector('input[type="time"]') as HTMLInputElement, {
      target: { value: '09:00' },
    });
    await act(async () => {
      fireEvent.click(within(dialog).getByRole('button', { name: 'Criar atividade' }));
    });
    await waitFor(() => expect(mockPost).toHaveBeenCalledTimes(1));
    expect(mockPost.mock.calls[0][0]).toBe(BASE);
    expect(mockSuccess).toHaveBeenCalledWith('Atividade criada. Ela aparece na Agenda da Área do Médium.');
  });

  it('chamada da gira: cria a âncora e abre a tela da chamada', async () => {
    const user = userEvent.setup();
    mockPost.mockResolvedValue({ data: { atividade_id: 'anc-1' } });
    setup();
    await user.click(await screen.findByRole('button', { name: 'Chamada de Gira de Caboclos' }));
    await waitFor(() => expect(mockPost).toHaveBeenCalledWith(`${BASE}/da-gira/g1/chamada`));
  });

  it('sem ESCALAS:edit não mostra "Chamada"; sem insert não abre confirmações da gira', async () => {
    mockGroupCan.mockImplementation((_f: string, a: string) => a === 'view');
    setup();
    await screen.findAllByTestId('agenda-item');
    expect(screen.queryByRole('button', { name: /^Chamada de/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Confirmações de Gira de Caboclos' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Confirmações de Faxina · G1' })).toBeInTheDocument();
  });
});
