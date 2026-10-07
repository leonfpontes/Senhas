/**
 * AM-09 — Avisos na Área do Médium: lista (ponto de não lido, "Fixado"), leitura que marca como
 * lido e atualiza o selo da aba, texto sem HTML (XSS) com links clicáveis, impersonação só lê,
 * aba escondida quando a casa desliga o módulo.
 */
import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';

const mockRouter: any = {
  pathname: '/medium/avisos',
  asPath: '/medium/avisos',
  query: {},
  isReady: true,
  push: jest.fn(() => Promise.resolve(true)),
  replace: jest.fn(() => Promise.resolve(true)),
  events: { on: jest.fn(), off: jest.fn() },
};
jest.mock('next/router', () => ({ useRouter: () => mockRouter }));
jest.mock('next/compat/router', () => ({ useRouter: () => mockRouter }));
jest.mock('next/head', () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
jest.mock('next/link', () => {
  const MockLink = React.forwardRef(({ children, href, ...rest }: any, ref: any) => (
    <a href={typeof href === 'string' ? href : href?.pathname} ref={ref} {...rest}>
      {children}
    </a>
  ));
  MockLink.displayName = 'MockLink';
  return MockLink;
});
jest.mock('next/font/google', () => ({
  Fraunces: () => ({ variable: 'font-fraunces', className: 'font-fraunces' }),
}));
jest.mock('@/services/analytics', () => ({ trackEvent: jest.fn() }));

let mockGet: jest.Mock;
const mockPost = jest.fn((..._a: unknown[]) => Promise.resolve({ data: { lido: true } }));
jest.mock('@/services/api_client', () => ({
  apiClient: {
    get: (...a: unknown[]) => mockGet(...a),
    post: (...a: unknown[]) => mockPost(...a),
    put: jest.fn(),
    delete: jest.fn(),
  },
  endImpersonation: jest.fn(),
}));

import { ProfileProvider } from '@/hooks/useProfile';
import { MediumProvider } from '@/components/medium/MediumProvider';
import { INSTALL_AREA_SEEN_KEY } from '@/components/medium/InstallAreaSheet';

const PROFILE = {
  id: 'u1',
  email: 'ana@exemplo.com',
  username: 'ana',
  full_name: 'Ana Paula Ribeiro',
  tenant_name: 'Casa da Luz',
  role: 'medium',
  areas: { admin: false, medium: { medium_id: 'm1', nome: 'Ana Paula Ribeiro' } },
};

function me(extra: Record<string, unknown> = {}) {
  return {
    nome: 'Ana Paula Ribeiro',
    foto_url: null,
    terreiro: { id: 't1', nome: 'Tenda Luz da Mata', slug: 'luz' },
    marca: { logo_url: null, primary_color: '#2f6b4f', secondary_color: '#e9b04a', font_color: null },
    areas: PROFILE.areas,
    modulos: ['agenda', 'avisos', 'mensalidade'],
    avisos_nao_lidos: 2,
    ...extra,
  };
}

const LISTA = {
  nao_lidos: 2,
  itens: [
    {
      id: 'a1',
      titulo: 'Agenda de outubro',
      resumo: 'Giras: 09/10 e 16/10.',
      fixado: true,
      publicado_em: '2026-10-01T12:00:00Z',
      lido: true,
    },
    {
      id: 'a2',
      titulo: 'Gira de sexta começa às 20h30',
      resumo: 'A corrente chega às 19h30.',
      fixado: false,
      publicado_em: '2026-10-07T12:00:00Z',
      lido: false,
    },
  ],
};

const DETALHE_XSS = {
  id: 'a2',
  titulo: 'Gira de sexta começa às 20h30',
  corpo:
    'A corrente chega às 19h30.\n<img src=x onerror="window.__xss=1">\nInscrição: https://exemplo.com.br/form.\njavascript:alert(1)',
  fixado: false,
  publicado_em: '2026-10-07T12:00:00Z',
  lido: false,
  lido_em: null,
};

function api(routes: Record<string, unknown>) {
  mockGet = jest.fn((url: string) => {
    if (url === '/api/v1/auth/profile') return Promise.resolve({ data: PROFILE });
    const hit = Object.entries(routes).find(([k]) => url === k);
    if (!hit) return Promise.resolve({ data: {} });
    const v = hit[1];
    if ((v as { status?: number })?.status) return Promise.reject(v);
    return Promise.resolve({ data: typeof v === 'function' ? (v as () => unknown)() : v });
  });
}

function renderApp(ui: React.ReactElement) {
  return render(
    <ProfileProvider>
      <MediumProvider>{ui}</MediumProvider>
    </ProfileProvider>,
  );
}

const tabBar = () => screen.getByRole('navigation', { name: 'Menu da Área do Médium' });
const calls = (m: jest.Mock) => m.mock.calls.map((c) => String(c[0]));

beforeEach(() => {
  jest.clearAllMocks();
  localStorage.clear();
  sessionStorage.clear();
  localStorage.setItem(INSTALL_AREA_SEEN_KEY, '1');
  localStorage.setItem('user', JSON.stringify(PROFILE));
  document.cookie = 'auth_state=1';
  mockRouter.pathname = '/medium/avisos';
  mockRouter.asPath = '/medium/avisos';
  mockRouter.query = {};
  delete (window as any).__xss;
});

describe('Avisos — lista', () => {
  it('mostra fixado primeiro, ponto de não lido e o selo na aba', async () => {
    api({ '/api/v1/medium/me': me(), '/api/v1/medium/avisos': LISTA });
    const Page = require('@/pages/medium/avisos').default;
    renderApp(<Page />);

    const itens = await screen.findAllByTestId('aviso-item');
    expect(itens.map((i) => within(i).getByRole('strong', { hidden: true }).textContent)).toEqual([
      'Agenda de outubro',
      'Gira de sexta começa às 20h30',
    ]);
    expect(within(itens[0]).getByText('Fixado')).toBeInTheDocument();
    expect(within(itens[0]).queryByTestId('aviso-nao-lido')).not.toBeInTheDocument();
    expect(within(itens[1]).getByRole('img', { name: 'Não lido' })).toBeInTheDocument();
    expect(itens[1]).toHaveAttribute('href', '/medium/avisos/a2');
    expect(within(itens[1]).getByText('Publicado em 07/10')).toBeInTheDocument();

    const avisosTab = within(tabBar()).getByRole('link', { name: /Avisos/ });
    expect(avisosTab).toHaveAttribute('aria-current', 'page');
    expect(within(avisosTab).getByTestId('medium-tab-badge')).toHaveTextContent('2');
    expect(avisosTab).toHaveTextContent('2 avisos não lidos');
  });

  it('sem avisos mostra o estado vazio', async () => {
    api({ '/api/v1/medium/me': me({ avisos_nao_lidos: 0 }), '/api/v1/medium/avisos': { itens: [], nao_lidos: 0 } });
    const Page = require('@/pages/medium/avisos').default;
    renderApp(<Page />);
    expect(await screen.findByText('Nenhum aviso por enquanto')).toBeInTheDocument();
    expect(within(tabBar()).queryByTestId('medium-tab-badge')).not.toBeInTheDocument();
  });

  it('módulo desligado pela casa: aba some e a tela mostra aviso neutro sem chamar a API', async () => {
    api({ '/api/v1/medium/me': me({ modulos: ['agenda', 'mensalidade'], avisos_nao_lidos: 0 }) });
    const Page = require('@/pages/medium/avisos').default;
    renderApp(<Page />);
    expect(await screen.findByText('Avisos indisponíveis')).toBeInTheDocument();
    expect(
      within(tabBar())
        .getAllByRole('link')
        .map((a) => a.textContent),
    ).toEqual(['Início', 'Agenda', 'Mensalidade', 'Perfil']);
    expect(calls(mockGet)).not.toContain('/api/v1/medium/avisos');
  });
});

describe('Avisos — leitura', () => {
  beforeEach(() => {
    mockRouter.pathname = '/medium/avisos/[id]';
    mockRouter.asPath = '/medium/avisos/a2';
    mockRouter.query = { id: 'a2' };
  });

  it('abrir marca como lido, atualiza o selo e renderiza o texto sem HTML', async () => {
    let naoLidos = 2;
    api({
      '/api/v1/medium/me': () => me({ avisos_nao_lidos: naoLidos }),
      '/api/v1/medium/avisos/a2': DETALHE_XSS,
    });
    mockPost.mockImplementationOnce(() => {
      naoLidos = 1;
      return Promise.resolve({ data: { lido: true } });
    });
    const Page = require('@/pages/medium/avisos/[id]').default;
    const { container } = renderApp(<Page />);

    expect(await screen.findByRole('heading', { name: 'Gira de sexta começa às 20h30' })).toBeInTheDocument();
    expect(screen.getByText('Direção da Tenda Luz da Mata · 07/10')).toBeInTheDocument();
    await waitFor(() => expect(mockPost).toHaveBeenCalledWith('/api/v1/medium/avisos/a2/lido'));
    await waitFor(() => expect(within(tabBar()).getByTestId('medium-tab-badge')).toHaveTextContent('1'));

    // XSS: a tag vira texto, nada de <img>; javascript: não vira link; https vira link seguro.
    const texto = screen.getByTestId('aviso-texto');
    expect(texto.querySelector('img')).toBeNull();
    expect(container.querySelector('img[src="x"]')).toBeNull();
    expect(within(texto).getByText('<img src=x onerror="window.__xss=1">')).toBeInTheDocument();
    expect((window as any).__xss).toBeUndefined();
    const links = within(texto).getAllByRole('link');
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveAttribute('href', 'https://exemplo.com.br/form');
    expect(links[0]).toHaveAttribute('target', '_blank');
    expect(links[0].getAttribute('rel')).toContain('noopener');
    expect(within(texto).getByText('javascript:alert(1)').tagName).toBe('P');
    // Quebras de linha viram parágrafos.
    expect(texto.querySelectorAll('p')).toHaveLength(4);
  });

  it('aviso já lido não marca de novo', async () => {
    api({ '/api/v1/medium/me': me(), '/api/v1/medium/avisos/a2': { ...DETALHE_XSS, lido: true } });
    const Page = require('@/pages/medium/avisos/[id]').default;
    renderApp(<Page />);
    await screen.findByRole('heading', { name: 'Gira de sexta começa às 20h30' });
    expect(mockPost).not.toHaveBeenCalled();
  });

  it('impersonando, o suporte só lê: não envia a marca de leitura', async () => {
    sessionStorage.setItem('impersonating', '1');
    api({ '/api/v1/medium/me': me(), '/api/v1/medium/avisos/a2': DETALHE_XSS });
    const Page = require('@/pages/medium/avisos/[id]').default;
    renderApp(<Page />);
    await screen.findByRole('heading', { name: 'Gira de sexta começa às 20h30' });
    expect(mockPost).not.toHaveBeenCalled();
  });

  it('aviso que saiu do ar ou de outro público: mensagem amigável', async () => {
    api({ '/api/v1/medium/me': me(), '/api/v1/medium/avisos/a2': { status: 404 } });
    const Page = require('@/pages/medium/avisos/[id]').default;
    renderApp(<Page />);
    expect(await screen.findByText('Aviso não encontrado')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Voltar aos avisos/ })).toHaveAttribute('href', '/medium/avisos');
  });
});
