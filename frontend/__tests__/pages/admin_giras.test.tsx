/**
 * Tests for /admin/giras page
 * Focus: CRUD table, ConfirmDialog for delete + release-now, status chips
 */
import React from 'react';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';

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

function wrap(ui: React.ReactElement) {
  return render(ui);
}

/** DateTimeField: data "dd/mm/aaaa" no campo rotulado e hora no input de hora ao lado. */
function timeInputOf(label: RegExp | string): HTMLInputElement {
  let el: HTMLElement | null = screen.getByLabelText(label);
  while (el && !el.querySelector('input[type="time"]')) el = el.parentElement;
  return (el as HTMLElement).querySelector('input[type="time"]') as HTMLInputElement;
}

function setDateTime(label: RegExp | string, date: string, time: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value: date } });
  fireEvent.change(timeInputOf(label), { target: { value: time } });
}

const timeOf = (label: RegExp | string) => timeInputOf(label).value;

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
    mockGroupCan.mockImplementation(() => true);
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

  describe('criação em 3 passos com padrões inteligentes de senhas', () => {
    const NEW_GIRA = { id: 'nova', nome: 'Gira de Caboclos', data_inicio: '2099-01-10T22:00:00Z', is_active: true };
    const LINK = 'https://girahub.com.br/public/casa/senha';

    function mockApi(giras: any[] = []) {
      const { apiClient } = require('@/services/api_client');
      apiClient.get.mockImplementation((url: string) => {
        if (url === '/api/v1/admin/giras') return Promise.resolve({ data: giras });
        if (url === '/api/v1/admin/giras/unified-links') {
          return Promise.resolve({ data: { public_link: LINK, sponsor_public_link: `${LINK}?a=1` } });
        }
        if (url.endsWith('/senhas')) {
          return Promise.resolve({
            data: { max_tickets: 0, release_start_at: NEW_GIRA.data_inicio, release_end_at: NEW_GIRA.data_inicio, current_count: 0 },
          });
        }
        return Promise.resolve({ data: {} });
      });
      apiClient.post.mockResolvedValue({ data: NEW_GIRA });
      apiClient.put.mockResolvedValue({ data: {} });
      return apiClient;
    }

    async function fillStepOne() {
      const AdminGiras = require('@/pages/admin/giras').default;
      wrap(<AdminGiras />);
      await waitFor(() => expect(screen.getByRole('button', { name: /Nova gira/ })).toBeEnabled());
      fireEvent.click(screen.getByRole('button', { name: /Nova gira/ }));
      fireEvent.change(screen.getByLabelText(/^Nome da gira/), { target: { value: NEW_GIRA.nome } });
      setDateTime(/^Dia e hora da gira/, '10/01/2099', '19:00');
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /salvar: Nova gira/ }));
      });
    }

    it('o passo "Senhas" já vem com a sugestão: média das giras e janela até o início', async () => {
      mockApi([{ ...MOCK_GIRAS[0], max_tickets: 40 }, { ...MOCK_GIRAS[0], id: 'g2', max_tickets: 20 }]);
      await fillStepOne();
      expect(screen.getByTestId('create-senha-suggestion')).toBeInTheDocument();
      expect(screen.getByLabelText(/^Quantas senhas/)).toHaveValue(30);
      expect((screen.getByLabelText(/^Senhas abrem em/) as HTMLInputElement).value).not.toBe('');
      expect(screen.getByLabelText(/^Senhas fecham em/)).toHaveValue('10/01/2099');
      expect(timeOf(/^Senhas fecham em/)).toBe('19:00');
      expect(screen.queryByTestId('short-window-warning')).not.toBeInTheDocument();
    });

    it('janela curta mostra aviso e "Usar sugestão" restaura a janela longa', async () => {
      mockApi([]);
      await fillStepOne();
      expect(screen.getByLabelText(/^Quantas senhas/)).toHaveValue(30);
      setDateTime(/^Senhas abrem em/, '10/01/2099', '18:00');
      setDateTime(/^Senhas fecham em/, '10/01/2099', '18:30');
      expect(screen.getByTestId('short-window-warning')).toHaveTextContent('A liberação dura só 30 minutos');
      fireEvent.click(screen.getByRole('button', { name: 'Usar sugestão' }));
      expect(screen.queryByTestId('short-window-warning')).not.toBeInTheDocument();
      expect(timeOf(/^Senhas fecham em/)).toBe('19:00');
    });

    it('ao concluir, cria a gira, salva as senhas e oferece o link', async () => {
      const api = mockApi([]);
      await fillStepOne();
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /salvar: Nova gira/ }));
      });
      expect(screen.getByTestId('create-review')).toHaveTextContent(NEW_GIRA.nome);
      fireEvent.change(screen.getByLabelText(/^Recados/), { target: { value: 'Trazer vela branca' } });
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /salvar: Nova gira/ }));
      });
      expect(api.post).toHaveBeenCalledWith(
        '/api/v1/admin/giras',
        expect.objectContaining({ nome: NEW_GIRA.nome, recados: 'Trazer vela branca' }),
      );
      await waitFor(() =>
        expect(api.put).toHaveBeenCalledWith('/api/v1/admin/giras/nova/senhas', expect.objectContaining({ max_tickets: 30 })),
      );
      await waitFor(() => expect(screen.getByTestId('share-link-dialog')).toBeInTheDocument());
      expect(screen.getByText('Gira criada! Compartilhe o link de senhas')).toBeInTheDocument();
      expect(screen.getAllByTestId('share-link-text')[0]).toHaveTextContent(LINK);
    });

    it('sem permissão de editar giras: pula o passo "Senhas", avisa e não tenta salvar senhas', async () => {
      mockGroupCan.mockImplementation((f: string, a: string) => !(f === 'giras' && a === 'edit'));
      const api = mockApi([]);
      await fillStepOne();
      expect(screen.queryByLabelText(/^Quantas senhas/)).not.toBeInTheDocument();
      expect(screen.getByTestId('create-sem-senhas')).toHaveTextContent('sem senhas liberadas');
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /salvar: Nova gira/ }));
      });
      expect(api.post).toHaveBeenCalledWith('/api/v1/admin/giras', expect.objectContaining({ nome: NEW_GIRA.nome }));
      expect(api.put).not.toHaveBeenCalled();
    });

    it('o local opcional vai no cadastro da gira (vazio = null, vale o endereço do terreiro)', async () => {
      const api = mockApi([]);
      const AdminGiras = require('@/pages/admin/giras').default;
      wrap(<AdminGiras />);
      await waitFor(() => expect(screen.getByRole('button', { name: /Nova gira/ })).toBeEnabled());
      fireEvent.click(screen.getByRole('button', { name: /Nova gira/ }));
      fireEvent.change(screen.getByLabelText(/^Nome da gira/), { target: { value: NEW_GIRA.nome } });
      setDateTime(/^Dia e hora da gira/, '10/01/2099', '19:00');
      fireEvent.change(screen.getByLabelText(/^Local/), { target: { value: 'Cachoeira do Parque' } });
      for (let i = 0; i < 3; i += 1) {
        await act(async () => {
          fireEvent.click(screen.getByRole('button', { name: /salvar: Nova gira/ }));
        });
      }
      expect(api.post).toHaveBeenCalledWith('/api/v1/admin/giras', expect.objectContaining({ local: 'Cachoeira do Parque' }));
    });

    it('"Compartilhar link" no cartão usa o link da própria gira, não o do terreiro', async () => {
      const now = Date.now();
      const aberta = {
        ...NEW_GIRA,
        id: 'aberta',
        nome: 'Gira de Ogum',
        data_inicio: new Date(now + 5 * 24 * 3600 * 1000).toISOString(),
        max_tickets: 50,
        release_start_at: new Date(now - 3600 * 1000).toISOString(),
        release_end_at: new Date(now + 4 * 24 * 3600 * 1000).toISOString(),
      };
      const GIRA_LINK = 'https://girahub.com.br/public/gira/aberta';
      const api = mockApi([aberta]);
      const base = api.get.getMockImplementation();
      api.get.mockImplementation((url: string) =>
        url === '/api/v1/admin/giras/aberta/senhas'
          ? Promise.resolve({ data: { max_tickets: 50, current_count: 3, public_link: GIRA_LINK, sponsor_public_link: '' } })
          : base(url),
      );
      const AdminGiras = require('@/pages/admin/giras').default;
      wrap(<AdminGiras />);
      await waitFor(() => expect(screen.getByRole('button', { name: /Compartilhar link/ })).toBeInTheDocument());
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /Compartilhar link/ }));
      });
      await waitFor(() => expect(screen.getAllByTestId('share-link-text')[0]).toHaveTextContent(GIRA_LINK));
      expect(screen.getByTestId('share-link-dialog')).toHaveTextContent('Este link é só da Gira de Ogum');
      expect(screen.getByTestId('share-link-dialog')).not.toHaveTextContent(LINK);
    });

    it('gira sem senhas: "Configurar senhas" abre o drawer com a sugestão', async () => {
      const api = mockApi([{ ...NEW_GIRA, max_tickets: null }]);
      const AdminGiras = require('@/pages/admin/giras').default;
      wrap(<AdminGiras />);
      await waitFor(() => expect(screen.getByRole('button', { name: /Configurar senhas/ })).toBeInTheDocument());
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /Configurar senhas/ }));
      });
      await waitFor(() => expect(screen.getByTestId('senha-suggestion')).toBeInTheDocument());
      expect(api.get).toHaveBeenCalledWith('/api/v1/admin/giras/nova/senhas');
      expect(screen.getByTestId('senha-suggestion')).not.toHaveTextContent('Gira criada!');
      expect(screen.getByLabelText(/^Quantas senhas/)).toHaveValue(30);
    });
  });
});
