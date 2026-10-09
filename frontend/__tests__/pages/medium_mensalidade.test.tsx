/**
 * AM-11/AM-12 — /medium/mensalidade: estados do mês (em aberto, aguardando a casa, não
 * confirmado, paga, isento, sem chave PIX), "Pagar com PIX" (copiar com e sem clipboard, QR,
 * chave), "Enviar comprovante" (validação de tipo/tamanho e envio), aviso neutro no 403,
 * `?pagar=1` do Início e a aba "Mensalidade" que some com o módulo desligado.
 */
import React from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

const mockRouter: any = {
  pathname: '/medium/mensalidade',
  asPath: '/medium/mensalidade',
  query: {},
  isReady: true,
  push: jest.fn(() => Promise.resolve(true)),
  replace: jest.fn(() => Promise.resolve(true)),
  events: { on: jest.fn(), off: jest.fn() },
};
jest.mock('next/router', () => ({ useRouter: () => mockRouter }));
jest.mock('next/compat/router', () => ({ useRouter: () => mockRouter }));
jest.mock('next/head', () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
jest.mock('next/link', () => {
  const MockLink = React.forwardRef(({ children, href, ...rest }: any, ref: any) => (
    <a href={typeof href === 'string' ? href : href?.pathname} ref={ref} {...rest}>
      {children}
    </a>
  ));
  MockLink.displayName = 'MockLink';
  return MockLink;
});
jest.mock('next/font/google', () => ({
  Fraunces: () => ({ variable: 'font-fraunces', className: 'font-fraunces' }),
}));
jest.mock('@/services/analytics', () => ({ trackEvent: jest.fn() }));
const mockSuccess = jest.fn();
jest.mock('@/contexts/SnackbarContext', () => ({
  useSnackbar: () => ({ showSuccess: mockSuccess, showError: jest.fn() }),
}));

let routes: Record<string, unknown> = {};
const mockGet = jest.fn((url: string) => {
  if (url === '/api/v1/auth/profile') return Promise.resolve({ data: PROFILE });
  const hit = Object.entries(routes).find(([k]) => url === k);
  if (!hit) return Promise.resolve({ data: {} });
  const v = hit[1] as { status?: number };
  if (v?.status) return Promise.reject(v);
  return Promise.resolve({ data: v });
});
const mockPost = jest.fn();
jest.mock('@/services/api_client', () => ({
  apiClient: {
    get: (...a: unknown[]) => (mockGet as any)(...a),
    post: (...a: unknown[]) => mockPost(...a),
  },
  extractApiErrorMessage: (e: any, f: string) => e?.response?.data?.message || f,
  endImpersonation: jest.fn(),
}));

import { ProfileProvider } from '@/hooks/useProfile';
import { MediumProvider } from '@/components/medium/MediumProvider';
import { INSTALL_AREA_SEEN_KEY } from '@/components/medium/InstallAreaSheet';
import MensalidadePage from '@/pages/medium/mensalidade';

const PROFILE = {
  id: 'u1',
  email: 'ana@exemplo.com',
  username: 'ana',
  full_name: 'Ana Paula Ribeiro',
  tenant_name: 'Tenda Luz da Mata',
  role: 'medium',
  areas: { admin: false, medium: { medium_id: 'm1', nome: 'Ana Paula Ribeiro' } },
};

const ME = {
  nome: 'Ana Paula Ribeiro',
  foto_url: null,
  terreiro: { id: 't1', nome: 'Tenda Luz da Mata', slug: 'luz' },
  marca: { logo_url: null, primary_color: '#2f6b4f', secondary_color: '#e9b04a', font_color: null },
  areas: PROFILE.areas,
  modulos: ['agenda', 'avisos', 'mensalidade'],
  whatsapp_casa: '5511999998888',
};

const PIX_CASA = {
  tipo: 'cpf',
  chave: '12345678909',
  nome_recebedor: 'Casa de Oxala',
  chave_alterada_em: null,
};

const mes = (over: Record<string, unknown> = {}) => ({
  mes: '2026-10',
  status: 'pendente',
  valor: 50,
  vencimento: '2026-10-10',
  data_pagamento: null,
  comprovante_enviado_em: null,
  recusa_motivo: null,
  recusado_em: null,
  atual: true,
  ...over,
});

const lista = (meses: unknown[], over: Record<string, unknown> = {}) => ({
  hoje: '2026-10-08',
  isento: false,
  valor_mensal: 50,
  dia_vencimento: 10,
  pix: PIX_CASA,
  meses,
  ...over,
});

const COPIA_E_COLA =
  '00020126580014br.gov.bcb.pix0111123456789090219Mensalidade 10/2026520400005303986540550.005802BR5913CASA DE OXALA6009SAO PAULO62240520MENS2026100A1B2C3D4E6304ABCD';
const PIX_MES = {
  mes: '2026-10',
  valor: 50,
  copia_e_cola: COPIA_E_COLA,
  txid: 'MENS2026100A1B2C3D4E',
  tipo: 'cpf',
  chave: '12345678909',
  nome_recebedor: 'Casa de Oxala',
  cidade: 'Sao Paulo',
  instrucoes: null,
  chave_alterada_em: null,
};

function montar(listaResp: unknown, extra: Record<string, unknown> = {}, me: unknown = ME) {
  routes = {
    '/api/v1/medium/me': me,
    '/api/v1/medium/mensalidades': listaResp,
    '/api/v1/medium/mensalidades/2026-10/pix': PIX_MES,
    ...extra,
  };
  return render(
    <ProfileProvider>
      <MediumProvider>
        <MensalidadePage />
      </MediumProvider>
    </ProfileProvider>,
  );
}

const calledUrls = () => mockGet.mock.calls.map((c) => String(c[0]));

beforeEach(() => {
  jest.clearAllMocks();
  localStorage.clear();
  localStorage.setItem(INSTALL_AREA_SEEN_KEY, '1');
  localStorage.setItem('user', JSON.stringify(PROFILE));
  document.cookie = 'auth_state=1';
  mockRouter.query = {};
  window.scrollTo = jest.fn() as unknown as typeof window.scrollTo;
});

describe('cartão do mês', () => {
  it('em aberto: valor, vencimento, "Pagar com PIX" e histórico — só chama a API da Área', async () => {
    montar(
      lista([
        mes(),
        mes({ mes: '2026-09', status: 'atrasada', vencimento: '2026-09-10', atual: false }),
        mes({
          mes: '2026-08',
          status: 'paga',
          data_pagamento: '2026-08-09T15:00:00Z',
          atual: false,
        }),
      ]),
    );
    const cartao = await screen.findByTestId('cartao-mensalidade');
    expect(within(cartao).getByText('outubro de 2026')).toBeInTheDocument();
    expect(within(cartao).getByText('Em aberto')).toBeInTheDocument();
    expect(within(cartao).getByTestId('valor-mes')).toHaveTextContent('R$ 50,00');
    expect(within(cartao).getByText('Vence sábado, 10/10')).toBeInTheDocument();
    expect(within(cartao).getByRole('button', { name: 'Pagar com PIX' })).toBeInTheDocument();
    expect(
      within(cartao).getByRole('button', { name: /Já paguei: enviar comprovante/ }),
    ).toBeInTheDocument();

    const abertos = screen.getByRole('region', { name: 'Meses em aberto' });
    expect(within(abertos).getByText('setembro de 2026')).toBeInTheDocument();
    expect(within(abertos).getByText('Atrasada')).toBeInTheDocument();
    const anteriores = screen.getByRole('region', { name: 'Meses anteriores' });
    expect(within(anteriores).getByText(/paga em 09\/08/)).toBeInTheDocument();

    // Abrir um mês em aberto troca o cartão.
    fireEvent.click(within(abertos).getByRole('button', { name: /setembro de 2026/ }));
    expect(
      within(screen.getByTestId('cartao-mensalidade')).getByText('Venceu em 10/09'),
    ).toBeInTheDocument();

    expect(calledUrls().filter((u) => u.startsWith('/api/v1/admin'))).toEqual([]);
  });

  it('aguardando a casa confirmar', async () => {
    montar(
      lista([mes({ status: 'em_conferencia', comprovante_enviado_em: '2026-10-08T17:05:00Z' })]),
    );
    const cartao = await screen.findByTestId('cartao-mensalidade');
    expect(within(cartao).getByText('Aguardando a casa confirmar.')).toBeInTheDocument();
    expect(within(cartao).getByText(/Comprovante enviado em 08\/10 às 14h05/)).toBeInTheDocument();
    expect(within(cartao).queryByRole('button', { name: 'Pagar com PIX' })).not.toBeInTheDocument();
  });

  it('não confirmado: motivo, reenviar e "Falar com a casa" pelo WhatsApp', async () => {
    montar(
      lista([
        mes({
          status: 'nao_confirmada',
          recusa_motivo: 'O comprovante mostra R$ 40,00.',
          recusado_em: '2026-10-08T18:00:00Z',
        }),
      ]),
    );
    const cartao = await screen.findByTestId('cartao-mensalidade');
    expect(within(cartao).getByText('A casa não confirmou seu comprovante.')).toBeInTheDocument();
    expect(
      within(cartao).getByText(/Motivo: O comprovante mostra R\$ 40,00\./),
    ).toBeInTheDocument();
    expect(
      within(cartao).getByRole('button', { name: /Enviar outro comprovante/ }),
    ).toBeInTheDocument();
    const falar = within(cartao).getByRole('link', { name: /Falar com a casa/ });
    expect(falar.getAttribute('href')).toMatch(/^https:\/\/wa\.me\/5511999998888\?text=/);
  });

  it('paga e isento', async () => {
    const { unmount } = montar(
      lista([mes({ status: 'paga', data_pagamento: '2026-10-05T12:00:00Z' })]),
    );
    expect(await screen.findByText(/A casa confirmou seu pagamento/)).toBeInTheDocument();
    unmount();
    montar(lista([mes({ status: 'isento', valor: null, vencimento: null })], { isento: true }));
    expect(await screen.findByText('Você é isento de mensalidade.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Pagar com PIX' })).not.toBeInTheDocument();
    expect(screen.queryByText('Quer pagar todo mês sem lembrar?')).not.toBeInTheDocument();
  });

  it('sem chave PIX: "Combine o pagamento com a casa" + WhatsApp, sem "Pagar com PIX"', async () => {
    montar(lista([mes()], { pix: null }));
    const cartao = await screen.findByTestId('cartao-mensalidade');
    expect(within(cartao).getByText('Combine o pagamento com a casa.')).toBeInTheDocument();
    expect(within(cartao).getByRole('link', { name: /Falar com a casa/ })).toBeInTheDocument();
    expect(within(cartao).queryByRole('button', { name: 'Pagar com PIX' })).not.toBeInTheDocument();
  });

  it('403 (módulo desligado ou fora do plano): aviso neutro, sem oferta de plano', async () => {
    montar({ status: 403 });
    expect(await screen.findByText('Mensalidade indisponível')).toBeInTheDocument();
    expect(screen.queryByText(/plano/i)).not.toBeInTheDocument();
  });

  it('Pix Agendado Recorrente: passo a passo com a chave, o valor e o dia', async () => {
    montar(lista([mes()]));
    fireEvent.click(
      await screen.findByRole('button', { name: 'Quer pagar todo mês sem lembrar?' }),
    );
    expect(await screen.findByText(/Pix Agendado Recorrente/)).toBeInTheDocument();
    expect(screen.getByText('12345678909')).toBeInTheDocument();
    expect(screen.getByText('Repetir todo mês')).toBeInTheDocument();
  });
});

describe('Pagar com PIX', () => {
  afterEach(() => {
    Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true });
  });

  it('copia o código, mostra o QR e a chave', async () => {
    const writeText = jest.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    montar(lista([mes()]));
    fireEvent.click(await screen.findByRole('button', { name: 'Pagar com PIX' }));
    const sheet = await screen.findByTestId('sheet-pagar');
    expect(await within(sheet).findByTestId('pix-copia-e-cola')).toHaveTextContent(COPIA_E_COLA);
    expect(within(sheet).getByText('Casa de Oxala')).toBeInTheDocument();
    expect(calledUrls()).toContain('/api/v1/medium/mensalidades/2026-10/pix');

    await act(async () => {
      fireEvent.click(within(sheet).getByRole('button', { name: 'Copiar código do PIX' }));
    });
    expect(writeText).toHaveBeenCalledWith(COPIA_E_COLA);
    expect(within(sheet).getByRole('button', { name: 'Código copiado' })).toBeInTheDocument();

    fireEvent.click(
      within(sheet).getByRole('button', { name: 'Pagar de outro aparelho (QR Code)' }),
    );
    expect(await within(sheet).findByTestId('pix-qr')).toBeInTheDocument();
    fireEvent.click(within(sheet).getByRole('button', { name: 'Prefere usar a chave PIX?' }));
    expect(await within(sheet).findByTestId('pix-chave')).toHaveTextContent('12345678909');
    await act(async () => {
      fireEvent.click(within(sheet).getByRole('button', { name: 'Copiar chave PIX' }));
    });
    expect(writeText).toHaveBeenLastCalledWith('12345678909');
  });

  it('sem clipboard (navegador do WhatsApp): usa o plano B e, se falhar, pede "toque e segure"', async () => {
    Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true });
    const exec = jest.fn(() => false);
    (document as any).execCommand = exec;
    montar(lista([mes()]));
    fireEvent.click(await screen.findByRole('button', { name: 'Pagar com PIX' }));
    const sheet = await screen.findByTestId('sheet-pagar');
    await within(sheet).findByTestId('pix-copia-e-cola');
    await act(async () => {
      fireEvent.click(within(sheet).getByRole('button', { name: 'Copiar código do PIX' }));
    });
    expect(exec).toHaveBeenCalledWith('copy');
    expect(within(sheet).getByText(/Toque e segure no código/)).toBeInTheDocument();

    exec.mockReturnValue(true);
    await act(async () => {
      fireEvent.click(within(sheet).getByRole('button', { name: 'Copiar código do PIX' }));
    });
    expect(within(sheet).getByRole('button', { name: 'Código copiado' })).toBeInTheDocument();
  });

  it('erro do servidor (409) aparece no sheet com o "Falar com a casa"', async () => {
    montar(lista([mes()]), {
      '/api/v1/medium/mensalidades/2026-10/pix': {
        status: 409,
        response: {
          data: {
            message: 'A casa ainda não cadastrou a chave PIX. Combine o pagamento com a casa.',
          },
        },
      },
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Pagar com PIX' }));
    const sheet = await screen.findByTestId('sheet-pagar');
    expect(await within(sheet).findByRole('alert')).toHaveTextContent(
      'A casa ainda não cadastrou a chave PIX',
    );
    expect(within(sheet).getByRole('link', { name: /Falar com a casa/ })).toBeInTheDocument();
  });

  it('?pagar=1 (botão do Início) abre o sheet direto', async () => {
    mockRouter.query = { pagar: '1' };
    montar(lista([mes()]));
    expect(await screen.findByTestId('sheet-pagar')).toBeInTheDocument();
    expect(mockRouter.replace).toHaveBeenCalledWith('/medium/mensalidade', undefined, {
      shallow: true,
    });
  });
});

describe('Enviar comprovante', () => {
  async function abrir() {
    montar(lista([mes()]));
    fireEvent.click(await screen.findByRole('button', { name: /Já paguei: enviar comprovante/ }));
    return screen.findByTestId('sheet-comprovante');
  }

  it('tipo errado e PDF acima de 2 MB são recusados com o que fazer', async () => {
    const sheet = await abrir();
    const input = within(sheet).getByTestId('comprovante-arquivo');
    await act(async () => {
      fireEvent.change(input, {
        target: { files: [new File(['oi'], 'nota.txt', { type: 'text/plain' })] },
      });
    });
    expect(within(sheet).getByRole('alert')).toHaveTextContent('Esse arquivo não serve');
    const grande = new File([new Uint8Array(2 * 1024 * 1024 + 1)], 'extrato.pdf', {
      type: 'application/pdf',
    });
    await act(async () => {
      fireEvent.change(input, { target: { files: [grande] } });
    });
    expect(within(sheet).getByRole('alert')).toHaveTextContent('O PDF passa de 2 MB');
    expect(within(sheet).getByRole('button', { name: 'Enviar para a casa' })).toBeDisabled();
    expect(mockPost).not.toHaveBeenCalled();
  });

  it('foto pequena: prévia e envio → "Aguardando a casa confirmar"', async () => {
    mockPost.mockResolvedValue({
      data: mes({ status: 'em_conferencia', comprovante_enviado_em: '2026-10-08T17:05:00Z' }),
    });
    const sheet = await abrir();
    const foto = new File([new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3])], 'comprovante.jpg', {
      type: 'image/jpeg',
    });
    await act(async () => {
      fireEvent.change(within(sheet).getByTestId('comprovante-camera'), {
        target: { files: [foto] },
      });
    });
    expect(within(sheet).getByTestId('comprovante-previa')).toHaveTextContent('comprovante.jpg');
    // Depois do envio a lista recarrega já com o mês em conferência.
    routes['/api/v1/medium/mensalidades'] = lista([
      mes({ status: 'em_conferencia', comprovante_enviado_em: '2026-10-08T17:05:00Z' }),
    ]);
    await act(async () => {
      fireEvent.click(within(sheet).getByRole('button', { name: 'Enviar para a casa' }));
    });
    expect(mockPost).toHaveBeenCalledWith(
      '/api/v1/medium/mensalidades/2026-10/comprovante',
      expect.any(FormData),
      expect.anything(),
    );
    const form = mockPost.mock.calls[0][1] as FormData;
    expect((form.get('arquivo') as File).name).toBe('comprovante.jpg');
    expect(mockSuccess).toHaveBeenCalledWith('Comprovante enviado. A casa vai conferir.');
    await waitFor(() =>
      expect(
        within(screen.getByTestId('cartao-mensalidade')).getByText('Aguardando a casa confirmar.'),
      ).toBeInTheDocument(),
    );
  });

  it('erro do servidor (ex.: mês já pago) fica no sheet', async () => {
    mockPost.mockRejectedValue({
      response: { data: { message: 'Esta mensalidade já está paga.' } },
    });
    const sheet = await abrir();
    await act(async () => {
      fireEvent.change(within(sheet).getByTestId('comprovante-arquivo'), {
        target: { files: [new File(['%PDF-1.4'], 'extrato.pdf', { type: 'application/pdf' })] },
      });
    });
    await act(async () => {
      fireEvent.click(within(sheet).getByRole('button', { name: 'Enviar para a casa' }));
    });
    expect(within(sheet).getByRole('alert')).toHaveTextContent('Esta mensalidade já está paga.');
  });
});

describe('barra inferior', () => {
  it('a aba "Mensalidade" some quando o módulo está desligado', async () => {
    montar(lista([mes()]), {}, { ...ME, modulos: ['agenda', 'avisos'] });
    const bar = await screen.findByRole('navigation', { name: 'Menu da Área do Médium' });
    await waitFor(() =>
      expect(
        within(bar)
          .getAllByRole('link')
          .map((a) => a.textContent),
      ).toEqual(['Início', 'Agenda', 'Avisos', 'Perfil']),
    );
  });
});

describe('baixa automática (F-02/AM-22)', () => {
  const AUTO = { provedor: 'stripe', provedor_label: 'Stripe', pix: true, boleto: false };
  const COBRANCA = {
    mes: '2026-10',
    valor: 50,
    metodo: 'pix',
    provedor: 'stripe',
    provedor_label: 'Stripe',
    status: 'pendente',
    mes_status: 'pendente',
    copia_e_cola: '00020101021226-PIX-AUTOMATICO',
    boleto_url: null,
    boleto_linha_digitavel: null,
    expira_em: '2026-10-09T17:00:00Z',
    pago_em: null,
  };

  const implementacaoOriginal = mockGet.getMockImplementation()!;
  afterEach(() => {
    jest.useRealTimers();
    mockGet.mockImplementation(implementacaoOriginal);
  });

  it('"Pagar com PIX" gera a cobrança da casa e mostra "Pagamento recebido" quando a baixa entra', async () => {
    jest.useFakeTimers({ advanceTimers: true });
    mockPost.mockResolvedValue({ data: COBRANCA });
    montar(lista([mes()], { cobranca_automatica: AUTO }));
    // A consulta "já caiu?" devolve a cobrança paga (o mock de rotas trata `status` como erro).
    const original = mockGet.getMockImplementation()!;
    mockGet.mockImplementation((url: string) =>
      url === '/api/v1/medium/mensalidades/2026-10/cobranca'
        ? Promise.resolve({ data: { ...COBRANCA, status: 'paga', mes_status: 'paga' } })
        : original(url),
    );
    const cartao = await screen.findByTestId('cartao-mensalidade');
    expect(within(cartao).getByText(/paga sozinha, sem comprovante/)).toBeInTheDocument();
    expect(screen.queryByText('Quer pagar todo mês sem lembrar?')).not.toBeInTheDocument();
    fireEvent.click(within(cartao).getByRole('button', { name: 'Pagar com PIX' }));

    const sheet = await screen.findByTestId('sheet-pagar-automatico');
    expect(await within(sheet).findByTestId('pix-auto-copia-e-cola')).toHaveTextContent(
      '00020101021226-PIX-AUTOMATICO',
    );
    expect(within(sheet).getByTestId('pix-auto-qr')).toBeInTheDocument();
    expect(mockPost).toHaveBeenCalledWith('/api/v1/medium/mensalidades/2026-10/cobranca', {
      metodo: 'pix',
    });
    // O PIX estático (chave da casa) não é chamado no modo automático.
    expect(calledUrls()).not.toContain('/api/v1/medium/mensalidades/2026-10/pix');

    await act(async () => {
      jest.advanceTimersByTime(5100);
    });
    expect(await within(sheet).findByText('Pagamento recebido!')).toBeInTheDocument();
    expect(mockGet).toHaveBeenCalledWith('/api/v1/medium/mensalidades/2026-10/cobranca', {
      params: { metodo: 'pix' },
    });
  });

  it('quando o provedor pede o CPF, o campo aparece e o PIX é gerado com ele', async () => {
    mockPost
      .mockRejectedValueOnce({
        status: 409,
        response: { status: 409, data: { details: { error_code: 'CPF_NECESSARIO' } } },
      })
      .mockResolvedValueOnce({ data: COBRANCA });
    montar(lista([mes()], { cobranca_automatica: AUTO }));
    const cartao = await screen.findByTestId('cartao-mensalidade');
    fireEvent.click(within(cartao).getByRole('button', { name: 'Pagar com PIX' }));
    const sheet = await screen.findByTestId('sheet-pagar-automatico');
    fireEvent.change(await within(sheet).findByLabelText('CPF'), { target: { value: '12345678909' } });
    await act(async () => {
      fireEvent.click(within(sheet).getByRole('button', { name: /Gerar PIX/ }));
    });
    expect(mockPost).toHaveBeenLastCalledWith('/api/v1/medium/mensalidades/2026-10/cobranca', {
      metodo: 'pix',
      cpf: '123.456.789-09',
    });
    expect(await within(sheet).findByTestId('pix-auto-copia-e-cola')).toBeInTheDocument();
  });

  it('mês pago pelo PIX automático diz que o pagamento foi recebido sozinho', async () => {
    montar(
      lista([mes({ status: 'paga', data_pagamento: '2026-10-05T12:00:00Z', pago_automatico: true })], {
        cobranca_automatica: AUTO,
      }),
    );
    expect(await screen.findByText(/Recebemos seu pagamento automaticamente/)).toBeInTheDocument();
  });
});
