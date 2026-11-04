/**
 * Cabeçalho do site com quem já está logado (Leonardo, 04/11/2026): deslogado, uma conta, médium,
 * várias contas, admin + médium, super admin, sessão vencida, "Sair" à vista e impersonação.
 */
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

jest.mock('next/link', () => {
  const L = ({ children, href, ...r }: any) => <a href={href} {...r}>{children}</a>;
  L.displayName = 'L';
  return L;
});
const mockGet = jest.fn();
const mockPost = jest.fn();
const mockEnd = jest.fn();
jest.mock('@/services/api_client', () => ({
  apiClient: { get: (...a: unknown[]) => mockGet(...a), post: (...a: unknown[]) => mockPost(...a) },
  endImpersonation: () => mockEnd(),
}));

import { SessaoNoSite } from '@/components/landing/SessaoNoSite';
import { resetMinhasContasCache } from '@/hooks/useMinhasContas';

const ADMIN = { id: 'u1', email: 'ray@filhosdefe.org', username: 'ray', full_name: 'Mãe Ray', tenant_id: 't1', role: 'admin', areas: { admin: true, medium: null } };

function logar(perfil: object, contas: object[] = [], tenantName = 'Terreiro Filhos de Fé') {
  document.cookie = 'auth_state=1';
  localStorage.setItem('user', JSON.stringify(perfil));
  mockGet.mockImplementation((url: string) => {
    if (url === '/api/v1/auth/profile') return Promise.resolve({ data: perfil });
    if (url.includes('minhas-contas')) return Promise.resolve({ data: contas });
    if (url === '/api/v1/admin/tenant/branding') return Promise.resolve({ data: { tenant_nome: tenantName } });
    if (url === '/api/v1/medium/me') return Promise.resolve({ data: { terreiro: { nome: tenantName } } });
    return Promise.reject(new Error(`inesperado: ${url}`));
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  resetMinhasContasCache();
  localStorage.clear();
  sessionStorage.clear();
  document.cookie = 'auth_state=; expires=Thu, 01 Jan 1970 00:00:00 GMT';
});

describe('<SessaoNoSite />', () => {
  it('deslogado: Entrar e Criar conta grátis, sem chamar o servidor', () => {
    render(<SessaoNoSite />);
    expect(screen.getByRole('link', { name: 'Entrar' })).toHaveAttribute('href', '/login');
    expect(screen.getByRole('link', { name: 'Criar conta grátis' })).toHaveAttribute('href', '/cadastro');
    expect(mockGet).not.toHaveBeenCalled();
  });

  it('enquanto confere, um espaço reservado (sem piscar)', () => {
    logar(ADMIN);
    render(<SessaoNoSite />);
    expect(screen.getByTestId('sessao-conferindo')).toBeInTheDocument();
  });

  it('uma conta, admin: "Abrir o <terreiro>" (nome da marca do terreiro) e "Sair" à vista', async () => {
    logar(ADMIN);
    render(<SessaoNoSite />);
    expect(await screen.findByRole('link', { name: 'Abrir o Terreiro Filhos de Fé' })).toHaveAttribute('href', '/admin/dashboard');
    expect(screen.getByRole('button', { name: /Sair/ })).toBeVisible();
  });

  it('médium puro: "Abrir minha Área", sem chamar /admin/*', async () => {
    logar({ ...ADMIN, role: 'medium', areas: { admin: false, medium: { medium_id: 'm1', nome: 'Aparecida' } } });
    render(<SessaoNoSite />);
    expect(await screen.findByRole('link', { name: 'Abrir minha Área' })).toHaveAttribute('href', '/medium');
    await waitFor(() => expect(mockGet).toHaveBeenCalled());
    expect(mockGet.mock.calls.some((c) => String(c[0]).startsWith('/api/v1/admin'))).toBe(false);
  });

  it('admin e médium: "Escolher onde entrar" leva à escolha de área', async () => {
    logar({ ...ADMIN, areas: { admin: true, medium: { medium_id: 'm1', nome: 'Ray' } } });
    render(<SessaoNoSite />);
    expect(await screen.findByRole('link', { name: 'Escolher onde entrar' })).toHaveAttribute('href', '/escolher-area');
  });

  it('mais de um terreiro: "Escolher onde entrar" abre a escolha de terreiro com o atual e os outros', async () => {
    logar(ADMIN, [{ conta_id: 'c2', terreiro: 'Casa de Oxóssi', logo_url: null, area: 'painel', precisa_senha: false }]);
    render(<SessaoNoSite />);
    fireEvent.click(await screen.findByRole('button', { name: 'Escolher onde entrar' }));
    expect(await screen.findByText('Em qual terreiro você quer entrar?')).toBeInTheDocument();
    expect(screen.getByTestId('terreiro-atual')).toHaveAttribute('href', '/admin/dashboard');
    expect(screen.getByTestId('terreiro-atual')).toHaveTextContent('Terreiro Filhos de Fé');
    expect(screen.getByRole('button', { name: /Casa de Oxóssi/ })).toBeInTheDocument();
  });

  it('super admin: "Abrir a plataforma"', async () => {
    logar({ ...ADMIN, role: 'super_admin', tenant_id: null });
    render(<SessaoNoSite />);
    expect(await screen.findByRole('link', { name: 'Abrir a plataforma' })).toHaveAttribute('href', '/platform');
  });

  it('sessão vencida: volta ao deslogado sem erro', async () => {
    document.cookie = 'auth_state=1';
    mockGet.mockRejectedValue({ status: 401 });
    render(<SessaoNoSite />);
    expect(await screen.findByRole('link', { name: 'Entrar' })).toBeInTheDocument();
    expect(mockGet).toHaveBeenCalledWith('/api/v1/auth/profile', expect.objectContaining({ skipAutoLogout: true }));
  });

  it('"Sair" chama o logout, limpa o user e volta a "Entrar" sem recarregar', async () => {
    logar(ADMIN);
    mockPost.mockResolvedValue({});
    render(<SessaoNoSite />);
    fireEvent.click(await screen.findByRole('button', { name: /Sair/ }));
    await waitFor(() => expect(screen.getByRole('link', { name: 'Entrar' })).toBeInTheDocument());
    expect(mockPost).toHaveBeenCalledWith('/api/v1/auth/logout', undefined, expect.objectContaining({ skipAutoLogout: true }));
    expect(localStorage.getItem('user')).toBeNull();
  });

  it('impersonação: não mostra quem é operado e "Sair" encerra a impersonação', () => {
    logar(ADMIN);
    sessionStorage.setItem('impersonating', '1');
    render(<SessaoNoSite />);
    expect(screen.queryByText(/Filhos de Fé|Mãe Ray/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Sair/ }));
    expect(mockEnd).toHaveBeenCalled();
    expect(mockPost).not.toHaveBeenCalled();
  });
});
