/**
 * Tests for the surviving public emission form: /public/gira/[id]
 * (a UI única de emissão, para onde /public/[tenant] agora redireciona).
 * Cobre render com emissão aberta, gate do botão, sucesso, erro e waitlist.
 */
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const mockRouter = {
  push: jest.fn(),
  replace: jest.fn(),
  query: { id: 'gira-1' },
  isReady: true,
  events: { on: jest.fn(), off: jest.fn() },
};
jest.mock('next/router', () => ({ useRouter: () => mockRouter }));

jest.mock('@/services/api_client', () => ({
  apiClient: { get: jest.fn(), post: jest.fn() },
  extractApiErrorMessage: (_err: unknown, fallback: string) =>
    (_err as { detail?: string })?.detail || fallback,
}));

import Page from '@/pages/public/gira/[id]';

const { apiClient } = jest.requireMock('@/services/api_client');

// GiraPublic com janela de emissão aberta agora (real useGiraCountdown → 'open')
function makeGira(overrides: Record<string, unknown> = {}) {
  return {
    id: 'gira-1',
    nome: 'Gira de Caboclos',
    descricao: 'Trabalho espiritual.',
    data_inicio: new Date(Date.now() + 86400000).toISOString(),
    local: 'Terreiro Central',
    release_start_at: new Date(Date.now() - 3600000).toISOString(), // 1h atrás
    release_end_at: new Date(Date.now() + 3600000).toISOString(),   // 1h à frente
    max_tickets: 100,
    current_tickets: 10,
    tickets_available: 90,
    is_open: true,
    is_exhausted: false,
    waitlist_available: false,
    is_sponsor: false,
    tenant_slug: 'terreiro-teste',
    tenant_name: 'Terreiro Teste',
    logo_url: null,
    primary_color: null,
    secondary_color: null,
    use_time_slots: false,
    time_slots: [],
    allow_acompanhantes: false,
    max_acompanhantes: 0,
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('PublicGiraPage — emission form', () => {
  it('renders the emission form when emission is open', async () => {
    apiClient.get.mockResolvedValue({ data: makeGira() });
    render(<Page />);

    await waitFor(() => {
      expect(screen.getByText('Gira de Caboclos')).toBeInTheDocument();
    });
    expect(screen.getByLabelText(/Nome completo/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/E-mail/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Emitir Senha/i })).toBeInTheDocument();
  });

  it('disables the submit button until name and email are filled', async () => {
    apiClient.get.mockResolvedValue({ data: makeGira() });
    render(<Page />);

    await waitFor(() => screen.getByLabelText(/Nome completo/i));
    const submit = screen.getByRole('button', { name: /Emitir Senha/i });
    expect(submit).toBeDisabled();

    fireEvent.change(screen.getByLabelText(/Nome completo/i), { target: { value: 'Maria Silva' } });
    expect(submit).toBeDisabled(); // ainda falta e-mail

    fireEvent.change(screen.getByLabelText(/E-mail/i), { target: { value: 'maria@example.com' } });
    expect(submit).toBeEnabled();
  });

  it('emits a ticket with gira_id and shows the ticket number on success', async () => {
    apiClient.get.mockResolvedValue({ data: makeGira() });
    apiClient.post.mockResolvedValue({ data: { numero: 42, waitlisted: false, acompanhantes: [] } });
    render(<Page />);

    await waitFor(() => screen.getByLabelText(/Nome completo/i));
    fireEvent.change(screen.getByLabelText(/Nome completo/i), { target: { value: 'Maria Silva' } });
    fireEvent.change(screen.getByLabelText(/E-mail/i), { target: { value: 'maria@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: /Emitir Senha/i }));

    await waitFor(() => {
      expect(screen.getByText('Senha emitida!')).toBeInTheDocument();
    });
    expect(screen.getByText('#42')).toBeInTheDocument();

    // gira_id fixa a emissão na gira exibida
    const [url, body] = apiClient.post.mock.calls[0];
    expect(url).toContain('gira_id=gira-1');
    expect(url).toContain('tenant_slug=terreiro-teste');
    expect(body).toMatchObject({ name: 'Maria Silva', email: 'maria@example.com' });
  });

  it('shows an error snackbar when emission fails', async () => {
    apiClient.get.mockResolvedValue({ data: makeGira() });
    apiClient.post.mockRejectedValue({ status: 409, detail: 'Você já possui uma senha para esta gira' });
    render(<Page />);

    await waitFor(() => screen.getByLabelText(/Nome completo/i));
    fireEvent.change(screen.getByLabelText(/Nome completo/i), { target: { value: 'Maria Silva' } });
    fireEvent.change(screen.getByLabelText(/E-mail/i), { target: { value: 'maria@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: /Emitir Senha/i }));

    await waitFor(() => {
      expect(screen.getByText('Você já possui uma senha para esta gira')).toBeInTheDocument();
    });
    expect(screen.queryByText('Senha emitida!')).not.toBeInTheDocument();
  });

  it('enters waitlist mode when the gira is exhausted with waitlist enabled', async () => {
    apiClient.get.mockResolvedValue({
      data: makeGira({ is_exhausted: true, waitlist_available: true, tickets_available: 0 }),
    });
    apiClient.post.mockResolvedValue({ data: { waitlisted: true, waitlist_position: 3 } });
    render(<Page />);

    await waitFor(() => screen.getByLabelText(/Nome completo/i));
    const submit = screen.getByRole('button', { name: /Entrar na fila de espera/i });
    expect(submit).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/Nome completo/i), { target: { value: 'Maria Silva' } });
    fireEvent.change(screen.getByLabelText(/E-mail/i), { target: { value: 'maria@example.com' } });
    fireEvent.click(submit);

    await waitFor(() => {
      expect(apiClient.post).toHaveBeenCalled();
    });
  });
});
