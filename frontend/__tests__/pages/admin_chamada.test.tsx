/**
 * AM-17/AM-28 — /admin/atividades/[id]/chamada: gates (Área, plano `atividades_corrente`, grupo
 * escalas/porta edit), lista com resposta e motivo (só com `ver_justificativa`), Presente/Ausente
 * (tocar de novo desfaz), "Marcar todos os confirmados", "Encerrar chamada" com confirmação,
 * painel do QR do dia (código, link sem dado pessoal, tela cheia), botão "Chamada" da gira
 * (`ChamadaDaGiraButton`) e o QR no canto do modo TV.
 */
import React from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

const mockPush = jest.fn(() => Promise.resolve(true));
const mockRouter: any = {
  push: mockPush,
  replace: jest.fn(),
  pathname: '/admin/atividades/[id]/chamada',
  query: { id: 'a1' },
  isReady: true,
};
jest.mock('next/router', () => ({ useRouter: () => mockRouter }));
jest.mock('next/link', () => ({ children, href, ...rest }: any) => (
  <a href={href} {...rest}>
    {children}
  </a>
));

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
  extractApiErrorMessage: (_e: unknown, fallback: string) => fallback,
}));
jest.mock('@/pages/admin/admin_layout', () => ({
  __esModule: true,
  default: ({ children }: any) => <div>{children}</div>,
}));
const mockPlanCan = jest.fn((_f: string) => true);
jest.mock('@/hooks/useSubscription', () => ({
  useSubscription: () => ({
    can: mockPlanCan,
    subscription: { plan: 'basic' },
    planLabel: 'Basic',
    loading: false,
  }),
}));
const mockGroupCan = jest.fn((_f: string, _a: string) => true);
jest.mock('@/hooks/usePermissions', () => ({
  usePermissions: () => ({
    can: mockGroupCan,
    permissions: null,
    loading: false,
    refresh: jest.fn(),
  }),
}));
const mockSuccess = jest.fn();
jest.mock('@/contexts/SnackbarContext', () => ({
  useSnackbar: () => ({ showSuccess: mockSuccess, showError: jest.fn() }),
}));

const BASE = '/api/v1/admin/atividades';

function chamada(over: Record<string, unknown> = {}, atividade: Record<string, unknown> = {}) {
  return {
    atividade: {
      atividade_id: 'a1',
      origem: 'gira',
      ref_id: 'g1',
      titulo: 'Gira de Caboclos',
      inicio: '2026-10-09T23:00:00Z',
      fim: null,
      local: null,
      tipo: { id: 't-gira', nome: 'Gira', icone: 'gira', cor: null },
      modo_presenca: 'confianca',
      controla_presenca: true,
      pede_confirmacao: true,
      exige_justificativa: true,
      convocacao_padrao: 'todos_elegiveis',
      cancelada: false,
      chamada_encerrada_em: null,
      chamada_encerrada_por: null,
      pode_encerrar: true,
      ...atividade,
    },
    contadores: {
      esperados: 3,
      confirmados: 1,
      ausencias_avisadas: 1,
      sem_resposta: 1,
      presentes: 0,
      ausentes: 0,
      sem_registro: 3,
      dispensados: 0,
    },
    pessoas: [
      {
        medium_id: 'm1',
        nome: 'Ana Paula',
        convocado: true,
        origem: 'elegivel',
        resposta: 'nao_vou',
        presenca: 'nao_registrada',
        situacao: 'ausencia_avisada',
        tem_justificativa: true,
        justificativa: 'Consulta médica',
        dispensado: false,
      },
      {
        medium_id: 'm2',
        nome: 'Beto Souza',
        convocado: true,
        origem: 'elegivel',
        resposta: 'vou',
        presenca: 'nao_registrada',
        situacao: 'confirmado',
        tem_justificativa: false,
        justificativa: null,
        dispensado: false,
      },
      {
        medium_id: 'm3',
        nome: 'Caio Lima',
        convocado: true,
        origem: 'elegivel',
        resposta: 'sem_resposta',
        presenca: 'presente',
        presenca_origem: 'checkin_medium',
        situacao: 'presente',
        tem_justificativa: false,
        justificativa: null,
        dispensado: false,
      },
    ],
    outros_mediuns: [{ id: 'm4', nome: 'Dora Melo' }],
    ver_justificativa: true,
    ...over,
  };
}

const QR = {
  modo: 'qr',
  ativo: true,
  codigo: 'K7P2QX',
  conteudo: 'https://girahub.com.br/medium/agenda/gira/g1?cheguei=K7P2QX',
  expira_em: new Date(Date.now() + 40_000).toISOString(),
  intervalo_s: 60,
  titulo: 'Gira de Caboclos',
};

function setup(dados = chamada(), qr = QR) {
  mockGet.mockImplementation((url: string) => {
    if (url === `${BASE}/a1/chamada`) return Promise.resolve({ data: dados });
    if (url.endsWith('/qr')) return Promise.resolve({ data: qr });
    return Promise.resolve({ data: {} });
  });
  mockPut.mockResolvedValue({ data: dados });
  mockPost.mockResolvedValue({ data: dados });
  const Page = require('@/pages/admin/atividades/[id]/chamada').default;
  return render(<Page />);
}

beforeEach(() => {
  jest.clearAllMocks();
  mockPlanCan.mockImplementation(() => true);
  mockGroupCan.mockImplementation(() => true);
});

describe('Chamada — gates', () => {
  it('sem a presença no plano: PlanLocked e nada de API', async () => {
    mockPlanCan.mockImplementation((f: string) => f !== 'atividades_corrente');
    setup();
    expect(await screen.findByText('Presença da corrente')).toBeInTheDocument();
    expect(mockGet).not.toHaveBeenCalled();
  });

  it('sem escalas:edit nem porta:edit: PermissionDenied', async () => {
    mockGroupCan.mockImplementation((_f: string, a: string) => a === 'view');
    setup();
    expect(await screen.findByText(/não tem permissão/i)).toBeInTheDocument();
    expect(mockGet).not.toHaveBeenCalled();
  });

  it('403 do servidor (porteiro numa atividade interna): PermissionDenied', async () => {
    mockGet.mockRejectedValue({ status: 403 });
    const Page = require('@/pages/admin/atividades/[id]/chamada').default;
    render(<Page />);
    expect(await screen.findByText(/não tem permissão/i)).toBeInTheDocument();
  });
});

describe('Chamada — lista e ações', () => {
  it('mostra resposta, motivo (com ver_justificativa) e "Marcou Cheguei"', async () => {
    setup();
    const ana = await screen.findByRole('listitem', { name: 'Ana Paula' });
    expect(within(ana).getByText('Não vou')).toBeInTheDocument();
    expect(within(ana).getByText('Motivo: Consulta médica')).toBeInTheDocument();
    const caio = screen.getByRole('listitem', { name: 'Caio Lima' });
    expect(within(caio).getAllByText('Marcou “Cheguei”').length).toBeGreaterThan(0);
    expect(within(caio).getByRole('button', { name: /Presente/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByTestId('chamada-contadores')).toHaveTextContent(
      '1 vão · 1 não vão · 1 sem resposta',
    );
  });

  it('pela Porta (sem ver_justificativa): sabe que há motivo, mas não lê o texto', async () => {
    const dados = chamada({ ver_justificativa: false });
    dados.pessoas[0] = { ...dados.pessoas[0], justificativa: null };
    setup(dados);
    const ana = await screen.findByRole('listitem', { name: 'Ana Paula' });
    expect(
      within(ana).getByText(/Contou o motivo \(só quem cuida das escalas vê\)/),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Consulta médica/)).not.toBeInTheDocument();
  });

  it('Presente/Ausente: tocar marca; tocar de novo desfaz', async () => {
    setup();
    const beto = await screen.findByRole('listitem', { name: 'Beto Souza' });
    await act(async () => {
      fireEvent.click(within(beto).getByRole('button', { name: /Ausente/ }));
    });
    expect(mockPut).toHaveBeenCalledWith(`${BASE}/a1/chamada`, {
      marcacoes: [{ medium_id: 'm2', presenca: 'ausente' }],
    });
    const caio = screen.getByRole('listitem', { name: 'Caio Lima' });
    await act(async () => {
      fireEvent.click(within(caio).getByRole('button', { name: /Presente/ }));
    });
    expect(mockPut).toHaveBeenLastCalledWith(`${BASE}/a1/chamada`, {
      marcacoes: [{ medium_id: 'm3', presenca: 'nao_registrada' }],
    });
  });

  it('busca pelo nome, marca os confirmados e encerra com confirmação', async () => {
    setup();
    await screen.findByRole('listitem', { name: 'Ana Paula' });
    fireEvent.change(screen.getByLabelText('Buscar pelo nome'), { target: { value: 'beto' } });
    expect(screen.queryByRole('listitem', { name: 'Ana Paula' })).not.toBeInTheDocument();
    await act(async () => {
      fireEvent.click(
        screen.getByRole('button', { name: /Marcar todos os confirmados como presentes \(1\)/ }),
      );
    });
    expect(mockPut).toHaveBeenCalledWith(`${BASE}/a1/chamada`, { marcar_confirmados: true });
    fireEvent.click(screen.getByRole('button', { name: /Encerrar chamada/ }));
    const dialog = await screen.findByRole('alertdialog');
    expect(within(dialog).getByText(/Quem confirmou “Vou”/)).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(within(dialog).getByRole('button', { name: 'Encerrar' }));
    });
    expect(mockPost).toHaveBeenCalledWith(`${BASE}/a1/chamada/encerrar`);
  });

  it('encerrada: aviso com quem encerrou e sem o botão de encerrar', async () => {
    setup(
      chamada(
        {},
        {
          chamada_encerrada_em: '2026-10-10T03:00:00Z',
          chamada_encerrada_por: 'Dirigente',
          pode_encerrar: false,
        },
      ),
    );
    expect(await screen.findByText(/Chamada encerrada em .* por Dirigente/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Encerrar chamada/ })).not.toBeInTheDocument();
  });
});

describe('QR do dia', () => {
  it('modo QR: painel com o código e o QR, sem dado pessoal, e tela cheia', async () => {
    setup(chamada({}, { modo_presenca: 'qr' }));
    const painel = await screen.findByTestId('qr-presenca');
    expect(within(painel).getByTestId('qr-codigo')).toHaveTextContent('K7P2QX');
    expect(painel.textContent).not.toMatch(/Ana|Beto|Caio/);
    expect(mockGet).toHaveBeenCalledWith(`${BASE}/a1/qr`);
    fireEvent.click(screen.getByRole('button', { name: /Mostrar o QR em tela cheia/ }));
    expect(screen.getByRole('dialog', { name: 'QR do Cheguei em tela cheia' })).toBeInTheDocument();
  });

  it('fora da janela: avisa quando o QR aparece', async () => {
    setup(chamada({}, { modo_presenca: 'qr' }), {
      ...QR,
      ativo: false,
      codigo: null,
      conteudo: null,
      janela_abre_em: '2026-10-09T22:00:00Z',
      janela_fecha_em: '2026-10-10T02:00:00Z',
    } as any);
    expect(await screen.findByTestId('qr-presenca-fechado')).toHaveTextContent(
      /O QR do “Cheguei” aparece aqui das/,
    );
  });

  it('modo TV: QR no canto com a Área liberada; sem o plano, nada', async () => {
    const { QrPresenca } = require('@/components/admin/presenca/QrPresenca');
    mockGet.mockResolvedValue({ data: QR });
    const { unmount } = render(<QrPresenca url={`${BASE}/da-gira/g1/qr`} variante="tv" />);
    expect(await screen.findByTestId('qr-codigo')).toHaveTextContent('K7P2QX');
    unmount();
    mockGet.mockResolvedValue({ data: { ...QR, modo: 'confianca', ativo: false } });
    render(<QrPresenca url={`${BASE}/da-gira/g1/qr`} variante="tv" />);
    await waitFor(() => expect(mockGet).toHaveBeenCalledTimes(2));
    expect(screen.queryByTestId('qr-presenca')).not.toBeInTheDocument();
  });
});

describe('Botão "Chamada" da gira', () => {
  it('cria a âncora e abre a chamada; some sem permissão', async () => {
    const {
      ChamadaDaGiraButton,
      giraTemChamada,
    } = require('@/components/admin/presenca/ChamadaDaGiraButton');
    mockPost.mockResolvedValue({ data: { atividade_id: 'anc-9' } });
    const { unmount } = render(<ChamadaDaGiraButton giraId="g1" />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Chamada/ }));
    });
    expect(mockPost).toHaveBeenCalledWith(`${BASE}/da-gira/g1/chamada`);
    expect(mockPush).toHaveBeenCalledWith('/admin/atividades/anc-9/chamada');
    unmount();
    mockGroupCan.mockImplementation(() => false);
    render(<ChamadaDaGiraButton giraId="g1" />);
    expect(screen.queryByRole('button', { name: /Chamada/ })).not.toBeInTheDocument();
    const agora = new Date('2026-10-09T12:00:00Z');
    expect(giraTemChamada({ data_inicio: '2026-10-09T23:00:00Z' }, agora)).toBe(true);
    expect(giraTemChamada({ data_inicio: '2026-10-12T23:00:00Z' }, agora)).toBe(false);
    expect(giraTemChamada({ data_inicio: '2026-10-09T10:00:00Z', is_active: false }, agora)).toBe(
      false,
    );
  });
});
