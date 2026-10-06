/**
 * /public/gira/[id] — a UI única de emissão (para onde /public/[tenant] e /senha redirecionam).
 * Cobre: formulário com três campos, botão sempre ativo que aponta o campo pendente, sucesso
 * com o Bilhete, 409 com "Reenviar meu e-mail", rede ≠ 404 no carregamento e no envio,
 * prioridade Não/Sim, esgotada e fila de espera.
 */
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const mockRouter = {
  push: jest.fn(),
  replace: jest.fn(),
  query: { id: 'gira-1' } as Record<string, string>,
  isReady: true,
  events: { on: jest.fn(), off: jest.fn() },
};
jest.mock('next/router', () => ({ useRouter: () => mockRouter }));

jest.mock('@/services/api_client', () => ({
  apiClient: { get: jest.fn(), post: jest.fn() },
  extractApiErrorMessage: (err: unknown, fallback: string) => (err as { detail?: string })?.detail || fallback,
}));

jest.mock('sonner', () => ({ toast: { success: jest.fn(), error: jest.fn() } }));

import Page from '@/pages/public/gira/[id]';

const { apiClient } = jest.requireMock('@/services/api_client');
const { toast } = jest.requireMock('sonner');

// GiraPublic com janela de emissão aberta agora (useGiraCountdown real → 'open')
function makeGira(overrides: Record<string, unknown> = {}) {
  return {
    id: 'gira-1',
    nome: 'Gira de Caboclos',
    descricao: 'Trabalho espiritual.',
    data_inicio: '2026-10-08T22:00:00+00:00',
    local: 'Terreiro Central',
    release_start_at: new Date(Date.now() - 3600000).toISOString(),
    release_end_at: new Date(Date.now() + 3600000).toISOString(),
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

async function renderOpenForm(overrides: Record<string, unknown> = {}) {
  apiClient.get.mockResolvedValue({ data: makeGira(overrides) });
  render(<Page />);
  await screen.findByLabelText(/Nome completo/i);
}

function fillRequired() {
  fireEvent.change(screen.getByLabelText(/Nome completo/i), { target: { value: 'Maria Silva' } });
  fireEvent.change(screen.getByLabelText(/E-mail/i), { target: { value: 'maria@example.com' } });
}

const submitButton = () => screen.getByRole('button', { name: /Pegar minha senha/i });

beforeEach(() => {
  jest.clearAllMocks();
  mockRouter.query = { id: 'gira-1' };
  window.scrollTo = jest.fn();
});

describe('Emissão pública — formulário', () => {
  it('mostra a gira com data e hora, os três campos e o botão de 48px', async () => {
    await renderOpenForm();

    expect(screen.getByRole('heading', { name: 'Gira de Caboclos', level: 1 })).toBeInTheDocument();
    expect(screen.getByText('Quinta-feira, 8 de outubro às 19h')).toBeInTheDocument();
    expect(screen.getByLabelText(/E-mail/i)).toHaveAttribute('type', 'email');
    const celular = screen.getByLabelText(/Celular/i);
    expect(celular).toHaveAttribute('inputMode', 'tel');
    fireEvent.change(celular, { target: { value: '11987654321' } });
    expect(celular).toHaveValue('(11) 98765-4321');
    expect(submitButton()).toBeEnabled();
    expect(apiClient.get).toHaveBeenCalledWith('/api/v1/public/gira/gira-1?tipo=comum');
  });

  it('botão sempre ativo: enviar vazio mostra os erros e não chama a API', async () => {
    await renderOpenForm();

    fireEvent.click(submitButton());

    expect(await screen.findByText('Digite seu nome completo')).toBeInTheDocument();
    expect(screen.getByText('Digite seu e-mail')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByLabelText(/Nome completo/i)).toHaveFocus());
    expect(apiClient.post).not.toHaveBeenCalled();
  });

  it('valida o e-mail ao sair do campo', async () => {
    await renderOpenForm();
    const email = screen.getByLabelText(/E-mail/i);
    fireEvent.change(email, { target: { value: 'maria@' } });
    fireEvent.blur(email);
    expect(await screen.findByText('Digite um e-mail válido')).toBeInTheDocument();
  });

  it('prioridade: "Sim" revela as categorias e exige uma escolha', async () => {
    await renderOpenForm();
    fillRequired();

    expect(screen.queryByRole('radiogroup', { name: /tipo de atendimento/i })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('radio', { name: 'Sim' }));
    expect(await screen.findByRole('radiogroup', { name: /tipo de atendimento/i })).toBeInTheDocument();

    fireEvent.click(submitButton());
    expect(await screen.findByText('Escolha o tipo de atendimento preferencial')).toBeInTheDocument();
    expect(apiClient.post).not.toHaveBeenCalled();
  });

  it('emite com gira_id, busca o bilhete completo e mostra o número sem "#"', async () => {
    await renderOpenForm();
    apiClient.post.mockResolvedValue({
      data: { ticket_number: '0042', waitlisted: false, acompanhantes: [], rescue_link: 'https://x/public/terreiro-teste/ticket/t-9' },
    });
    apiClient.get.mockResolvedValueOnce({
      data: {
        ticket_number: '0042', status: 'emitted', status_label: 'Confirmada', waitlisted: false, cancellable: true,
        cancel_reason: null, gira_name: 'Gira de Caboclos', gira_date: '', gira_date_iso: '2026-10-08T22:00:00+00:00',
        gira_local: 'Terreiro Central', horario: null, recados: null, tenant_name: 'Terreiro Teste',
        tenant_slug: 'terreiro-teste', tenant_address: 'Rua A, 1', maps_url: null, tenant_logo_url: null,
        primary_color: null, secondary_color: null, consulente_name: 'Maria Silva', acompanhantes: [],
      },
    });

    fillRequired();
    fireEvent.click(submitButton());

    expect(await screen.findByText('Senha emitida!')).toBeInTheDocument();
    expect(screen.getByTestId('ticket-number')).toHaveTextContent(/^0042$/);
    expect(screen.getByText('Rua A, 1')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /cancelar minha senha/i })).toHaveAttribute('href', '/public/ticket/t-9/cancelar');

    const [url, body] = apiClient.post.mock.calls[0];
    expect(url).toContain('gira_id=gira-1');
    expect(url).toContain('tenant_slug=terreiro-teste');
    expect(body).toMatchObject({ name: 'Maria Silva', email: 'maria@example.com', priority_category: null, acompanhantes: [] });
    expect(apiClient.get).toHaveBeenCalledWith('/api/v1/public/terreiro-teste/ticket/t-9');
  });

  it('409: alerta persistente com "Reenviar meu e-mail"', async () => {
    await renderOpenForm();
    apiClient.post.mockRejectedValueOnce({ status: 409, detail: 'Você já possui uma senha para esta gira' });

    fillRequired();
    fireEvent.click(submitButton());

    expect(await screen.findByText('Você já tem senha para esta gira')).toBeInTheDocument();
    expect(screen.getByText('Você já possui uma senha para esta gira')).toBeInTheDocument();

    apiClient.post.mockResolvedValueOnce({ data: { tickets_count: 1, email_sent: true, message: 'ok' } });
    fireEvent.click(screen.getByRole('button', { name: 'Reenviar meu e-mail' }));

    await waitFor(() =>
      expect(apiClient.post).toHaveBeenLastCalledWith(
        '/api/v1/public/resend-ticket-email?tenant_slug=terreiro-teste',
        { email: 'maria@example.com', phone: null },
      ),
    );
    expect(toast.success).toHaveBeenCalled();
    expect(screen.queryByText('Senha emitida!')).not.toBeInTheDocument();
  });

  it('falha de rede no envio oferece "Tentar de novo" e reenvia', async () => {
    await renderOpenForm();
    apiClient.post.mockRejectedValueOnce({ status: 0 });

    fillRequired();
    fireEvent.click(submitButton());

    expect(await screen.findByText('Não foi possível enviar')).toBeInTheDocument();
    expect(screen.getByText(/Sem conexão/)).toBeInTheDocument();

    apiClient.post.mockResolvedValueOnce({ data: { numero: 7, waitlisted: false, acompanhantes: [] } });
    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));

    expect(await screen.findByText('Senha emitida!')).toBeInTheDocument();
    expect(screen.getByTestId('ticket-number')).toHaveTextContent('7');
    expect(apiClient.post).toHaveBeenCalledTimes(2);
  });
});

describe('Emissão pública — estados da gira', () => {
  it('404 diz que a gira não existe (sem "Tentar de novo")', async () => {
    apiClient.get.mockRejectedValue({ status: 404, detail: 'Gira não encontrada' });
    render(<Page />);

    expect(await screen.findByRole('heading', { name: 'Gira não encontrada' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /tentar de novo/i })).not.toBeInTheDocument();
  });

  it('erro de servidor é diferente de 404 e oferece tentar de novo', async () => {
    apiClient.get.mockRejectedValueOnce({ status: 500 }).mockResolvedValueOnce({ data: makeGira() });
    render(<Page />);

    expect(await screen.findByRole('heading', { name: 'Não foi possível carregar' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /tentar de novo/i }));
    expect(await screen.findByLabelText(/Nome completo/i)).toBeInTheDocument();
  });

  it('esgotada sem fila: aviso e "Ver próximas giras do terreiro"', async () => {
    apiClient.get.mockResolvedValue({ data: makeGira({ is_exhausted: true, tickets_available: 0 }) });
    render(<Page />);

    expect(await screen.findByText('Senhas esgotadas')).toBeInTheDocument();
    expect(screen.queryByLabelText(/Nome completo/i)).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /ver próximas giras do terreiro/i })).toHaveAttribute('href', '/public/terreiro-teste');
  });

  it('emissão ainda não aberta mostra a contagem regressiva', async () => {
    apiClient.get.mockResolvedValue({
      data: makeGira({
        release_start_at: new Date(Date.now() + 2 * 3600000).toISOString(),
        release_end_at: new Date(Date.now() + 5 * 3600000).toISOString(),
      }),
    });
    render(<Page />);

    expect(await screen.findByText('Emissão abre em')).toBeInTheDocument();
    expect(screen.getByRole('timer')).toBeInTheDocument();
    expect(screen.queryByLabelText(/Nome completo/i)).not.toBeInTheDocument();
  });

  it('esgotada com fila: formulário vira "Entrar na fila de espera"', async () => {
    await renderOpenForm({ is_exhausted: true, waitlist_available: true, tickets_available: 0 });
    apiClient.post.mockResolvedValue({ data: { ticket_number: 'F003', waitlisted: true, waitlist_position: 3 } });

    fillRequired();
    fireEvent.click(screen.getByRole('button', { name: /Entrar na fila de espera/i }));

    expect(await screen.findByText('Você está na fila de espera!')).toBeInTheDocument();
    expect(screen.getByText('3º')).toBeInTheDocument();
  });
});
