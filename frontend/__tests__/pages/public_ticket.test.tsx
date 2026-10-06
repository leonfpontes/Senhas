/**
 * /public/[tenant]/ticket/[ticketId] — o bilhete do consulente, destino do
 * link "Para resgatar sua senha" dos e-mails (antes dava 404).
 */
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const mockRouter = {
  push: jest.fn(),
  replace: jest.fn(),
  query: { tenant: 'tenda-pai-joaquim', ticketId: 't-1' },
  isReady: true,
  events: { on: jest.fn(), off: jest.fn() },
};
jest.mock('next/router', () => ({ useRouter: () => mockRouter }));
jest.mock('@/services/api_client', () => ({
  apiClient: { get: jest.fn() },
  extractApiErrorMessage: (_err: unknown, fallback: string) => fallback,
}));

import Page from '@/pages/public/[tenant]/ticket/[ticketId]';
import { buildIcs, formatGiraDate, type PublicTicket } from '@/components/public';

const { apiClient } = jest.requireMock('@/services/api_client');

function makeTicket(overrides: Partial<PublicTicket> = {}): PublicTicket {
  return {
    ticket_number: '0042',
    status: 'emitted',
    status_label: 'Confirmada',
    waitlisted: false,
    cancellable: true,
    cancel_reason: null,
    gira_name: 'Gira de Pretos-Velhos',
    gira_date: '08/10/2026 às 19:00',
    gira_date_iso: '2026-10-08T22:00:00+00:00',
    gira_local: 'Salão principal',
    horario: null,
    recados: 'Traga uma vela branca.',
    tenant_name: 'Tenda Pai Joaquim',
    tenant_slug: 'tenda-pai-joaquim',
    tenant_address: 'Rua das Flores, 123',
    maps_url: 'https://www.google.com/maps/dir/?api=1&destination=Rua%20das%20Flores',
    tenant_logo_url: null,
    primary_color: '#4f46e5',
    secondary_color: null,
    consulente_name: 'Maria da Silva',
    acompanhantes: [{ ticket_number: '0043', name: 'João' }],
    ...overrides,
  };
}

beforeEach(() => jest.clearAllMocks());

describe('Bilhete público', () => {
  it('mostra número, gira, data com horário, endereço e ações', async () => {
    apiClient.get.mockResolvedValue({ data: makeTicket() });

    render(<Page />);

    expect(await screen.findByTestId('ticket-number')).toHaveTextContent('0042');
    expect(apiClient.get).toHaveBeenCalledWith('/api/v1/public/tenda-pai-joaquim/ticket/t-1');
    expect(screen.getByText('Gira de Pretos-Velhos')).toBeInTheDocument();
    expect(screen.getByText(/8 de outubro às 19h/i)).toBeInTheDocument();
    expect(screen.getByText('Rua das Flores, 123')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Como chegar' })).toHaveAttribute('href', expect.stringContaining('google.com/maps'));
    expect(screen.getByText('Traga uma vela branca.')).toBeInTheDocument();
    expect(screen.getByText('0043 · João')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /adicionar à agenda/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /cancelar minha senha/i })).toHaveAttribute('href', '/public/ticket/t-1/cancelar');
    expect(screen.getByRole('link', { name: /ver próximas giras/i })).toHaveAttribute('href', '/tenda-pai-joaquim');
  });

  it('senha cancelada: sem ações, número riscado e rótulo', async () => {
    apiClient.get.mockResolvedValue({
      data: makeTicket({ status: 'cancelled', status_label: 'Cancelada', cancellable: false, cancel_reason: 'Esta senha já foi cancelada.' }),
    });

    render(<Page />);

    expect(await screen.findByText('Cancelada')).toBeInTheDocument();
    expect(screen.getByTestId('ticket-number')).toHaveStyle({ textDecoration: 'line-through' });
    expect(screen.queryByRole('button', { name: /adicionar à agenda/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /cancelar minha senha/i })).not.toBeInTheDocument();
  });

  it('404 leva às próximas giras do terreiro', async () => {
    apiClient.get.mockRejectedValue({ response: { status: 404 } });

    render(<Page />);

    expect(await screen.findByText('Senha não encontrada')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /ver próximas giras do terreiro/i })).toHaveAttribute('href', '/tenda-pai-joaquim');
  });

  it('erro de rede oferece tentar de novo', async () => {
    apiClient.get.mockRejectedValueOnce({ response: { status: 500 } }).mockResolvedValueOnce({ data: makeTicket() });

    render(<Page />);

    fireEvent.click(await screen.findByRole('button', { name: /tentar de novo/i }));

    await waitFor(() => expect(screen.getByTestId('ticket-number')).toHaveTextContent('0042'));
    expect(apiClient.get).toHaveBeenCalledTimes(2);
  });
});

describe('helpers do bilhete', () => {
  it('formata a data da gira em português, no fuso de Brasília', () => {
    expect(formatGiraDate('2026-10-08T22:00:00+00:00', 'x')).toBe('Quinta-feira, 8 de outubro às 19h');
    expect(formatGiraDate('2026-10-08T22:30:00+00:00', 'x')).toBe('Quinta-feira, 8 de outubro às 19h30');
    expect(formatGiraDate(null, '08/10/2026 às 19:00')).toBe('08/10/2026 às 19:00');
  });

  it('gera um .ics de duas horas com local e número da senha', () => {
    const ics = buildIcs(makeTicket())!;
    expect(ics).toContain('DTSTART:20261008T220000Z');
    expect(ics).toContain('DTEND:20261009T000000Z');
    expect(ics).toContain('SUMMARY:Gira de Pretos-Velhos — Tenda Pai Joaquim');
    expect(ics).toContain('LOCATION:Salão principal · Rua das Flores\\, 123');
    expect(ics).toContain('DESCRIPTION:Senha 0042\\nTraga uma vela branca.');
    expect(buildIcs(makeTicket({ gira_date_iso: null }))).toBeNull();
  });

  it('usa o horário escolhido pelo consulente quando a gira tem horários', () => {
    const ics = buildIcs(makeTicket({ horario: '20:30' }))!;
    expect(ics).toContain('DTSTART:20261008T233000Z'); // 20:30 em Brasília
  });
});
