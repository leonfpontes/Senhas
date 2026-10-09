/**
 * AM-21 — Estudos na Área do Médium: lista por categoria com busca, link comum abre em outra aba,
 * texto/ponto/vídeo abrem a tela do material (texto sem HTML, YouTube no `youtube-nocookie`),
 * cursos da casa com o link da inscrição, entrada no menu só com `me.estudos` e aviso neutro sem
 * o plano (sem chamar a API).
 */
import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const mockRouter: any = {
  pathname: '/medium/estudos',
  asPath: '/medium/estudos',
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
    post: jest.fn(),
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
    avisos_nao_lidos: 0,
    estudos: true,
    ...extra,
  };
}

const LISTA = {
  categorias: ['Fundamentos', 'Pontos cantados'],
  itens: [
    {
      id: 'e1',
      titulo: 'Apostila do desenvolvimento',
      tipo: 'link',
      categoria: 'Fundamentos',
      resumo: '',
      url: 'https://drive.google.com/file/d/x/view',
      fonte: 'drive',
      youtube_id: null,
    },
    {
      id: 'e2',
      titulo: 'Ponto de Ogum',
      tipo: 'ponto',
      categoria: 'Pontos cantados',
      resumo: 'Ogum ê Patacori',
      url: null,
      fonte: null,
      youtube_id: null,
    },
    {
      id: 'e3',
      titulo: 'Gira de Exu explicada',
      tipo: 'link',
      categoria: 'Fundamentos',
      resumo: '',
      url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      fonte: 'youtube',
      youtube_id: 'dQw4w9WgXcQ',
    },
  ],
  cursos: [
    {
      id: 'c1',
      titulo: 'Curso de ervas',
      resumo: 'Banhos e defumações',
      data_inicio: '2026-11-07T22:00:00Z',
      data_fim: null,
      local: 'Salão',
      vagas_restantes: 2,
      inscricao_path: '/public/cursos/c1/inscricao',
    },
  ],
};

function api(routes: Record<string, unknown>) {
  mockGet = jest.fn((url: string) => {
    if (url === '/api/v1/auth/profile') return Promise.resolve({ data: PROFILE });
    const hit = Object.entries(routes).find(([k]) => url === k);
    if (!hit) return Promise.resolve({ data: {} });
    const v = hit[1];
    if ((v as { status?: number })?.status) return Promise.reject(v);
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

const calls = () => mockGet.mock.calls.map((c) => String(c[0]));

beforeEach(() => {
  jest.clearAllMocks();
  localStorage.clear();
  sessionStorage.clear();
  localStorage.setItem(INSTALL_AREA_SEEN_KEY, '1');
  localStorage.setItem('user', JSON.stringify(PROFILE));
  document.cookie = 'auth_state=1';
  mockRouter.pathname = '/medium/estudos';
  mockRouter.asPath = '/medium/estudos';
  mockRouter.query = {};
});

describe('Estudos — lista', () => {
  it('agrupa por categoria, link comum abre em outra aba e o resto abre a tela do material', async () => {
    api({ '/api/v1/medium/me': me(), '/api/v1/medium/materiais': LISTA });
    const Page = require('@/pages/medium/estudos').default;
    renderApp(<Page />);

    const fundamentos = await screen.findByRole('region', { name: 'Fundamentos' });
    const itens = within(fundamentos).getAllByTestId('material-item');
    expect(itens.map((i) => within(i).getByText(/Apostila|Gira de Exu/).textContent)).toEqual([
      'Apostila do desenvolvimento',
      'Gira de Exu explicada',
    ]);
    expect(itens[0]).toHaveAttribute('href', 'https://drive.google.com/file/d/x/view');
    expect(itens[0]).toHaveAttribute('target', '_blank');
    expect(itens[0].getAttribute('rel')).toContain('noopener');
    expect(within(itens[0]).getByText('Google Drive')).toBeInTheDocument();
    expect(itens[1]).toHaveAttribute('href', '/medium/estudos/e3');
    const pontos = screen.getByRole('region', { name: 'Pontos cantados' });
    expect(within(pontos).getByTestId('material-item')).toHaveAttribute('href', '/medium/estudos/e2');

    const curso = screen.getByTestId('curso-item');
    expect(within(curso).getByText('Curso de ervas')).toBeInTheDocument();
    expect(within(curso).getByText('Restam 2 vagas')).toBeInTheDocument();
    expect(within(curso).getByRole('link', { name: /Fazer a inscrição/ })).toHaveAttribute(
      'href',
      '/public/cursos/c1/inscricao',
    );
  });

  it('busca sem acento por título ou categoria', async () => {
    api({ '/api/v1/medium/me': me(), '/api/v1/medium/materiais': LISTA });
    const Page = require('@/pages/medium/estudos').default;
    renderApp(<Page />);
    await screen.findAllByTestId('material-item');
    await userEvent.type(screen.getByTestId('estudos-busca'), 'OGUM');
    expect(screen.getAllByTestId('material-item')).toHaveLength(1);
    fireEvent.change(screen.getByTestId('estudos-busca'), { target: { value: 'xyz' } });
    expect(screen.getByText(/Nada encontrado/)).toBeInTheDocument();
  });

  it('o menu do cabeçalho mostra "Estudos e documentos" só com me.estudos', async () => {
    api({ '/api/v1/medium/me': me(), '/api/v1/medium/materiais': LISTA });
    const Page = require('@/pages/medium/estudos').default;
    renderApp(<Page />);
    await screen.findAllByTestId('material-item');
    await userEvent.click(screen.getByTestId('medium-menu'));
    expect(await screen.findByTestId('medium-menu-estudos')).toBeInTheDocument();
  });

  it('sem o plano: aviso neutro, sem item no menu e sem chamar a API', async () => {
    api({ '/api/v1/medium/me': me({ estudos: false }) });
    const Page = require('@/pages/medium/estudos').default;
    renderApp(<Page />);
    expect(await screen.findByText('Estudos indisponíveis')).toBeInTheDocument();
    expect(screen.queryByText(/plano/i)).not.toBeInTheDocument();
    expect(calls()).not.toContain('/api/v1/medium/materiais');
    await userEvent.click(screen.getByTestId('medium-menu'));
    expect(screen.queryByTestId('medium-menu-estudos')).not.toBeInTheDocument();
  });

  it('403 da API vira o aviso neutro', async () => {
    api({ '/api/v1/medium/me': me(), '/api/v1/medium/materiais': { status: 403 } });
    const Page = require('@/pages/medium/estudos').default;
    renderApp(<Page />);
    expect(await screen.findByText('Estudos indisponíveis')).toBeInTheDocument();
  });
});

describe('Estudos — material', () => {
  beforeEach(() => {
    mockRouter.pathname = '/medium/estudos/[id]';
  });

  it('ponto: letra sem HTML com quebras de linha e botão para ouvir', async () => {
    mockRouter.asPath = '/medium/estudos/e2';
    mockRouter.query = { id: 'e2' };
    api({
      '/api/v1/medium/me': me(),
      '/api/v1/medium/materiais/e2': {
        id: 'e2',
        titulo: 'Ponto de Ogum',
        tipo: 'ponto',
        categoria: 'Pontos cantados',
        resumo: '',
        url: 'https://soundcloud.com/casa/ogum',
        fonte: 'link',
        youtube_id: null,
        texto: 'Ogum ê\n<img src=x onerror="window.__xss=1">\nPatacori',
      },
    });
    const Page = require('@/pages/medium/estudos/[id]').default;
    renderApp(<Page />);
    expect(await screen.findByRole('heading', { name: 'Ponto de Ogum' })).toBeInTheDocument();
    expect(screen.getByText('Ogum ê')).toBeInTheDocument();
    expect(screen.getByText('Patacori')).toBeInTheDocument();
    expect(document.querySelector('img[src="x"]')).toBeNull();
    expect((window as any).__xss).toBeUndefined();
    expect(screen.getByTestId('estudo-abrir')).toHaveAttribute('href', 'https://soundcloud.com/casa/ogum');
    expect(screen.queryByTestId('estudo-video')).not.toBeInTheDocument();
  });

  it('vídeo do YouTube toca no youtube-nocookie', async () => {
    mockRouter.asPath = '/medium/estudos/e3';
    mockRouter.query = { id: 'e3' };
    api({
      '/api/v1/medium/me': me(),
      '/api/v1/medium/materiais/e3': { ...LISTA.itens[2], texto: null },
    });
    const Page = require('@/pages/medium/estudos/[id]').default;
    renderApp(<Page />);
    const video = await screen.findByTestId('estudo-video');
    expect(video).toHaveAttribute('src', 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ');
    expect(screen.queryByTestId('estudo-abrir')).not.toBeInTheDocument();
  });

  it('material que não existe (404) mostra mensagem amigável', async () => {
    mockRouter.asPath = '/medium/estudos/zz';
    mockRouter.query = { id: 'zz' };
    api({ '/api/v1/medium/me': me(), '/api/v1/medium/materiais/zz': { status: 404 } });
    const Page = require('@/pages/medium/estudos/[id]').default;
    renderApp(<Page />);
    expect(await screen.findByText('Este estudo não está mais aqui')).toBeInTheDocument();
  });
});
