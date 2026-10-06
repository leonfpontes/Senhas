/**
 * /public/ticket/[ticketId]/cancelar — só cancela depois da confirmação explícita.
 */
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';

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

import Page from '@/pages/public/ticket/[ticketId]/cancelar';

const { apiClient } = jest.requireMock('@/services/api_client');

const cancelInfo = {
  ticket_number: '0042',
  status: 'emitted',
  cancellable: true,
  reason: null,
  gira_name: 'Gira de Caboclos',
  gira_date: '08/10/2026 às 19:00',
  tenant_name: 'Tenda Pai Joaquim',
  tenant_slug: 'tenda-pai-joaquim',
  consulente_name: 'Maria',
  waitlisted: false,
  acompanhantes: [{ ticket_number: '0043', name: 'João' }],
};

const ticket = {
  ...cancelInfo,
  status_label: 'Confirmada',
  cancel_reason: null,
  gira_date_iso: '2026-10-08T22:00:00+00:00',
  gira_local: 'Salão',
  horario: null,
  recados: null,
  tenant_address: 'Rua A, 1',
  maps_url: null,
  tenant_logo_url: null,
  primary_color: '#2e7d32',
  secondary_color: null,
};

function mockLoad(info: Record<string, unknown> = cancelInfo, full: unknown = ticket) {
  apiClient.get.mockImplementation((url: string) => {
    if (url.endsWith('/cancel-info')) return Promise.resolve({ data: info });
    return full ? Promise.resolve({ data: full }) : Promise.reject({ status: 500 });
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  window.scrollTo = jest.fn();
});

describe('Cancelar minha senha', () => {
  it('pede confirmação, avisa dos acompanhantes e não cancela ao abrir', async () => {
    mockLoad();
    render(<Page />);

    expect(await screen.findByRole('heading', { name: 'Cancelar sua senha?' })).toBeInTheDocument();
    expect(screen.getByTestId('ticket-number')).toHaveTextContent('0042');
    expect(screen.getByText('Quinta-feira, 8 de outubro às 19h')).toBeInTheDocument();
    expect(screen.getByText(/0043 \(João\)/)).toBeInTheDocument();
    expect(apiClient.post).not.toHaveBeenCalled();
  });

  it('"Sim, cancelar" chama a API e mostra a senha riscada', async () => {
    mockLoad();
    render(<Page />);
    apiClient.post.mockResolvedValue({ data: { ticket_number: '0042', message: 'Sua senha foi cancelada.' } });

    fireEvent.click(await screen.findByRole('button', { name: 'Sim, cancelar minha senha' }));

    expect(await screen.findByRole('heading', { name: 'Senha cancelada' })).toBeInTheDocument();
    expect(apiClient.post).toHaveBeenCalledWith('/api/v1/public/tickets/t-1/cancel');
    expect(screen.getByText('Sua senha foi cancelada.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ver próximas giras' })).toHaveAttribute('href', '/public/tenda-pai-joaquim');
  });

  it('"Manter minha senha" mostra o bilhete sem cancelar', async () => {
    mockLoad();
    render(<Page />);
    fireEvent.click(await screen.findByRole('button', { name: 'Manter minha senha' }));

    expect(await screen.findByRole('heading', { name: 'Sua senha continua valendo' })).toBeInTheDocument();
    expect(screen.getByText('Rua A, 1')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /cancelar minha senha/i })).not.toBeInTheDocument();
    expect(apiClient.post).not.toHaveBeenCalled();
  });

  it('"Manter" sem bilhete completo cai num aviso de sucesso', async () => {
    mockLoad(cancelInfo, null);
    render(<Page />);
    fireEvent.click(await screen.findByRole('button', { name: 'Manter minha senha' }));
    expect(await screen.findByRole('heading', { name: 'Sua senha continua valendo' })).toBeInTheDocument();
    expect(screen.getByText(/Nada foi cancelado\. Senha 0042/)).toBeInTheDocument();
  });

  it('erro ao cancelar é separado do erro de carga e permite tentar de novo ou manter', async () => {
    mockLoad();
    render(<Page />);
    apiClient.post.mockRejectedValueOnce({ status: 500, detail: 'Falha temporária.' });
    fireEvent.click(await screen.findByRole('button', { name: 'Sim, cancelar minha senha' }));

    expect(await screen.findByRole('heading', { name: 'Não foi possível cancelar' })).toBeInTheDocument();
    expect(screen.getByText('Falha temporária.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Manter minha senha' })).toBeInTheDocument();

    apiClient.post.mockResolvedValueOnce({ data: { ticket_number: '0042', message: 'Cancelada.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));
    expect(await screen.findByRole('heading', { name: 'Senha cancelada' })).toBeInTheDocument();
  });

  it('senha não cancelável mostra o motivo', async () => {
    mockLoad({ ...cancelInfo, cancellable: false, reason: 'A gira já começou.' });
    render(<Page />);
    expect(await screen.findByRole('heading', { name: 'Cancelamento indisponível' })).toBeInTheDocument();
    expect(screen.getByText('A gira já começou.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /cancelar/i })).not.toBeInTheDocument();
  });

  it('404 diz "Senha não encontrada"; erro de rede oferece tentar de novo', async () => {
    apiClient.get.mockRejectedValueOnce({ status: 404 });
    const { unmount } = render(<Page />);
    expect(await screen.findByRole('heading', { name: 'Senha não encontrada' })).toBeInTheDocument();
    unmount();

    apiClient.get.mockRejectedValueOnce({ status: 0 });
    render(<Page />);
    expect(await screen.findByRole('heading', { name: 'Não foi possível carregar' })).toBeInTheDocument();
    mockLoad();
    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));
    expect(await screen.findByRole('heading', { name: 'Cancelar sua senha?' })).toBeInTheDocument();
  });
});
