/**
 * Modo TV (T-04): a tela pública da sala de espera lê só `GET /giras/{id}/door/tv`
 * (número, nome reduzido no servidor, próximas e última chamada) — nunca a fila completa
 * com e-mail e telefone (`/door/queue`).
 */
import React from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';

const mockRouter: any = {
  push: jest.fn(),
  replace: jest.fn(),
  pathname: '/admin/porta/kiosk',
  query: {},
  asPath: '/admin/porta/kiosk',
  isReady: true,
  events: { on: jest.fn(), off: jest.fn() },
};
jest.mock('next/router', () => ({ useRouter: () => mockRouter }));
jest.mock('next/head', () => ({ __esModule: true, default: ({ children }: any) => <>{children}</> }));

jest.mock('@/services/api_client', () => ({
  apiClient: { get: jest.fn() },
}));

const mockCan = jest.fn((_feature: string, _action: string) => true);
let mockPermLoading = false;
jest.mock('@/hooks/usePermissions', () => ({
  usePermissions: () => ({ can: mockCan, permissions: null, loading: mockPermLoading, refresh: jest.fn() }),
}));

const GIRA = { id: 'g1', nome: 'Gira de Caboclos', data_inicio: new Date().toISOString(), is_active: true };
const OUTRA = { id: 'g2', nome: 'Gira de Pretos-Velhos', data_inicio: new Date().toISOString(), is_active: true };

let TV: any;
let mockPlay: jest.SpyInstance;

function mockApi() {
  const { apiClient } = require('@/services/api_client');
  apiClient.get.mockImplementation((url: string) => {
    if (url === '/api/v1/admin/giras') return Promise.resolve({ data: [GIRA, OUTRA] });
    if (url.endsWith('/door/tv')) return Promise.resolve({ data: TV });
    return Promise.reject(new Error(`URL inesperada no modo TV: ${url}`));
  });
  return apiClient;
}

async function renderKiosk() {
  const Kiosk = require('@/pages/admin/porta/kiosk').default;
  await act(async () => {
    render(<Kiosk />);
  });
}

describe('Modo TV da Porta', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCan.mockImplementation(() => true);
    mockPermLoading = false;
    mockRouter.query = {};
    mockPlay = jest.spyOn(window.HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
    TV = {
      gira_nome: 'Gira de Caboclos',
      atual: { numero_formatado: '0042', nome: 'Maria S.', chamado_em: null },
      proximas: ['0043', 'P003', '0045'],
      ultima_chamada: { numero_formatado: '0041', nome: null, chamado_em: '2026-10-06T22:15:00Z' },
    };
  });

  it('mostra o número atual, o nome reduzido, as próximas e a última chamada', async () => {
    mockApi();
    await renderKiosk();

    expect(await screen.findByTestId('kiosk-numero')).toHaveTextContent('0042');
    expect(screen.getByTestId('kiosk-nome')).toHaveTextContent('Maria S.');
    expect(screen.getAllByTestId('kiosk-proxima').map((li) => li.textContent)).toEqual(['0043', 'P003', '0045']);
    expect(screen.getByTestId('kiosk-ultima')).toHaveTextContent('Última chamada: 0041');
    expect(screen.getByText('Gira de Caboclos')).toBeInTheDocument();
  });

  it('só consome o endpoint enxuto da TV — nunca /door/queue', async () => {
    const api = mockApi();
    mockRouter.query = { gira: 'g2' };
    await renderKiosk();
    await screen.findByTestId('kiosk-numero');

    const urls = api.get.mock.calls.map((c: unknown[]) => c[0] as string);
    expect(urls).toContain('/api/v1/admin/giras/g2/door/tv');
    expect(urls.some((u: string) => u.includes('/door/queue'))).toBe(false);
    expect(urls.every((u: string) => u === '/api/v1/admin/giras' || u.endsWith('/door/tv'))).toBe(true);
  });

  it('sem ninguém que chegou, avisa que aguarda a próxima pessoa', async () => {
    TV = { gira_nome: 'Gira de Caboclos', atual: null, proximas: ['0001'], ultima_chamada: null };
    mockApi();
    await renderKiosk();

    expect(await screen.findByText('Aguardando a próxima pessoa chegar')).toBeInTheDocument();
    expect(screen.getByTestId('kiosk-numero')).toHaveTextContent('—');
    expect(screen.queryByTestId('kiosk-nome')).not.toBeInTheDocument();
    expect(screen.queryByTestId('kiosk-ultima')).not.toBeInTheDocument();
  });

  afterEach(() => {
    mockPlay.mockRestore();
  });

  it('atualiza sozinho a cada ciclo de polling e toca o aviso quando o número muda', async () => {
    jest.useFakeTimers();
    try {
      mockApi();
      await renderKiosk();
      await waitFor(() => expect(screen.getByTestId('kiosk-numero')).toHaveTextContent('0042'));

      TV = { ...TV, atual: { numero_formatado: '0043', nome: 'João P.', chamado_em: null }, proximas: ['P003'] };
      await act(async () => {
        jest.advanceTimersByTime(8000);
      });

      await waitFor(() => expect(screen.getByTestId('kiosk-numero')).toHaveTextContent('0043'));
      expect(screen.getByTestId('kiosk-nome')).toHaveTextContent('João P.');
      expect(mockPlay).toHaveBeenCalledTimes(1);
    } finally {
      jest.useRealTimers();
    }
  });

  it('sem o grupo Porta (view) mostra "Sem permissão" e não chama a API', async () => {
    const api = mockApi();
    mockCan.mockImplementation(() => false);
    await renderKiosk();

    expect(await screen.findByText('Sem permissão')).toBeInTheDocument();
    expect(api.get).not.toHaveBeenCalled();
  });
});
