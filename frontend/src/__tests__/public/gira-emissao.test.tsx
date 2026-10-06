/**
 * Emissão pública (/public/gira/[id]): recusas por horário têm error_code próprio e limpam o
 * horário escolhido; "Reenviar meu e-mail" manda só e-mail + gira; aviso de privacidade no
 * rodapé; WhatsApp do bilhete usa o rescue_link e "Ver próximas giras" vai para a agenda.
 */
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const mockGet = jest.fn();
const mockPost = jest.fn();
jest.mock('../../services/api_client', () => ({
  apiClient: {
    get: (...args: unknown[]) => mockGet(...args),
    post: (...args: unknown[]) => mockPost(...args),
  },
  extractApiErrorMessage: (err: unknown, fallback: string) => {
    const e = err as { response?: { data?: { detail?: unknown; message?: unknown } } };
    const d = e?.response?.data;
    if (typeof d?.detail === 'string') return d.detail;
    if (typeof d?.message === 'string') return d.message;
    return fallback;
  },
}));
jest.mock('next/router', () => ({
  useRouter: () => ({ query: { id: 'gira-1' }, push: jest.fn(), replace: jest.fn(), isReady: true }),
}));
jest.mock('sonner', () => ({ toast: { success: jest.fn(), error: jest.fn() } }));

import PublicGiraPage from '../../pages/public/gira/[id]';

const now = Date.now();
const GIRA = {
  id: 'gira-1',
  nome: 'Gira de Caboclos',
  descricao: null,
  data_inicio: new Date(now + 2 * 86400000).toISOString(),
  local: null,
  release_start_at: new Date(now - 3600000).toISOString(),
  release_end_at: new Date(now + 86400000).toISOString(),
  max_tickets: 50,
  current_tickets: 0,
  tickets_available: 50,
  is_open: true,
  is_exhausted: false,
  waitlist_available: false,
  is_sponsor: false,
  tenant_slug: 'tenda-luz',
  tenant_name: 'Tenda Luz',
  logo_url: null,
  primary_color: null,
  secondary_color: null,
  use_time_slots: true,
  time_slots: [{ id: 'slot-19', horario: '19:00', vagas_disponiveis: 3 }],
  allow_acompanhantes: false,
  max_acompanhantes: 0,
};

async function fillAndPickSlot() {
  await screen.findByText('Gira de Caboclos');
  fireEvent.click(screen.getByRole('radio', { name: /19:00/ }));
  expect(screen.getByText(/Horário escolhido: 19:00/)).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText(/Nome completo/i), { target: { value: 'Maria da Silva' } });
  fireEvent.change(screen.getByLabelText(/^E-mail/i), { target: { value: 'maria@example.com' } });
}

function submit() {
  fireEvent.click(screen.getByRole('button', { name: /Pegar minha senha/i }));
}

describe('Emissão pública — jornadas', () => {
  beforeAll(() => {
    window.scrollTo = jest.fn() as unknown as typeof window.scrollTo;
  });

  beforeEach(() => {
    mockGet.mockReset();
    mockPost.mockReset();
    mockGet.mockResolvedValue({ data: GIRA });
  });

  it('horário lotado (410 TIME_SLOT_FULL) pede outro horário e limpa a escolha', async () => {
    mockPost.mockRejectedValueOnce({
      status: 410,
      response: {
        status: 410,
        data: { error_code: 'TIME_SLOT_FULL', message: 'Este horário não tem mais vagas disponíveis. Escolha outro horário.' },
      },
    });
    render(<PublicGiraPage />);
    await fillAndPickSlot();
    submit();

    expect(await screen.findByText('Escolha outro horário')).toBeInTheDocument();
    expect(screen.queryByText(/As vagas acabaram/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Horário escolhido: 19:00/)).not.toBeInTheDocument();
  });

  it('horário removido (409 TIME_SLOT_UNAVAILABLE) não vira "você já tem senha"', async () => {
    mockPost.mockRejectedValueOnce({
      status: 409,
      response: { status: 409, data: { error_code: 'TIME_SLOT_UNAVAILABLE', message: 'Este horário deixou de estar disponível.' } },
    });
    render(<PublicGiraPage />);
    await fillAndPickSlot();
    submit();

    expect(await screen.findByText('Escolha outro horário')).toBeInTheDocument();
    expect(screen.queryByText(/Você já tem senha/)).not.toBeInTheDocument();
  });

  it('"Reenviar meu e-mail" manda e-mail e gira, sem telefone', async () => {
    mockPost.mockRejectedValueOnce({
      status: 409,
      response: { status: 409, data: { detail: 'Este e-mail já possui uma senha emitida para esta gira' } },
    });
    mockPost.mockResolvedValueOnce({ data: { tickets_count: 1 } });
    render(<PublicGiraPage />);
    await fillAndPickSlot();
    submit();

    fireEvent.click(await screen.findByRole('button', { name: /Reenviar meu e-mail/i }));
    await waitFor(() => expect(mockPost).toHaveBeenCalledTimes(2));
    const [url, body] = mockPost.mock.calls[1];
    expect(url).toContain('/api/v1/public/resend-ticket-email');
    expect(body).toEqual({ email: 'maria@example.com', gira_id: 'gira-1' });
  });

  it('mostra o aviso de privacidade com link para /privacidade', async () => {
    render(<PublicGiraPage />);
    await screen.findByText('Gira de Caboclos');
    expect(screen.getByRole('link', { name: /Política de privacidade/i })).toHaveAttribute('href', '/privacidade');
  });

  it('sucesso: WhatsApp leva o link do bilhete e "Ver próximas giras" vai para a agenda', async () => {
    const rescue = 'https://app.example.com/public/tenda-luz/ticket/abc-123';
    mockPost.mockResolvedValueOnce({ data: { ticket_number: '0007', rescue_link: rescue, message: 'ok' } });
    mockGet.mockImplementation((url: string) =>
      url.includes('/ticket/') ? Promise.reject({ status: 500 }) : Promise.resolve({ data: GIRA }),
    );
    render(<PublicGiraPage />);
    await fillAndPickSlot();
    submit();

    const wa = await screen.findByRole('link', { name: /Enviar no WhatsApp/i });
    expect(decodeURIComponent(wa.getAttribute('href') || '')).toContain(rescue);
    expect(screen.getByRole('link', { name: /Ver próximas giras/i })).toHaveAttribute('href', '/tenda-luz');
  });
});
