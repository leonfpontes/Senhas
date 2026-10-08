/**
 * AM-23 — /admin/mediuns/grupos ("Grupos da corrente"): gates (área sem PlanLocked, grupo
 * MEDIUNS), botões só com permissão, lista com cor e contagem, CrudDrawer com nome, cor,
 * descrição e médiuns ativos, arquivar com confirmação e trazer de volta.
 */
import React from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

jest.mock('next/router', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), pathname: '/admin/mediuns/grupos', query: {} }),
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
  useSubscription: () => ({ can: mockPlanCan, subscription: { plan: 'basic' }, loading: false }),
}));
const mockGroupCan = jest.fn((_f: string, _a: string) => true);
jest.mock('@/hooks/usePermissions', () => ({
  usePermissions: () => ({ can: mockGroupCan, permissions: null, loading: false, refresh: jest.fn() }),
}));
const mockSuccess = jest.fn();
jest.mock('@/contexts/SnackbarContext', () => ({
  useSnackbar: () => ({ showSuccess: mockSuccess, showError: jest.fn() }),
}));

const GRUPOS = [
  {
    id: 'g1',
    nome: 'G1',
    cor: 'ambar',
    descricao: 'Faxina no 1º sábado',
    arquivado_em: null,
    total_membros: 2,
    membros: [
      { medium_id: 'm1', nome: 'Ana Paula', desde: '2026-10-01T00:00:00Z' },
      { medium_id: 'm2', nome: 'Beto Souza', desde: '2026-10-01T00:00:00Z' },
    ],
  },
  { id: 'g2', nome: 'Ogãs', cor: 'petroleo', descricao: null, arquivado_em: null, total_membros: 0, membros: [] },
];
const ARQUIVADO = { id: 'g9', nome: 'Antigo', cor: 'grafite', descricao: null, arquivado_em: '2026-10-05T00:00:00Z', total_membros: 1, membros: [] };
const MEDIUNS = [
  { id: 'm1', nome: 'Ana Paula', is_atendimento: true },
  { id: 'm2', nome: 'Beto Souza', is_atendimento: false },
  { id: 'm3', nome: 'Caio Lima', is_atendimento: true },
];

function setup(grupos = GRUPOS) {
  mockGet.mockImplementation((url: string, config?: { params?: { incluir_arquivados?: boolean } }) => {
    if (url === '/api/v1/admin/corrente-grupos') {
      return Promise.resolve({ data: config?.params?.incluir_arquivados ? [...grupos, ARQUIVADO] : grupos });
    }
    if (url === '/api/v1/admin/mediuns/options') return Promise.resolve({ data: MEDIUNS });
    return Promise.resolve({ data: [] });
  });
  const Page = require('@/pages/admin/mediuns/grupos').default;
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

describe('Grupos da corrente — gates', () => {
  it('sem area_medium: aviso neutro, sem oferta de plano e sem chamar a API', async () => {
    mockPlanCan.mockImplementation((f: string) => f !== 'area_medium');
    setup();
    expect(await screen.findByText('A Área do Médium ainda não está disponível para este terreiro.')).toBeInTheDocument();
    expect(screen.queryByText(/plano/i)).not.toBeInTheDocument();
    expect(mockGet).not.toHaveBeenCalled();
  });

  it('sem MEDIUNS:view mostra PermissionDenied e não busca', async () => {
    mockGroupCan.mockImplementation(() => false);
    setup();
    expect(await screen.findByText('Você não tem permissão para visualizar este módulo.')).toBeInTheDocument();
    expect(mockGet).not.toHaveBeenCalled();
  });

  it('só view: lista com cor, contagem e nomes, sem botões e sem buscar médiuns', async () => {
    mockGroupCan.mockImplementation((_f: string, a: string) => a === 'view');
    setup();
    const itens = await screen.findAllByTestId('grupo-item');
    expect(itens).toHaveLength(2);
    expect(within(itens[0]).getByTestId('grupo-chip')).toHaveTextContent('G1');
    expect(within(itens[0]).getByTestId('grupo-chip')).toHaveStyle({ backgroundColor: '#b45309' });
    expect(within(itens[0]).getByText('2 médiuns')).toBeInTheDocument();
    expect(within(itens[0]).getByText('Ana Paula, Beto Souza')).toBeInTheDocument();
    expect(within(itens[1]).getByText('Ninguém no grupo ainda')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Novo grupo/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Editar/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Arquivar/ })).not.toBeInTheDocument();
    expect(mockGroupCan).toHaveBeenCalledWith('mediuns', 'view');
    expect(mockGet).not.toHaveBeenCalledWith('/api/v1/admin/mediuns/options');
  });

  it('edit sem delete: Editar aparece, Arquivar não', async () => {
    mockGroupCan.mockImplementation((_f: string, a: string) => a !== 'delete');
    setup();
    await screen.findAllByTestId('grupo-item');
    expect(screen.getByRole('button', { name: 'Editar G1' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Arquivar G1' })).not.toBeInTheDocument();
  });
});

describe('Grupos da corrente — cadastro', () => {
  it('cria com nome, cor sugerida (primeira livre), descrição e médiuns', async () => {
    const user = userEvent.setup();
    setup();
    await screen.findAllByTestId('grupo-item');
    await user.click(screen.getByRole('button', { name: /Novo grupo/ }));
    const dialog = await screen.findByRole('dialog');

    // âmbar e petróleo já estão em uso: sugere violeta.
    expect(within(dialog).getByRole('radio', { name: 'Violeta' })).toHaveAttribute('aria-checked', 'true');
    await user.click(within(dialog).getByRole('radio', { name: 'Azul' }));
    fireEvent.change(within(dialog).getByLabelText(/^Nome/), { target: { value: 'G3' } });
    fireEvent.change(within(dialog).getByLabelText(/Descrição/), { target: { value: 'Faxina no último sábado' } });

    await user.click(within(dialog).getByRole('combobox', { name: 'Médiuns do grupo' }));
    await user.click(await screen.findByText('Caio Lima'));
    await user.click(screen.getByText('Ana Paula', { selector: '[cmdk-item] span' }));

    await act(async () => {
      fireEvent.click(within(dialog).getByRole('button', { name: 'Criar grupo' }));
    });
    await waitFor(() => expect(mockPost).toHaveBeenCalled());
    expect(mockPost).toHaveBeenCalledWith('/api/v1/admin/corrente-grupos', {
      nome: 'G3',
      cor: 'azul',
      descricao: 'Faxina no último sábado',
      medium_ids: ['m3', 'm1'],
    });
    expect(mockSuccess).toHaveBeenCalledWith('Grupo criado.');
  });

  it('não cria sem nome', async () => {
    setup();
    fireEvent.click(await screen.findByRole('button', { name: /Novo grupo/ }));
    const dialog = await screen.findByRole('dialog');
    await act(async () => {
      fireEvent.click(within(dialog).getByRole('button', { name: 'Criar grupo' }));
    });
    expect(await within(dialog).findByText('Dê um nome ao grupo')).toBeInTheDocument();
    expect(mockPost).not.toHaveBeenCalled();
  });

  it('editar vem preenchido e manda o PUT com os membros', async () => {
    setup();
    fireEvent.click(await screen.findByRole('button', { name: 'Editar G1' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByDisplayValue('G1')).toBeInTheDocument();
    expect(within(dialog).getByRole('radio', { name: 'Âmbar' })).toHaveAttribute('aria-checked', 'true');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Tirar Beto Souza' }));
    await act(async () => {
      fireEvent.click(within(dialog).getByRole('button', { name: 'Salvar' }));
    });
    await waitFor(() => expect(mockPut).toHaveBeenCalled());
    expect(mockPut).toHaveBeenCalledWith('/api/v1/admin/corrente-grupos/g1', {
      nome: 'G1',
      cor: 'ambar',
      descricao: 'Faxina no 1º sábado',
      medium_ids: ['m1'],
    });
  });

  it('arquivar pede confirmação e chama o DELETE; arquivado volta com "Trazer de volta"', async () => {
    setup();
    fireEvent.click(await screen.findByRole('button', { name: 'Arquivar Ogãs' }));
    const confirm = await screen.findByRole('alertdialog');
    await act(async () => {
      fireEvent.click(within(confirm).getByRole('button', { name: 'Arquivar' }));
    });
    expect(mockDelete).toHaveBeenCalledWith('/api/v1/admin/corrente-grupos/g2');

    fireEvent.click(screen.getByRole('switch', { name: /Mostrar arquivados/ }));
    const voltar = await screen.findByRole('button', { name: 'Trazer de volta Antigo' });
    await act(async () => {
      fireEvent.click(voltar);
    });
    expect(mockPost).toHaveBeenCalledWith('/api/v1/admin/corrente-grupos/g9/desarquivar');
  });
});
