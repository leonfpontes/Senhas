/**
 * Excluir gira com a beta "avisar quem tem senha" (decisão do Leonardo, 04/11/2026): nada vem
 * marcado; depois de confirmar a exclusão, a pergunta "Avisar por e-mail…?" com "Enviar aviso" e
 * "Não enviar" no mesmo peso decide se o aviso vai junto.
 */
import React from 'react';
import userEvent from '@testing-library/user-event';
import { render, screen, waitFor, fireEvent, act, within } from '@testing-library/react';

// Objeto mutável (prefixo `mock` para o jest permitir no factory): cada teste
// pode ajustar query/isReady.
const mockRouter: any = {
  push: jest.fn(), replace: jest.fn(), pathname: '/admin/giras',
  query: {}, asPath: '/admin/giras', isReady: true,
  events: { on: jest.fn(), off: jest.fn() },
};
jest.mock('next/router', () => ({ useRouter: () => mockRouter }));

jest.mock('next/link', () => ({ children, href }: any) => <a href={href}>{children}</a>);

jest.mock('@/services/api_client', () => ({
  apiClient: {
    get:    jest.fn(),
    post:   jest.fn().mockResolvedValue({ data: {} }),
    put:    jest.fn().mockResolvedValue({ data: {} }),
    delete: jest.fn().mockResolvedValue({ data: {} }),
    patch:  jest.fn().mockResolvedValue({ data: {} }),
  },
}));

// Strip the layout so we only test the page content
jest.mock('@/pages/admin/admin_layout', () => ({
  __esModule: true,
  default: ({ children }: any) => <div data-testid="admin-layout">{children}</div>,
}));

jest.mock('@/hooks/useSubscription', () => ({
  useSubscription: () => ({
    subscription: { plan: 'pro', status: 'active', max_giras_per_month: 20 },
    can: () => true,
    beta: (k: string) => k === 'beta_avisar_exclusao_gira',
    canCreateGira: () => true,
    loading: false,
    refresh: jest.fn(),
  }),
}));

const mockGroupCan = jest.fn((_f: string, _a: string) => true);
jest.mock('@/hooks/usePermissions', () => ({
  usePermissions: () => ({ can: mockGroupCan, permissions: null, loading: false, refresh: jest.fn() }),
}));

jest.mock('@/components/CrudDrawer', () => ({
  __esModule: true,
  default: ({ children, open, title, onSave }: any) =>
    open ? (
      <div data-testid="crud-drawer" aria-label={title}>
        {children}
        <button onClick={onSave}>{`salvar: ${title}`}</button>
      </div>
    ) : null,
}));

const amanha = new Date(Date.now() + 2 * 86400000);
const GIRA = {
  id: 'g1', nome: 'Gira de Exú', descricao: '', data_inicio: amanha.toISOString(),
  data_fim: new Date(amanha.getTime() + 3 * 3600000).toISOString(), is_active: true, status: 'open', is_open: true,
  release_start_at: null, link_publico: 'https://example.com/g/g1', max_tickets: 50, current_count: 3,
};

function mockApi() {
  const { apiClient } = require('@/services/api_client');
  apiClient.get.mockImplementation((url: string) => {
    if (url.endsWith('/senhas')) return Promise.resolve({ data: { current_count: 3 } });
    if (url.includes('/api/v1/admin/giras')) return Promise.resolve({ data: [GIRA] });
    return Promise.resolve({ data: [] });
  });
  return apiClient;
}

async function abrirExclusao() {
  const AdminGiras = require('@/pages/admin/giras').default;
  render(<AdminGiras />);
  const user = userEvent.setup();
  await user.click(await screen.findByRole('button', { name: /Mais ações da gira Gira de Exú/ }));
  await user.click(await screen.findByRole('menuitem', { name: /Excluir/ }));
  const dialogo = await screen.findByRole('alertdialog', { name: /Excluir a Gira de Exú/ });
  await waitFor(() => expect(within(dialogo).getByText(/3 pessoas já pegaram senha/)).toBeInTheDocument());
  return dialogo;
}

describe('Excluir gira · avisar quem tem senha', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGroupCan.mockImplementation(() => true);
    mockRouter.query = {};
  });

  it('o diálogo de excluir não tem caixa marcada; a pergunta vem depois de confirmar', async () => {
    mockApi();
    const dialogo = await abrirExclusao();
    expect(within(dialogo).queryByRole('checkbox')).not.toBeInTheDocument();
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Excluir a gira' }));
    const pergunta = await screen.findByRole('alertdialog', { name: /Avisar por e-mail as 3 pessoas que têm senha/ });
    const enviar = within(pergunta).getByRole('button', { name: 'Enviar aviso' });
    const naoEnviar = within(pergunta).getByRole('button', { name: 'Não enviar' });
    expect(enviar.className).toBe(naoEnviar.className);
  });

  it('"Enviar aviso" exclui com o aviso', async () => {
    const api = mockApi();
    const dialogo = await abrirExclusao();
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Excluir a gira' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Enviar aviso' }));
    await waitFor(() => expect(api.delete).toHaveBeenCalledWith('/api/v1/admin/giras/g1?avisar=true'));
  });

  it('"Não enviar" exclui sem o aviso', async () => {
    const api = mockApi();
    const dialogo = await abrirExclusao();
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Excluir a gira' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Não enviar' }));
    await waitFor(() => expect(api.delete).toHaveBeenCalledWith('/api/v1/admin/giras/g1'));
  });
});
