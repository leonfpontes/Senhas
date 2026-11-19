/**
 * ChavesPixGruposCard (migração 100) — chaves PIX por grupo da corrente:
 * - lista com conta, grupos e médiuns; aviso de médium em grupos com chaves diferentes;
 * - só view: sem botões de criar/editar/excluir;
 * - criar pede a senha e envia a conta, sem grupo; 401 fica no diálogo (skipAutoLogout);
 * - "Chave de cada grupo": cada grupo escolhe entre a principal e as cadastradas (11/2026).
 */
import React from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

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
  extractApiErrorMessage: (_e: unknown, f: string) => f,
}));
const mockSuccess = jest.fn();
jest.mock('@/contexts/SnackbarContext', () => ({
  useSnackbar: () => ({ showSuccess: mockSuccess, showError: jest.fn() }),
}));

import { ChavesPixGruposCard } from '@/components/financeiro/ChavesPixGruposCard';

const COM_CHAVE = {
  chaves: [
    {
      id: 'c1',
      apelido: 'Conta Inter',
      tipo: 'email',
      chave_mascarada: 'a***@example.com',
      chave: 'alternativa@example.com',
      nome_recebedor: 'Casa de Oxala',
      cidade: 'Sao Paulo',
      instrucoes: null,
      alterado_em: '2026-10-26T12:00:00Z',
      conta_bancaria_id: 'b2',
      conta_bancaria_nome: 'Alternativa Inter',
      grupos: [{ id: 'g2', nome: 'G2', cor: 'petroleo' }],
      total_mediuns: 7,
      brcode_previa: null,
    },
  ],
  grupos: [
    { id: 'g1', nome: 'G1', cor: 'ambar', chave_id: null },
    { id: 'g2', nome: 'G2', cor: 'petroleo', chave_id: 'c1' },
  ],
  contas_bancarias: [
    { id: 'b1', nome: 'PJ Sicredi', banco: 'Sicredi' },
    { id: 'b2', nome: 'Alternativa Inter', banco: 'Inter' },
  ],
  conflitos: [{ medium_id: 'm1', medium_nome: 'Ana Paula', chave_valida: 'Conta Inter', outras: ['Conta PJ 2'] }],
};

const VAZIO = { chaves: [], grupos: COM_CHAVE.grupos.map((g) => ({ ...g, chave_id: null })), contas_bancarias: COM_CHAVE.contas_bancarias, conflitos: [] };

describe('ChavesPixGruposCard', () => {
  beforeEach(() => jest.clearAllMocks());

  it('lista a chave com conta, grupos e o aviso de conflito', async () => {
    mockGet.mockResolvedValue({ data: COM_CHAVE });
    render(<ChavesPixGruposCard canInsert canEdit canDelete />);
    const item = await screen.findByTestId('pix-chave-grupo');
    expect(item).toHaveTextContent('Conta Inter');
    expect(item).toHaveTextContent('alternativa@example.com');
    expect(item).toHaveTextContent('Cai na conta Alternativa Inter');
    expect(item).toHaveTextContent('7 médiuns');
    expect(within(item).getByText('G2')).toBeInTheDocument();
    expect(screen.getByTestId('pix-conflitos')).toHaveTextContent('Ana Paula: paga na “Conta Inter”');
    expect(screen.getByRole('button', { name: /Nova chave PIX/ })).toBeInTheDocument();
  });

  it('só visualização: sem criar, editar ou excluir', async () => {
    mockGet.mockResolvedValue({ data: COM_CHAVE });
    render(<ChavesPixGruposCard canInsert={false} canEdit={false} canDelete={false} />);
    await screen.findByTestId('pix-chave-grupo');
    expect(screen.queryByRole('button', { name: /Nova chave PIX/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Ações da chave/ })).not.toBeInTheDocument();
  });

  it('criar pede a senha; senha errada fica no diálogo', async () => {
    mockGet.mockResolvedValue({ data: VAZIO });
    mockPost.mockRejectedValueOnce({ response: { status: 401 } });
    render(<ChavesPixGruposCard canInsert canEdit canDelete />);
    fireEvent.click(await screen.findByRole('button', { name: /Nova chave PIX/ }));

    fireEvent.change(await screen.findByLabelText('Nome da chave'), { target: { value: 'Conta Inter' } });
    fireEvent.change(screen.getByLabelText('Chave PIX'), { target: { value: '12345678909' } });
    fireEvent.change(screen.getByLabelText('Nome de quem recebe'), { target: { value: 'Casa de Oxala' } });
    fireEvent.change(screen.getByLabelText('Cidade'), { target: { value: 'Sao Paulo' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar chave' }));

    const dialog = await screen.findByRole('alertdialog');
    fireEvent.change(within(dialog).getByLabelText('Sua senha'), { target: { value: 'senha-errada' } });
    await act(async () => {
      fireEvent.click(within(dialog).getByRole('button', { name: 'Salvar chave' }));
    });
    expect(await within(dialog).findByText('Senha incorreta. Confira e tente de novo.')).toBeInTheDocument();
    await waitFor(() =>
      expect(mockPost).toHaveBeenCalledWith(
        '/api/v1/admin/financeiro/config/pix/chaves',
        {
          apelido: 'Conta Inter',
          tipo: 'cpf',
          chave: '123.456.789-09',
          nome_recebedor: 'Casa de Oxala',
          cidade: 'Sao Paulo',
          instrucoes: '',
          conta_bancaria_id: null,
          grupo_ids: [],
          senha: 'senha-errada',
        },
        { skipAutoLogout: true },
      ),
    );
  });

  it('mostra a chave de cada grupo e escolhe entre as cadastradas com senha', async () => {
    mockGet.mockResolvedValue({ data: COM_CHAVE });
    mockPut.mockResolvedValue({ data: COM_CHAVE });
    render(<ChavesPixGruposCard canInsert canEdit canDelete />);
    const lista = await screen.findByTestId('pix-grupos-lista');
    expect(lista).toHaveTextContent('G1paga na Chave principal');
    expect(lista).toHaveTextContent('G2paga na Conta Inter');

    fireEvent.click(screen.getByRole('button', { name: 'Escolher a chave dos grupos' }));
    const select = await screen.findByRole('combobox', { name: 'Chave do grupo G1' });
    fireEvent.click(select);
    fireEvent.click(await screen.findByRole('option', { name: 'Conta Inter (Alternativa Inter)' }));
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveTextContent('G1: passa a pagar na Conta Inter');
    fireEvent.change(within(dialog).getByLabelText('Sua senha'), { target: { value: 'minha-senha' } });
    await act(async () => {
      fireEvent.click(within(dialog).getByRole('button', { name: 'Salvar' }));
    });
    expect(mockPut).toHaveBeenCalledWith(
      '/api/v1/admin/financeiro/config/pix/grupos',
      { grupos: [{ grupo_id: 'g1', chave_id: 'c1' }], senha: 'minha-senha' },
      { skipAutoLogout: true },
    );
  });

  it('só visualização: não escolhe a chave dos grupos', async () => {
    mockGet.mockResolvedValue({ data: COM_CHAVE });
    render(<ChavesPixGruposCard canInsert={false} canEdit={false} canDelete={false} />);
    await screen.findByTestId('pix-grupos-lista');
    expect(screen.queryByRole('button', { name: 'Escolher a chave dos grupos' })).not.toBeInTheDocument();
  });

  it('erro ao carregar mostra o aviso', async () => {
    mockGet.mockRejectedValue(new Error('x'));
    render(<ChavesPixGruposCard canInsert canEdit canDelete />);
    expect(await screen.findByText('Não foi possível carregar as chaves PIX dos grupos.')).toBeInTheDocument();
  });
});
