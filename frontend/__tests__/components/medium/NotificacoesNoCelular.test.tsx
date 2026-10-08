/**
 * AM-16 — "Notificações no celular" no Perfil da Área: some sem as chaves no servidor; permissão
 * só no toque; inscreve e manda à API; negado/bloqueado explicam sem erro cru; iPhone fora da tela
 * inicial oferece o passo de instalação; liga/desliga por tipo; desligar o aparelho; só leitura
 * impersonando; "Sair" tira o aparelho.
 */
import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';

const mockGet = jest.fn();
const mockPost = jest.fn();
const mockPut = jest.fn();
const mockDelete = jest.fn();
jest.mock('@/services/api_client', () => ({
  apiClient: {
    get: (...a: unknown[]) => mockGet(...a),
    post: (...a: unknown[]) => mockPost(...a),
    put: (...a: unknown[]) => mockPut(...a),
    delete: (...a: unknown[]) => mockDelete(...a),
  },
}));
const mockSuccess = jest.fn();
jest.mock('@/contexts/SnackbarContext', () => ({
  useSnackbar: () => ({ showSuccess: mockSuccess, showError: jest.fn() }),
}));

import { NotificacoesNoCelular, desligarCelularAoSair } from '@/components/medium/perfil/NotificacoesNoCelular';

const TODOS = { mensalidade: true, escalas: true, confirmacao: true, faltas: true, avisos: true };
const CHAVE = 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM';
const ESTADO = {
  disponivel: true,
  chave_publica: CHAVE,
  aparelhos: 0,
  preferencias: TODOS,
  disponiveis: ['mensalidade', 'avisos'],
};
const NOVO = 'https://fcm.googleapis.com/fcm/send/novo';
const UA_ORIGINAL = navigator.userAgent;

function inscricao(endpoint: string) {
  return {
    endpoint,
    toJSON: () => ({ endpoint, expirationTime: null, keys: { p256dh: 'P'.repeat(20), auth: 'A'.repeat(10) } }),
    unsubscribe: jest.fn(async () => true),
  };
}

function navegador({
  permissao = 'default',
  inscrito = null as string | null,
  pedir = 'granted',
  push = true,
}: { permissao?: string; inscrito?: string | null; pedir?: string; push?: boolean } = {}) {
  let atual: ReturnType<typeof inscricao> | null = inscrito ? inscricao(inscrito) : null;
  const pushManager = {
    getSubscription: jest.fn(async () => atual),
    subscribe: jest.fn(async () => {
      atual = inscricao(NOVO);
      return atual;
    }),
  };
  const reg = { pushManager };
  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    value: { ready: Promise.resolve(reg), getRegistration: jest.fn(async () => reg) },
  });
  if (push) (window as any).PushManager = function PushManager() {};
  const Notif: any = function Notification() {};
  Notif.permission = permissao;
  Notif.requestPermission = jest.fn(async () => {
    Notif.permission = pedir;
    return pedir;
  });
  (window as any).Notification = Notif;
  return { pushManager, Notif, atual: () => atual };
}

function userAgent(ua: string) {
  Object.defineProperty(navigator, 'userAgent', { configurable: true, value: ua });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockPost.mockImplementation(async (url: string) =>
    url.endsWith('/teste') ? { data: { enviadas: 1 } } : { data: { ...ESTADO, aparelhos: 1 } },
  );
  mockDelete.mockResolvedValue({ status: 204 });
});

afterEach(() => {
  delete (window as any).PushManager;
  delete (window as any).Notification;
  delete (navigator as any).serviceWorker;
  userAgent(UA_ORIGINAL);
});

it('some quando o servidor não tem as chaves (disponivel: false) ou a resposta não serve', async () => {
  navegador();
  mockGet.mockResolvedValueOnce({ data: { ...ESTADO, disponivel: false, chave_publica: null } });
  const { container, unmount } = render(<NotificacoesNoCelular />);
  await waitFor(() => expect(mockGet).toHaveBeenCalledWith('/api/v1/medium/push'));
  expect(container).toBeEmptyDOMElement();
  unmount();
  mockGet.mockResolvedValueOnce({ data: {} });
  const outro = render(<NotificacoesNoCelular />);
  await waitFor(() => expect(mockGet).toHaveBeenCalledTimes(2));
  expect(outro.container).toBeEmptyDOMElement();
});

it('pede a permissão só no toque, inscreve o aparelho e mostra os tipos e o teste', async () => {
  const nav = navegador();
  mockGet.mockResolvedValue({ data: ESTADO });
  render(<NotificacoesNoCelular />);
  const aparelho = await screen.findByTestId('push-aparelho');
  expect(aparelho).toHaveAttribute('aria-checked', 'false');
  expect(nav.Notif.requestPermission).not.toHaveBeenCalled();
  expect(mockPost).not.toHaveBeenCalled();
  expect(screen.queryByTestId('push-tipo-avisos')).not.toBeInTheDocument();

  await act(async () => {
    fireEvent.click(aparelho);
  });
  expect(nav.Notif.requestPermission).toHaveBeenCalled();
  const opcoes = (nav.pushManager.subscribe.mock.calls[0] as unknown[])[0] as {
    userVisibleOnly: boolean;
    applicationServerKey: Uint8Array;
  };
  expect(opcoes.userVisibleOnly).toBe(true);
  expect(opcoes.applicationServerKey).toHaveLength(65);
  expect(mockPost).toHaveBeenCalledWith('/api/v1/medium/push/inscricao', {
    endpoint: NOVO,
    keys: { p256dh: 'P'.repeat(20), auth: 'A'.repeat(10) },
  });
  await waitFor(() => expect(screen.getByTestId('push-aparelho')).toHaveAttribute('aria-checked', 'true'));
  expect(mockSuccess).toHaveBeenCalled();
  expect(screen.getByTestId('push-tipo-mensalidade')).toBeInTheDocument();
  expect(screen.getByTestId('push-tipo-avisos')).toBeInTheDocument();
  expect(screen.queryByTestId('push-tipo-faltas')).not.toBeInTheDocument();

  await act(async () => {
    fireEvent.click(screen.getByTestId('push-teste'));
  });
  expect(mockPost).toHaveBeenCalledWith('/api/v1/medium/push/teste');
});

it('pessoa recusou a permissão: explica como liberar, sem chamar a API', async () => {
  navegador({ pedir: 'denied' });
  mockGet.mockResolvedValue({ data: ESTADO });
  render(<NotificacoesNoCelular />);
  const aparelho = await screen.findByTestId('push-aparelho');
  await act(async () => {
    fireEvent.click(aparelho);
  });
  expect(await screen.findByRole('alert')).toHaveTextContent('Você não permitiu as notificações');
  expect(mockPost).not.toHaveBeenCalled();
  expect(screen.getByTestId('push-bloqueado')).toBeInTheDocument();
});

it('permissão já bloqueada no navegador: mostra como liberar em vez do botão', async () => {
  navegador({ permissao: 'denied' });
  mockGet.mockResolvedValue({ data: ESTADO });
  render(<NotificacoesNoCelular />);
  expect(await screen.findByTestId('push-bloqueado')).toHaveTextContent('permita para este site');
  expect(screen.queryByTestId('push-aparelho')).not.toBeInTheDocument();
});

it('API recusou a inscrição: desfaz no navegador e mostra a mensagem do servidor', async () => {
  const nav = navegador();
  mockGet.mockResolvedValue({ data: ESTADO });
  mockPost.mockRejectedValueOnce({
    response: { status: 422, data: { message: 'Este navegador não pode receber notificações da Área.' } },
  });
  render(<NotificacoesNoCelular />);
  const aparelho = await screen.findByTestId('push-aparelho');
  await act(async () => {
    fireEvent.click(aparelho);
  });
  expect(await screen.findByRole('alert')).toHaveTextContent('Este navegador não pode receber');
  expect(nav.atual()?.unsubscribe).toHaveBeenCalled();
  expect(screen.getByTestId('push-aparelho')).toHaveAttribute('aria-checked', 'false');
});

it('iPhone fora da tela inicial: explica e abre o passo de instalação', async () => {
  navegador({ push: false });
  userAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Safari/604.1');
  const onInstalar = jest.fn();
  mockGet.mockResolvedValue({ data: ESTADO });
  render(<NotificacoesNoCelular onInstalar={onInstalar} />);
  expect(await screen.findByTestId('push-iphone')).toHaveTextContent('iOS 16.4');
  fireEvent.click(screen.getByRole('button', { name: /Pôr a Área na tela inicial/ }));
  expect(onInstalar).toHaveBeenCalled();
  expect(screen.queryByTestId('push-aparelho')).not.toBeInTheDocument();
});

it('navegador sem suporte: avisa, sem botão', async () => {
  navegador({ push: false });
  mockGet.mockResolvedValue({ data: ESTADO });
  render(<NotificacoesNoCelular />);
  expect(await screen.findByTestId('push-sem-suporte')).toBeInTheDocument();
  expect(screen.queryByRole('switch')).not.toBeInTheDocument();
});

it('já inscrito: sincroniza ao abrir, muda um tipo e desliga o aparelho', async () => {
  const nav = navegador({ permissao: 'granted', inscrito: 'https://fcm.googleapis.com/fcm/send/antigo' });
  mockGet.mockResolvedValue({ data: { ...ESTADO, aparelhos: 1 } });
  mockPut.mockResolvedValue({ data: { ...ESTADO, aparelhos: 1, preferencias: { ...TODOS, avisos: false } } });
  render(<NotificacoesNoCelular />);
  await waitFor(() => expect(screen.getByTestId('push-aparelho')).toHaveAttribute('aria-checked', 'true'));
  expect(mockPost).toHaveBeenCalledWith(
    '/api/v1/medium/push/inscricao',
    expect.objectContaining({ endpoint: 'https://fcm.googleapis.com/fcm/send/antigo' }),
  );

  await act(async () => {
    fireEvent.click(screen.getByTestId('push-tipo-avisos'));
  });
  expect(mockPut).toHaveBeenCalledWith('/api/v1/medium/push/preferencias', { avisos: false });
  await waitFor(() => expect(screen.getByTestId('push-tipo-avisos')).toHaveAttribute('aria-checked', 'false'));

  const antiga = nav.atual();
  await act(async () => {
    fireEvent.click(screen.getByTestId('push-aparelho'));
  });
  expect(mockDelete).toHaveBeenCalledWith('/api/v1/medium/push/inscricao', {
    data: { endpoint: 'https://fcm.googleapis.com/fcm/send/antigo' },
  });
  expect(antiga?.unsubscribe).toHaveBeenCalled();
  await waitFor(() => expect(screen.getByTestId('push-aparelho')).toHaveAttribute('aria-checked', 'false'));
  expect(nav.Notif.requestPermission).not.toHaveBeenCalled();
});

it('impersonando: só leitura, sem botões nem sincronização', async () => {
  navegador({ permissao: 'granted', inscrito: 'https://fcm.googleapis.com/fcm/send/x' });
  mockGet.mockResolvedValue({ data: { ...ESTADO, aparelhos: 2, preferencias: { ...TODOS, mensalidade: false } } });
  render(<NotificacoesNoCelular somenteLeitura />);
  expect(await screen.findByTestId('push-aparelhos')).toHaveTextContent('2');
  expect(screen.getByTestId('push-tipo-mensalidade-estado')).toHaveTextContent('Desligado');
  expect(screen.getByTestId('push-tipo-avisos-estado')).toHaveTextContent('Ligado');
  expect(screen.queryByRole('switch')).not.toBeInTheDocument();
  expect(screen.queryByTestId('push-teste')).not.toBeInTheDocument();
  expect(mockPost).not.toHaveBeenCalled();
});

it('"Sair" tira este aparelho das notificações (servidor e navegador)', async () => {
  const nav = navegador({ permissao: 'granted', inscrito: 'https://fcm.googleapis.com/fcm/send/meu' });
  const sub = nav.atual();
  await desligarCelularAoSair();
  expect(mockDelete).toHaveBeenCalledWith('/api/v1/medium/push/inscricao', {
    data: { endpoint: 'https://fcm.googleapis.com/fcm/send/meu' },
  });
  expect(sub?.unsubscribe).toHaveBeenCalled();
  // Sem inscrição (ou sem suporte): não chama nada.
  mockDelete.mockClear();
  delete (window as any).PushManager;
  await desligarCelularAoSair();
  expect(mockDelete).not.toHaveBeenCalled();
});
