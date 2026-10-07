/**
 * AM-04/AM-06 — Área do Médium no navegador: gate do MediumLayout (sessão, área, painel),
 * Início (pendências primeiro, próxima gira, vazio), Perfil, escolha de área e a regra de ouro
 * "médium puro nunca chama /api/v1/admin/*" com os providers reais do _app.
 */
import React from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

const mockRouter: any = {
  pathname: '/medium',
  asPath: '/medium',
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

const mockTrack = jest.fn();
jest.mock('@/services/analytics', () => ({ trackEvent: (...a: unknown[]) => mockTrack(...a) }));

type Handler = (url: string) => unknown;
let mockGet: jest.Mock;
const mockPost = jest.fn(() => Promise.resolve({ data: {} }));
jest.mock('@/services/api_client', () => ({
  apiClient: {
    get: (...a: unknown[]) => mockGet(...a),
    post: (...a: unknown[]) => mockPost(...(a as [])),
    put: jest.fn(),
    delete: jest.fn(),
  },
  endImpersonation: jest.fn(),
}));

import { TenantAwareThemeProvider } from '@/providers/ThemeProvider';
import { ProfileProvider } from '@/hooks/useProfile';
import { MediumProvider } from '@/components/medium/MediumProvider';
import { SubscriptionProvider } from '@/hooks/useSubscription';
import { PermissionsProvider } from '@/hooks/usePermissions';
import { BirthdayProvider } from '@/providers/BirthdayProvider';
import { INSTALL_AREA_SEEN_KEY } from '@/components/medium/InstallAreaSheet';

const MEDIUM_AREAS = { admin: false, medium: { medium_id: 'm1', nome: 'Ana Paula Ribeiro' } };
const AMBAS = { admin: true, medium: { medium_id: 'm1', nome: 'Ana Paula Ribeiro' } };

function profileOf(role: string, areas: unknown) {
  return {
    id: 'u1',
    email: 'ana@exemplo.com',
    username: 'ana',
    full_name: 'Ana Paula Ribeiro',
    tenant_name: 'Casa da Luz',
    role,
    areas,
  };
}

const ME = {
  nome: 'Ana Paula Ribeiro',
  foto_url: null,
  terreiro: { id: 't1', nome: 'Tenda Luz da Mata', slug: 'luz' },
  marca: { logo_url: null, primary_color: '#2f6b4f', secondary_color: '#e9b04a', font_color: null },
  areas: MEDIUM_AREAS,
  modulos: ['agenda', 'avisos', 'mensalidade'],
};

const INICIO_COMPLETO = {
  hoje: '2026-10-15',
  pendencias: [
    {
      tipo: 'mensalidade',
      situacao: 'atrasada',
      mes: '2026-10',
      valor: 50,
      vencimento: '2026-10-10',
      dias_para_vencer: -5,
    },
    { tipo: 'aviso', quantidade: 2 },
  ],
  proxima_gira: {
    id: 'g1',
    nome: 'Gira de Caboclos',
    data_inicio: '2026-10-16T23:00:00Z',
    data_fim: null,
    local: 'Salão principal',
    orientacoes: null,
  },
  mensalidade: {
    mes: '2026-10',
    status: 'atrasada',
    valor: 50,
    vencimento: '2026-10-10',
    data_pagamento: null,
  },
  avisos: { nao_lidos: 2, ultimos: [] },
};

function api(routes: Record<string, unknown>, profile: unknown) {
  mockGet = jest.fn((url: string) => {
    if (url === '/api/v1/auth/profile') return Promise.resolve({ data: profile });
    const hit = Object.entries(routes).find(([k]) => url.startsWith(k));
    if (!hit) return Promise.resolve({ data: {} });
    const v = hit[1];
    if (v instanceof Error || (v as { status?: number })?.status) return Promise.reject(v);
    return Promise.resolve({ data: typeof v === 'function' ? (v as Handler)(url) : v });
  });
}

function signIn(profile: unknown) {
  localStorage.setItem('user', JSON.stringify(profile));
  document.cookie = 'auth_state=1';
}

function renderApp(ui: React.ReactElement) {
  return render(
    <TenantAwareThemeProvider>
      <ProfileProvider>
        <MediumProvider>
          <SubscriptionProvider>
            <PermissionsProvider>
              <BirthdayProvider>{ui}</BirthdayProvider>
            </PermissionsProvider>
          </SubscriptionProvider>
        </MediumProvider>
      </ProfileProvider>
    </TenantAwareThemeProvider>,
  );
}

const calledUrls = () => mockGet.mock.calls.map((c) => String(c[0]));

beforeEach(() => {
  jest.clearAllMocks();
  localStorage.clear();
  sessionStorage.clear();
  localStorage.setItem(INSTALL_AREA_SEEN_KEY, '1');
  document.cookie = 'auth_state=; expires=Thu, 01 Jan 1970 00:00:00 GMT';
  document.documentElement.classList.remove('dark');
  mockRouter.pathname = '/medium';
  mockRouter.asPath = '/medium';
});

describe('Início da Área do Médium', () => {
  it('médium puro: pendências primeiro, próxima gira e nenhuma chamada a /api/v1/admin', async () => {
    const profile = profileOf('medium', MEDIUM_AREAS);
    signIn(profile);
    api({ '/api/v1/medium/me': ME, '/api/v1/medium/inicio': INICIO_COMPLETO }, profile);
    const Page = require('@/pages/medium/index').default;

    renderApp(<Page />);

    expect(await screen.findByRole('heading', { name: 'Olá, Ana' })).toBeInTheDocument();
    expect(await screen.findByText('Você tem 2 coisas para ver.')).toBeInTheDocument();
    const pend = screen.getByRole('region', { name: 'Para você ver agora' });
    const mensal = within(pend).getByTestId('pendencia-mensalidade');
    expect(within(mensal).getByText(/Mensalidade de outubro/)).toBeInTheDocument();
    expect(within(mensal).getByText('Venceu em 10/10')).toBeInTheDocument();
    expect(within(mensal).getByRole('link', { name: 'Pagar com PIX' })).toHaveAttribute(
      'href',
      '/medium/mensalidade?pagar=1',
    );
    expect(within(pend).getByRole('link', { name: /2 avisos novos da casa/ })).toHaveAttribute(
      'href',
      '/medium/avisos',
    );

    // Ordem: pendências antes da próxima gira (D-24).
    const gira = screen.getByTestId('proxima-gira');
    expect(pend.compareDocumentPosition(gira) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(gira).getByRole('heading', { name: 'Gira de Caboclos' })).toBeInTheDocument();
    expect(within(gira).getByText(/sexta, 16 de outubro · 20h/i)).toBeInTheDocument();

    // Cabeçalho com o terreiro, barra inferior com os 5 itens.
    expect(screen.getByText('Tenda Luz da Mata')).toBeInTheDocument();
    const bar = screen.getByRole('navigation', { name: 'Menu da Área do Médium' });
    expect(
      within(bar)
        .getAllByRole('link')
        .map((a) => a.textContent),
    ).toEqual(['Início', 'Agenda', 'Avisos', 'Mensalidade', 'Perfil']);
    expect(within(bar).getByRole('link', { name: 'Início' })).toHaveAttribute(
      'aria-current',
      'page',
    );

    await waitFor(() => expect(calledUrls()).toContain('/api/v1/medium/inicio'));
    expect(calledUrls().filter((u) => u.startsWith('/api/v1/admin'))).toEqual([]);
    // Marca do terreiro aplicada no <html>, com o texto da marca calculado para a paleta terra.
    expect(document.documentElement.style.getPropertyValue('--primary')).toBe('#2f6b4f');
    expect(document.documentElement.style.getPropertyValue('--terra-brand-text-light')).toMatch(
      /^#/,
    );
  });

  it('sem nada publicado mostra o estado vazio amigável', async () => {
    const profile = profileOf('medium', MEDIUM_AREAS);
    signIn(profile);
    api(
      {
        '/api/v1/medium/me': ME,
        '/api/v1/medium/inicio': {
          hoje: '2026-10-15',
          pendencias: [],
          proxima_gira: null,
          mensalidade: null,
          avisos: { nao_lidos: 0, ultimos: [] },
        },
      },
      profile,
    );
    const Page = require('@/pages/medium/index').default;
    renderApp(<Page />);
    expect(await screen.findByText('Nada novo por aqui')).toBeInTheDocument();
    expect(screen.getByText('Tudo em dia por aqui.')).toBeInTheDocument();
  });

  it('mensalidade paga aparece em "Acompanhando", fora das pendências', async () => {
    const profile = profileOf('medium', MEDIUM_AREAS);
    signIn(profile);
    api(
      {
        '/api/v1/medium/me': ME,
        '/api/v1/medium/inicio': {
          hoje: '2026-10-15',
          pendencias: [],
          proxima_gira: null,
          mensalidade: {
            mes: '2026-10',
            status: 'paga',
            valor: 50,
            vencimento: '2026-10-10',
            data_pagamento: '2026-10-03T12:00:00Z',
          },
          avisos: { nao_lidos: 0, ultimos: [] },
        },
      },
      profile,
    );
    const Page = require('@/pages/medium/index').default;
    renderApp(<Page />);
    const acomp = await screen.findByRole('region', { name: 'Acompanhando' });
    expect(within(acomp).getByText('Paga · confirmada pela casa')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Para você ver agora' })).not.toBeInTheDocument();
  });

  it('mensalidade em aberto a mais de 5 dias do vencimento fica em "Acompanhando"', async () => {
    const profile = profileOf('medium', MEDIUM_AREAS);
    signIn(profile);
    api(
      {
        '/api/v1/medium/me': ME,
        '/api/v1/medium/inicio': {
          hoje: '2026-10-01',
          pendencias: [],
          proxima_gira: null,
          mensalidade: { mes: '2026-10', status: 'pendente', valor: 50, vencimento: '2026-10-10', data_pagamento: null },
          avisos: { nao_lidos: 0, ultimos: [] },
        },
      },
      profile,
    );
    const Page = require('@/pages/medium/index').default;
    renderApp(<Page />);
    const acomp = await screen.findByRole('region', { name: 'Acompanhando' });
    expect(within(acomp).getByText(/vence em 10\/10/)).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Para você ver agora' })).not.toBeInTheDocument();
  });

  it('primeiro acesso no aparelho abre o passo "Deixe a Área na tela inicial" (e lembra)', async () => {
    localStorage.removeItem(INSTALL_AREA_SEEN_KEY);
    const profile = profileOf('medium', MEDIUM_AREAS);
    signIn(profile);
    api({ '/api/v1/medium/me': ME, '/api/v1/medium/inicio': INICIO_COMPLETO }, profile);
    const Page = require('@/pages/medium/index').default;
    renderApp(<Page />);
    const sheet = await screen.findByRole('dialog', { name: 'Deixe a Área na tela inicial' });
    expect(within(sheet).getByText(/Abriu dentro do WhatsApp\?/)).toBeInTheDocument();
    fireEvent.click(within(sheet).getByRole('radio', { name: 'iPhone' }));
    expect(within(sheet).getByText(/Adicionar à Tela de Início/)).toBeInTheDocument();
    expect(within(sheet).getByText('Abrir no Safari')).toBeInTheDocument();
    fireEvent.click(within(sheet).getByRole('button', { name: 'Agora não' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(localStorage.getItem(INSTALL_AREA_SEEN_KEY)).toBe('1');
  });
});

describe('gate do MediumLayout', () => {
  it('conta só do painel é mandada para o painel, sem chamar /medium/me', async () => {
    const profile = profileOf('admin', { admin: true, medium: null });
    signIn(profile);
    api({}, profile);
    const Page = require('@/pages/medium/index').default;
    renderApp(<Page />);
    await waitFor(() => expect(mockRouter.replace).toHaveBeenCalledWith('/admin/dashboard'));
    expect(calledUrls()).not.toContain('/api/v1/medium/me');
  });

  it('sem nenhuma área: aviso neutro, sem oferta de plano e sem chamar a API da Área', async () => {
    const profile = profileOf('medium', { admin: false, medium: null });
    signIn(profile);
    api({}, profile);
    const Page = require('@/pages/medium/index').default;
    renderApp(<Page />);
    expect(
      await screen.findByText(
        'A Área do Médium não está disponível agora. Fale com a direção da casa.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/plano|assin|upgrade/i)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sair' })).toBeInTheDocument();
    expect(
      calledUrls().filter((u) => u.startsWith('/api/v1/medium') || u.startsWith('/api/v1/admin')),
    ).toEqual([]);
  });

  it('403 no /medium/me (casa desligou a Área) também mostra o aviso neutro', async () => {
    const profile = profileOf('medium', MEDIUM_AREAS);
    signIn(profile);
    api({ '/api/v1/medium/me': { status: 403 } }, profile);
    const Page = require('@/pages/medium/index').default;
    renderApp(<Page />);
    expect(await screen.findByText(/não está disponível agora/)).toBeInTheDocument();
    expect(calledUrls()).not.toContain('/api/v1/medium/inicio');
  });

  it('sem sessão vai para o login', async () => {
    api({}, null);
    const Page = require('@/pages/medium/index').default;
    renderApp(<Page />);
    await waitFor(() => expect(mockRouter.replace).toHaveBeenCalledWith('/login'));
  });

  it('com as duas áreas, o menu tem "Trocar de área", que vai ao painel e atualiza a escolha lembrada', async () => {
    const profile = profileOf('operator', AMBAS);
    signIn(profile);
    localStorage.setItem('girahub:area:u1', 'medium');
    api(
      { '/api/v1/medium/me': { ...ME, areas: AMBAS }, '/api/v1/medium/inicio': INICIO_COMPLETO },
      profile,
    );
    const Page = require('@/pages/medium/perfil').default;
    mockRouter.pathname = '/medium/perfil';
    renderApp(<Page />);
    const trocar = await screen.findByTestId('perfil-trocar-area');
    fireEvent.click(trocar);
    expect(mockRouter.push).toHaveBeenCalledWith('/admin/dashboard');
    expect(localStorage.getItem('girahub:area:u1')).toBe('admin');
    expect(mockTrack).toHaveBeenCalledWith('area_escolhida', {
      area: 'admin',
      lembrada: true,
      origem: 'troca',
    });
    // Na Área nada chama o admin, mesmo para quem tem o painel.
    expect(calledUrls().filter((u) => u.startsWith('/api/v1/admin'))).toEqual([]);
  });

  it('médium puro não vê "Trocar de área" no Perfil; "Sair" chama /auth/logout', async () => {
    const profile = profileOf('medium', MEDIUM_AREAS);
    signIn(profile);
    api({ '/api/v1/medium/me': ME }, profile);
    mockRouter.pathname = '/medium/perfil';
    const Page = require('@/pages/medium/perfil').default;
    renderApp(<Page />);
    expect(await screen.findByRole('heading', { name: 'Ana Paula Ribeiro' })).toBeInTheDocument();
    expect(screen.queryByTestId('perfil-trocar-area')).not.toBeInTheDocument();
    expect(screen.getByTestId('perfil-instalar')).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(screen.getByTestId('perfil-sair'));
    });
    expect(mockPost).toHaveBeenCalledWith('/api/v1/auth/logout');
    expect(localStorage.getItem('user')).toBeNull();
    expect(mockRouter.push).toHaveBeenCalledWith('/login');
  });
});

describe('providers do painel fora do /admin', () => {
  it('no painel (admin) os providers buscam assinatura, permissões e marca; na Área, não', async () => {
    const profile = profileOf('operator', AMBAS);
    signIn(profile);
    api({ '/api/v1/medium/me': { ...ME, areas: AMBAS } }, profile);
    mockRouter.pathname = '/admin/dashboard';
    const { unmount } = renderApp(<div>painel</div>);
    await waitFor(() => expect(calledUrls()).toContain('/api/v1/admin/subscription'));
    expect(calledUrls()).toContain('/api/v1/admin/permission-groups/me/permissions');
    expect(calledUrls()).toContain('/api/v1/admin/tenant/branding');
    unmount();

    mockGet.mockClear();
    mockRouter.pathname = '/medium';
    renderApp(<div>area</div>);
    await waitFor(() => expect(calledUrls()).toContain('/api/v1/medium/me'));
    expect(calledUrls().filter((u) => u.startsWith('/api/v1/admin'))).toEqual([]);
  });
});

describe('/escolher-area', () => {
  it('mostra os dois cartões com o terreiro; "lembrar" vem marcado e grava a escolha', async () => {
    const profile = profileOf('operator', AMBAS);
    signIn(profile);
    api({ '/api/v1/medium/me': { ...ME, areas: AMBAS } }, profile);
    mockRouter.pathname = '/escolher-area';
    const Page = require('@/pages/escolher-area').default;
    renderApp(<Page />);
    expect(
      await screen.findByRole('heading', { name: 'Olá, Ana. Para onde você quer ir?' }),
    ).toBeInTheDocument();
    expect(await screen.findByText('Tenda Luz da Mata')).toBeInTheDocument();
    const lembrar = screen.getByRole('checkbox', { name: 'Lembrar minha escolha neste aparelho' });
    expect(lembrar).toBeChecked();
    fireEvent.click(screen.getByRole('button', { name: /Área do Médium/ }));
    expect(mockRouter.push).toHaveBeenCalledWith('/medium');
    expect(localStorage.getItem('girahub:area:u1')).toBe('medium');
    expect(mockTrack).toHaveBeenCalledWith('area_escolhida', {
      area: 'medium',
      lembrada: true,
      origem: 'escolha',
    });
    expect(calledUrls().filter((u) => u.startsWith('/api/v1/admin'))).toEqual([]);
  });

  it('desmarcar "lembrar" não grava a escolha', async () => {
    const profile = profileOf('admin', AMBAS);
    signIn(profile);
    api({ '/api/v1/medium/me': { ...ME, areas: AMBAS } }, profile);
    mockRouter.pathname = '/escolher-area';
    const Page = require('@/pages/escolher-area').default;
    renderApp(<Page />);
    fireEvent.click(
      await screen.findByRole('checkbox', { name: 'Lembrar minha escolha neste aparelho' }),
    );
    fireEvent.click(screen.getByRole('button', { name: /Painel do terreiro/ }));
    expect(mockRouter.push).toHaveBeenCalledWith('/admin/dashboard');
    expect(localStorage.getItem('girahub:area:u1')).toBeNull();
    expect(mockTrack).toHaveBeenCalledWith('area_escolhida', {
      area: 'admin',
      lembrada: false,
      origem: 'escolha',
    });
  });

  it('quem tem só uma área é mandado para ela', async () => {
    const profile = profileOf('medium', MEDIUM_AREAS);
    signIn(profile);
    api({}, profile);
    mockRouter.pathname = '/escolher-area';
    const Page = require('@/pages/escolher-area').default;
    renderApp(<Page />);
    await waitFor(() => expect(mockRouter.replace).toHaveBeenCalledWith('/medium'));
  });
});
