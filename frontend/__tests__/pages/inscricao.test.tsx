/**
 * /public/cursos/[id]/inscricao — fluxo mínimo: carregar, validar, enviar multipart, sucesso.
 */
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const mockRouter = {
  push: jest.fn(),
  replace: jest.fn(),
  query: { id: 'curso-1' },
  isReady: true,
  events: { on: jest.fn(), off: jest.fn() },
};
jest.mock('next/router', () => ({ useRouter: () => mockRouter }));
jest.mock('sonner', () => ({ toast: { success: jest.fn(), error: jest.fn() } }));

import Page from '@/pages/public/cursos/[id]/inscricao';

const { toast } = jest.requireMock('sonner');

function makeCurso(overrides: Record<string, unknown> = {}) {
  return {
    id: 'curso-1',
    titulo: 'Desenvolvimento Mediúnico',
    ementa: 'Estudo e prática.',
    data_inicio: '2026-11-03T22:00:00+00:00',
    data_fim: null,
    local: 'Salão',
    max_participantes: 30,
    vagas_restantes: 10,
    valor_mensalidade_padrao: null,
    gerar_mensalidade: false,
    is_active: true,
    tipo_formulario: 'simples',
    chave_pix: null,
    observacoes: null,
    tenant_nome: 'Tenda Pai Joaquim',
    tenant_primary_color: '#2e7d32',
    tenant_secondary_color: '#1b5e20',
    tenant_logo_url: null,
    tenant_endereco: 'Rua A, 1',
    ...overrides,
  };
}

const jsonResponse = (body: unknown, status = 200) =>
  Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(body) });

let fetchMock: jest.Mock;
beforeEach(() => {
  jest.clearAllMocks();
  window.scrollTo = jest.fn();
  fetchMock = jest.fn();
  global.fetch = fetchMock as unknown as typeof fetch;
});

describe('Inscrição em curso', () => {
  it('formulário simples: valida, envia multipart e mostra a confirmação', async () => {
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (init?.method === 'POST') {
        return jsonResponse({
          id: 'i-1', nome: 'Maria Silva', email: 'maria@example.com', curso_titulo: 'Desenvolvimento Mediúnico',
          data_inicio: '2026-11-03T22:00:00+00:00', valor_mensalidade: null, mensagem: 'Inscrição realizada.',
        });
      }
      return jsonResponse(makeCurso());
    });

    render(<Page />);
    expect(await screen.findByRole('heading', { level: 1, name: 'Desenvolvimento Mediúnico' })).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/public/cursos/curso-1');
    expect(screen.queryByRole('list', { name: 'Etapas' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /confirmar inscrição/i }));
    expect(await screen.findByText('Nome completo é obrigatório (mínimo 3 caracteres).')).toBeInTheDocument();
    expect(screen.getByText('É necessário aceitar o uso dos seus dados pessoais (LGPD).')).toBeInTheDocument();
    expect(toast.error).toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    fireEvent.change(screen.getByLabelText(/Nome completo/i), { target: { value: 'Maria Silva' } });
    fireEvent.change(screen.getByLabelText(/^E-mail/i), { target: { value: 'maria@example.com' } });
    fireEvent.click(screen.getByRole('checkbox', { name: /uso dos meus dados pessoais/i }));
    fireEvent.click(screen.getByRole('checkbox', { name: /uso da minha imagem/i }));
    fireEvent.click(screen.getByRole('button', { name: /confirmar inscrição/i }));

    expect(await screen.findByRole('heading', { name: 'Inscrição confirmada!' })).toBeInTheDocument();
    const [url, init] = fetchMock.mock.calls[1];
    expect(url).toBe('/api/v1/public/cursos/curso-1/inscricao');
    expect(init.method).toBe('POST');
    const payload = JSON.parse((init.body as FormData).get('data') as string);
    expect(payload).toMatchObject({ nome: 'Maria Silva', email: 'maria@example.com', aceita_uso_dados: true, aceita_uso_imagem: true });
    expect(screen.getByRole('button', { name: /adicionar à agenda/i })).toBeInTheDocument();
  });

  it('formulário completo anda em etapas e não avança com campo pendente', async () => {
    fetchMock.mockImplementation(() => jsonResponse(makeCurso({ tipo_formulario: 'completo' })));
    render(<Page />);

    expect(await screen.findByRole('list', { name: 'Etapas' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /continuar/i }));
    expect(await screen.findByText('WhatsApp/Celular é obrigatório.')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /seus dados/i })).toBeInTheDocument();
  });

  it('curso lotado não mostra o formulário; 404 e erro de rede são estados diferentes', async () => {
    fetchMock.mockImplementationOnce(() => jsonResponse(makeCurso({ vagas_restantes: 0 })));
    const { unmount } = render(<Page />);
    expect(await screen.findByRole('heading', { name: 'Vagas esgotadas' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /confirmar inscrição/i })).not.toBeInTheDocument();
    unmount();

    fetchMock.mockImplementationOnce(() => jsonResponse({}, 404));
    const second = render(<Page />);
    expect(await screen.findByRole('heading', { name: 'Curso não encontrado' })).toBeInTheDocument();
    second.unmount();

    fetchMock.mockImplementationOnce(() => Promise.reject(new Error('offline')));
    render(<Page />);
    expect(await screen.findByRole('heading', { name: 'Não foi possível carregar' })).toBeInTheDocument();
    fetchMock.mockImplementationOnce(() => jsonResponse(makeCurso()));
    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));
    await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: 'Desenvolvimento Mediúnico' })).toBeInTheDocument());
  });
});
