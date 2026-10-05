/**
 * Tests for /admin/giras page
 * Focus: CRUD table, ConfirmDialog for delete + release-now, status chips
 */
import React from 'react';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material/styles';

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

const theme = createTheme();
function wrap(ui: React.ReactElement) {
  return render(<ThemeProvider theme={theme}>{ui}</ThemeProvider>);
}

const MOCK_GIRAS = [
  {
    id: 'g1', nome: 'Gira de Exú', descricao: 'Desc', data_inicio: '2025-01-01T20:00:00Z',
    data_fim: '2025-01-01T23:00:00Z', is_active: true, status: 'open',
    release_start_at: null, link_publico: 'https://example.com/g/g1',
    numero_tickets: 10, emitidos: 3,
  },
];

describe('Admin Giras Page', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRouter.query = {};
    const { apiClient } = require('@/services/api_client');
    apiClient.get.mockResolvedValue({ data: MOCK_GIRAS });
  });

  it('renders without crashing', () => {
    const AdminGiras = require('@/pages/admin/giras').default;
    const { container } = wrap(<AdminGiras />);
    expect(container).toBeTruthy();
  });

  it('renders gira name after loading', async () => {
    const AdminGiras = require('@/pages/admin/giras').default;
    wrap(<AdminGiras />);
    await waitFor(() => {
      expect(screen.getByText('Gira de Exú')).toBeInTheDocument();
    });
  });

  it('shows empty state when no giras', async () => {
    const { apiClient } = require('@/services/api_client');
    apiClient.get.mockResolvedValue({ data: [] });
    const AdminGiras = require('@/pages/admin/giras').default;
    wrap(<AdminGiras />);
    await waitFor(() => {
      expect(screen.getByTestId('giras-empty-state')).toBeInTheDocument();
    });
    expect(screen.queryByText('Gira de Exú')).not.toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Criar primeira gira/ }));
    expect(screen.getByTestId('crud-drawer')).toBeInTheDocument();
  });

  it('falha ao carregar mostra erro com retry, não o empty state', async () => {
    const { apiClient } = require('@/services/api_client');
    apiClient.get.mockImplementation((url: string) =>
      url === '/api/v1/admin/giras' ? Promise.reject(new Error('Network Error')) : Promise.resolve({ data: {} }),
    );
    const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const AdminGiras = require('@/pages/admin/giras').default;
    wrap(<AdminGiras />);
    await waitFor(() => {
      expect(screen.getByText('Não foi possível carregar as giras.')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('giras-empty-state')).not.toBeInTheDocument();

    apiClient.get.mockResolvedValue({ data: MOCK_GIRAS });
    fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));
    await waitFor(() => {
      expect(screen.getByText('Gira de Exú')).toBeInTheDocument();
    });
    errSpy.mockRestore();
  });

  it('?nova=1 abre o formulário de criação e limpa o parâmetro', async () => {
    mockRouter.query = { nova: '1' };
    const AdminGiras = require('@/pages/admin/giras').default;
    wrap(<AdminGiras />);
    await waitFor(() => {
      expect(screen.getByTestId('crud-drawer')).toBeInTheDocument();
    });
    expect(mockRouter.replace).toHaveBeenCalledWith(
      { pathname: '/admin/giras', query: {} },
      undefined,
      { shallow: true },
    );
  });

  describe('padrões inteligentes de senhas', () => {
    const NEW_GIRA = { id: 'nova', nome: 'Gira de Caboclos', data_inicio: '2099-01-10T22:00:00Z', is_active: true };

    function mockApi(giras: any[] = []) {
      const { apiClient } = require('@/services/api_client');
      apiClient.get.mockImplementation((url: string) => {
        if (url === '/api/v1/admin/giras') return Promise.resolve({ data: giras });
        if (url.endsWith('/senhas')) {
          return Promise.resolve({
            data: { max_tickets: 0, release_start_at: NEW_GIRA.data_inicio, release_end_at: NEW_GIRA.data_inicio, current_count: 0 },
          });
        }
        return Promise.resolve({ data: {} });
      });
      apiClient.post.mockResolvedValue({ data: NEW_GIRA });
      return apiClient;
    }

    async function createGira() {
      const AdminGiras = require('@/pages/admin/giras').default;
      wrap(<AdminGiras />);
      await waitFor(() => expect(screen.getByRole('button', { name: /Nova Gira/ })).toBeEnabled());
      fireEvent.click(screen.getByRole('button', { name: /Nova Gira/ }));
      fireEvent.change(screen.getByLabelText(/^Nome/), { target: { value: NEW_GIRA.nome } });
      fireEvent.change(screen.getByLabelText(/Data Início/), { target: { value: '2099-01-10T19:00' } });
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /salvar: Nova Gira/ }));
      });
    }

    it('depois de criar, abre a configuração de senhas já com a sugestão', async () => {
      const api = mockApi([{ ...MOCK_GIRAS[0], max_tickets: 40 }, { ...MOCK_GIRAS[0], id: 'g2', max_tickets: 20 }]);
      await createGira();
      await waitFor(() => expect(screen.getByTestId('senha-suggestion')).toBeInTheDocument());
      expect(api.post).toHaveBeenCalledWith('/api/v1/admin/giras', expect.objectContaining({ nome: NEW_GIRA.nome }));
      expect(api.get).toHaveBeenCalledWith('/api/v1/admin/giras/nova/senhas');
      const alert = screen.getByTestId('senha-suggestion');
      expect(alert).toHaveTextContent('Gira criada! Falta liberar as senhas.');
      expect(alert).toHaveTextContent('30 senhas (a média das suas giras)');
      expect(screen.getByLabelText(/^Quantidade de Senhas(\s*\*)?$/)).toHaveValue(30);
      expect((screen.getByLabelText(/^Início da Liberação(\s*\*)?$/) as HTMLInputElement).value).not.toBe('');
      const fim = new Date(NEW_GIRA.data_inicio);
      const pad = (n: number) => String(n).padStart(2, '0');
      expect(screen.getByLabelText(/^Fim da Liberação(\s*\*)?$/)).toHaveValue(
        `${fim.getFullYear()}-${pad(fim.getMonth() + 1)}-${pad(fim.getDate())}T${pad(fim.getHours())}:${pad(fim.getMinutes())}`,
      );
      expect(screen.queryByTestId('short-window-warning')).not.toBeInTheDocument();
    });

    it('janela curta mostra aviso e "Usar sugestão" restaura a janela longa', async () => {
      mockApi([]);
      await createGira();
      await waitFor(() => expect(screen.getByTestId('senha-suggestion')).toBeInTheDocument());
      expect(screen.getByLabelText(/^Quantidade de Senhas(\s*\*)?$/)).toHaveValue(30);
      const fimSugerido = (screen.getByLabelText(/^Fim da Liberação(\s*\*)?$/) as HTMLInputElement).value;

      fireEvent.change(screen.getByLabelText(/^Início da Liberação(\s*\*)?$/), { target: { value: '2099-01-10T18:00' } });
      fireEvent.change(screen.getByLabelText(/^Fim da Liberação(\s*\*)?$/), { target: { value: '2099-01-10T19:00' } });
      expect(screen.getByTestId('short-window-warning')).toHaveTextContent('A liberação dura só 1 hora');

      fireEvent.click(screen.getByRole('button', { name: 'Usar sugestão' }));
      expect(screen.queryByTestId('short-window-warning')).not.toBeInTheDocument();
      expect(screen.getByLabelText(/^Fim da Liberação(\s*\*)?$/)).toHaveValue(fimSugerido);
    });
  });
});
