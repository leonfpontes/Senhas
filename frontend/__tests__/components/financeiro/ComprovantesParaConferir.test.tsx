/**
 * AM-12 — painel: fila "Comprovantes para conferir", conferência (confirmar = POST de registro
 * com PAGO; não confirmar = PATCH .../recusa com motivo), guards por grupo (botões ocultos) e,
 * no `CobrancaMensal`, o filtro/selo "Comprovante enviado" só quando a tela liga a conferência.
 */
import React from 'react';
import { act, fireEvent, render, screen, within } from '@testing-library/react';

const mockGet = jest.fn();
const mockPost = jest.fn();
const mockPatch = jest.fn();
jest.mock('@/services/api_client', () => ({
  apiClient: {
    get: (...a: unknown[]) => mockGet(...a),
    post: (...a: unknown[]) => mockPost(...a),
    patch: (...a: unknown[]) => mockPatch(...a),
  },
  extractApiErrorMessage: (_e: unknown, f: string) => f,
}));
const mockSuccess = jest.fn();
jest.mock('@/contexts/SnackbarContext', () => ({
  useSnackbar: () => ({ showSuccess: mockSuccess, showError: jest.fn(), showInfo: jest.fn() }),
}));

import {
  ComprovantesParaConferir,
  ConferirComprovanteSheet,
  type ComprovanteAlvo,
} from '@/components/financeiro/ComprovantesParaConferir';
import { CobrancaMensal, type CobrancaItem } from '@/components/financeiro/CobrancaMensal';

const ALVO: ComprovanteAlvo = {
  mediun_id: 'm1',
  mediun_nome: 'Elaine Souza',
  mes: '2026-10',
  valor: 50,
  comprovante_enviado_em: '2026-10-08T17:05:00Z',
  comprovante_filename: 'comprovante.jpg',
  comprovante_mime: 'image/jpeg',
};

beforeEach(() => {
  jest.clearAllMocks();
  (URL as any).createObjectURL = jest.fn(() => 'blob:comprovante');
  (URL as any).revokeObjectURL = jest.fn();
  mockGet.mockImplementation((url: string) =>
    url.endsWith('/comprovante')
      ? Promise.resolve({ data: new Blob(['x'], { type: 'image/jpeg' }) })
      : Promise.resolve({ data: [ALVO] }),
  );
  mockPost.mockResolvedValue({ data: { status: 'PAGO' } });
  mockPatch.mockResolvedValue({ data: {} });
});

describe('fila', () => {
  it('mostra o KPI e a lista; "Conferir" abre a conferência', async () => {
    const onConferir = jest.fn();
    render(<ComprovantesParaConferir enabled onConferir={onConferir} />);
    const fila = await screen.findByTestId('comprovantes-conferir');
    expect(await within(fila).findByText('Elaine Souza')).toBeInTheDocument();
    expect(within(fila).getByText('Comprovantes para conferir')).toBeInTheDocument();
    expect(within(fila).getByText('1')).toBeInTheDocument();
    expect(mockGet).toHaveBeenCalledWith(
      '/api/v1/admin/financeiro/mensalidades/comprovantes-para-conferir',
    );
    fireEvent.click(
      within(fila).getByRole('button', { name: 'Conferir comprovante de Elaine Souza' }),
    );
    expect(onConferir).toHaveBeenCalledWith(ALVO);
  });

  it('desligada (sem a Área no plano ou sem FINANCEIRO:view): não renderiza nem chama a API', () => {
    const { container } = render(
      <ComprovantesParaConferir enabled={false} onConferir={jest.fn()} />,
    );
    expect(container).toBeEmptyDOMElement();
    expect(mockGet).not.toHaveBeenCalled();
  });
});

describe('conferência', () => {
  it('confirmar = POST de registro com PAGO, valor e a data do envio', async () => {
    const onDone = jest.fn();
    const onClose = jest.fn();
    render(
      <ConferirComprovanteSheet alvo={ALVO} onClose={onClose} canInsert canEdit onDone={onDone} />,
    );
    const sheet = await screen.findByTestId('sheet-conferir-comprovante');
    expect(
      await within(sheet).findByRole('img', { name: /Comprovante enviado por Elaine Souza/ }),
    ).toHaveAttribute('src', 'blob:comprovante');
    expect(mockGet).toHaveBeenCalledWith(
      '/api/v1/admin/financeiro/mensalidades/m1/2026-10/comprovante',
      {
        responseType: 'blob',
      },
    );
    await act(async () => {
      fireEvent.click(within(sheet).getByRole('button', { name: /Confirmar pagamento/ }));
    });
    const [url, form] = mockPost.mock.calls[0];
    expect(url).toBe('/api/v1/admin/financeiro/mensalidades/m1/2026-10');
    expect((form as FormData).get('status')).toBe('PAGO');
    expect((form as FormData).get('valor_pago')).toBe('50');
    expect((form as FormData).get('data_pagamento')).toBe('2026-10-08');
    expect((form as FormData).has('observacao')).toBe(false);
    expect(onDone).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it('não confirmar: motivo rápido ou texto → PATCH .../recusa', async () => {
    render(
      <ConferirComprovanteSheet
        alvo={ALVO}
        onClose={jest.fn()}
        canInsert
        canEdit
        onDone={jest.fn()}
      />,
    );
    const sheet = await screen.findByTestId('sheet-conferir-comprovante');
    fireEvent.click(within(sheet).getByRole('button', { name: /Não confirmar/ }));
    const avisar = within(sheet).getByRole('button', { name: 'Avisar o médium' });
    expect(avisar).toBeDisabled();
    fireEvent.click(
      within(sheet).getByRole('button', { name: 'O valor é diferente da mensalidade.' }),
    );
    expect(within(sheet).getByRole('textbox')).toHaveValue('O valor é diferente da mensalidade.');
    fireEvent.change(within(sheet).getByRole('textbox'), {
      target: { value: 'O comprovante mostra R$ 40,00.' },
    });
    await act(async () => {
      fireEvent.click(avisar);
    });
    expect(mockPatch).toHaveBeenCalledWith(
      '/api/v1/admin/financeiro/mensalidades/m1/2026-10/recusa',
      {
        motivo: 'O comprovante mostra R$ 40,00.',
      },
    );
    expect(mockSuccess).toHaveBeenCalledWith(expect.stringContaining('Elaine vai ver o motivo'));
  });

  it('sem FINANCEIRO:insert some "Confirmar"; sem edit some "Não confirmar"', async () => {
    const { unmount } = render(
      <ConferirComprovanteSheet
        alvo={ALVO}
        onClose={jest.fn()}
        canInsert={false}
        canEdit
        onDone={jest.fn()}
      />,
    );
    let sheet = await screen.findByTestId('sheet-conferir-comprovante');
    expect(
      within(sheet).queryByRole('button', { name: /Confirmar pagamento/ }),
    ).not.toBeInTheDocument();
    expect(within(sheet).getByRole('button', { name: /Não confirmar/ })).toBeInTheDocument();
    unmount();
    render(
      <ConferirComprovanteSheet
        alvo={ALVO}
        onClose={jest.fn()}
        canInsert
        canEdit={false}
        onDone={jest.fn()}
      />,
    );
    sheet = await screen.findByTestId('sheet-conferir-comprovante');
    expect(within(sheet).getByRole('button', { name: /Confirmar pagamento/ })).toBeInTheDocument();
    expect(within(sheet).queryByRole('button', { name: /Não confirmar/ })).not.toBeInTheDocument();
  });

  it('PDF vira link para abrir', async () => {
    mockGet.mockResolvedValue({ data: new Blob(['%PDF'], { type: 'application/pdf' }) });
    render(
      <ConferirComprovanteSheet
        alvo={{ ...ALVO, comprovante_mime: 'application/pdf' }}
        onClose={jest.fn()}
        canInsert
        canEdit
        onDone={jest.fn()}
      />,
    );
    expect(await screen.findByRole('link', { name: /Abrir o PDF do comprovante/ })).toHaveAttribute(
      'href',
      'blob:comprovante',
    );
  });
});

describe('CobrancaMensal com conferência', () => {
  const ITEMS: CobrancaItem[] = [
    {
      id: 'm1',
      nome: 'Elaine Souza',
      status: 'PENDENTE',
      data_pagamento: null,
      valor_vigente: 50,
      valor_pago: null,
      comprovante_filename: 'comprovante.jpg',
      observacao: null,
      comprovanteParaConferir: true,
    },
    {
      id: 'm2',
      nome: 'Gisele Lima',
      status: null,
      data_pagamento: null,
      valor_vigente: null,
      valor_pago: null,
      comprovante_filename: null,
      observacao: null,
    },
  ];
  const base = {
    mes: '2026-10',
    items: ITEMS,
    diaVencimento: 10,
    valorPadrao: 50,
    canEdit: false,
    entidade: 'médium',
    onRegistrar: jest.fn(),
  };

  it('sem onConferir (casa sem a Área): sem selo nem botão — a tela fica como antes', () => {
    render(<CobrancaMensal {...base} />);
    expect(screen.queryByText('Comprovante enviado')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Conferir/ })).not.toBeInTheDocument();
  });

  it('com onConferir: selo, botão "Conferir" e filtro "Comprovante enviado"', async () => {
    const onConferir = jest.fn();
    render(<CobrancaMensal {...base} onConferir={onConferir} />);
    expect(screen.getAllByText('Comprovante enviado').length).toBeGreaterThan(0);
    fireEvent.click(screen.getAllByRole('button', { name: /Conferir/ })[0]);
    expect(onConferir).toHaveBeenCalledWith(expect.objectContaining({ id: 'm1' }));

    fireEvent.click(screen.getByRole('combobox', { name: 'Filtrar por status' }));
    fireEvent.click(await screen.findByRole('option', { name: 'Comprovante enviado' }));
    expect(screen.queryAllByText('Gisele Lima')).toHaveLength(0);
    expect(screen.getAllByText('Elaine Souza').length).toBeGreaterThan(0);
  });
});
