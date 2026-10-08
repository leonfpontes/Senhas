/**
 * AM-27 — Aba "Trocas" de Atividades e escalas: PlanLocked sem `escalas`, PermissionDenied sem
 * `escalas:view`, aprovar com ConfirmDialog, "Escolher quem vai" no pedido sem colega, botões
 * ocultos sem `escalas:edit`; e o abono do motivo (`AbonoJustificativa`).
 */
import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';

const mockGet = jest.fn();
const mockPost = jest.fn();
const mockPut = jest.fn();
jest.mock('@/services/api_client', () => ({
  apiClient: {
    get: (...a: unknown[]) => mockGet(...a),
    post: (...a: unknown[]) => mockPost(...a),
    put: (...a: unknown[]) => mockPut(...a),
  },
  extractApiErrorMessage: (_e: unknown, fallback: string) => fallback,
}));
const mockPlanCan = jest.fn((_f: string) => true);
jest.mock('@/hooks/useSubscription', () => ({
  useSubscription: () => ({ can: mockPlanCan, subscription: { plan: 'pro' }, planLabel: 'Pro', loading: false }),
}));
const mockGroupCan = jest.fn((_f: string, _a: string) => true);
jest.mock('@/hooks/usePermissions', () => ({
  usePermissions: () => ({ can: mockGroupCan, permissions: null, loading: false, refresh: jest.fn() }),
}));
jest.mock('@/contexts/SnackbarContext', () => ({
  useSnackbar: () => ({ showSuccess: jest.fn(), showError: jest.fn() }),
}));

import { TrocasDaEscala } from '@/components/admin/atividades/TrocasDaEscala';
import { AbonoJustificativa } from '@/components/admin/presenca/AbonoJustificativa';

const URL = '/api/v1/admin/atividades/trocas';
const atividade = {
  origem: 'atividade',
  id: 'a1',
  atividade_id: 'a1',
  titulo: 'Faxina · G1',
  inicio: '2026-10-12T12:00:00Z',
  tipo: { nome: 'Faxina', icone: 'faxina', cor: null },
  cancelada: false,
};
const aceita = {
  id: 't1',
  status: 'aceito',
  aguardando: 'direcao',
  vigente: true,
  atividade,
  funcao: null,
  grupo: 'G1',
  solicitante: { id: 'm1', nome: 'Ana Paula' },
  substituto: { id: 'm2', nome: 'Beto Lima' },
  indicado_pela_direcao: false,
  recado: null,
  criada_em: '2026-10-08T12:00:00Z',
};
const semColega = { ...aceita, id: 't2', status: 'pedido', substituto: null };

beforeEach(() => {
  jest.clearAllMocks();
  mockPlanCan.mockImplementation(() => true);
  mockGroupCan.mockImplementation(() => true);
});

it('sem o plano escalas: PlanLocked e nada de busca', () => {
  mockPlanCan.mockImplementation((f) => f !== 'escalas');
  render(<TrocasDaEscala />);
  expect(mockGet).not.toHaveBeenCalled();
  expect(screen.getAllByText(/Troca de escala/).length).toBeGreaterThan(0);
});

it('sem escalas:view: PermissionDenied', () => {
  mockGroupCan.mockImplementation(() => false);
  render(<TrocasDaEscala />);
  expect(mockGet).not.toHaveBeenCalled();
  expect(screen.getByText(/não tem permissão/i)).toBeInTheDocument();
});

it('lista, conta as que esperam a direção e aprova com confirmação', async () => {
  const onContagem = jest.fn();
  mockGet.mockResolvedValue({ data: { trocas: [aceita], aguardando_direcao: 1, exige_aprovacao: true } });
  mockPost.mockResolvedValue({ data: {} });
  render(<TrocasDaEscala onContagem={onContagem} />);
  expect(await screen.findByText('Esperando a aprovação da direção.')).toBeInTheDocument();
  expect(mockGet).toHaveBeenCalledWith(URL, { params: { abertas: true } });
  expect(onContagem).toHaveBeenCalledWith(1);
  fireEvent.click(screen.getByRole('button', { name: /Aprovar/ }));
  expect(await screen.findByText(/Beto Lima vai no lugar de Ana Paula/)).toBeInTheDocument();
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Aprovar' }));
  });
  expect(mockPost).toHaveBeenCalledWith(`${URL}/t1/aprovar`, { substituto_id: null });
});

it('pedido sem colega: a direção escolhe quem vai no drawer', async () => {
  mockGet.mockImplementation((url: string) =>
    Promise.resolve(
      url.endsWith('/substitutos')
        ? { data: [{ id: 'm3', nome: 'Caio Silva' }] }
        : { data: { trocas: [semColega], aguardando_direcao: 1, exige_aprovacao: false } },
    ),
  );
  render(<TrocasDaEscala />);
  expect(await screen.findByText('A direção escolhe quem vai.')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /Escolher quem vai/ }));
  await waitFor(() => expect(mockGet).toHaveBeenCalledWith(`${URL}/t2/substitutos`));
  expect(await screen.findByText('Aprovar a troca')).toBeInTheDocument();
});

it('sem escalas:edit: só leitura, sem botões de ação', async () => {
  mockGroupCan.mockImplementation((_f, a) => a === 'view');
  mockGet.mockResolvedValue({ data: { trocas: [aceita], aguardando_direcao: 1, exige_aprovacao: true } });
  render(<TrocasDaEscala />);
  await screen.findByText('Esperando a aprovação da direção.');
  expect(screen.queryByRole('button', { name: /Aprovar|Recusar|Cancelar pedido/ })).not.toBeInTheDocument();
});

describe('AbonoJustificativa', () => {
  it('recusa o motivo e mostra o selo; sem edit só o selo', async () => {
    const onAtualizado = jest.fn();
    mockPut.mockResolvedValue({ data: { pessoas: [] } });
    const { unmount } = render(
      <AbonoJustificativa atividadeId="a1" mediumId="m1" nome="Ana" avaliacao={null} canEdit onAtualizado={onAtualizado} />,
    );
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Recusar o motivo de Ana' }));
    });
    expect(mockPut).toHaveBeenCalledWith('/api/v1/admin/atividades/a1/justificativas/m1', { avaliacao: 'recusada' });
    expect(onAtualizado).toHaveBeenCalled();
    unmount();
    render(<AbonoJustificativa atividadeId="a1" mediumId="m1" nome="Ana" avaliacao="recusada" canEdit={false} />);
    expect(screen.getByText('Motivo recusado')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
