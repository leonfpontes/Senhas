/**
 * /convite/[token] — convite da casa para a Área do Médium (AM-03): marca do terreiro em
 * destaque, e-mail mascarado, "Crie sua senha de acesso" com consentimento obrigatório,
 * conta do painel entra com a própria senha, convite inválido com o próximo passo e, no
 * aceite, sessão aberta e ida para /medium.
 */
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

const mockQuery: Record<string, string> = { token: 'tok-123' };
jest.mock('next/router', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), pathname: '/convite/[token]', query: mockQuery, isReady: true }),
}));
jest.mock('next/head', () => ({ __esModule: true, default: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
jest.mock('next/link', () => ({ children, href, className }: { children: React.ReactNode; href: string; className?: string }) => (
  <a href={href} className={className}>
    {children}
  </a>
));
jest.mock('next/image', () => ({
  __esModule: true,
  // eslint-disable-next-line @next/next/no-img-element
  default: ({ src, alt }: { src: string; alt: string }) => <img src={src} alt={alt} />,
}));

const mockGet = jest.fn();
const mockPost = jest.fn();
jest.mock('@/services/api_client', () => ({
  apiClient: { get: (...a: unknown[]) => mockGet(...a), post: (...a: unknown[]) => mockPost(...a) },
}));

import ConvitePage from '@/pages/convite/[token]';

const STRONG = 'SenhaForte#2026';

const CONVITE = {
  terreiro: { nome: 'Tenda Luz da Mata', slug: 'luz-da-mata' },
  marca: { logo_url: 'https://cdn.exemplo/logo.png', primary_color: '#a64b22', secondary_color: '#333333', font_color: null },
  medium_primeiro_nome: 'Ana',
  email_mascarado: 'an•••••••@gmail.com',
  conta_existente: false,
  expira_em: '2026-10-14T12:00:00Z',
  consentimento_versao: '1',
};

describe('Convite da casa', () => {
  let errSpy: jest.SpyInstance;
  beforeEach(() => {
    jest.clearAllMocks();
    mockQuery.token = 'tok-123';
    mockGet.mockResolvedValue({ data: CONVITE });
    mockPost.mockResolvedValue({ data: { redirect: '/medium', user: { id: 'u1', role: 'medium' }, areas: {} } });
    delete (window as unknown as { location?: unknown }).location;
    (window as unknown as { location: { href: string } }).location = { href: '' };
    localStorage.clear();
    errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => errSpy.mockRestore());

  it('mostra a casa em destaque, o e-mail mascarado e a promessa de privacidade', async () => {
    render(<ConvitePage />);
    expect(await screen.findByRole('heading', { name: 'Olá, Ana! Tenda Luz da Mata convidou você.' })).toBeInTheDocument();
    expect(mockGet).toHaveBeenCalledWith('/api/v1/public/convite/tok-123', { skipAutoLogout: true });
    expect(screen.getByText('Convite da casa')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Logo de Tenda Luz da Mata' })).toHaveAttribute('src', CONVITE.marca.logo_url);
    expect(screen.getByText('an•••••••@gmail.com')).toBeInTheDocument();
    expect(screen.getByText(/Os outros médiuns não veem nada seu/)).toBeInTheDocument();
    // Glossário da Área: nada de "login" nem "cadastro" na tela do médium.
    expect(document.body.textContent).not.toMatch(/login|cadastro/i);
  });

  it('cria a senha, exige o termo e entra na Área', async () => {
    render(<ConvitePage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Continuar' }));
    expect(screen.getByRole('heading', { name: 'Crie sua senha de acesso' })).toBeInTheDocument();
    expect(screen.getByText('Passo 2 de 2')).toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'Regras da senha' })).toBeInTheDocument();

    const senha = screen.getByLabelText(/Senha de acesso/);
    fireEvent.change(senha, { target: { value: STRONG } });
    // Mostrar/ocultar
    expect(senha).toHaveAttribute('type', 'password');
    fireEvent.click(screen.getByRole('button', { name: 'Mostrar senha' }));
    expect(senha).toHaveAttribute('type', 'text');

    fireEvent.click(screen.getByRole('button', { name: 'Ativar meu acesso' }));
    expect(await screen.findByText('Para ativar, marque a autorização acima.')).toBeInTheDocument();
    expect(mockPost).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Ler o termo' }));
    expect(await screen.findByRole('dialog', { name: 'Termo de uso dos seus dados' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Entendi' }));

    fireEvent.click(screen.getByRole('checkbox', { name: /Autorizo Tenda Luz da Mata/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Ativar meu acesso' }));

    await waitFor(() => expect(window.location.href).toBe('/medium'));
    expect(mockPost).toHaveBeenCalledWith(
      '/api/v1/public/convite/tok-123/aceitar',
      { senha: STRONG, aceite_termo: true },
      { skipAutoLogout: true },
    );
    expect(JSON.parse(localStorage.getItem('user') as string)).toEqual({ id: 'u1', role: 'medium' });
  });

  it('senha fraca não é enviada', async () => {
    render(<ConvitePage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Continuar' }));
    fireEvent.change(screen.getByLabelText(/Senha de acesso/), { target: { value: 'abc' } });
    fireEvent.click(screen.getByRole('checkbox', { name: /Autorizo/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Ativar meu acesso' }));
    await waitFor(() => expect(screen.getByLabelText(/Senha de acesso/)).toHaveAttribute('aria-invalid', 'true'));
    expect(mockPost).not.toHaveBeenCalled();
  });

  it('quem já tem conta do painel entra com a própria senha (sem regra de senha nova)', async () => {
    mockGet.mockResolvedValue({ data: { ...CONVITE, conta_existente: true } });
    mockPost.mockRejectedValueOnce({
      response: { status: 400, data: { detail: { error_code: 'SENHA_INCORRETA', message: 'Senha incorreta. Use a senha que você já usa para entrar no GiraHub.' } } },
    });
    render(<ConvitePage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Continuar' }));
    expect(screen.getByRole('heading', { name: 'Entre com a sua senha' })).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'Regras da senha' })).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/Senha de acesso/), { target: { value: 'qualquer' } });
    fireEvent.click(screen.getByRole('checkbox', { name: /Autorizo/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Ativar meu acesso' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Senha incorreta');
    expect(window.location.href).toBe('');
  });

  it('convite inválido diz o que fazer', async () => {
    mockGet.mockRejectedValue({
      response: { status: 404, data: { detail: { error_code: 'CONVITE_INVALIDO', message: 'Este convite não vale mais. Peça um novo convite à casa.' } } },
    });
    render(<ConvitePage />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Peça um novo convite à casa.');
    expect(screen.queryByRole('button', { name: 'Continuar' })).not.toBeInTheDocument();
  });

  it('logo que não carrega cai na inicial da casa', async () => {
    render(<ConvitePage />);
    const logo = await screen.findByRole('img', { name: 'Logo de Tenda Luz da Mata' });
    fireEvent.error(logo);
    expect(screen.queryByRole('img', { name: 'Logo de Tenda Luz da Mata' })).not.toBeInTheDocument();
    expect(screen.getByText('T')).toBeInTheDocument();
  });
});
