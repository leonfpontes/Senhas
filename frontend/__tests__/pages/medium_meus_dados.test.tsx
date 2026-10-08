/**
 * AM-14 — /medium/meus-dados ("Quem vê o quê", baixar em JSON/PDF, encerrar o acesso com a senha) e
 * AM-20 — opt-in do aniversário no Perfil e aniversários no Início. Só chamadas da API da Área.
 */
import React from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

const mockRouter: any = {
  pathname: '/medium/meus-dados',
  asPath: '/medium/meus-dados',
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
jest.mock('@/contexts/SnackbarContext', () => ({
  useSnackbar: () => ({ showSuccess: jest.fn(), showError: jest.fn() }),
}));
const mockGerarPdf = jest.fn(() => Promise.resolve());
jest.mock('@/lib/pdf/meusDadosPdf', () => ({
  gerarMeusDadosPdf: (...a: unknown[]) => (mockGerarPdf as any)(...a),
}));

let routes: Record<string, unknown> = {};
const mockGet = jest.fn((url: string) => {
  if (url === '/api/v1/auth/profile') return Promise.resolve({ data: PROFILE });
  const hit = Object.entries(routes).find(([k]) => url === k);
  if (!hit) return Promise.resolve({ data: {} });
  const v = hit[1] as { status?: number };
  if (v?.status) return Promise.reject(v);
  return Promise.resolve({ data: v });
});
const mockPost = jest.fn();
const mockPut = jest.fn();
jest.mock('@/services/api_client', () => ({
  apiClient: {
    get: (...a: unknown[]) => (mockGet as any)(...a),
    post: (...a: unknown[]) => mockPost(...a),
    put: (...a: unknown[]) => mockPut(...a),
    patch: jest.fn(),
    delete: jest.fn(),
  },
  extractApiErrorMessage: (e: any, f: string) => e?.response?.data?.message || f,
  endImpersonation: jest.fn(),
}));

import { ProfileProvider } from '@/hooks/useProfile';
import { MediumProvider } from '@/components/medium/MediumProvider';
import { INSTALL_AREA_SEEN_KEY } from '@/components/medium/InstallAreaSheet';
import MeusDadosPage from '@/pages/medium/meus-dados';
import PerfilPage from '@/pages/medium/perfil';
import InicioPage from '@/pages/medium/index';
import { aposEncerrar, quemVeOQue, type MeusDadosExport } from '@/components/medium/meusDados/meusDados';
import { secoesDoPdf } from '@/lib/pdf/meusDadosPdf';

const { secoesDoPdf: secoesReais } = jest.requireActual('@/lib/pdf/meusDadosPdf') as {
  secoesDoPdf: typeof secoesDoPdf;
};

const PROFILE = {
  id: 'u1',
  email: 'ana@exemplo.com',
  username: 'ana',
  full_name: 'Ana Paula Ribeiro',
  tenant_name: 'Tenda Luz da Mata',
  role: 'medium',
  areas: { admin: false, medium: { medium_id: 'm1', nome: 'Ana Paula Ribeiro' } },
};

const ME = {
  nome: 'Ana Paula Ribeiro',
  foto_url: null,
  terreiro: { id: 't1', nome: 'Tenda Luz da Mata', slug: 'luz' },
  marca: { logo_url: 'https://logo', primary_color: '#2f6b4f', secondary_color: '#e9b04a', font_color: null },
  areas: PROFILE.areas,
  modulos: ['agenda', 'avisos', 'mensalidade'],
};

const PERFIL = {
  casa: { nome: 'Ana Paula Ribeiro', data_entrada: '2019-03-10', tipo: 'cambone', isento_mensalidade: false },
  telefone: '11987654321',
  data_nascimento: '1985-04-20',
  cep: null,
  logradouro: null,
  numero: null,
  bairro: null,
  cidade: null,
  foto_url: null,
  email: 'ana@exemplo.com',
  email_pendente: null,
  email_pendente_expira_em: null,
  mostrar_aniversario: false,
};

const EXPORT: MeusDadosExport = {
  formato: 1,
  gerado_em: '2026-10-08T15:00:00+00:00',
  terreiro: 'Tenda Luz da Mata',
  sobre: 'Estes são os dados que Tenda Luz da Mata guarda sobre você no GiraHub.',
  cadastro: {
    nome: 'Ana Paula Ribeiro',
    na_corrente: 'cambone',
    data_entrada: '2019-03-10',
    telefone: '11987654321',
    email_do_cadastro: 'ana@exemplo.com',
    data_nascimento: '1985-04-20',
    endereco: { cep: null, logradouro: null, numero: null, bairro: null, cidade: 'São Paulo' },
    isento_de_mensalidade: false,
    mostrar_aniversario_para_a_corrente: false,
  },
  conta: { email_de_acesso: 'ana@exemplo.com', nome: 'Ana', tem_foto: false, tambem_acessa_o_painel: false, criada_em: null },
  consentimento: { aceito_em: '2026-10-07T12:00:00+00:00', versao_aceita: '1', revogado_em: null, versao_revogada: null },
  grupos: [{ nome: 'G2', desde: null }],
  avisos_por_email: { mensalidade: true, escalas: false },
  mensalidades: [],
  avisos_lidos: [],
  participacoes: [],
};

const erro = (status: number, data: Record<string, unknown>) => ({ status, response: { status, data } });
const calledUrls = () =>
  [...mockGet.mock.calls, ...mockPost.mock.calls, ...mockPut.mock.calls].map((c) => String(c[0]));

function montar(Page: React.ComponentType, extra: Record<string, unknown> = {}, me = ME) {
  routes = { '/api/v1/medium/me': me, '/api/v1/medium/perfil': PERFIL, ...extra };
  return render(
    <ProfileProvider>
      <MediumProvider>
        <Page />
      </MediumProvider>
    </ProfileProvider>,
  );
}

const realLocation = window.location;

beforeEach(() => {
  jest.clearAllMocks();
  localStorage.clear();
  sessionStorage.clear();
  localStorage.setItem(INSTALL_AREA_SEEN_KEY, '1');
  localStorage.setItem('user', JSON.stringify(PROFILE));
  document.cookie = 'auth_state=1';
  window.scrollTo = jest.fn() as unknown as typeof window.scrollTo;
  // @ts-expect-error — jsdom não navega: troca por um objeto simples para ler o destino.
  delete window.location;
  // @ts-expect-error — idem
  window.location = { ...realLocation, href: 'http://localhost/medium/meus-dados', pathname: '/medium/meus-dados' };
});

afterAll(() => {
  // @ts-expect-error — devolve o location do jsdom
  window.location = realLocation;
});

describe('Meus dados e privacidade (AM-14)', () => {
  it('mostra "Quem vê o quê" com o nome da casa e só chama a API da Área', async () => {
    montar(MeusDadosPage);
    const quem = await screen.findByTestId('quem-ve-o-que');
    expect(within(quem).getByText('A direção da casa')).toBeInTheDocument();
    expect(within(quem).getByText('Os outros médiuns')).toBeInTheDocument();
    expect(within(quem).getByText('Ninguém de fora da casa')).toBeInTheDocument();
    await waitFor(() => expect(within(quem).getByText(/A direção de Tenda Luz da Mata/)).toBeInTheDocument());
    expect(within(quem).getByText(/^Nada seu\./)).toBeInTheDocument();
    expect(calledUrls().filter((u) => u.startsWith('/api/v1/admin'))).toEqual([]);
  });

  it('o texto dos outros médiuns acompanha o opt-in do aniversário', () => {
    expect(quemVeOQue('Casa', true)[1].texto).toMatch(/primeiro nome e o dia e o mês/);
    expect(quemVeOQue('Casa', false)[1].texto).toMatch(/^Nada seu/);
  });

  it('baixa o JSON e o PDF com a marca do terreiro', async () => {
    routes = {};
    const createObjectURL = jest.fn(() => 'blob:x');
    (URL as any).createObjectURL = createObjectURL;
    (URL as any).revokeObjectURL = jest.fn();
    const click = jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    montar(MeusDadosPage, { '/api/v1/medium/meus-dados/exportar': EXPORT });

    const json = await screen.findByTestId('baixar-json');
    await act(async () => {
      fireEvent.click(json);
    });
    expect(mockGet).toHaveBeenCalledWith('/api/v1/medium/meus-dados/exportar');
    expect(createObjectURL).toHaveBeenCalled();
    expect(click).toHaveBeenCalled();

    await act(async () => {
      fireEvent.click(screen.getByTestId('baixar-pdf'));
    });
    await waitFor(() => expect(mockGerarPdf).toHaveBeenCalled());
    expect(mockGerarPdf).toHaveBeenCalledWith(EXPORT, {
      nome: 'Tenda Luz da Mata',
      logoUrl: 'https://logo',
      primaryColor: '#2f6b4f',
    });
    click.mockRestore();
  });

  it('senha errada no encerrar mostra o erro sem derrubar a sessão', async () => {
    mockPost.mockRejectedValue(erro(400, { error_code: 'SENHA_INCORRETA', message: 'A senha não confere.' }));
    montar(MeusDadosPage);
    fireEvent.click(await screen.findByTestId('abrir-encerrar'));
    const drawer = await screen.findByRole('dialog');
    expect(drawer.className).toContain('medium-terra');
    expect(within(drawer).getByTestId('encerrar-itens')).toHaveTextContent('A sua conta da Área é desativada');
    fireEvent.change(within(drawer).getByLabelText(/Sua senha/), { target: { value: 'errada' } });
    await act(async () => {
      fireEvent.click(within(drawer).getByRole('button', { name: 'Encerrar meu acesso' }));
    });
    expect(mockPost).toHaveBeenCalledWith(
      '/api/v1/medium/meus-dados/encerrar',
      { senha: 'errada' },
      expect.objectContaining({ skipAutoLogout: true }),
    );
    expect(await within(drawer).findByRole('alert')).toHaveTextContent('A senha não confere.');
    expect(localStorage.getItem('user')).not.toBeNull();
    expect(window.location.href).toBe('http://localhost/medium/meus-dados');
  });

  it('encerrar (conta só da Área) limpa o navegador e vai ao login com aviso', async () => {
    localStorage.setItem('girahub:area:u1', 'medium');
    mockPost.mockResolvedValue({
      data: { message: 'ok', conta_desativada: true, redirect: '/login?acesso_encerrado=1' },
    });
    montar(MeusDadosPage);
    fireEvent.click(await screen.findByTestId('abrir-encerrar'));
    const drawer = await screen.findByRole('dialog');
    fireEvent.change(within(drawer).getByLabelText(/Sua senha/), { target: { value: 'Senha-forte-123' } });
    await act(async () => {
      fireEvent.click(within(drawer).getByRole('button', { name: 'Encerrar meu acesso' }));
    });
    await waitFor(() => expect(window.location.href).toBe('/login?acesso_encerrado=1'));
    expect(localStorage.getItem('user')).toBeNull();
    expect(localStorage.getItem('girahub:area:u1')).toBeNull();
  });

  it('operador que também é médium: só a Área sai do user guardado e a escolha vira o painel', () => {
    localStorage.setItem('user', JSON.stringify({ ...PROFILE, role: 'operator', areas: { admin: true, medium: { medium_id: 'm1' } } }));
    const destino = aposEncerrar({ message: 'ok', conta_desativada: false, redirect: '/admin/dashboard' }, 'u1');
    expect(destino).toBe('/admin/dashboard');
    expect(JSON.parse(localStorage.getItem('user')!).areas).toEqual({ admin: true, medium: null });
    expect(localStorage.getItem('girahub:area:u1')).toBe('admin');
  });

  it('impersonando, baixar e encerrar não aparecem', async () => {
    sessionStorage.setItem('impersonating', '1');
    montar(MeusDadosPage);
    expect(await screen.findByTestId('meus-dados-somente-leitura')).toBeInTheDocument();
    expect(screen.queryByTestId('baixar-json')).not.toBeInTheDocument();
    expect(screen.queryByTestId('abrir-encerrar')).not.toBeInTheDocument();
  });

  it('PDF: seções legíveis, sem o ano onde não precisa e com a autorização', () => {
    const secoes = secoesReais(EXPORT);
    expect(secoes.map((s) => s.titulo)).toEqual(['Cadastro na casa', 'Conta de acesso e autorização']);
    const cadastro = Object.fromEntries(secoes[0].linhas);
    expect(cadastro['Telefone']).toBe('(11) 98765-4321');
    expect(cadastro['Na corrente']).toBe('Cambone');
    expect(cadastro['Endereço']).toBe('São Paulo');
    const conta = Object.fromEntries(secoes[1].linhas);
    expect(conta['Versão do termo aceito']).toBe('1');
    expect(conta['Grupos da corrente']).toBe('G2');
    expect(conta['Avisos por e-mail ligados']).toBe('mensalidade');
    expect(conta['Autorização retirada em']).toBeUndefined();
  });
});

describe('Aniversário no Perfil (AM-20)', () => {
  it('liga o opt-in e leva a "Meus dados e privacidade"', async () => {
    mockPut.mockResolvedValue({ data: { ...PERFIL, mostrar_aniversario: true } });
    montar(PerfilPage);
    const secao = await screen.findByTestId('perfil-aniversario');
    expect(within(secao).getByText(/nunca o ano/)).toBeInTheDocument();
    const sw = within(secao).getByTestId('perfil-aniversario-switch');
    expect(sw).toHaveAttribute('aria-checked', 'false');
    await act(async () => {
      fireEvent.click(sw);
    });
    expect(mockPut).toHaveBeenCalledWith('/api/v1/medium/perfil/aniversario', { mostrar: true });
    await waitFor(() => expect(sw).toHaveAttribute('aria-checked', 'true'));

    fireEvent.click(screen.getByTestId('perfil-meus-dados-privacidade'));
    expect(mockRouter.push).toHaveBeenCalledWith('/medium/meus-dados');
  });

  it('sem data de nascimento o botão fica travado e explica o que fazer', async () => {
    routes = {};
    montar(PerfilPage, { '/api/v1/medium/perfil': { ...PERFIL, data_nascimento: null } });
    const secao = await screen.findByTestId('perfil-aniversario');
    expect(within(secao).getByText(/preencha a sua data de nascimento em Meus dados/)).toBeInTheDocument();
    expect(within(secao).getByTestId('perfil-aniversario-switch')).toBeDisabled();
  });

  it('erro ao salvar volta o botão e avisa', async () => {
    mockPut.mockRejectedValue(erro(500, { message: 'falhou' }));
    montar(PerfilPage);
    const secao = await screen.findByTestId('perfil-aniversario');
    const sw = within(secao).getByTestId('perfil-aniversario-switch');
    await act(async () => {
      fireEvent.click(sw);
    });
    expect(await within(secao).findByRole('alert')).toBeInTheDocument();
    expect(sw).toHaveAttribute('aria-checked', 'false');
  });
});

describe('Aniversários no Início (AM-20)', () => {
  const INICIO = {
    hoje: '2026-10-14',
    pendencias: [],
    proxima_gira: null,
    mensalidade: null,
    avisos: { nao_lidos: 0, ultimos: [] },
    escalas: [],
  };

  it('mostra a mensagem da casa e os aniversariantes da semana (dia e mês)', async () => {
    montar(InicioPage, {
      '/api/v1/medium/inicio': {
        ...INICIO,
        meu_aniversario: { mensagem: 'A Tenda Luz da Mata deseja um feliz aniversário, Ana! Axé!' },
        aniversariantes: [
          { primeiro_nome: 'Bia', dia: 12, mes: 10, hoje: false, sou_eu: false },
          { primeiro_nome: 'Ana', dia: 14, mes: 10, hoje: true, sou_eu: true },
        ],
      },
    });
    expect(await screen.findByTestId('meu-aniversario')).toHaveTextContent(
      'A Tenda Luz da Mata deseja um feliz aniversário, Ana! Axé!',
    );
    const lista = screen.getByTestId('aniversariantes-semana');
    const itens = within(lista).getAllByTestId('aniversariante');
    expect(itens[0]).toHaveTextContent('Bia');
    expect(itens[0]).toHaveTextContent('12/10');
    expect(itens[1]).toHaveTextContent('Ana (você)');
    expect(itens[1]).toHaveTextContent('Hoje');
    expect(screen.queryByText('Nada novo por aqui')).not.toBeInTheDocument();
  });

  it('sem aniversariantes o cartão some', async () => {
    montar(InicioPage, { '/api/v1/medium/inicio': { ...INICIO, aniversariantes: [], meu_aniversario: null } });
    expect(await screen.findByText('Nada novo por aqui')).toBeInTheDocument();
    expect(screen.queryByTestId('aniversariantes-semana')).not.toBeInTheDocument();
    expect(screen.queryByTestId('meu-aniversario')).not.toBeInTheDocument();
  });
});
