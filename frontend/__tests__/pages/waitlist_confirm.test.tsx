/**
 * /public/waitlist/[ticketId]/confirm — tela de decisão: abrir o link não confirma nada.
 */
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const mockRouter = {
  push: jest.fn(),
  replace: jest.fn(),
  query: { ticketId: 't-1' },
  isReady: true,
  events: { on: jest.fn(), off: jest.fn() },
};
jest.mock('next/router', () => ({ useRouter: () => mockRouter }));
jest.mock('@/services/api_client', () => ({
  apiClient: { get: jest.fn(), post: jest.fn() },
  extractApiErrorMessage: (err: unknown, fallback: string) => (err as { detail?: string })?.detail || fallback,
}));

import Page from '@/pages/public/waitlist/[ticketId]/confirm';

const { apiClient } = jest.requireMock('@/services/api_client');

const cancelInfo = {
  ticket_number: 'F003',
  status: 'waitlisted',
  cancellable: true,
  reason: null,
  gira_name: 'Gira de Exu',
  gira_date: '08/10/2026 às 19:00',
  tenant_name: 'Tenda Pai Joaquim',
  tenant_slug: 'tenda-pai-joaquim',
  consulente_name: 'Maria',
  waitlisted: true,
};

const ticket = {
  ticket_number: 'F003',
  status: 'waitlisted',
  status_label: 'Na fila de espera',
  waitlisted: true,
  cancellable: true,
  cancel_reason: null,
  gira_name: 'Gira de Exu',
  gira_date: '08/10/2026 às 19:00',
  gira_date_iso: '2026-10-08T22:00:00+00:00',
  gira_local: 'Salão',
  horario: null,
  recados: null,
  tenant_name: 'Tenda Pai Joaquim',
  tenant_slug: 'tenda-pai-joaquim',
  tenant_address: 'Rua A, 1',
  maps_url: null,
  tenant_logo_url: null,
  primary_color: null,
  secondary_color: null,
  consulente_name: 'Maria',
  acompanhantes: [],
};

function mockLoad(info = cancelInfo, full: unknown = ticket) {
  apiClient.get.mockImplementation((url: string) => {
    if (url.endsWith('/cancel-info')) return Promise.resolve({ data: info });
    return Promise.resolve({ data: full });
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  window.scrollTo = jest.fn();
});

describe('Confirmação da fila de espera', () => {
  it('carrega os dados e só confirma no botão', async () => {
    mockLoad();
    render(<Page />);

    expect(await screen.findByRole('heading', { name: 'Abriu uma vaga para você!' })).toBeInTheDocument();
    expect(apiClient.get).toHaveBeenCalledWith('/api/v1/public/tickets/t-1/cancel-info');
    expect(apiClient.get).toHaveBeenCalledWith('/api/v1/public/tenda-pai-joaquim/ticket/t-1');
    expect(apiClient.post).not.toHaveBeenCalled();
    expect(screen.getByText('Quinta-feira, 8 de outubro às 19h')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Não vou poder ir' })).toHaveAttribute('href', '/public/ticket/t-1/cancelar');

    apiClient.post.mockResolvedValue({ data: { ticket_number: '0051', message: 'Senha confirmada com sucesso.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar minha senha' }));

    expect(await screen.findByRole('heading', { name: 'Senha confirmada!' })).toBeInTheDocument();
    expect(apiClient.post).toHaveBeenCalledWith('/api/v1/public/waitlist/t-1/confirm');
    expect(screen.getByTestId('ticket-number')).toHaveTextContent('0051');
    expect(screen.getByRole('button', { name: /adicionar à agenda/i })).toBeInTheDocument();
  });

  it('senha já confirmada mostra o bilhete direto', async () => {
    mockLoad({ ...cancelInfo, status: 'emitted', waitlisted: false }, { ...ticket, status: 'emitted', status_label: 'Confirmada', waitlisted: false });
    render(<Page />);
    expect(await screen.findByRole('heading', { name: 'Senha confirmada!' })).toBeInTheDocument();
    expect(apiClient.post).not.toHaveBeenCalled();
  });

  it('prazo expirado (410 ao confirmar) leva às próximas giras', async () => {
    mockLoad();
    render(<Page />);
    apiClient.post.mockRejectedValue({ status: 410, detail: 'O prazo para confirmar terminou.' });
    fireEvent.click(await screen.findByRole('button', { name: 'Confirmar minha senha' }));

    expect(await screen.findByRole('heading', { name: 'Prazo expirado' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ver próximas giras' })).toHaveAttribute('href', '/public/tenda-pai-joaquim');
  });

  it('erro ao confirmar oferece tentar de novo', async () => {
    mockLoad();
    render(<Page />);
    apiClient.post.mockRejectedValueOnce({ status: 500 });
    fireEvent.click(await screen.findByRole('button', { name: 'Confirmar minha senha' }));

    expect(await screen.findByRole('heading', { name: 'Não foi possível confirmar' })).toBeInTheDocument();
    apiClient.post.mockResolvedValueOnce({ data: { ticket_number: 'F003', message: 'ok' } });
    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));
    await waitFor(() => expect(apiClient.post).toHaveBeenCalledTimes(2));
    expect(await screen.findByRole('heading', { name: 'Senha confirmada!' })).toBeInTheDocument();
  });

  it('404 ≠ erro de rede', async () => {
    apiClient.get.mockRejectedValueOnce({ status: 404 });
    const { unmount } = render(<Page />);
    expect(await screen.findByRole('heading', { name: 'Senha não encontrada' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Tentar de novo' })).not.toBeInTheDocument();
    unmount();

    apiClient.get.mockRejectedValueOnce({ status: 0 });
    render(<Page />);
    expect(await screen.findByRole('heading', { name: 'Não foi possível carregar' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tentar de novo' })).toBeInTheDocument();
  });
});
