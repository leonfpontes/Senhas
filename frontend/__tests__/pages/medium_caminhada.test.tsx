/**
 * AM-19 — "Minha caminhada" na Área do Médium: sem autorização mostra o termo e autoriza (com a
 * versão do texto); com autorização mostra os campos liberados e a linha do tempo; "Sugerir"
 * manda a sugestão (fica com a direção); retirar autorização pede confirmação; impersonação só lê;
 * plano sem a ficha → aviso neutro. Só chama /api/v1/medium/*. Perfil mostra a entrada só com
 * `me.ficha`.
 */
import React from 'react';
import { act, fireEvent, render, screen, within } from '@testing-library/react';

const mockRouter: any = {
  pathname: '/medium/caminhada',
  asPath: '/medium/caminhada',
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
const mockPost = jest.fn();
const mockDelete = jest.fn();
jest.mock('@/services/api_client', () => ({
  apiClient: {
    get: (...a: unknown[]) => mockGet(...a),
    post: (...a: unknown[]) => mockPost(...a),
    put: jest.fn(),
    delete: (...a: unknown[]) => mockDelete(...a),
    getBaseURL: () => '',
  },
  extractApiErrorMessage: (e: any, fallback: string) => e?.response?.data?.message ?? fallback,
  endImpersonation: jest.fn(),
}));

import { ProfileProvider } from '@/hooks/useProfile';
import { MediumProvider } from '@/components/medium/MediumProvider';
import { INSTALL_AREA_SEEN_KEY } from '@/components/medium/InstallAreaSheet';

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
  modulos: ['agenda', 'avisos'],
  ficha: true,
};
const SEM = { consentimento: { dado: false, versao_atual: '1', revogado_em: null }, campos: [], marcos: [] };
const COM = {
  consentimento: { dado: true, em: '2026-10-08T10:00:00Z', versao: '1', versao_atual: '1', revogado_em: null },
  campos: [
    { id: 'c1', rotulo: 'Orixá de cabeça', tipo: 'texto', opcoes: null, valor: 'Oxóssi', pode_sugerir: false, sugestao_pendente: null },
    { id: 'c2', rotulo: 'Data do batismo', tipo: 'data', opcoes: null, valor: '2019-03-10', pode_sugerir: true, sugestao_pendente: null },
  ],
  marcos: [{ id: 'k1', tipo: 'batismo', titulo: 'Batismo na casa', data: '2019-03-10', observacao: null }],
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

function renderPage() {
  const Page = require('@/pages/medium/caminhada').default;
  return render(
    <ProfileProvider>
      <MediumProvider>
        <Page />
      </MediumProvider>
    </ProfileProvider>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  localStorage.clear();
  sessionStorage.clear();
  localStorage.setItem(INSTALL_AREA_SEEN_KEY, '1');
  localStorage.setItem('user', JSON.stringify(PROFILE));
  document.cookie = 'auth_state=1';
  mockRouter.pathname = '/medium/caminhada';
});

describe('Minha caminhada', () => {
  it('sem autorização: termo e "Autorizar" com a versão do texto', async () => {
    api({ '/api/v1/medium/me': ME, '/api/v1/medium/ficha': SEM });
    mockPost.mockResolvedValue({ data: COM });
    renderPage();
    const card = await screen.findByTestId('caminhada-autorizar');
    expect(card).toHaveTextContent(/dado sensível/);
    const botao = within(card).getByRole('button', { name: 'Autorizar' });
    expect(botao).toBeDisabled();
    fireEvent.click(within(card).getByRole('checkbox'));
    await act(async () => {
      fireEvent.click(botao);
    });
    expect(mockPost).toHaveBeenCalledWith('/api/v1/medium/ficha/consentimento', { confirmo: true, versao: '1' });
    expect(await screen.findAllByTestId('caminhada-campo')).toHaveLength(2);
    const urls = mockGet.mock.calls.map((c) => String(c[0]));
    expect(urls.filter((u) => u.startsWith('/api/v1/admin'))).toEqual([]);
  });

  it('com autorização: campos liberados, linha do tempo e sugestão vai para a casa', async () => {
    api({ '/api/v1/medium/me': ME, '/api/v1/medium/ficha': COM });
    mockPost.mockResolvedValue({
      data: { ...COM, campos: [COM.campos[0], { ...COM.campos[1], sugestao_pendente: { valor: '2019-03-17', criado_em: 'x' } }] },
    });
    renderPage();
    const campos = await screen.findAllByTestId('caminhada-campo');
    expect(campos[0]).toHaveTextContent('Oxóssi');
    expect(campos[1]).toHaveTextContent('10/03/2019');
    expect(within(campos[0]).queryByRole('button', { name: /Sugerir/ })).not.toBeInTheDocument();
    expect(screen.getByTestId('caminhada-marco')).toHaveTextContent('Batismo na casa');

    fireEvent.click(within(campos[1]).getByRole('button', { name: /Sugerir/ }));
    const sheet = await screen.findByTestId('sugerir-sheet');
    fireEvent.change(within(sheet).getByLabelText('Data'), { target: { value: '2019-03-17' } });
    await act(async () => {
      fireEvent.click(within(sheet).getByRole('button', { name: 'Enviar para a casa' }));
    });
    expect(mockPost).toHaveBeenCalledWith('/api/v1/medium/ficha/sugestoes', { campo_id: 'c2', valor: '2019-03-17' });
    expect(await screen.findByTestId('sugestao-pendente')).toHaveTextContent('17/03/2019');
  });

  it('retirar autorização pede confirmação e avisa que a direção será avisada', async () => {
    api({ '/api/v1/medium/me': ME, '/api/v1/medium/ficha': COM });
    mockDelete.mockResolvedValue({ data: { ...SEM, consentimento: { ...SEM.consentimento, revogado_em: '2026-10-08T12:00:00Z' } } });
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Retirar autorização' }));
    expect(await screen.findByText(/direção da casa será avisada/)).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(screen.getAllByRole('button', { name: 'Retirar autorização' }).at(-1)!);
    });
    expect(mockDelete).toHaveBeenCalledWith('/api/v1/medium/ficha/consentimento');
    expect(await screen.findByText(/Você retirou a autorização/)).toBeInTheDocument();
  });

  it('impersonando: só leitura (sem Sugerir nem Retirar)', async () => {
    sessionStorage.setItem('impersonating', '1');
    api({ '/api/v1/medium/me': ME, '/api/v1/medium/ficha': COM });
    renderPage();
    await screen.findAllByTestId('caminhada-campo');
    expect(screen.queryByRole('button', { name: /Sugerir/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Retirar autorização' })).not.toBeInTheDocument();
  });

  it('plano da casa sem a ficha: aviso neutro', async () => {
    api({ '/api/v1/medium/me': { ...ME, ficha: false }, '/api/v1/medium/ficha': { status: 403 } });
    renderPage();
    expect(await screen.findByText('Caminhada indisponível')).toBeInTheDocument();
  });
});
