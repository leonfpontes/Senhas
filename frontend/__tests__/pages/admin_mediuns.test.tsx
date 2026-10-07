/**
 * /admin/mediuns — função Médium/Cambone em RadioGroup, "Editar" explícito no menu da linha,
 * modo somente leitura fora do plano (lista visível, sem ações, link para /admin/billing).
 */
import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';

jest.mock('next/router', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), pathname: '/admin/mediuns', query: {}, isReady: true }),
}));

const mockGet = jest.fn();
const mockPost = jest.fn().mockResolvedValue({ data: {} });
const mockPatch = jest.fn().mockResolvedValue({ data: {} });
jest.mock('@/services/api_client', () => ({
  apiClient: {
    get: (...a: unknown[]) => mockGet(...a),
    post: (...a: unknown[]) => mockPost(...a),
    patch: (...a: unknown[]) => mockPatch(...a),
    delete: jest.fn().mockResolvedValue({ data: {} }),
  },
  extractApiErrorMessage: (_e: unknown, f: string) => f,
}));

jest.mock('@/pages/admin/admin_layout', () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

let mockPlan = true;
let mockArea = false;
let mockEdit = true;
let mockSub: Record<string, unknown> = {};
jest.mock('@/hooks/useSubscription', () => ({
  useSubscription: () => ({
    can: (f: string) => (f === 'mediuns' ? mockPlan : f === 'area_medium' ? mockArea : false),
    loading: false,
    subscription: mockSub,
    canCreateMedium: () => true,
  }),
}));

jest.mock('@/hooks/usePermissions', () => ({
  usePermissions: () => ({ can: (_f: string, action: string) => action !== 'edit' || mockEdit }),
}));

jest.mock('@/contexts/SnackbarContext', () => {
  const s = { showSuccess: jest.fn(), showError: jest.fn(), showInfo: jest.fn() };
  return { useSnackbar: () => s };
});

jest.mock('@/providers/ThemeProvider', () => ({ useTenant: () => ({ tenantName: 'Tenda Luz da Mata' }) }));

import AdminMediunsPage from '@/pages/admin/mediuns';

const MEDIUNS = [
  {
    id: 'm1', nome: 'Pai Antônio', is_atendimento: true, is_active: true, telefone: '11987654321',
    email: 'antonio@gmail.com', created_at: '2026-01-01T00:00:00Z', acesso_area: { status: 'sem_acesso' },
  },
  {
    id: 'm2', nome: 'Joana', is_atendimento: false, is_active: true, created_at: '2026-01-01T00:00:00Z',
    acesso_area: { status: 'ativo', desde: '2026-10-02T15:00:00Z' },
  },
];

describe('Médiuns', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPlan = true;
    mockArea = false;
    mockEdit = true;
    mockSub = { plan: 'pro', max_mediuns: 150, current_mediuns: 2 };
    mockGet.mockImplementation((url: string) =>
      Promise.resolve({ data: url.startsWith('/api/v1/admin/mediuns?') ? MEDIUNS : [] }),
    );
  });

  it('cria com a função escolhida no RadioGroup (Cambone por padrão)', async () => {
    render(<AdminMediunsPage />);
    await screen.findByText('Pai Antônio');

    fireEvent.click(screen.getByRole('button', { name: /Novo/ }));
    const cambone = await screen.findByRole('radio', { name: /Cambone/ });
    const medium = screen.getByRole('radio', { name: /Médium/ });
    expect(cambone).toBeChecked();
    expect(medium).not.toBeChecked();

    fireEvent.click(medium);
    expect(medium).toBeChecked();

    fireEvent.change(screen.getByLabelText(/^Nome/), { target: { value: 'Mãe Cida' } });
    fireEvent.click(screen.getByRole('button', { name: 'Criar' }));

    await waitFor(() => expect(mockPost).toHaveBeenCalled());
    expect(mockPost.mock.calls[0][0]).toBe('/api/v1/admin/mediuns');
    expect(mockPost.mock.calls[0][1]).toMatchObject({ nome: 'Mãe Cida', is_atendimento: true });
  });

  it('o menu da linha tem "Editar" explícito e abre a ficha preenchida', async () => {
    render(<AdminMediunsPage />);
    await screen.findByText('Pai Antônio');

    fireEvent.keyDown(screen.getByRole('button', { name: 'Ações de Pai Antônio' }), { key: 'Enter' });
    const menu = await screen.findByRole('menu');
    fireEvent.click(within(menu).getByRole('menuitem', { name: /Editar/ }));

    expect(await screen.findByDisplayValue('Pai Antônio')).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /Médium/ })).toBeChecked();
  });

  it('fora do plano: lista visível, sem ações, com link para /admin/billing', async () => {
    mockPlan = false;
    mockSub = { plan: 'free', max_mediuns: 0, current_mediuns: 2 };
    render(<AdminMediunsPage />);

    expect(await screen.findByText('Pai Antônio')).toBeInTheDocument();
    const aviso = screen.getByTestId('mediuns-somente-leitura');
    expect(within(aviso).getByRole('link')).toHaveAttribute('href', '/admin/billing');
    expect(screen.queryByRole('button', { name: /Ações de/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Novo/ })).not.toBeInTheDocument();
  });

  describe('Acesso à Área do Médium (AM-03)', () => {
    it('com a Área liberada e MEDIUNS:edit: coluna, selo, convite em lote e ação na linha', async () => {
      mockArea = true;
      render(<AdminMediunsPage />);
      await screen.findByText('Pai Antônio');
      expect(screen.getByRole('columnheader', { name: /Acesso à Área/ })).toBeInTheDocument();
      expect(screen.getAllByText('Sem acesso').length).toBeGreaterThan(0);
      expect(screen.getAllByText('Ativo').length).toBeGreaterThan(0);
      expect(screen.getByRole('button', { name: 'Convidar todos com e-mail (1)' })).toBeInTheDocument();

      fireEvent.keyDown(screen.getByRole('button', { name: 'Ações de Pai Antônio' }), { key: 'Enter' });
      const menu = await screen.findByRole('menu');
      fireEvent.click(within(menu).getByRole('menuitem', { name: /Acesso à Área/ }));
      const sheet = await screen.findByTestId('acesso-area-sheet');
      expect(within(sheet).getByText('Pai Antônio')).toBeInTheDocument();
      expect(within(sheet).getByRole('button', { name: /Enviar pelo WhatsApp/ })).toBeInTheDocument();
    });

    it('sem a Área liberada (plano ou chave do piloto): nada da Área aparece, sem PlanLocked', async () => {
      render(<AdminMediunsPage />);
      await screen.findByText('Pai Antônio');
      expect(screen.queryByRole('columnheader', { name: /Acesso à Área/ })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /Convidar todos/ })).not.toBeInTheDocument();
      expect(screen.queryByText(/Área do Médium/)).not.toBeInTheDocument();
      fireEvent.keyDown(screen.getByRole('button', { name: 'Ações de Pai Antônio' }), { key: 'Enter' });
      const menu = await screen.findByRole('menu');
      expect(within(menu).queryByRole('menuitem', { name: /Acesso à Área/ })).not.toBeInTheDocument();
    });

    it('sem MEDIUNS:edit: nada da Área aparece, mesmo com a Área liberada', async () => {
      mockArea = true;
      mockEdit = false;
      render(<AdminMediunsPage />);
      await screen.findByText('Pai Antônio');
      expect(screen.queryByRole('columnheader', { name: /Acesso à Área/ })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /Convidar todos/ })).not.toBeInTheDocument();
    });
  });
});
