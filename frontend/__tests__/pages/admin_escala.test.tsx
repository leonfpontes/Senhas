/**
 * AM-18 — /admin/atividades/[id]/escala: gates (Área, plano `escalas` com o plano mínimo, grupo
 * escalas view/edit), funções com médiuns e grupos inteiros, resumo, "Salvar escala" (tirar
 * alguém manda o PUT sem ele), "Copiar da gira anterior" com confirmação, abrir pela gira
 * (`?origem=gira` → âncora + troca de URL), só leitura sem `escalas:edit`, o "Rodízio" (drawer e a
 * ordem circular da prévia) e os botões "Escala" no cartão da gira e na Agenda da casa.
 */
import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';

const mockReplace = jest.fn(() => Promise.resolve(true));
const mockRouter: any = {
  push: jest.fn(() => Promise.resolve(true)),
  replace: mockReplace,
  pathname: '/admin/atividades/[id]/escala',
  query: { id: 'a1' },
  isReady: true,
};
jest.mock('next/router', () => ({ useRouter: () => mockRouter }));
jest.mock('next/link', () => ({ children, href, ...rest }: any) => (
  <a href={href} {...rest}>
    {children}
  </a>
));

const mockGet = jest.fn();
const mockPost = jest.fn();
const mockPut = jest.fn();
jest.mock('@/services/api_client', () => ({
  apiClient: {
    get: (...a: unknown[]) => mockGet(...a),
    post: (...a: unknown[]) => mockPost(...a),
    put: (...a: unknown[]) => mockPut(...a),
    delete: jest.fn(),
  },
  extractApiErrorMessage: (e: any, fallback: string) => e?.response?.data?.message ?? fallback,
}));
jest.mock('@/pages/admin/admin_layout', () => ({
  __esModule: true,
  default: ({ children }: any) => <div>{children}</div>,
}));
const mockPlanCan = jest.fn((_f: string) => true);
jest.mock('@/hooks/useSubscription', () => ({
  useSubscription: () => ({
    can: mockPlanCan,
    subscription: { plan: 'basic' },
    planLabel: 'Basic',
    loading: false,
  }),
}));
const mockGroupCan = jest.fn((_f: string, _a: string) => true);
jest.mock('@/hooks/usePermissions', () => ({
  usePermissions: () => ({
    can: mockGroupCan,
    permissions: null,
    loading: false,
    refresh: jest.fn(),
  }),
}));
const mockSuccess = jest.fn();
jest.mock('@/contexts/SnackbarContext', () => ({
  useSnackbar: () => ({ showSuccess: mockSuccess, showError: jest.fn() }),
}));

import { rodizio, resumoDaEscala, textoResultadoEscala, type EscalaResponse } from '@/constants/escalaGira';

const BASE = '/api/v1/admin/atividades';

function escala(over: Partial<EscalaResponse> = {}): EscalaResponse {
  return {
    atividade: {
      atividade_id: 'a1',
      origem: 'gira',
      ref_id: 'g1',
      titulo: 'Gira de Caboclos',
      inicio: '2026-11-07T23:00:00Z',
      fim: null,
      local: null,
      tipo: { id: 't-gira', nome: 'Gira', icone: 'gira', cor: null },
      convocacao_padrao: 'todos_elegiveis',
      cancelada: false,
      chamada_encerrada: false,
      pode_editar: true,
    },
    funcoes: [
      {
        id: 'f-cambone',
        nome: 'Cambone',
        descricao: null,
        arquivada: false,
        mediuns: [
          { medium_id: 'm1', nome: 'Ana Paula', origem: 'funcao', resposta: 'vou' },
          { medium_id: 'm2', nome: 'Beto Souza', origem: 'funcao', resposta: 'sem_resposta' },
        ],
        grupos: [],
      },
      {
        id: 'f-porteiro',
        nome: 'Porteiro',
        descricao: 'Recebe a assistência',
        arquivada: false,
        mediuns: [],
        grupos: [
          {
            id: 'g-1',
            nome: 'G1',
            cor: 'petroleo',
            mediuns: [{ medium_id: 'm3', nome: 'Caio Lima', origem: 'grupo', resposta: 'sem_resposta' }],
          },
        ],
      },
      { id: 'f-oga', nome: 'Ogã/Atabaque', descricao: null, arquivada: false, mediuns: [], grupos: [] },
    ],
    tirados: [{ medium_id: 'm4', nome: 'Dora Melo', funcao: 'Ogã/Atabaque' }],
    elegiveis: [
      { id: 'm1', nome: 'Ana Paula' },
      { id: 'm2', nome: 'Beto Souza' },
      { id: 'm3', nome: 'Caio Lima' },
      { id: 'm4', nome: 'Dora Melo' },
    ],
    anterior: { atividade_id: 'a0', titulo: 'Gira de Pretos Velhos', inicio: '2026-10-31T23:00:00Z' },
    total_na_escala: 3,
    ...over,
  };
}

const RESULTADO = {
  novos: 0,
  trocados: 0,
  mantidos: 2,
  tirados: 1,
  fora_da_elegibilidade_nomes: [],
  repetidos_nomes: [],
  em_outra_funcao_nomes: [],
};

function setup(dados = escala()) {
  mockGet.mockImplementation((url: string) => {
    if (url === `${BASE}/a1/escala`) return Promise.resolve({ data: dados });
    if (url.includes('corrente-grupos/opcoes'))
      return Promise.resolve({ data: [{ id: 'g-1', nome: 'G1', cor: 'petroleo', total_membros: 1 }] });
    return Promise.resolve({ data: {} });
  });
  mockPut.mockResolvedValue({ data: { ...dados, resultado: RESULTADO } });
  mockPost.mockResolvedValue({ data: { ...dados, resultado: RESULTADO } });
  const Page = require('@/pages/admin/atividades/[id]/escala').default;
  return render(<Page />);
}

async function funcaoCard(nome: string): Promise<HTMLElement> {
  await screen.findAllByTestId('escala-funcao');
  const card = screen
    .getAllByTestId('escala-funcao')
    .find((el) => within(el).queryByRole('heading', { name: nome }));
  if (!card) throw new Error(`função ${nome} não encontrada`);
  return card;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockRouter.query = { id: 'a1' };
  mockPlanCan.mockImplementation(() => true);
  mockGroupCan.mockImplementation(() => true);
});

describe('Escala — gates', () => {
  it('sem o plano escalas: PlanLocked com o plano mínimo e nada de API', async () => {
    mockPlanCan.mockImplementation((f: string) => f !== 'escalas');
    setup();
    expect(await screen.findByText('Escala de gira por função')).toBeInTheDocument();
    expect(screen.getByText('Pro')).toBeInTheDocument();
    expect(mockGet).not.toHaveBeenCalled();
  });

  it('sem a Área liberada: aviso neutro', async () => {
    mockPlanCan.mockImplementation((f: string) => f !== 'area_medium');
    setup();
    expect(await screen.findByText(/ainda não está disponível/)).toBeInTheDocument();
    expect(mockGet).not.toHaveBeenCalled();
  });

  it('sem escalas:view: PermissionDenied', async () => {
    mockGroupCan.mockImplementation(() => false);
    setup();
    expect(await screen.findByText(/não tem permissão/i)).toBeInTheDocument();
    expect(mockGet).not.toHaveBeenCalled();
  });

  it('tipo sem escala por função (409): explica e volta para Atividades', async () => {
    mockGet.mockRejectedValue({ status: 409, response: { data: { message: 'Este tipo não tem escala.' } } });
    const Page = require('@/pages/admin/atividades/[id]/escala').default;
    render(<Page />);
    expect(await screen.findByText('Sem escala por função')).toBeInTheDocument();
    expect(screen.getByText('Este tipo não tem escala.')).toBeInTheDocument();
  });
});

describe('Escala — funções e ações', () => {
  it('lista as funções com médiuns e grupos, o resumo e quem saiu', async () => {
    setup();
    const cambone = await funcaoCard('Cambone');
    expect(within(cambone).getByText('Ana Paula')).toBeInTheDocument();
    expect(within(cambone).getByText('Beto Souza')).toBeInTheDocument();
    const porteiro = await funcaoCard('Porteiro');
    expect(within(porteiro).getAllByText('G1').length).toBeGreaterThan(0);
    expect(within(porteiro).getByText('Caio Lima')).toBeInTheDocument();
    expect(screen.getByTestId('escala-resumo')).toHaveTextContent('3 médiuns na escala');
    expect(screen.getByTestId('escala-resumo')).toHaveTextContent('Cambone: Ana, Beto · Porteiro: G1 (1)');
    expect(screen.getByTestId('escala-tirados')).toHaveTextContent('Dora Melo (era Ogã/Atabaque)');
  });

  it('tirar alguém e salvar manda a escala inteira sem ele', async () => {
    setup();
    const cambone = await funcaoCard('Cambone');
    const salvar = screen.getByRole('button', { name: /Salvar escala/ });
    expect(salvar).toBeDisabled();
    fireEvent.click(within(cambone).getByRole('button', { name: 'Tirar Beto Souza' }));
    expect(salvar).toBeEnabled();
    // Com mudança por salvar, copiar e rodízio esperam.
    expect(screen.getByRole('button', { name: /Rodízio/ })).toBeDisabled();
    fireEvent.click(salvar);
    await waitFor(() =>
      expect(mockPut).toHaveBeenCalledWith(`${BASE}/a1/escala`, {
        funcoes: [
          { funcao_id: 'f-cambone', medium_ids: ['m1'], grupo_ids: [] },
          { funcao_id: 'f-porteiro', medium_ids: [], grupo_ids: ['g-1'] },
        ],
      }),
    );
    expect(mockSuccess).toHaveBeenCalledWith('1 saiu da escala.');
  });

  it('uma função por médium: quem está no Cambone não aparece para escolher no Ogã', async () => {
    setup();
    const oga = await funcaoCard('Ogã/Atabaque');
    fireEvent.click(within(oga).getByRole('combobox', { name: /Médiuns/ }));
    const lista = await screen.findByRole('listbox');
    expect(within(lista).queryByText('Ana Paula')).not.toBeInTheDocument();
    expect(within(lista).getByText('Dora Melo')).toBeInTheDocument();
  });

  it('copiar da gira anterior pede confirmação quando já há escala', async () => {
    setup();
    fireEvent.click(await screen.findByRole('button', { name: /Copiar da gira anterior/ }));
    expect(await screen.findByText(/Gira de Pretos Velhos/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Copiar' }));
    await waitFor(() => expect(mockPost).toHaveBeenCalledWith(`${BASE}/a1/escala/copiar-anterior`));
    expect(mockSuccess).toHaveBeenCalledWith(expect.stringContaining('Escala copiada'));
  });

  it('abre o rodízio num drawer', async () => {
    setup();
    fireEvent.click(await screen.findByRole('button', { name: /Rodízio/ }));
    expect(await screen.findByText(/Distribui uma função em ordem/)).toBeInTheDocument();
    expect(screen.getByText('Fazer o rodízio')).toBeInTheDocument();
  });

  it('pela gira: garante a âncora e troca a URL', async () => {
    mockRouter.query = { id: 'g1', origem: 'gira' };
    mockPost.mockResolvedValue({ data: { atividade_id: 'a1' } });
    const Page = require('@/pages/admin/atividades/[id]/escala').default;
    render(<Page />);
    await waitFor(() => expect(mockPost).toHaveBeenCalledWith(`${BASE}/da-gira/g1/escala`));
    expect(mockReplace).toHaveBeenCalledWith('/admin/atividades/a1/escala');
  });

  it('sem escalas:edit: só leitura (sem salvar, copiar nem rodízio)', async () => {
    mockGroupCan.mockImplementation((_f: string, a: string) => a === 'view');
    setup();
    expect(await screen.findByText('Ana Paula, Beto Souza')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Salvar escala/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Copiar/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Rodízio/ })).not.toBeInTheDocument();
  });

  it('gira cancelada: só leitura com aviso', async () => {
    setup(escala({ atividade: { ...escala().atividade, cancelada: true, pode_editar: false } }));
    expect(await screen.findByText(/Gira cancelada/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Salvar escala/ })).not.toBeInTheDocument();
  });
});

describe('Escala — regras de tela', () => {
  it('rodízio em ordem circular, dando a volta (espelho do servidor)', () => {
    expect(rodizio(['Ana', 'Beto', 'Caio'], 5)).toEqual([['Ana'], ['Beto'], ['Caio'], ['Ana'], ['Beto']]);
    expect(rodizio(['A', 'B', 'C', 'D', 'E'], 3, 2)).toEqual([['A', 'B'], ['C', 'D'], ['E', 'A']]);
    expect(rodizio(['A', 'B'], 2, 5)).toEqual([['A', 'B'], ['B', 'A']]);
    expect(rodizio([], 3)).toEqual([]);
  });

  it('textos do resultado e resumo vazio', () => {
    expect(textoResultadoEscala({ ...RESULTADO, tirados: 0, mantidos: 0 })).toBe('Escala salva sem mudanças.');
    expect(
      textoResultadoEscala({ ...RESULTADO, novos: 2, tirados: 0, fora_da_elegibilidade_nomes: ['Beto'] }),
    ).toBe('2 médiuns entraram na escala · fora de quem pode participar: Beto.');
    expect(resumoDaEscala(escala({ funcoes: [] }))).toBe('Ninguém escalado ainda.');
  });
});

describe('Botões "Escala"', () => {
  it('no cartão da gira: só com a Área, a presença no plano e escalas:view', () => {
    const { EscalaDaGiraButton } = require('@/components/admin/atividades/EscalaDaGiraButton');
    const { rerender } = render(<EscalaDaGiraButton giraId="g9" />);
    expect(screen.getByRole('link', { name: /Escala/ })).toHaveAttribute(
      'href',
      '/admin/atividades/g9/escala?origem=gira',
    );
    mockGroupCan.mockImplementation(() => false);
    rerender(<EscalaDaGiraButton giraId="g9" />);
    expect(screen.queryByRole('link', { name: /Escala/ })).not.toBeInTheDocument();
  });
});
