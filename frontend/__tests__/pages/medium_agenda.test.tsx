/**
 * AM-07 — Agenda da Área do Médium: lista por mês com filtro, detalhe da gira (orientações,
 * mapa, senhas, .ics, Google Agenda e WhatsApp), aba "Agenda" escondida com o módulo desligado e
 * o cartão "Próxima gira" do Início levando ao detalhe. Só chama /api/v1/medium/*.
 */
import React from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

const mockRouter: any = {
  pathname: '/medium/agenda',
  asPath: '/medium/agenda',
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
jest.mock('@/services/api_client', () => ({
  apiClient: {
    get: (...a: unknown[]) => mockGet(...a),
    post: jest.fn(() => Promise.resolve({ data: {} })),
    put: jest.fn(),
    delete: jest.fn(),
    getBaseURL: () => '',
  },
  endImpersonation: jest.fn(),
}));

import { ProfileProvider } from '@/hooks/useProfile';
import { MediumProvider } from '@/components/medium/MediumProvider';
import { INSTALL_AREA_SEEN_KEY } from '@/components/medium/InstallAreaSheet';
import { textoDivulgar, type GiraDetalhe } from '@/components/medium/agenda';

const AREAS = { admin: false, medium: { medium_id: 'm1', nome: 'Ana Paula Ribeiro' } };
const PROFILE = {
  id: 'u1',
  email: 'ana@exemplo.com',
  username: 'ana',
  full_name: 'Ana Paula Ribeiro',
  tenant_name: 'Tenda Luz da Mata',
  role: 'medium',
  areas: AREAS,
};
const ME = {
  nome: 'Ana Paula Ribeiro',
  foto_url: null,
  terreiro: { id: 't1', nome: 'Tenda Luz da Mata', slug: 'luz' },
  marca: { logo_url: null, primary_color: '#2f6b4f', secondary_color: '#e9b04a', font_color: null },
  areas: AREAS,
  modulos: ['agenda', 'avisos', 'mensalidade'],
};

const tipoGira = { nome: 'Gira', icone: 'gira', cor: null };
const AGENDA = {
  inicio: '2099-10-01',
  fim: '2099-12-31',
  itens: [
    {
      origem: 'gira',
      id: 'g1',
      tipo: tipoGira,
      titulo: 'Gira de Caboclos',
      inicio: '2099-10-09T23:30:00Z',
      fim: null,
      local: null,
      minha_participacao: null,
    },
    {
      origem: 'gira',
      id: 'g2',
      tipo: tipoGira,
      titulo: 'Gira de Pretos-Velhos',
      inicio: '2099-11-13T23:00:00Z',
      fim: null,
      local: 'Cachoeira do Parque',
      minha_participacao: null,
    },
  ],
};

const DETALHE: GiraDetalhe = {
  origem: 'gira',
  id: 'g1',
  tipo: tipoGira,
  titulo: 'Gira de Caboclos',
  inicio: '2099-10-09T23:30:00Z',
  fim: '2099-10-10T02:30:00Z',
  local: null,
  minha_participacao: null,
  descricao: 'Gira aberta ao público.',
  orientacoes_corrente: 'Roupa branca e guias.\nA corrente chega às 19h30.',
  endereco: 'Rua das Palmeiras, 120',
  mapa_url: 'https://www.google.com/maps/search/?api=1&query=Rua%20das%20Palmeiras%2C%20120',
  senhas: { situacao: 'abertas', abrem_em: null },
  link_publico: 'https://girahub.com.br/public/gira/g1',
  agenda_celular: {
    ics_path: '/api/v1/medium/agenda/gira/g1/ics',
    google_url: 'https://calendar.google.com/calendar/render?action=TEMPLATE&text=Gira',
  },
};

function api(routes: Record<string, unknown>) {
  mockGet = jest.fn((url: string) => {
    if (url === '/api/v1/auth/profile') return Promise.resolve({ data: PROFILE });
    const hit = Object.entries(routes)
      .sort((a, b) => b[0].length - a[0].length)
      .find(([k]) => url.startsWith(k));
    if (!hit) return Promise.resolve({ data: {} });
    const v = hit[1] as { status?: number };
    if (v?.status) return Promise.reject(v);
    return Promise.resolve({ data: v });
  });
}

function renderApp(ui: React.ReactElement) {
  return render(
    <ProfileProvider>
      <MediumProvider>{ui}</MediumProvider>
    </ProfileProvider>,
  );
}

const calledUrls = () => mockGet.mock.calls.map((c) => String(c[0]));

beforeEach(() => {
  jest.clearAllMocks();
  localStorage.clear();
  localStorage.setItem(INSTALL_AREA_SEEN_KEY, '1');
  localStorage.setItem('user', JSON.stringify(PROFILE));
  document.cookie = 'auth_state=1';
  mockRouter.pathname = '/medium/agenda';
  mockRouter.query = {};
});

describe('Agenda (lista)', () => {
  it('agrupa por mês, filtra por Giras e leva ao detalhe', async () => {
    api({ '/api/v1/medium/me': ME, '/api/v1/medium/agenda': AGENDA });
    const Page = require('@/pages/medium/agenda').default;
    renderApp(<Page />);

    const outubro = await screen.findByRole('region', { name: 'Outubro de 2099' });
    const novembro = screen.getByRole('region', { name: 'Novembro de 2099' });
    expect(within(outubro).getByRole('link', { name: /Gira de Caboclos/ })).toHaveAttribute(
      'href',
      '/medium/agenda/gira/g1',
    );
    expect(within(novembro).getByText(/Cachoeira do Parque/)).toBeInTheDocument();

    // Só existem giras: Tudo · Giras (Atividades chegam com o AM-08).
    const filtro = screen.getByRole('group', { name: 'Filtrar agenda' });
    const botoes = within(filtro).getAllByRole('button');
    expect(botoes.map((b) => b.textContent)).toEqual(['Tudo', 'Giras']);
    expect(within(filtro).getByRole('button', { name: 'Tudo' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(within(filtro).getByRole('button', { name: 'Giras' }));
    expect(within(filtro).getByRole('button', { name: 'Giras' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getAllByRole('link', { name: /Gira de/ })).toHaveLength(2);

    // Aba Agenda ativa na barra inferior.
    const bar = screen.getByRole('navigation', { name: 'Menu da Área do Médium' });
    expect(within(bar).getByRole('link', { name: 'Agenda' })).toHaveAttribute('aria-current', 'page');
    expect(calledUrls().filter((u) => !u.startsWith('/api/v1/medium') && u !== '/api/v1/auth/profile')).toEqual(
      [],
    );
  });

  it('"Ver os próximos meses" busca a partir do dia seguinte ao fim', async () => {
    api({
      '/api/v1/medium/me': ME,
      '/api/v1/medium/agenda?inicio=': { inicio: '2100-01-01', fim: '2100-03-31', itens: [] },
      '/api/v1/medium/agenda': AGENDA,
    });
    const Page = require('@/pages/medium/agenda').default;
    renderApp(<Page />);
    await screen.findByRole('region', { name: 'Outubro de 2099' });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Ver os próximos meses/ }));
    });
    expect(calledUrls()).toContain('/api/v1/medium/agenda?inicio=2100-01-01');
  });

  it('sem nada marcado mostra o estado vazio', async () => {
    api({ '/api/v1/medium/me': ME, '/api/v1/medium/agenda': { ...AGENDA, itens: [] } });
    const Page = require('@/pages/medium/agenda').default;
    renderApp(<Page />);
    expect(await screen.findByText('Nada na agenda por enquanto')).toBeInTheDocument();
  });
});

describe('Detalhe da gira', () => {
  beforeEach(() => {
    mockRouter.pathname = '/medium/agenda/[tipo]/[id]';
    mockRouter.query = { tipo: 'gira', id: 'g1' };
  });

  it('mostra orientações, mapa, senhas e as ações de agenda e divulgação', async () => {
    api({ '/api/v1/medium/me': ME, '/api/v1/medium/agenda/gira/g1': DETALHE });
    const Page = require('@/pages/medium/agenda/[tipo]/[id]').default;
    renderApp(<Page />);

    expect(await screen.findByRole('heading', { name: 'Gira de Caboclos' })).toBeInTheDocument();
    expect(screen.getByText(/sexta, 9 de outubro · 20h30 às 23h30/i)).toBeInTheDocument();
    const orient = screen.getByRole('region', { name: /Orientações para a corrente/ });
    expect(orient).toHaveTextContent('Roupa branca e guias.');
    expect(orient).toHaveTextContent('A corrente chega às 19h30.');
    expect(screen.getByText('Rua das Palmeiras, 120')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Abrir no mapa' })).toHaveAttribute('href', DETALHE.mapa_url);
    expect(screen.getByTestId('gira-senhas')).toHaveTextContent('Senhas abertas para o público');

    expect(screen.getByRole('link', { name: /Adicionar à agenda do celular/ })).toHaveAttribute(
      'href',
      '/api/v1/medium/agenda/gira/g1/ics',
    );
    expect(screen.getByRole('link', { name: /Abrir no Google Agenda/ })).toHaveAttribute(
      'href',
      DETALHE.agenda_celular.google_url,
    );
    const wa = screen.getByRole('link', { name: /Divulgar a gira no WhatsApp/ });
    const href = wa.getAttribute('href') as string;
    expect(href.startsWith('https://wa.me/?text=')).toBe(true);
    const texto = decodeURIComponent(href.split('text=')[1]);
    expect(texto).toContain('Gira de Caboclos · Tenda Luz da Mata');
    expect(texto).toContain('https://girahub.com.br/public/gira/g1');
    // Orientações são da corrente: não vão na divulgação.
    expect(texto).not.toContain('Roupa branca');
    // Fora do navegador do WhatsApp não aparece o aviso.
    expect(screen.queryByRole('note')).not.toBeInTheDocument();

    const bar = screen.getByRole('navigation', { name: 'Menu da Área do Médium' });
    expect(within(bar).getByRole('link', { name: 'Agenda' })).toHaveAttribute('aria-current', 'page');
  });

  it('gira que não existe mais mostra aviso e volta para a agenda', async () => {
    api({ '/api/v1/medium/me': ME, '/api/v1/medium/agenda/gira/g1': { status: 404 } });
    const Page = require('@/pages/medium/agenda/[tipo]/[id]').default;
    renderApp(<Page />);
    expect(await screen.findByText('Não encontramos esta gira')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Voltar para a agenda/ })).toHaveAttribute('href', '/medium/agenda');
  });

  it('texto de divulgação conforme a situação das senhas', () => {
    const abrem = textoDivulgar(
      { ...DETALHE, senhas: { situacao: 'abrem_em', abrem_em: '2099-10-07T12:00:00Z' } },
      'Casa',
    );
    expect(abrem).toMatch(/As senhas abrem quarta, 7 de outubro · 9h: https:\/\/girahub/);
    const sem = textoDivulgar(
      { ...DETALHE, senhas: { situacao: 'sem_senhas' }, link_publico: 'https://girahub.com.br/luz' },
      null,
    );
    expect(sem).toContain('Veja a agenda da casa: https://girahub.com.br/luz');
    expect(sem.startsWith('Gira de Caboclos\nQuando: ')).toBe(true);
  });
});

describe('Módulo da agenda', () => {
  it('desligado pela casa: a aba Agenda some da barra', async () => {
    mockRouter.pathname = '/medium/perfil';
    api({ '/api/v1/medium/me': { ...ME, modulos: ['avisos', 'mensalidade'] } });
    const Page = require('@/pages/medium/perfil').default;
    renderApp(<Page />);
    const bar = await screen.findByRole('navigation', { name: 'Menu da Área do Médium' });
    expect(
      within(bar)
        .getAllByRole('link')
        .map((a) => a.textContent),
    ).toEqual(['Início', 'Avisos', 'Mensalidade', 'Perfil']);
  });

  it('Início: "Próxima gira" leva ao detalhe; sem o módulo, sem o link', async () => {
    mockRouter.pathname = '/medium';
    const inicio = {
      hoje: '2099-10-01',
      pendencias: [],
      proxima_gira: {
        id: 'g1',
        nome: 'Gira de Caboclos',
        data_inicio: '2099-10-09T23:30:00Z',
        data_fim: null,
        local: null,
        orientacoes: 'Roupa branca e guias.',
      },
      mensalidade: null,
      avisos: { nao_lidos: 0, ultimos: [] },
    };
    api({ '/api/v1/medium/me': ME, '/api/v1/medium/inicio': inicio });
    const Page = require('@/pages/medium/index').default;
    const { unmount } = renderApp(<Page />);
    const card = await screen.findByTestId('proxima-gira');
    expect(within(card).getByText('Roupa branca e guias.')).toBeInTheDocument();
    expect(within(card).getByRole('link', { name: /Ver detalhes da gira/ })).toHaveAttribute(
      'href',
      '/medium/agenda/gira/g1',
    );
    unmount();

    api({ '/api/v1/medium/me': { ...ME, modulos: ['avisos'] }, '/api/v1/medium/inicio': inicio });
    renderApp(<Page />);
    const card2 = await screen.findByTestId('proxima-gira');
    await waitFor(() => expect(within(card2).queryByRole('link')).not.toBeInTheDocument());
  });
});
