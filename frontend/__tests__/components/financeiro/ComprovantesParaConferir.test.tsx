/**
 * AM-12 + pagamento parcial (092) — painel: fila "Comprovantes para conferir" (um item por
 * comprovante), conferência por comprovante ("Conferir" com o valor que entrou + atalho "Valor
 * total"; "Não confirmar" com motivo), histórico do mês, guards por grupo (botões ocultos sem
 * FINANCEIRO:edit) e, no `CobrancaMensal`, o selo/filtro "Comprovante enviado" e o parcial.
 */
import React from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

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
  type ComprovanteNaFila,
  type HistoricoMes,
} from '@/components/financeiro/ComprovantesParaConferir';
import { CobrancaMensal, type CobrancaItem } from '@/components/financeiro/CobrancaMensal';

const BASE = '/api/v1/admin/financeiro/mensalidades';

const NA_FILA: ComprovanteNaFila = {
  comprovante_id: 'c2',
  pagamento_id: 'p1',
  mediun_id: 'm1',
  mediun_nome: 'Elaine Souza',
  mes: '2026-10',
  valor: 50,
  valor_recebido: 30,
  falta: 20,
  valor_informado: null,
  mes_status: 'PENDENTE',
  comprovante_enviado_em: '2026-10-08T17:05:00Z',
  comprovante_filename: 'comprovante.jpg',
  comprovante_mime: 'image/jpeg',
};

const ALVO: ComprovanteAlvo = {
  mediun_id: 'm1',
  mediun_nome: 'Elaine Souza',
  mes: '2026-10',
  valor: 50,
  comprovante_id: 'c2',
};

const HISTORICO: HistoricoMes = {
  mediun_id: 'm1',
  mediun_nome: 'Elaine Souza',
  mes: '2026-10',
  pagamento_id: 'p1',
  status: 'PENDENTE',
  valor_mensalidade: 50,
  valor_recebido: 30,
  recebido_automatico: 0,
  falta: 20,
  pago_a_mais: 0,
  valor_pago: null,
  comprovantes: [
    {
      id: 'c1',
      origem: 'medium',
      enviado_em: '2026-10-05T13:00:00Z',
      arquivo_filename: 'primeiro.jpg',
      arquivo_mime: 'image/jpeg',
      arquivo_tamanho: 100,
      valor_informado: 30,
      status: 'conferido',
      valor_conferido: 30,
      conferido_em: '2026-10-05T15:00:00Z',
      motivo: null,
    },
    {
      id: 'c2',
      origem: 'medium',
      enviado_em: '2026-10-08T17:05:00Z',
      arquivo_filename: 'comprovante.jpg',
      arquivo_mime: 'image/jpeg',
      arquivo_tamanho: 100,
      valor_informado: 15,
      status: 'em_conferencia',
      valor_conferido: null,
      conferido_em: null,
      motivo: null,
    },
  ],
};

let historico: HistoricoMes = HISTORICO;

beforeEach(() => {
  jest.clearAllMocks();
  historico = HISTORICO;
  (URL as any).createObjectURL = jest.fn(() => 'blob:comprovante');
  (URL as any).revokeObjectURL = jest.fn();
  mockGet.mockImplementation((url: string) => {
    if (url.endsWith('/arquivo')) {
      return Promise.resolve({ data: new Blob(['x'], { type: 'image/jpeg' }) });
    }
    if (url.endsWith('/comprovantes')) return Promise.resolve({ data: historico });
    return Promise.resolve({ data: [NA_FILA] });
  });
  mockPatch.mockResolvedValue({ data: { ...HISTORICO, status: 'PAGO', falta: 0, valor_recebido: 50 } });
});

describe('fila', () => {
  it('um item por comprovante, com o que falta; "Conferir" abre aquele comprovante', async () => {
    const onConferir = jest.fn();
    render(<ComprovantesParaConferir enabled onConferir={onConferir} />);
    const fila = await screen.findByTestId('comprovantes-conferir');
    expect(await within(fila).findByText('Elaine Souza')).toBeInTheDocument();
    expect(within(fila).getByText('Comprovantes para conferir')).toBeInTheDocument();
    expect(within(fila).getByText('1')).toBeInTheDocument();
    expect(within(fila).getByText('Pagamento parcial')).toBeInTheDocument();
    expect(within(fila).getByText(/falta R\$\s?20,00 de R\$\s?50,00/)).toBeInTheDocument();
    expect(mockGet).toHaveBeenCalledWith(`${BASE}/comprovantes-para-conferir`);
    fireEvent.click(within(fila).getByRole('button', { name: 'Conferir comprovante de Elaine Souza' }));
    expect(onConferir).toHaveBeenCalledWith(ALVO);
  });

  it('desligada (sem a Área no plano ou sem FINANCEIRO:view): não renderiza nem chama a API', () => {
    const { container } = render(<ComprovantesParaConferir enabled={false} onConferir={jest.fn()} />);
    expect(container).toBeEmptyDOMElement();
    expect(mockGet).not.toHaveBeenCalled();
  });
});

describe('conferência', () => {
  it('mostra o saldo do mês, o histórico e o comprovante escolhido', async () => {
    render(<ConferirComprovanteSheet alvo={ALVO} onClose={jest.fn()} canEdit onDone={jest.fn()} />);
    const sheet = await screen.findByTestId('sheet-conferir-comprovante');
    const saldo = await within(sheet).findByTestId('saldo-do-mes');
    expect(saldo).toHaveTextContent(/Mensalidade\s*R\$\s?50,00/);
    expect(saldo).toHaveTextContent(/Recebido\s*R\$\s?30,00/);
    expect(saldo).toHaveTextContent(/Falta\s*R\$\s?20,00/);
    expect(mockGet).toHaveBeenCalledWith(`${BASE}/m1/2026-10/comprovantes`);
    expect(
      await within(sheet).findByRole('img', { name: /Comprovante enviado por Elaine Souza/ }),
    ).toHaveAttribute('src', 'blob:comprovante');
    expect(mockGet).toHaveBeenCalledWith(`${BASE}/comprovantes/c2/arquivo`, { responseType: 'blob' });
    const hist = within(sheet).getByTestId('historico-comprovantes');
    const itens = within(hist).getAllByRole('button');
    expect(itens[0]).toHaveTextContent(/Conferido R\$\s?30,00/);
    expect(itens[1]).toHaveTextContent('Em conferência');
    expect(itens[1]).toHaveAttribute('aria-current', 'true');
    // Tocar num comprovante do histórico abre o arquivo dele.
    fireEvent.click(itens[0]);
    await waitFor(() =>
      expect(mockGet).toHaveBeenCalledWith(`${BASE}/comprovantes/c1/arquivo`, { responseType: 'blob' }),
    );
    expect(within(sheet).getByText('Este comprovante já foi conferido.')).toBeInTheDocument();
  });

  it('"Recebi só uma parte": o valor vem do informado, "Valor total" usa o que falta, PATCH conferir', async () => {
    mockPatch.mockResolvedValue({ data: { ...HISTORICO, valor_recebido: 45, falta: 5 } });
    const onDone = jest.fn();
    const onClose = jest.fn();
    render(<ConferirComprovanteSheet alvo={ALVO} onClose={onClose} canEdit onDone={onDone} />);
    const sheet = await screen.findByTestId('sheet-conferir-comprovante');
    const campo = (await within(sheet).findByLabelText('Quanto entrou na conta da casa')) as HTMLInputElement;
    expect(campo.value).toMatch(/15,00/);
    await act(async () => {
      fireEvent.click(within(sheet).getByRole('button', { name: /Conferir R\$\s?15,00/ }));
    });
    expect(mockPatch).toHaveBeenCalledWith(`${BASE}/comprovantes/c2/conferir`, { valor: 15 });
    expect(mockSuccess).toHaveBeenCalledWith(expect.stringMatching(/Elaine ainda deve R\$\s?5,00/));
    expect(onDone).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it('atalho "Valor total" e o mês que fecha', async () => {
    render(<ConferirComprovanteSheet alvo={ALVO} onClose={jest.fn()} canEdit onDone={jest.fn()} />);
    const sheet = await screen.findByTestId('sheet-conferir-comprovante');
    fireEvent.click(await within(sheet).findByRole('button', { name: /Valor total \(R\$\s?20,00\)/ }));
    await act(async () => {
      fireEvent.click(within(sheet).getByRole('button', { name: /Conferir R\$\s?20,00/ }));
    });
    expect(mockPatch).toHaveBeenCalledWith(`${BASE}/comprovantes/c2/conferir`, { valor: 20 });
    expect(mockSuccess).toHaveBeenCalledWith(expect.stringContaining('Mensalidade de Elaine paga'));
  });

  it('sem valor informado, já vem o que falta', async () => {
    historico = {
      ...HISTORICO,
      comprovantes: [{ ...HISTORICO.comprovantes[1], valor_informado: null }],
    };
    render(<ConferirComprovanteSheet alvo={ALVO} onClose={jest.fn()} canEdit onDone={jest.fn()} />);
    const sheet = await screen.findByTestId('sheet-conferir-comprovante');
    const campo = (await within(sheet).findByLabelText('Quanto entrou na conta da casa')) as HTMLInputElement;
    expect(campo.value).toMatch(/20,00/);
  });

  it('não confirmar: motivo rápido ou texto → PATCH .../nao-confirmar', async () => {
    render(<ConferirComprovanteSheet alvo={ALVO} onClose={jest.fn()} canEdit onDone={jest.fn()} />);
    const sheet = await screen.findByTestId('sheet-conferir-comprovante');
    fireEvent.click(await within(sheet).findByRole('button', { name: /Não confirmar/ }));
    const avisar = within(sheet).getByRole('button', { name: 'Avisar o médium' });
    expect(avisar).toBeDisabled();
    fireEvent.click(within(sheet).getByRole('button', { name: 'Não dá para ler o comprovante.' }));
    expect(within(sheet).getByRole('textbox')).toHaveValue('Não dá para ler o comprovante.');
    fireEvent.change(within(sheet).getByRole('textbox'), {
      target: { value: 'O comprovante está cortado.' },
    });
    await act(async () => {
      fireEvent.click(avisar);
    });
    expect(mockPatch).toHaveBeenCalledWith(`${BASE}/comprovantes/c2/nao-confirmar`, {
      motivo: 'O comprovante está cortado.',
    });
    expect(mockSuccess).toHaveBeenCalledWith(expect.stringContaining('Elaine vai ver o motivo'));
  });

  it('sem FINANCEIRO:edit: vê o mês e o histórico, sem "Conferir" nem "Não confirmar"', async () => {
    render(
      <ConferirComprovanteSheet alvo={ALVO} onClose={jest.fn()} canEdit={false} onDone={jest.fn()} />,
    );
    const sheet = await screen.findByTestId('sheet-conferir-comprovante');
    await within(sheet).findByTestId('historico-comprovantes');
    expect(within(sheet).queryByRole('button', { name: /Conferir R\$/ })).not.toBeInTheDocument();
    expect(within(sheet).queryByRole('button', { name: /Não confirmar/ })).not.toBeInTheDocument();
    expect(within(sheet).queryByLabelText('Quanto entrou na conta da casa')).not.toBeInTheDocument();
  });

  it('pago a mais aparece no saldo', async () => {
    historico = { ...HISTORICO, status: 'PAGO', valor_recebido: 60, falta: 0, pago_a_mais: 10 };
    render(<ConferirComprovanteSheet alvo={ALVO} onClose={jest.fn()} canEdit onDone={jest.fn()} />);
    const saldo = await screen.findByTestId('saldo-do-mes');
    expect(saldo).toHaveTextContent(/Pago a mais\s*R\$\s?10,00/);
  });

  it('PDF vira link para abrir', async () => {
    mockGet.mockImplementation((url: string) =>
      url.endsWith('/arquivo')
        ? Promise.resolve({ data: new Blob(['%PDF'], { type: 'application/pdf' }) })
        : Promise.resolve({ data: HISTORICO }),
    );
    render(<ConferirComprovanteSheet alvo={ALVO} onClose={jest.fn()} canEdit onDone={jest.fn()} />);
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
      valorRecebido: 30,
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
    {
      id: 'm3',
      nome: 'Iara Melo',
      status: 'PAGO',
      data_pagamento: '2026-10-05',
      valor_vigente: 50,
      valor_pago: 60,
      comprovante_filename: null,
      observacao: null,
      pagoAMais: 10,
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

  it('pago em parte mostra o recebido e o que falta; pago a mais aparece no pago', () => {
    render(<CobrancaMensal {...base} />);
    const parcial = screen.getAllByTestId('pagamento-parcial')[0];
    expect(parcial).toHaveTextContent(/R\$\s?30,00/);
    expect(parcial).toHaveTextContent(/falta R\$\s?20,00/);
    expect(screen.getAllByTestId('pago-a-mais')[0]).toHaveTextContent(/pago a mais R\$\s?10,00/);
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
