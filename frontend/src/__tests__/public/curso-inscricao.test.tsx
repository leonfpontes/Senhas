/**
 * Inscrição em curso (formulário simples): a tela de sucesso só fala de mensalidade quando o
 * curso gera cobrança mensal (gerar_mensalidade) — antes bastava existir valor padrão.
 * Consentimentos (LGPD): dados é obrigatório; imagem e voz é opcional (art. 8º, §4º) e o texto
 * de dados não promete "nenhum terceiro" — aponta para a Política de Privacidade.
 */
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

jest.mock('next/router', () => ({
  useRouter: () => ({ query: { id: 'curso-1' }, push: jest.fn(), replace: jest.fn(), isReady: true }),
}));
jest.mock('sonner', () => ({ toast: { success: jest.fn(), error: jest.fn() } }));

import InscricaoCursoPage from '../../pages/public/cursos/[id]/inscricao';

const CURSO = {
  id: 'curso-1',
  titulo: 'Curso de Desenvolvimento',
  ementa: null,
  data_inicio: new Date(Date.now() + 10 * 86400000).toISOString(),
  data_fim: null,
  local: null,
  max_participantes: null,
  vagas_restantes: null,
  valor_mensalidade_padrao: 50,
  gerar_mensalidade: false,
  is_active: true,
  tipo_formulario: 'simples',
  chave_pix: null,
  observacoes: null,
  tenant_nome: 'Tenda Luz',
  tenant_primary_color: '#4f46e5',
  tenant_secondary_color: '#818cf8',
  tenant_logo_url: null,
  tenant_endereco: null,
};

function mockFetch(inscricao: Record<string, unknown>) {
  global.fetch = jest.fn((url: string, init?: RequestInit) => {
    const body = init?.method === 'POST' ? inscricao : CURSO;
    return Promise.resolve({ ok: true, status: init?.method === 'POST' ? 201 : 200, json: () => Promise.resolve(body) });
  }) as unknown as typeof fetch;
}

describe('Inscrição em curso — sucesso', () => {
  beforeAll(() => {
    window.scrollTo = jest.fn() as unknown as typeof window.scrollTo;
  });

  it('não mostra mensalidade quando o curso não gera cobrança mensal', async () => {
    mockFetch({
      id: 'p1',
      nome: 'Maria da Silva',
      email: 'maria@example.com',
      curso_titulo: 'Curso de Desenvolvimento',
      data_inicio: CURSO.data_inicio,
      valor_mensalidade: 50, // backend antigo devolvia o valor padrão mesmo sem cobrança
      mensagem: 'Inscrição realizada com sucesso!',
    });
    render(<InscricaoCursoPage />);
    fireEvent.change(await screen.findByLabelText(/Nome completo/i), { target: { value: 'Maria da Silva' } });
    fireEvent.change(screen.getByLabelText(/^E-mail/i), { target: { value: 'maria@example.com' } });
    fireEvent.click(document.getElementById('aceita_uso_dados') as HTMLElement);
    fireEvent.click(document.getElementById('aceita_uso_imagem') as HTMLElement);
    fireEvent.click(screen.getByRole('button', { name: /Confirmar inscrição/i }));

    expect(await screen.findByText('Inscrição confirmada!')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText('Mensalidade')).not.toBeInTheDocument());
    expect(screen.queryByText(/mensalidade é cobrada/i)).not.toBeInTheDocument();
    expect(screen.getByText(/e-mail de confirmação em maria@example.com/)).toBeInTheDocument();
  });

  it('inscreve sem autorizar imagem e voz e manda a escolha (false) para o backend', async () => {
    mockFetch({
      id: 'p2',
      nome: 'João Souza',
      email: 'joao@example.com',
      curso_titulo: 'Curso de Desenvolvimento',
      data_inicio: CURSO.data_inicio,
      valor_mensalidade: null,
      mensagem: 'Inscrição realizada com sucesso!',
    });
    render(<InscricaoCursoPage />);
    fireEvent.change(await screen.findByLabelText(/Nome completo/i), { target: { value: 'João Souza' } });
    fireEvent.change(screen.getByLabelText(/^E-mail/i), { target: { value: 'joao@example.com' } });
    expect(screen.getByText(/Opcional: você pode se inscrever sem autorizar/)).toBeInTheDocument();
    expect(screen.queryByText(/não serão compartilhados com terceiros/)).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Política de Privacidade' })).toHaveAttribute('href', '/privacidade');
    fireEvent.click(document.getElementById('aceita_uso_dados') as HTMLElement);
    fireEvent.click(screen.getByRole('button', { name: /Confirmar inscrição/i }));

    expect(await screen.findByText('Inscrição confirmada!')).toBeInTheDocument();
    const post = (global.fetch as jest.Mock).mock.calls.find(([, init]) => init?.method === 'POST');
    const enviado = JSON.parse((post![1].body as FormData).get('data') as string);
    expect(enviado).toMatchObject({ aceita_uso_dados: true, aceita_uso_imagem: false });
  });

  it('sem o consentimento de dados não envia', async () => {
    mockFetch({});
    render(<InscricaoCursoPage />);
    fireEvent.change(await screen.findByLabelText(/Nome completo/i), { target: { value: 'Ana Lima' } });
    fireEvent.change(screen.getByLabelText(/^E-mail/i), { target: { value: 'ana@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: /Confirmar inscrição/i }));
    expect(await screen.findByText(/aceitar o uso dos seus dados pessoais/i)).toBeInTheDocument();
    expect((global.fetch as jest.Mock).mock.calls.some(([, init]) => init?.method === 'POST')).toBe(false);
  });
});
