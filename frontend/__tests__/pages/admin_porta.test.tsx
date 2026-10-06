/**
 * Porta em modo operação: "Chamar próximo", vocabulário do terreiro, Desfazer pelo toast e mudo.
 */
import React from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

const mockRouter: any = {
  push: jest.fn(),
  replace: jest.fn(),
  pathname: '/admin/porta',
  query: {},
  asPath: '/admin/porta',
  isReady: true,
  events: { on: jest.fn(), off: jest.fn() },
};
jest.mock('next/router', () => ({ useRouter: () => mockRouter }));
jest.mock('next/link', () => ({ children, href, ...rest }: any) => (
  <a href={href} {...rest}>
    {children}
  </a>
));

jest.mock('@/services/api_client', () => ({
  apiClient: { get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn(), patch: jest.fn() },
  extractApiErrorMessage: (_e: unknown, fallback: string) => fallback,
}));

jest.mock('@/pages/admin/admin_layout', () => ({
  __esModule: true,
  default: ({ children }: any) => <div data-testid="admin-layout">{children}</div>,
}));

const mockCan = jest.fn((_feature: string, _action: string) => true);
jest.mock('@/hooks/usePermissions', () => ({
  usePermissions: () => ({ can: mockCan, permissions: null, loading: false, refresh: jest.fn() }),
}));

const mockToast: any = Object.assign(jest.fn(), { success: jest.fn(), error: jest.fn(), info: jest.fn() });
jest.mock('sonner', () => ({ toast: mockToast }));

const GIRA = { id: 'g1', nome: 'Gira de Caboclos', data_inicio: new Date().toISOString(), is_active: true };

const item = (id: string, numero: number, extra: Record<string, unknown> = {}) => ({
  id,
  numero,
  numero_formatado: `#${String(numero).padStart(4, '0')}`,
  status: 'emitted',
  consulente_nome: `Pessoa ${numero}`,
  consulente_telefone: null,
  preferencial: false,
  is_sponsor: false,
  is_walk_in: false,
  checkin_em: null,
  atendido_em: null,
  chamado_em: null,
  finalizado_em: null,
  medium_nome: null,
  cambone_nome: null,
  atendimento_descricao: null,
  ...extra,
});

let QUEUE: any[] = [];

function mockApi() {
  const { apiClient } = require('@/services/api_client');
  apiClient.get.mockImplementation((url: string) => {
    if (url === '/api/v1/admin/giras') return Promise.resolve({ data: [GIRA] });
    if (url === '/api/v1/admin/door/config') return Promise.resolve({ data: { enable_walk_in: true } });
    if (url.startsWith('/api/v1/admin/mediuns/options')) return Promise.resolve({ data: [] });
    if (url.endsWith('/door/stats')) {
      return Promise.resolve({
        data: { total: 5, checked_in: 2, awaiting: 1, in_progress: 0, completed: 1, no_show: 1, walk_in: 1, preferenciais: 0, patrocinados: 0 },
      });
    }
    if (url.endsWith('/door/queue')) return Promise.resolve({ data: { items: QUEUE } });
    return Promise.resolve({ data: {} });
  });
  apiClient.patch.mockResolvedValue({ data: {} });
  apiClient.delete.mockResolvedValue({ data: {} });
  apiClient.post.mockResolvedValue({ data: item('w1', 9, { is_walk_in: true }) });
  return apiClient;
}

async function renderPorta() {
  const Porta = require('@/pages/admin/porta').default;
  render(<Porta />);
  await waitFor(() => expect(screen.getByTestId('porta-indicadores')).toBeInTheDocument());
  await waitFor(() => expect(screen.queryByRole('status', { name: 'Carregando a fila' })).not.toBeInTheDocument());
}

jest.setTimeout(20000);

describe('Porta — modo operação', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCan.mockImplementation(() => true);
    mockRouter.query = {};
    window.localStorage.clear();
    window.sessionStorage.clear();
    QUEUE = [
      item('t1', 1),
      item('t2', 2, { checkin_em: '2026-10-06T19:00:00Z' }),
      item('t3', 3, { checkin_em: '2026-10-06T19:01:00Z', is_walk_in: true }),
      item('t4', 4, { status: 'completed' }),
      item('t5', 5, { status: 'no_show' }),
    ];
  });

  it('"Chamar próximo" chama quem já chegou, na ordem da API, e registra o atendimento', async () => {
    const api = mockApi();
    await renderPorta();
    const chamar = screen.getByRole('button', { name: /Chamar próximo · 0002/ });
    fireEvent.click(chamar);
    const dialog = await screen.findByTestId('attend-modal');
    expect(within(dialog).getByText('Chamar senha 0002')).toBeInTheDocument();
    fireEvent.change(within(dialog).getByLabelText(/^Médium/), { target: { value: 'Mãe Joana' } });
    await act(async () => {
      fireEvent.click(within(dialog).getByRole('button', { name: 'Atendido' }));
    });
    expect(api.patch).toHaveBeenCalledWith('/api/v1/admin/door/tickets/t2/attend', expect.objectContaining({ medium_nome: 'Mãe Joana' }));
  });

  it('sem ninguém marcado como chegou, chama o primeiro da fila', async () => {
    QUEUE = [item('t7', 7), item('t8', 8)];
    mockApi();
    await renderPorta();
    expect(screen.getByRole('button', { name: /Chamar próximo · 0007/ })).toBeInTheDocument();
  });

  it('usa o vocabulário do terreiro e mostra os indicadores numa linha', async () => {
    mockApi();
    await renderPorta();
    expect(screen.getByTestId('porta-indicadores')).toHaveTextContent('3 aguardando · 1 atendidos · 1 não veio');
    expect(screen.getByRole('button', { name: /Sem senha/ })).toBeInTheDocument();
    expect(screen.getAllByText('Chegou').length).toBeGreaterThan(0);
    expect(screen.queryByText(/Walk-in|Check-in|Ausente/)).not.toBeInTheDocument();
    // Número sem cerquilha
    expect(screen.queryByText(/#000/)).not.toBeInTheDocument();
  });

  it('o menu da senha tem Chegou, Chamar e Não veio; "Não veio" oferece Desfazer no toast', async () => {
    const api = mockApi();
    await renderPorta();
    const trigger = screen.getByRole('button', { name: 'Ações da senha 0001' });
    fireEvent.keyDown(trigger, { key: 'Enter' });
    const menu = await screen.findByRole('menu');
    expect(within(menu).getByRole('menuitem', { name: /Chegou/ })).toBeInTheDocument();
    expect(within(menu).getByRole('menuitem', { name: /Chamar/ })).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(within(menu).getByRole('menuitem', { name: /Não veio/ }));
    });
    expect(api.patch).toHaveBeenCalledWith('/api/v1/admin/door/tickets/t1/no-show');
    const [msg, opts] = mockToast.success.mock.calls.find((c: any[]) => c[1]?.action) ?? [];
    expect(msg).toBe('0001: não veio');
    expect(opts.action.label).toBe('Desfazer');
    await act(async () => {
      await opts.action.onClick();
    });
    expect(api.patch).toHaveBeenCalledWith('/api/v1/admin/door/tickets/t1/undo');
  });

  it('o botão de mudo alterna e fica salvo neste navegador', async () => {
    mockApi();
    await renderPorta();
    const mute = screen.getByRole('button', { name: 'Silenciar o aviso sonoro' });
    expect(mute).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(mute);
    expect(screen.getByRole('button', { name: 'Ligar o aviso sonoro' })).toHaveAttribute('aria-pressed', 'true');
    expect(window.localStorage.getItem('girahub:porta-som-mudo')).toBe('1');
  });

  it('indicadores abrem o resumo com os finalizados', async () => {
    mockApi();
    await renderPorta();
    fireEvent.click(screen.getByRole('button', { name: /Ver resumo/ }));
    expect(await screen.findByText('Resumo da gira')).toBeInTheDocument();
    expect(screen.getByTestId('porta-resumo')).toHaveTextContent('Sem senha');
  });

  it('sem permissão de editar não mostra "Chamar próximo" nem menus; sem inserir, não mostra "Sem senha"', async () => {
    mockCan.mockImplementation((_f: string, action: string) => action === 'view');
    mockApi();
    await renderPorta();
    expect(screen.queryByRole('button', { name: /Chamar próximo/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Ações da senha/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Sem senha/ })).not.toBeInTheDocument();
  });

  it('sem rede mostra "Sem conexão" mantendo a fila; ao voltar, avisa e atualiza na hora', async () => {
    const api = mockApi();
    await renderPorta();
    expect(screen.queryByText('Sem conexão — mostrando a última fila carregada')).not.toBeInTheDocument();

    const onLine = jest.spyOn(window.navigator, 'onLine', 'get').mockReturnValue(false);
    act(() => {
      window.dispatchEvent(new Event('offline'));
    });
    expect(screen.getByTestId('porta-sem-conexao')).toHaveAttribute('role', 'status');
    expect(screen.getByText('Sem conexão — mostrando a última fila carregada')).toBeInTheDocument();
    // A última fila continua na tela.
    expect(screen.getAllByTestId('fila-item').length).toBeGreaterThan(0);

    const queueCallsBefore = api.get.mock.calls.filter((c: any[]) => String(c[0]).endsWith('/door/queue')).length;
    onLine.mockReturnValue(true);
    await act(async () => {
      window.dispatchEvent(new Event('online'));
    });
    await waitFor(() =>
      expect(screen.queryByText('Sem conexão — mostrando a última fila carregada')).not.toBeInTheDocument(),
    );
    expect(mockToast.success).toHaveBeenCalledWith('Conexão de volta');
    const queueCallsAfter = api.get.mock.calls.filter((c: any[]) => String(c[0]).endsWith('/door/queue')).length;
    expect(queueCallsAfter).toBeGreaterThan(queueCallsBefore);
    onLine.mockRestore();
  });

  it('duas falhas seguidas da atualização também mostram "Sem conexão" (um toast de erro só)', async () => {
    jest.useFakeTimers();
    try {
      const api = mockApi();
      await renderPorta();
      const ok = api.get.getMockImplementation();
      api.get.mockImplementation((url: string) =>
        url.endsWith('/door/queue') ? Promise.reject(new Error('Network Error')) : ok(url),
      );
      await act(async () => {
        jest.advanceTimersByTime(8000);
      });
      expect(screen.queryByText('Sem conexão — mostrando a última fila carregada')).not.toBeInTheDocument();
      await act(async () => {
        jest.advanceTimersByTime(8000);
      });
      expect(screen.getByText('Sem conexão — mostrando a última fila carregada')).toBeInTheDocument();
      expect(mockToast.error.mock.calls.filter((c: any[]) => c[0] === 'Erro ao carregar a fila.')).toHaveLength(1);

      api.get.mockImplementation(ok);
      await act(async () => {
        jest.advanceTimersByTime(8000);
      });
      expect(screen.queryByText('Sem conexão — mostrando a última fila carregada')).not.toBeInTheDocument();
      expect(mockToast.success).toHaveBeenCalledWith('Conexão de volta');
    } finally {
      jest.useRealTimers();
    }
  });

  it('sem permissão de ver a Porta mostra o aviso padrão', () => {
    mockCan.mockImplementation(() => false);
    mockApi();
    const Porta = require('@/pages/admin/porta').default;
    render(<Porta />);
    expect(screen.getByText('Você não tem permissão para visualizar este módulo.')).toBeInTheDocument();
  });
});
