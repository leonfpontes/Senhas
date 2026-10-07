/**
 * AreaMediumConfigSection (AM-10) — aba "Área do Médium" de /admin/config:
 * carrega a config, salva só com CONFIGURACOES:edit (sem ele: só leitura, sem botão),
 * WhatsApp vai sem máscara e o aviso de plano aparece quando a mensalidade não está no plano.
 */
import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';

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

import { AreaMediumConfigSection } from '@/components/admin/AreaMediumConfigSection';

const CONFIG = {
  ativa: true,
  boas_vindas: null,
  whatsapp: '5511987654321',
  modulos: { agenda: true, avisos: true, mensalidade: true },
  mensalidade_no_plano: true,
};

describe('AreaMediumConfigSection', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGet.mockResolvedValue({ data: CONFIG });
    mockPut.mockImplementation((_url: string, body: Record<string, unknown>) =>
      Promise.resolve({ data: { ...CONFIG, ...body, whatsapp: body.whatsapp ? `55${body.whatsapp}` : null } }),
    );
  });

  it('carrega e salva a configuração (WhatsApp só com dígitos)', async () => {
    render(<AreaMediumConfigSection canEdit />);
    expect(await screen.findByDisplayValue('(11) 98765-4321')).toBeInTheDocument();
    expect(mockGet).toHaveBeenCalledWith('/api/v1/admin/config/area-medium');

    const salvar = screen.getByRole('button', { name: /Salvar Área do Médium/ });
    expect(salvar).toBeDisabled(); // nada mudou

    fireEvent.change(screen.getByLabelText('Mensagem de boas-vindas'), { target: { value: 'Axé, corrente!' } });
    fireEvent.click(screen.getByRole('switch', { name: 'Avisos' }));
    fireEvent.click(screen.getByRole('switch', { name: 'Área do Médium ligada' }));
    await act(async () => {
      fireEvent.click(salvar);
    });

    await waitFor(() => expect(mockPut).toHaveBeenCalled());
    expect(mockPut).toHaveBeenCalledWith('/api/v1/admin/config/area-medium', {
      ativa: false,
      boas_vindas: 'Axé, corrente!',
      whatsapp: '11987654321',
      modulos: { agenda: true, avisos: false, mensalidade: true },
    });
    expect(mockSuccess).toHaveBeenCalledWith('Área do Médium salva.');
  });

  it('sem CONFIGURACOES:edit: campos só leitura e sem botão de salvar', async () => {
    render(<AreaMediumConfigSection canEdit={false} />);
    await screen.findByDisplayValue('(11) 98765-4321');
    expect(screen.queryByRole('button', { name: /Salvar Área do Médium/ })).not.toBeInTheDocument();
    expect(screen.getByRole('switch', { name: 'Área do Médium ligada' })).toBeDisabled();
    expect(screen.getByLabelText('WhatsApp da casa')).toBeDisabled();
  });

  it('avisa quando a mensalidade não está no plano', async () => {
    mockGet.mockResolvedValue({ data: { ...CONFIG, mensalidade_no_plano: false } });
    render(<AreaMediumConfigSection canEdit />);
    expect(await screen.findByText(/não inclui a mensalidade dos médiuns/)).toBeInTheDocument();
  });

  it('WhatsApp incompleto bloqueia o salvar', async () => {
    render(<AreaMediumConfigSection canEdit />);
    const campo = await screen.findByLabelText('WhatsApp da casa');
    fireEvent.change(campo, { target: { value: '1198' } });
    expect(await screen.findByText(/Número com DDD/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Salvar Área do Médium/ })).toBeDisabled();
  });
});
