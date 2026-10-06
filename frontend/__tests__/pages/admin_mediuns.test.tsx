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
let mockSub: Record<string, unknown> = {};
jest.mock('@/hooks/useSubscription', () => ({
  useSubscription: () => ({
    can: (f: string) => (f === 'mediuns' ? mockPlan : false),
    loading: false,
    subscription: mockSub,
    canCreateMedium: () => true,
  }),
}));

jest.mock('@/hooks/usePermissions', () => ({
  usePermissions: () => ({ can: () => true }),
}));

jest.mock('@/contexts/SnackbarContext', () => {
  const s = { showSuccess: jest.fn(), showError: jest.fn(), showInfo: jest.fn() };
  return { useSnackbar: () => s };
});

import AdminMediunsPage from '@/pages/admin/mediuns';

const MEDIUNS = [
  { id: 'm1', nome: 'Pai Antônio', is_atendimento: true, is_active: true, telefone: '11987654321', created_at: '2026-01-01T00:00:00Z' },
  { id: 'm2', nome: 'Joana', is_atendimento: false, is_active: true, created_at: '2026-01-01T00:00:00Z' },
];

describe('Médiuns', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPlan = true;
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
});
