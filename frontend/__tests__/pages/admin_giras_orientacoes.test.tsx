/**
 * AM-07 — campo "Orientações para a corrente" no drawer da gira (/admin/giras).
 * Só aparece (e só é enviado) quando o terreiro tem a Área do Médium (`can('area_medium')`).
 */
import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const mockRouter: any = {
  push: jest.fn(),
  replace: jest.fn(),
  pathname: '/admin/giras',
  query: {},
  asPath: '/admin/giras',
  isReady: true,
  events: { on: jest.fn(), off: jest.fn() },
};
jest.mock('next/router', () => ({ useRouter: () => mockRouter }));
jest.mock('next/link', () => ({ children, href }: any) => <a href={href}>{children}</a>);

jest.mock('@/services/api_client', () => ({
  apiClient: {
    get: jest.fn(),
    post: jest.fn().mockResolvedValue({ data: {} }),
    put: jest.fn().mockResolvedValue({ data: {} }),
    delete: jest.fn().mockResolvedValue({ data: {} }),
    patch: jest.fn().mockResolvedValue({ data: {} }),
  },
  extractApiErrorMessage: (_e: unknown, fallback: string) => fallback,
}));

jest.mock('@/pages/admin/admin_layout', () => ({
  __esModule: true,
  default: ({ children }: any) => <div data-testid="admin-layout">{children}</div>,
}));

let mockAreaMedium = true;
jest.mock('@/hooks/useSubscription', () => ({
  useSubscription: () => ({
    subscription: { plan: 'pro', status: 'active', max_giras_per_month: 20 },
    can: (f: string) => (f === 'area_medium' ? mockAreaMedium : true),
    canCreateGira: () => true,
    loading: false,
    refresh: jest.fn(),
  }),
}));

jest.mock('@/hooks/usePermissions', () => ({
  usePermissions: () => ({ can: () => true, permissions: null, loading: false, refresh: jest.fn() }),
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

const GIRA = {
  id: 'g1',
  nome: 'Gira de Exú',
  descricao: '',
  data_inicio: '2099-01-01T20:00:00Z',
  is_active: true,
  status: 'open',
  recados: '',
  orientacoes_corrente: 'Roupa branca.',
  max_tickets: 10,
};

function mockApi() {
  const { apiClient } = require('@/services/api_client');
  apiClient.get.mockImplementation((url: string) => {
    if (url === '/api/v1/admin/giras') return Promise.resolve({ data: [GIRA] });
    return Promise.resolve({ data: {} });
  });
  apiClient.put.mockResolvedValue({ data: {} });
  return apiClient;
}

async function abrirEdicao() {
  const AdminGiras = require('@/pages/admin/giras').default;
  render(<AdminGiras />);
  await waitFor(() => expect(screen.getByText('Gira de Exú')).toBeInTheDocument());
  const user = userEvent.setup();
  await user.click(screen.getAllByRole('button', { name: /Mais ações da gira/ })[0]);
  await user.click(await screen.findByRole('menuitem', { name: /Editar gira/ }));
  await screen.findByRole('button', { name: 'salvar: Editar gira' });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockAreaMedium = true;
});

it('com a Área do Médium: o campo aparece preenchido e vai no PUT da gira', async () => {
  const api = mockApi();
  await abrirEdicao();
  const campo = screen.getByLabelText(/^Orientações para a corrente/);
  expect(campo).toHaveValue('Roupa branca.');
  expect(screen.getByText(/nunca vai para o consulente/)).toBeInTheDocument();
  fireEvent.change(campo, { target: { value: '  Roupa branca e guias.  ' } });
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'salvar: Editar gira' }));
  });
  expect(api.put).toHaveBeenCalledWith(
    '/api/v1/admin/giras/g1',
    expect.objectContaining({ orientacoes_corrente: 'Roupa branca e guias.' }),
  );
});

it('sem a Área do Médium (piloto desligado): o campo some e o valor não é enviado', async () => {
  mockAreaMedium = false;
  const api = mockApi();
  await abrirEdicao();
  expect(screen.queryByLabelText(/^Orientações para a corrente/)).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText(/^Nome/), { target: { value: 'Gira de Exu' } });
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'salvar: Editar gira' }));
  });
  expect(api.put).toHaveBeenCalledTimes(1);
  expect(api.put.mock.calls[0][1]).not.toHaveProperty('orientacoes_corrente');
});
