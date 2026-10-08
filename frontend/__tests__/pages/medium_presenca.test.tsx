/**
 * AM-17/AM-28 — Presença na Área do Médium: cartão "Você está na escala" no Início (Vou / Não vou
 * com "Conte o motivo" e o aviso de saúde, "Cheguei" pelo app e com o QR do dia — leitor nativo
 * ausente → câmera do celular ou código), selo da escala na Agenda, "Cheguei" pelo link do QR no
 * detalhe (`?cheguei=`), "Minhas presenças" (percentual, histórico, "Conte o motivo" no prazo) e
 * impersonação só leitura. Só chama /api/v1/medium/*; nunca "convocado" nem "check-in" na tela.
 * AM-29: sem BarcodeDetector (iPhone) a câmera abre dentro da Área e o jsQR (baixado sob demanda,
 * aqui mockado) lê o QR.
 */
import React from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

const mockRouter: any = {
  pathname: '/medium',
  asPath: '/medium',
  query: {},
  isReady: true,
  push: jest.fn(() => Promise.resolve(true)),
  replace: jest.fn(() => Promise.resolve(true)),
  events: { on: jest.fn(), off: jest.fn() },
};
jest.mock('next/router', () => ({ useRouter: () => mockRouter }));
const mockJsQr = jest.fn();
jest.mock('jsqr', () => ({ __esModule: true, default: (...a: unknown[]) => mockJsQr(...a) }));
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

let mockGet: jest.Mock;
const mockPost = jest.fn();
jest.mock('@/services/api_client', () => ({
  apiClient: {
    get: (...a: unknown[]) => mockGet(...a),
    post: (...a: unknown[]) => mockPost(...a),
    put: jest.fn(),
    delete: jest.fn(),
    getBaseURL: () => '',
  },
  extractApiErrorMessage: (e: any, fallback: string) => e?.response?.data?.message ?? fallback,
  endImpersonation: jest.fn(),
}));

import { ProfileProvider } from '@/hooks/useProfile';
import { MediumProvider } from '@/components/medium/MediumProvider';
import { INSTALL_AREA_SEEN_KEY } from '@/components/medium/InstallAreaSheet';
import type { MinhaParticipacao } from '@/constants/presenca';

const AREAS = { admin: false, medium: { medium_id: 'm1', nome: 'Ana Paula Ribeiro' } };
const PROFILE = {
  id: 'u1',
  email: 'ana@exemplo.com',
  username: 'ana',
  full_name: 'Ana Paula Ribeiro',
  tenant_name: 'Tenda Luz da Mata',
  role: 'medium',
  areas: AREAS,
};
const ME = {
  nome: 'Ana Paula Ribeiro',
  foto_url: null,
  terreiro: { id: 't1', nome: 'Tenda Luz da Mata', slug: 'luz' },
  marca: { logo_url: null, primary_color: '#2f6b4f', secondary_color: '#e9b04a', font_color: null },
  areas: AREAS,
  modulos: ['agenda', 'avisos', 'mensalidade'],
};

function participacao(over: Partial<MinhaParticipacao> = {}): MinhaParticipacao {
  return {
    convocado: true,
    situacao: 'convocado',
    resposta: 'sem_resposta',
    presenca: 'nao_registrada',
    presenca_em: null,
    justificativa: null,
    grupo: 'G2',
    funcao: null,
    pede_confirmacao: true,
    exige_justificativa: true,
    controla_presenca: true,
    modo_presenca: 'confianca',
    pode_responder: true,
    responder_ate: '2099-10-10T12:00:00Z',
    pode_checkin: false,
    checkin_abre_em: null,
    checkin_fecha_em: null,
    pode_justificar: false,
    justificar_ate: null,
    chamada_encerrada: false,
    ...over,
  };
}

const tipoFaxina = { nome: 'Faxina', icone: 'faxina', cor: 'petroleo' };
function escala(over: Partial<MinhaParticipacao> = {}, id = 'f1') {
  return {
    origem: 'atividade',
    id,
    tipo: tipoFaxina,
    titulo: 'Faxina · G2',
    inicio: '2099-10-10T12:00:00Z',
    fim: '2099-10-10T15:00:00Z',
    local: null,
    cancelada: false,
    minha_participacao: participacao(over),
  };
}

function inicio(escalas: unknown[]) {
  return {
    hoje: '2099-10-07',
    pendencias: [{ tipo: 'escala', quantidade: 1 }],
    proxima_gira: null,
    mensalidade: null,
    avisos: { nao_lidos: 0, ultimos: [] },
    escalas,
  };
}

function api(routes: Record<string, unknown>) {
  mockGet = jest.fn((url: string) => {
    if (url === '/api/v1/auth/profile') return Promise.resolve({ data: PROFILE });
    const hit = Object.entries(routes)
      .sort((a, b) => b[0].length - a[0].length)
      .find(([k]) => url.startsWith(k));
    if (!hit) return Promise.resolve({ data: {} });
    const v = hit[1] as { status?: number };
    if (v?.status) return Promise.reject(v);
    return Promise.resolve({ data: v });
  });
}

function renderApp(ui: React.ReactElement) {
  return render(
    <ProfileProvider>
      <MediumProvider>{ui}</MediumProvider>
    </ProfileProvider>,
  );
}

const ACAO = '/api/v1/medium/atividades/atividade/f1';

beforeEach(() => {
  jest.clearAllMocks();
  localStorage.clear();
  sessionStorage.clear();
  localStorage.setItem(INSTALL_AREA_SEEN_KEY, '1');
  localStorage.setItem('user', JSON.stringify(PROFILE));
  document.cookie = 'auth_state=1';
  mockRouter.pathname = '/medium';
  mockRouter.query = {};
  delete (window as any).BarcodeDetector;
});

describe('Início — Você está na escala', () => {
  it('Vou: manda a resposta e o cartão sai das pendências', async () => {
    api({ '/api/v1/medium/me': ME, '/api/v1/medium/inicio': inicio([escala()]) });
    mockPost.mockResolvedValue({ data: participacao({ resposta: 'vou', situacao: 'confirmado' }) });
    const Page = require('@/pages/medium/index').default;
    renderApp(<Page />);
    const card = await screen.findByTestId('escala-card');
    expect(within(card).getByText(/Você está na escala/)).toBeInTheDocument();
    expect(within(card).getByText('· grupo G2')).toBeInTheDocument();
    expect(within(card).getByText(/Responda até/)).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/convocad|check-in/i);
    await act(async () => {
      fireEvent.click(within(card).getByRole('button', { name: 'Vou' }));
    });
    expect(mockPost).toHaveBeenCalledWith(`${ACAO}/resposta`, { resposta: 'vou' });
  });

  it('Não vou: "Conte o motivo" com o aviso de saúde; obrigatório quando o tipo pede', async () => {
    api({ '/api/v1/medium/me': ME, '/api/v1/medium/inicio': inicio([escala()]) });
    mockPost.mockResolvedValue({
      data: participacao({
        resposta: 'nao_vou',
        situacao: 'ausencia_avisada',
        justificativa: 'Viagem',
      }),
    });
    const Page = require('@/pages/medium/index').default;
    renderApp(<Page />);
    const card = await screen.findByTestId('escala-card');
    fireEvent.click(within(card).getByRole('button', { name: 'Não vou' }));
    const sheet = await screen.findByTestId('motivo-sheet');
    expect(within(sheet).getByText(/Não precisa detalhar questões de saúde/)).toBeInTheDocument();
    const avisar = within(sheet).getByRole('button', { name: 'Avisar a casa' });
    expect(avisar).toBeDisabled();
    fireEvent.change(within(sheet).getByLabelText('Conte o motivo'), {
      target: { value: 'Viagem a trabalho' },
    });
    await act(async () => {
      fireEvent.click(avisar);
    });
    expect(mockPost).toHaveBeenCalledWith(`${ACAO}/resposta`, {
      resposta: 'nao_vou',
      justificativa: 'Viagem a trabalho',
    });
  });

  it('Cheguei pelo app: um toque dentro da janela', async () => {
    api({
      '/api/v1/medium/me': ME,
      '/api/v1/medium/inicio': inicio([
        escala({
          modo_presenca: 'app',
          pode_checkin: true,
          checkin_abre_em: '2099-10-10T11:00:00Z',
          checkin_fecha_em: '2099-10-10T15:00:00Z',
        }),
      ]),
    });
    mockPost.mockResolvedValue({
      data: participacao({
        presenca: 'presente',
        situacao: 'presente',
        presenca_em: '2099-10-10T12:04:00Z',
      }),
    });
    const Page = require('@/pages/medium/index').default;
    renderApp(<Page />);
    const card = await screen.findByTestId('escala-card');
    expect(within(card).getByText(/O botão vale das 8h às 12h/)).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(within(card).getByRole('button', { name: 'Cheguei' }));
    });
    expect(mockPost).toHaveBeenCalledWith(`${ACAO}/checkin`, { codigo: null });
  });

  it('Cheguei com QR: sem leitor nativo, orienta a câmera do celular e aceita o código', async () => {
    api({
      '/api/v1/medium/me': ME,
      '/api/v1/medium/inicio': inicio([escala({ modo_presenca: 'qr', pode_checkin: true })]),
    });
    mockPost
      .mockRejectedValueOnce({
        status: 422,
        response: { data: { message: 'x', details: { error_code: 'QR_INVALIDO' } } },
      })
      .mockResolvedValueOnce({
        data: participacao({ presenca: 'presente', situacao: 'presente' }),
      });
    const Page = require('@/pages/medium/index').default;
    renderApp(<Page />);
    const card = await screen.findByTestId('escala-card');
    fireEvent.click(within(card).getByRole('button', { name: 'Cheguei' }));
    const sheet = await screen.findByTestId('cheguei-sheet');
    expect(within(sheet).getByTestId('cheguei-sem-leitor')).toHaveTextContent(/câmera do celular/);
    const campo = within(sheet).getByLabelText('Código embaixo do QR');
    fireEvent.change(campo, { target: { value: 'k7p2qx' } });
    await act(async () => {
      fireEvent.click(within(sheet).getByRole('button', { name: /Marcar presença/ }));
    });
    expect(mockPost).toHaveBeenLastCalledWith(`${ACAO}/checkin`, { codigo: 'K7P2QX' });
    expect(await within(sheet).findByRole('alert')).toHaveTextContent(/não vale mais/);
    await act(async () => {
      fireEvent.click(within(sheet).getByRole('button', { name: /Marcar presença/ }));
    });
    await waitFor(() => expect(mockPost).toHaveBeenCalledTimes(2));
  });

  it('com o BarcodeDetector do navegador, lê o QR pela câmera e manda o código do link', async () => {
    const stop = jest.fn();
    (navigator as any).mediaDevices = {
      getUserMedia: jest.fn(() => Promise.resolve({ getTracks: () => [{ stop }] })),
    };
    (window as any).BarcodeDetector = class {
      detect() {
        return Promise.resolve([
          { rawValue: 'https://girahub.com.br/medium/agenda/atividade/f1?cheguei=ABC234' },
        ]);
      }
    };
    Object.defineProperty(HTMLMediaElement.prototype, 'readyState', {
      configurable: true,
      get: () => 4,
    });
    HTMLMediaElement.prototype.play = jest.fn(() => Promise.resolve());
    api({
      '/api/v1/medium/me': ME,
      '/api/v1/medium/inicio': inicio([escala({ modo_presenca: 'qr', pode_checkin: true })]),
    });
    mockPost.mockResolvedValue({
      data: participacao({ presenca: 'presente', situacao: 'presente' }),
    });
    const Page = require('@/pages/medium/index').default;
    renderApp(<Page />);
    const card = await screen.findByTestId('escala-card');
    fireEvent.click(within(card).getByRole('button', { name: 'Cheguei' }));
    await waitFor(
      () => expect(mockPost).toHaveBeenCalledWith(`${ACAO}/checkin`, { codigo: 'ABC234' }),
      { timeout: 3000 },
    );
    await waitFor(() => expect(stop).toHaveBeenCalled());
  });

  it('sem BarcodeDetector (iPhone): a câmera abre na Área e o jsQR lê o QR', async () => {
    const stop = jest.fn();
    const antes = (navigator as any).mediaDevices;
    (navigator as any).mediaDevices = {
      getUserMedia: jest.fn(() => Promise.resolve({ getTracks: () => [{ stop }] })),
    };
    mockJsQr.mockReturnValue({ data: 'https://girahub.com.br/medium/agenda/atividade/f1?cheguei=XYZ789' });
    const getContext = jest.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
      () =>
        ({
          drawImage: jest.fn(),
          getImageData: (_x: number, _y: number, w: number, h: number) => ({
            data: new Uint8ClampedArray(w * h * 4),
            width: w,
            height: h,
          }),
        }) as unknown as CanvasRenderingContext2D,
    );
    Object.defineProperty(HTMLMediaElement.prototype, 'readyState', { configurable: true, get: () => 4 });
    Object.defineProperty(HTMLVideoElement.prototype, 'videoWidth', { configurable: true, get: () => 640 });
    Object.defineProperty(HTMLVideoElement.prototype, 'videoHeight', { configurable: true, get: () => 480 });
    HTMLMediaElement.prototype.play = jest.fn(() => Promise.resolve());
    try {
      api({
        '/api/v1/medium/me': ME,
        '/api/v1/medium/inicio': inicio([escala({ modo_presenca: 'qr', pode_checkin: true })]),
      });
      mockPost.mockResolvedValue({ data: participacao({ presenca: 'presente', situacao: 'presente' }) });
      const Page = require('@/pages/medium/index').default;
      renderApp(<Page />);
      const card = await screen.findByTestId('escala-card');
      fireEvent.click(within(card).getByRole('button', { name: 'Cheguei' }));
      const sheet = await screen.findByTestId('cheguei-sheet');
      expect(within(sheet).queryByTestId('cheguei-sem-leitor')).not.toBeInTheDocument();
      await waitFor(
        () => expect(mockPost).toHaveBeenCalledWith(`${ACAO}/checkin`, { codigo: 'XYZ789' }),
        { timeout: 3000 },
      );
      expect(mockJsQr).toHaveBeenCalled();
      await waitFor(() => expect(stop).toHaveBeenCalled());
    } finally {
      getContext.mockRestore();
      (navigator as any).mediaDevices = antes;
    }
  });

  it('sem câmera nenhuma: não baixa o jsQR; câmera do celular ou código', async () => {
    const antes = (navigator as any).mediaDevices;
    (navigator as any).mediaDevices = undefined;
    try {
      api({
        '/api/v1/medium/me': ME,
        '/api/v1/medium/inicio': inicio([escala({ modo_presenca: 'qr', pode_checkin: true })]),
      });
      const Page = require('@/pages/medium/index').default;
      renderApp(<Page />);
      const card = await screen.findByTestId('escala-card');
      fireEvent.click(within(card).getByRole('button', { name: 'Cheguei' }));
      const sheet = await screen.findByTestId('cheguei-sheet');
      expect(within(sheet).getByTestId('cheguei-sem-leitor')).toBeInTheDocument();
      expect(within(sheet).getByLabelText('Código embaixo do QR')).toBeInTheDocument();
      expect(mockJsQr).not.toHaveBeenCalled();
    } finally {
      (navigator as any).mediaDevices = antes;
    }
  });

  it('impersonando: só leitura (sem Vou/Não vou)', async () => {
    sessionStorage.setItem('impersonating', '1');
    api({ '/api/v1/medium/me': ME, '/api/v1/medium/inicio': inicio([escala()]) });
    const Page = require('@/pages/medium/index').default;
    renderApp(<Page />);
    const card = await screen.findByTestId('escala-card');
    expect(within(card).queryByRole('button', { name: 'Vou' })).not.toBeInTheDocument();
  });

  it('já respondida vai para "Acompanhando"', async () => {
    api({
      '/api/v1/medium/me': ME,
      '/api/v1/medium/inicio': {
        ...inicio([escala({ resposta: 'vou', situacao: 'confirmado' })]),
        pendencias: [],
      },
    });
    const Page = require('@/pages/medium/index').default;
    renderApp(<Page />);
    const item = await screen.findByTestId('escala-acompanhando');
    expect(item).toHaveTextContent('Você confirmou: Vou');
    expect(screen.queryByTestId('escala-card')).not.toBeInTheDocument();
  });
});

describe('Agenda — selo e o link do QR', () => {
  it('selo da escala na lista', async () => {
    mockRouter.pathname = '/medium/agenda';
    api({
      '/api/v1/medium/me': ME,
      '/api/v1/medium/agenda': {
        inicio: '2099-10-01',
        fim: '2099-12-31',
        itens: [escala(), escala({ resposta: 'nao_vou', situacao: 'ausencia_avisada' }, 'f2')],
      },
    });
    const Page = require('@/pages/medium/agenda').default;
    renderApp(<Page />);
    const selos = await screen.findAllByTestId('selo-escala');
    expect(selos.map((s) => s.textContent)).toEqual(['Na escala', 'Não vou']);
  });

  it('detalhe com ?cheguei= marca a presença uma vez e limpa a URL', async () => {
    mockRouter.pathname = '/medium/agenda/[tipo]/[id]';
    mockRouter.query = { tipo: 'atividade', id: 'f1', cheguei: 'K7P2QX' };
    api({
      '/api/v1/medium/me': ME,
      '/api/v1/medium/agenda/atividade/f1': {
        ...escala({ modo_presenca: 'qr', pode_checkin: true }),
        descricao: null,
        orientacoes_corrente: null,
        endereco: null,
        mapa_url: null,
        cancelamento_motivo: null,
        agenda_celular: { ics_path: '/x.ics', google_url: 'https://calendar.google.com' },
      },
    });
    mockPost.mockResolvedValue({
      data: participacao({
        presenca: 'presente',
        situacao: 'presente',
        presenca_em: '2099-10-10T12:04:00Z',
      }),
    });
    const Page = require('@/pages/medium/agenda/[tipo]/[id]').default;
    renderApp(<Page />);
    await waitFor(() =>
      expect(mockPost).toHaveBeenCalledWith(`${ACAO}/checkin`, { codigo: 'K7P2QX' }),
    );
    expect(mockRouter.replace).toHaveBeenCalledWith('/medium/agenda/atividade/f1', undefined, {
      shallow: true,
    });
    expect(await screen.findByText(/Presença marcada às/)).toBeInTheDocument();
    expect(mockPost).toHaveBeenCalledTimes(1);
  });
});

describe('Minhas presenças', () => {
  const PRESENCAS = {
    proximas: [escala()],
    historico: [
      {
        ...escala(
          {
            presenca: 'ausente',
            situacao: 'ausente',
            pode_justificar: true,
            justificar_ate: '2099-10-14',
            chamada_encerrada: true,
            pode_responder: false,
          },
          'r1',
        ),
        titulo: 'Estudo da corrente',
      },
      {
        ...escala(
          {
            presenca: 'presente',
            situacao: 'presente',
            chamada_encerrada: true,
            pode_responder: false,
          },
          'g9',
        ),
        origem: 'gira',
        titulo: 'Gira de Caboclos',
      },
    ],
    resumo: { presentes: 11, total: 12, percentual: 92, desde: '2099-07-10' },
    prazo_justificativa_dias: 7,
  };

  it('percentual, próximas, histórico e "Conte o motivo" no prazo', async () => {
    mockRouter.pathname = '/medium/presencas';
    api({ '/api/v1/medium/me': ME, '/api/v1/medium/presencas': PRESENCAS });
    mockPost.mockResolvedValue({
      data: participacao({
        presenca: 'ausente',
        situacao: 'ausente_justificado',
        justificativa: 'Febre',
      }),
    });
    const Page = require('@/pages/medium/presencas').default;
    renderApp(<Page />);
    const resumo = await screen.findByTestId('resumo-presencas');
    expect(resumo).toHaveTextContent('92%');
    expect(resumo).toHaveTextContent('11 de 12');
    expect(screen.getByTestId('escala-card')).toBeInTheDocument();
    expect(screen.getAllByTestId('situacao').map((s) => s.textContent)).toEqual([
      'Ausente',
      'Presente',
    ]);
    expect(screen.getByText(/Só você e a direção da casa veem suas presenças/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Conte o motivo \(até 14\/10\)/ }));
    const sheet = await screen.findByTestId('motivo-sheet');
    expect(within(sheet).getByText('Por que você não foi?')).toBeInTheDocument();
    fireEvent.change(within(sheet).getByLabelText('Conte o motivo'), {
      target: { value: 'Febre' },
    });
    await act(async () => {
      fireEvent.click(within(sheet).getByRole('button', { name: 'Enviar para a casa' }));
    });
    expect(mockPost).toHaveBeenCalledWith('/api/v1/medium/atividades/atividade/r1/justificativa', {
      justificativa: 'Febre',
    });
    const urls = mockGet.mock.calls.map((c) => String(c[0]));
    expect(urls.filter((u) => u.startsWith('/api/v1/admin'))).toEqual([]);
  });

  it('sem a presença no plano: aviso neutro', async () => {
    mockRouter.pathname = '/medium/presencas';
    api({ '/api/v1/medium/me': ME, '/api/v1/medium/presencas': { status: 403 } });
    const Page = require('@/pages/medium/presencas').default;
    renderApp(<Page />);
    expect(await screen.findByText('Presenças indisponíveis')).toBeInTheDocument();
  });
});
