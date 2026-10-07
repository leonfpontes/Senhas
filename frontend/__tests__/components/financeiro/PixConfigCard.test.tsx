/**
 * PixConfigCard (AM-10) — chave PIX da mensalidade:
 * - só FINANCEIRO:view → chave mascarada, sem formulário nem QR;
 * - FINANCEIRO:edit → formulário com validação por tipo e prévia do QR;
 * - salvar pede a senha; o PUT vai com skipAutoLogout e senha errada (401) fica no diálogo.
 */
import React from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

const mockGet = jest.fn();
const mockPut = jest.fn();
jest.mock('@/services/api_client', () => ({
  apiClient: { get: (...a: unknown[]) => mockGet(...a), put: (...a: unknown[]) => mockPut(...a) },
  extractApiErrorMessage: (_e: unknown, f: string) => f,
}));
const mockSuccess = jest.fn();
jest.mock('@/contexts/SnackbarContext', () => ({
  useSnackbar: () => ({ showSuccess: mockSuccess, showError: jest.fn() }),
}));

import { PixConfigCard } from '@/components/financeiro/PixConfigCard';

const BRCODE =
  '00020126330014br.gov.bcb.pix0111123456789095204000053039865404100.005802BR5913CASA DE OXALA6009SAO PAULO62160512PREVIA2026106304ABCD';

const SALVA = {
  configurada: true,
  tipo: 'cpf',
  chave_mascarada: '***.456.789-**',
  chave: '12345678909',
  nome_recebedor: 'Casa de Oxalá',
  cidade: 'São Paulo',
  instrucoes: null,
  alterado_em: '2026-10-07T20:00:00Z',
  brcode_previa: BRCODE,
  valor_previa: 100,
};

const VAZIA = {
  configurada: false,
  tipo: null,
  chave_mascarada: null,
  chave: null,
  nome_recebedor: null,
  cidade: null,
  instrucoes: null,
  alterado_em: null,
  brcode_previa: null,
  valor_previa: null,
};

describe('PixConfigCard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('só visualização: mostra a chave mascarada, sem formulário nem QR', async () => {
    mockGet.mockResolvedValue({ data: { ...SALVA, chave: null, brcode_previa: null, valor_previa: null } });
    render(<PixConfigCard canEdit={false} />);
    expect(await screen.findByTestId('pix-chave-atual')).toHaveTextContent('***.456.789-**');
    expect(screen.queryByLabelText('Chave PIX')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Salvar chave PIX/ })).not.toBeInTheDocument();
    expect(screen.queryByTestId('pix-qr-previa')).not.toBeInTheDocument();
  });

  it('edição: mostra a prévia do QR da chave salva', async () => {
    mockGet.mockResolvedValue({ data: SALVA });
    render(<PixConfigCard canEdit />);
    expect(await screen.findByTestId('pix-qr-previa')).toBeInTheDocument();
    expect(screen.getByDisplayValue('123.456.789-09')).toBeInTheDocument();
    expect(screen.getByLabelText('PIX copia e cola')).toHaveTextContent(BRCODE);
    expect(screen.getByRole('button', { name: /Copiar PIX copia e cola/ })).toBeInTheDocument();
  });

  it('chave inválida não abre a confirmação', async () => {
    mockGet.mockResolvedValue({ data: VAZIA });
    render(<PixConfigCard canEdit />);
    fireEvent.change(await screen.findByLabelText('Chave PIX'), { target: { value: '123.456.789-00' } });
    fireEvent.change(screen.getByLabelText('Nome de quem recebe'), { target: { value: 'Casa' } });
    fireEvent.change(screen.getByLabelText('Cidade'), { target: { value: 'Rio' } });
    fireEvent.click(screen.getByRole('button', { name: /Salvar chave PIX/ }));
    expect(await screen.findByText('CPF inválido. Confira os números.')).toBeInTheDocument();
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('salvar pede a senha; senha errada fica no diálogo e não desloga; a certa salva', async () => {
    mockGet.mockResolvedValue({ data: VAZIA });
    mockPut
      .mockRejectedValueOnce({ response: { status: 401, data: { detail: 'Senha incorreta' } } })
      .mockResolvedValueOnce({ data: SALVA });
    render(<PixConfigCard canEdit />);

    fireEvent.change(await screen.findByLabelText('Chave PIX'), { target: { value: '12345678909' } });
    expect(screen.getByDisplayValue('123.456.789-09')).toBeInTheDocument(); // máscara do CPF
    fireEvent.change(screen.getByLabelText('Nome de quem recebe'), { target: { value: 'Casa de Oxalá' } });
    fireEvent.change(screen.getByLabelText('Cidade'), { target: { value: 'São Paulo' } });
    fireEvent.click(screen.getByRole('button', { name: /Salvar chave PIX/ }));

    const dialog = await screen.findByRole('alertdialog');
    fireEvent.change(within(dialog).getByLabelText('Sua senha'), { target: { value: 'senha-errada' } });
    await act(async () => {
      fireEvent.click(within(dialog).getByRole('button', { name: 'Salvar chave' }));
    });
    expect(await within(dialog).findByText('Senha incorreta. Confira e tente de novo.')).toBeInTheDocument();
    expect(mockPut).toHaveBeenCalledWith(
      '/api/v1/admin/financeiro/config/pix',
      {
        tipo: 'cpf',
        chave: '123.456.789-09',
        nome_recebedor: 'Casa de Oxalá',
        cidade: 'São Paulo',
        instrucoes: '',
        senha: 'senha-errada',
      },
      { skipAutoLogout: true },
    );

    fireEvent.change(within(dialog).getByLabelText('Sua senha'), { target: { value: 'senha-certa' } });
    await act(async () => {
      fireEvent.click(within(dialog).getByRole('button', { name: 'Salvar chave' }));
    });
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(mockPut).toHaveBeenLastCalledWith(
      '/api/v1/admin/financeiro/config/pix',
      expect.objectContaining({ senha: 'senha-certa' }),
      { skipAutoLogout: true },
    );
    expect(mockSuccess).toHaveBeenCalledWith('Chave PIX salva. Os administradores foram avisados por e-mail.');
    expect(screen.getByTestId('pix-qr-previa')).toBeInTheDocument();
  });
});
