/**
 * Trocar de terreiro sem sair (2026-10-09): opção no menu do painel, diálogo "Em qual terreiro
 * você quer entrar?", troca direta e troca com a senha de outra conta.
 */
import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const mockRouter: any = {
  pathname: '/admin/profile',
  asPath: '/admin/profile',
  query: {},
  isReady: true,
  push: jest.fn(() => Promise.resolve(true)),
  replace: jest.fn(() => Promise.resolve(true)),
  events: { on: jest.fn(), off: jest.fn() },
};
jest.mock('next/router', () => ({ useRouter: () => mockRouter }));
jest.mock('next/link', () => {
  const MockLink = React.forwardRef(({ children, href, ...rest }: any, ref: any) => (
    <a href={typeof href === 'string' ? href : href?.pathname} ref={ref} {...rest}>
      {children}
    </a>
  ));
  MockLink.displayName = 'MockLink';
  return MockLink;
});
jest.mock('@/services/analytics', () => ({ trackEvent: jest.fn() }));

let mockProfile: unknown = null;
jest.mock('@/hooks/useProfile', () => ({
  useProfile: () => ({ profile: mockProfile, loading: false, refresh: jest.fn() }),
}));

let mockContas: unknown = [];
const mockGet = jest.fn((url: string) =>
  Promise.resolve({ data: url === '/api/v1/auth/minhas-contas' ? mockContas : [] }),
);
const mockPost = jest.fn();
jest.mock('@/services/api_client', () => ({
  apiClient: {
    get: (...a: unknown[]) => mockGet(...(a as [string])),
    post: (...a: unknown[]) => mockPost(...a),
    put: jest.fn(),
    delete: jest.fn(),
  },
  endImpersonation: jest.fn(),
}));
jest.mock('@/hooks/usePermissions', () => ({
  usePermissions: () => ({ can: () => true, permissions: null, loading: false, refresh: jest.fn() }),
}));
jest.mock('@/hooks/useSubscription', () => ({
  useSubscription: () => ({
    can: () => true,
    subscription: { plan: 'basic' },
    planLabel: 'Basic',
    loading: false,
    canCreateGira: () => true,
    refresh: jest.fn(),
  }),
}));
jest.mock('@/components/support/useTenantSupportUnread', () => ({ useTenantSupportUnread: () => 0 }));

import { resetMinhasContasCache } from '@/hooks/useMinhasContas';
import { completeSwitch } from '@/services/authSession';

const PERFIL = {
  id: 'u-a',
  role: 'admin',
  email: 'ana@x.com',
  tenant_id: 't-a',
  areas: { admin: true, medium: null },
};
const CONTAS = [
  { conta_id: 'u-b', terreiro: 'Casa B', logo_url: null, area: 'medium', precisa_senha: false },
  { conta_id: 'u-c', terreiro: 'Casa C', logo_url: null, area: 'painel', precisa_senha: true },
];

const assign = jest.fn();
const originalLocation = window.location;

function renderLayout() {
  const AdminLayout = require('@/pages/admin/admin_layout').default;
  return render(
    <AdminLayout title="Perfil">
      <div>conteúdo</div>
    </AdminLayout>,
  );
}

async function abrirMenu() {
  await userEvent.click(screen.getByTestId('topbar-user-menu'));
  await screen.findByRole('menuitem', { name: /Sair/ });
}

async function abrirTroca() {
  renderLayout();
  await waitFor(() => expect(mockGet).toHaveBeenCalledWith('/api/v1/auth/minhas-contas'));
  await abrirMenu();
  await userEvent.click(await screen.findByRole('menuitem', { name: /Trocar de terreiro/ }));
  return screen.findByTestId('trocar-terreiro-dialog');
}

beforeEach(() => {
  jest.clearAllMocks();
  resetMinhasContasCache();
  localStorage.clear();
  sessionStorage.clear();
  mockProfile = PERFIL;
  mockContas = CONTAS;
  Object.defineProperty(window, 'location', { value: { ...originalLocation, assign }, writable: true });
});

afterAll(() => {
  Object.defineProperty(window, 'location', { value: originalLocation, writable: true });
});

describe('Menu do painel — Trocar de terreiro', () => {
  it('não aparece quando o e-mail só tem esta conta', async () => {
    mockContas = [];
    renderLayout();
    await waitFor(() => expect(mockGet).toHaveBeenCalledWith('/api/v1/auth/minhas-contas'));
    await abrirMenu();
    expect(screen.queryByRole('menuitem', { name: /Trocar de terreiro/ })).not.toBeInTheDocument();
  });

  it('não aparece (nem busca) impersonando', async () => {
    sessionStorage.setItem('impersonating', 'true');
    renderLayout();
    await abrirMenu();
    expect(screen.queryByRole('menuitem', { name: /Trocar de terreiro/ })).not.toBeInTheDocument();
    expect(mockGet).not.toHaveBeenCalledWith('/api/v1/auth/minhas-contas');
  });

  it('o diálogo lista o terreiro atual ("Você está aqui") e as outras contas', async () => {
    const dialogo = await abrirTroca();
    expect(within(dialogo).getByRole('heading', { name: /Em qual terreiro você quer entrar/ })).toBeInTheDocument();
    const atual = within(dialogo).getByTestId('terreiro-atual');
    expect(within(atual).getByText('Você está aqui')).toBeInTheDocument();
    expect(atual.tagName).not.toBe('BUTTON');
    expect(within(dialogo).getByRole('button', { name: 'Casa B — Área do Médium' })).toBeInTheDocument();
    expect(within(dialogo).getByRole('button', { name: 'Casa C — Painel do terreiro' })).toBeInTheDocument();
  });

  it('conta conferida no login troca direto, sem senha, e recarrega na área da conta nova', async () => {
    const areas = { admin: false, medium: { medium_id: 'm1', nome: 'Ana' } };
    mockPost.mockResolvedValueOnce({ data: { user: { id: 'u-b', role: 'medium', tenant_id: 't-b' }, areas } });
    sessionStorage.setItem('girahub:gira-selecionada', 'gira-da-casa-a');
    const dialogo = await abrirTroca();

    await userEvent.click(within(dialogo).getByRole('button', { name: /Casa B/ }));

    await waitFor(() => expect(assign).toHaveBeenCalledWith('/medium'));
    expect(mockPost).toHaveBeenCalledWith(
      '/api/v1/auth/trocar-terreiro',
      { conta_id: 'u-b' },
      expect.objectContaining({ skipAutoLogout: true }),
    );
    expect(JSON.parse(localStorage.getItem('user') || '{}')).toEqual({ id: 'u-b', role: 'medium', tenant_id: 't-b', areas });
    expect(sessionStorage.getItem('girahub:gira-selecionada')).toBeNull();
  });

  it('conta com outra senha abre o campo; senha errada mostra o erro e não sai da conta', async () => {
    mockPost.mockRejectedValueOnce({
      status: 400,
      detail: { error_code: 'SENHA_INCORRETA', message: 'Senha incorreta para esta conta.' },
    });
    localStorage.setItem('user', JSON.stringify({ id: 'u-a', role: 'admin' }));
    const dialogo = await abrirTroca();

    await userEvent.click(within(dialogo).getByRole('button', { name: /Casa C/ }));
    expect(mockPost).not.toHaveBeenCalled();
    const campo = within(dialogo).getByLabelText(/Esta conta tem outra senha/);
    await userEvent.type(campo, 'senha-errada');
    await userEvent.click(within(dialogo).getByRole('button', { name: /^Entrar$/ }));

    expect(await within(dialogo).findByText('Senha incorreta para esta conta.')).toBeInTheDocument();
    expect(mockPost).toHaveBeenCalledWith(
      '/api/v1/auth/trocar-terreiro',
      { conta_id: 'u-c', senha: 'senha-errada' },
      expect.objectContaining({ skipAutoLogout: true }),
    );
    expect(assign).not.toHaveBeenCalled();
    expect(mockPost).not.toHaveBeenCalledWith('/api/v1/auth/logout');
    expect(JSON.parse(localStorage.getItem('user') || '{}').id).toBe('u-a');
  });

  it('senha certa entra na conta e vai para o painel dela', async () => {
    mockPost.mockResolvedValueOnce({
      data: { user: { id: 'u-c', role: 'admin', tenant_id: 't-c' }, areas: { admin: true, medium: null } },
    });
    const dialogo = await abrirTroca();
    await userEvent.click(within(dialogo).getByRole('button', { name: /Casa C/ }));
    await userEvent.type(within(dialogo).getByLabelText(/Esta conta tem outra senha/), 'Outra-senha-456');
    await userEvent.click(within(dialogo).getByRole('button', { name: /^Entrar$/ }));
    await waitFor(() => expect(assign).toHaveBeenCalledWith('/admin/dashboard'));
  });
});

describe('completeSwitch', () => {
  it('conta com as duas áreas e sem escolha lembrada vai para /escolher-area', () => {
    completeSwitch({ id: 'u-x', role: 'operator', areas: { admin: true, medium: { medium_id: 'm', nome: 'X' } } });
    expect(assign).toHaveBeenCalledWith('/escolher-area');
  });
});
