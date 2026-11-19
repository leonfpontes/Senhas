/**
 * Cadastro único das chaves PIX (migração 112) + chave de cada grupo:
 * - todas as chaves numa lista, a principal com selo; cada chave mostra QR e copia e cola;
 * - "Definir como principal" pede a senha e chama a rota da chave;
 * - a principal não pode ser excluída enquanto houver outra chave;
 * - criar pede a senha e vai sem grupo; 401 fica no diálogo (skipAutoLogout);
 * - "Chave de cada grupo" escolhe entre as cadastradas (só manda o que mudou);
 * - só view: nada de criar, editar, excluir ou escolher.
 */
import React from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

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
jest.mock('qrcode.react', () => ({ QRCodeSVG: () => <svg data-testid="pix-qr-previa" /> }));
const mockSuccess = jest.fn();
jest.mock('@/contexts/SnackbarContext', () => ({
  useSnackbar: () => ({ showSuccess: mockSuccess, showError: jest.fn() }),
}));

import { ChavesPixSection } from '@/components/financeiro/ChavesPixSection';

const base = {
  nome_recebedor: 'Casa de Oxala',
  cidade: 'Sao Paulo',
  instrucoes: null,
  alterado_em: null,
  total_mediuns: 0,
};

const DADOS = {
  valor_previa: 50,
  chaves: [
    {
      ...base,
      id: 'c0',
      apelido: 'Sicredi PJ',
      principal: true,
      tipo: 'cpf',
      chave_mascarada: '***.456.789-**',
      chave: '12345678909',
      conta_bancaria_id: 'b1',
      conta_bancaria_nome: 'PJ Sicredi',
      grupos: [],
      brcode_previa: '00020126-SICREDI',
    },
    {
      ...base,
      id: 'c1',
      apelido: 'Conta Inter',
      principal: false,
      tipo: 'email',
      chave_mascarada: 'a***@example.com',
      chave: 'alternativa@example.com',
      conta_bancaria_id: 'b2',
      conta_bancaria_nome: 'Alternativa Inter',
      grupos: [{ id: 'g2', nome: 'G2', cor: 'petroleo' }],
      total_mediuns: 7,
      brcode_previa: '00020126-INTER',
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

const VAZIO = { chaves: [], grupos: [], contas_bancarias: DADOS.contas_bancarias, conflitos: [] };

async function senhaNoDialogo(botao: string, senha = 'minha-senha') {
  const dialog = await screen.findByRole('alertdialog');
  fireEvent.change(within(dialog).getByLabelText('Sua senha'), { target: { value: senha } });
  await act(async () => {
    fireEvent.click(within(dialog).getByRole('button', { name: botao }));
  });
  return dialog;
}

describe('ChavesPixSection', () => {
  beforeEach(() => jest.clearAllMocks());

  it('lista todas as chaves numa lista só, com a principal marcada e o QR de cada uma', async () => {
    mockGet.mockResolvedValue({ data: DADOS });
    render(<ChavesPixSection canInsert canEdit canDelete />);
    const [principal, inter] = await screen.findAllByTestId('pix-chave');
    expect(principal).toHaveTextContent('Sicredi PJ');
    expect(within(principal).getByTestId('pix-chave-principal')).toHaveTextContent('Principal');
    expect(inter).toHaveTextContent('Cai na conta Alternativa Inter');
    expect(inter).toHaveTextContent('7 médiuns');
    expect(within(inter).queryByTestId('pix-chave-principal')).not.toBeInTheDocument();

    fireEvent.click(within(inter).getByRole('button', { name: 'Ver QR e copia e cola' }));
    expect(within(inter).getByLabelText('PIX copia e cola')).toHaveTextContent('00020126-INTER');
    expect(within(inter).getByTestId('pix-qr-previa')).toBeInTheDocument();
    fireEvent.click(within(principal).getByRole('button', { name: 'Ver QR e copia e cola' }));
    expect(within(principal).getByLabelText('PIX copia e cola')).toHaveTextContent('00020126-SICREDI');

    expect(screen.getByTestId('pix-conflitos')).toHaveTextContent('Ana Paula: paga na “Conta Inter”');
    const grupos = screen.getByTestId('pix-grupos-lista');
    expect(grupos).toHaveTextContent('G1paga na Sicredi PJ (principal)');
    expect(grupos).toHaveTextContent('G2paga na Conta Inter');
  });

  it('definir como principal pede a senha e chama a rota da chave', async () => {
    mockGet.mockResolvedValue({ data: DADOS });
    mockPost.mockResolvedValue({ data: DADOS });
    render(<ChavesPixSection canInsert canEdit canDelete />);
    await screen.findAllByTestId('pix-chave');
    await userEvent.click(screen.getByRole('button', { name: 'Ações da chave Conta Inter' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: /Definir como principal/ }));
    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveTextContent('Conta Inter passa a ser a chave principal');
    await senhaNoDialogo('Definir como principal');
    expect(mockPost).toHaveBeenCalledWith(
      '/api/v1/admin/financeiro/config/pix/chaves/c1/principal',
      { senha: 'minha-senha' },
      { skipAutoLogout: true },
    );
  });

  it('a principal não oferece excluir enquanto houver outra chave', async () => {
    mockGet.mockResolvedValue({ data: DADOS });
    render(<ChavesPixSection canInsert canEdit canDelete />);
    await screen.findAllByTestId('pix-chave');
    await userEvent.click(screen.getByRole('button', { name: 'Ações da chave Sicredi PJ' }));
    await screen.findByRole('menuitem', { name: 'Editar' });
    expect(screen.queryByRole('menuitem', { name: /Excluir/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: /Definir como principal/ })).not.toBeInTheDocument();
  });

  it('criar a primeira chave pede a senha, vai sem grupo e senha errada fica no diálogo', async () => {
    mockGet.mockResolvedValue({ data: VAZIO });
    mockPost.mockRejectedValueOnce({ response: { status: 401 } });
    render(<ChavesPixSection canInsert canEdit canDelete />);
    expect(await screen.findByText(/A primeira chave que você cadastrar vira a principal/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Nova chave PIX/ }));
    fireEvent.change(await screen.findByLabelText('Nome da chave'), { target: { value: 'Sicredi PJ' } });
    fireEvent.change(screen.getByLabelText('Chave PIX'), { target: { value: '12345678909' } });
    fireEvent.change(screen.getByLabelText('Nome de quem recebe'), { target: { value: 'Casa de Oxala' } });
    fireEvent.change(screen.getByLabelText('Cidade'), { target: { value: 'Sao Paulo' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar chave' }));
    const dialog = await senhaNoDialogo('Salvar chave', 'senha-errada');
    expect(await within(dialog).findByText('Senha incorreta. Confira e tente de novo.')).toBeInTheDocument();
    await waitFor(() =>
      expect(mockPost).toHaveBeenCalledWith(
        '/api/v1/admin/financeiro/config/pix/chaves',
        {
          apelido: 'Sicredi PJ',
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

  it('escolhe a chave de cada grupo entre as cadastradas, com senha', async () => {
    mockGet.mockResolvedValue({ data: DADOS });
    mockPut.mockResolvedValue({ data: DADOS });
    render(<ChavesPixSection canInsert canEdit canDelete />);
    fireEvent.click(await screen.findByRole('button', { name: 'Escolher a chave dos grupos' }));
    fireEvent.click(await screen.findByRole('combobox', { name: 'Chave do grupo G1' }));
    fireEvent.click(await screen.findByRole('option', { name: 'Conta Inter (Alternativa Inter)' }));
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveTextContent('G1: passa a pagar na Conta Inter');
    await senhaNoDialogo('Salvar');
    expect(mockPut).toHaveBeenCalledWith(
      '/api/v1/admin/financeiro/config/pix/grupos',
      { grupos: [{ grupo_id: 'g1', chave_id: 'c1' }], senha: 'minha-senha' },
      { skipAutoLogout: true },
    );
  });

  it('só visualização: sem criar, editar, excluir ou escolher', async () => {
    mockGet.mockResolvedValue({ data: DADOS });
    render(<ChavesPixSection canInsert={false} canEdit={false} canDelete={false} />);
    await screen.findAllByTestId('pix-chave');
    expect(screen.queryByRole('button', { name: /Nova chave PIX/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Ações da chave/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Escolher a chave dos grupos' })).not.toBeInTheDocument();
  });

  it('erro ao carregar mostra o aviso', async () => {
    mockGet.mockRejectedValue(new Error('x'));
    render(<ChavesPixSection canInsert canEdit canDelete />);
    expect(await screen.findByText('Não foi possível carregar as chaves PIX.')).toBeInTheDocument();
  });
});
