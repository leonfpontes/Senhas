/**
 * AM-13 — /medium/perfil: "Meus dados" (telefone, endereço, nascimento) com edição em CrudDrawer
 * (MaskedInput, busca do CEP), dados da casa travados, foto reduzida e enviada, "Trocar e-mail"
 * (link no novo endereço, mensagem clara) e "Trocar senha" (sessões caem → login), modo leitura
 * impersonando e só chamadas da API da Área.
 */
import React from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

const mockRouter: any = {
  pathname: '/medium/perfil',
  asPath: '/medium/perfil',
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
const mockSuccess = jest.fn();
jest.mock('@/contexts/SnackbarContext', () => ({
  useSnackbar: () => ({ showSuccess: mockSuccess, showError: jest.fn() }),
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
const mockPatch = jest.fn();
const mockDelete = jest.fn();
jest.mock('@/services/api_client', () => ({
  apiClient: {
    get: (...a: unknown[]) => (mockGet as any)(...a),
    post: (...a: unknown[]) => mockPost(...a),
    patch: (...a: unknown[]) => mockPatch(...a),
    delete: (...a: unknown[]) => mockDelete(...a),
  },
  extractApiErrorMessage: (e: any, f: string) => e?.response?.data?.message || f,
  endImpersonation: jest.fn(),
}));

import { ProfileProvider } from '@/hooks/useProfile';
import { MediumProvider } from '@/components/medium/MediumProvider';
import { INSTALL_AREA_SEEN_KEY } from '@/components/medium/InstallAreaSheet';
import PerfilPage from '@/pages/medium/perfil';

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
  marca: { logo_url: null, primary_color: '#2f6b4f', secondary_color: '#e9b04a', font_color: null },
  areas: PROFILE.areas,
  modulos: ['agenda', 'avisos', 'mensalidade'],
};

const PERFIL = {
  casa: { nome: 'Ana Paula Ribeiro', data_entrada: '2019-03-10', tipo: 'cambone', isento_mensalidade: false },
  telefone: '11987654321',
  data_nascimento: '1985-04-20',
  cep: '01310100',
  logradouro: 'Avenida Paulista',
  numero: '1000',
  bairro: 'Bela Vista',
  cidade: 'São Paulo',
  foto_url: null,
  email: 'ana@exemplo.com',
  email_pendente: null,
  email_pendente_expira_em: null,
};

function montar(perfil: unknown = PERFIL) {
  routes = { '/api/v1/medium/me': ME, '/api/v1/medium/perfil': perfil };
  return render(
    <ProfileProvider>
      <MediumProvider>
        <PerfilPage />
      </MediumProvider>
    </ProfileProvider>,
  );
}

const calledUrls = () =>
  [...mockGet.mock.calls, ...mockPost.mock.calls, ...mockPatch.mock.calls, ...mockDelete.mock.calls].map((c) =>
    String(c[0]),
  );

const erro = (status: number, data: Record<string, unknown>) => ({ status, response: { status, data } });

beforeEach(() => {
  jest.clearAllMocks();
  localStorage.clear();
  sessionStorage.clear();
  localStorage.setItem(INSTALL_AREA_SEEN_KEY, '1');
  localStorage.setItem('user', JSON.stringify(PROFILE));
  document.cookie = 'auth_state=1';
  mockRouter.query = {};
  window.scrollTo = jest.fn() as unknown as typeof window.scrollTo;
});

describe('Meus dados', () => {
  it('mostra os dados do médium, os da casa travados e a conta — só com a API da Área', async () => {
    montar();
    const meus = await screen.findByTestId('perfil-meus-dados');
    expect(within(meus).getByTestId('perfil-valor-telefone')).toHaveTextContent('(11) 98765-4321');
    expect(within(meus).getByTestId('perfil-valor-endereco')).toHaveTextContent(
      'Avenida Paulista, 1000 · Bela Vista · São Paulo · 01310-100',
    );
    expect(within(meus).getByTestId('perfil-valor-nascimento')).toHaveTextContent('20/04/1985');

    const casa = screen.getByTestId('perfil-dados-casa');
    expect(within(casa).getByText('Cambone')).toBeInTheDocument();
    expect(within(casa).getByText('10/03/2019')).toBeInTheDocument();
    expect(within(casa).getByText('Paga mensalidade')).toBeInTheDocument();
    expect(within(casa).getByText(/Só a direção da casa altera estes dados/)).toBeInTheDocument();
    // Nada editável na seção da casa.
    expect(within(casa).queryByRole('textbox')).not.toBeInTheDocument();
    expect(within(casa).queryByRole('button')).not.toBeInTheDocument();

    expect(screen.getByTestId('perfil-trocar-email')).toHaveTextContent('ana@exemplo.com');
    // Itens de sempre continuam.
    expect(screen.getByTestId('perfil-instalar')).toBeInTheDocument();
    expect(screen.getByTestId('perfil-sair')).toBeInTheDocument();

    expect(calledUrls().filter((u) => u.startsWith('/api/v1/admin'))).toEqual([]);
  });

  it('dado vazio aparece como "Não informado"', async () => {
    montar({ ...PERFIL, telefone: null, cep: null, logradouro: null, numero: null, bairro: null, cidade: null, data_nascimento: null });
    const meus = await screen.findByTestId('perfil-meus-dados');
    expect(within(meus).getAllByText('Não informado')).toHaveLength(3);
  });

  it('edita no drawer: telefone com máscara, CEP preenche o endereço e salva só dígitos', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      json: () => Promise.resolve({ logradouro: 'Rua Augusta', bairro: 'Consolação', localidade: 'São Paulo' }),
    });
    (global as any).fetch = fetchMock;
    mockPatch.mockImplementation((_url: string, body: Record<string, unknown>) =>
      Promise.resolve({ data: { ...PERFIL, ...body } }),
    );
    montar();
    fireEvent.click(await screen.findByTestId('perfil-editar-dados'));

    const drawer = await screen.findByRole('dialog');
    expect(drawer.className).toContain('medium-terra');
    expect(within(drawer).getByText('Editar meus dados')).toBeInTheDocument();
    // Campos da casa não estão no formulário.
    expect(within(drawer).queryByLabelText(/Nome/)).not.toBeInTheDocument();

    const tel = within(drawer).getByLabelText('Telefone (WhatsApp)');
    fireEvent.change(tel, { target: { value: '21998765432' } });
    expect(tel).toHaveValue('(21) 99876-5432');

    const cep = within(drawer).getByLabelText('CEP');
    fireEvent.change(cep, { target: { value: '01305000' } });
    expect(cep).toHaveValue('01305-000');
    await act(async () => {
      fireEvent.blur(cep);
    });
    expect(fetchMock).toHaveBeenCalledWith('https://viacep.com.br/ws/01305000/json/');
    await waitFor(() => expect(within(drawer).getByLabelText('Rua')).toHaveValue('Rua Augusta'));
    expect(within(drawer).getByLabelText('Bairro')).toHaveValue('Consolação');

    await act(async () => {
      fireEvent.click(within(drawer).getByRole('button', { name: 'Salvar meus dados' }));
    });
    expect(mockPatch).toHaveBeenCalledWith('/api/v1/medium/perfil', {
      telefone: '21998765432',
      cep: '01305000',
      logradouro: 'Rua Augusta',
      numero: '1000',
      bairro: 'Consolação',
      cidade: 'São Paulo',
      data_nascimento: '1985-04-20',
    });
    await waitFor(() =>
      expect(screen.getByTestId('perfil-valor-telefone')).toHaveTextContent('(21) 99876-5432'),
    );
    expect(mockSuccess).toHaveBeenCalledWith('Seus dados foram atualizados.');
  });

  it('erro do servidor aparece dentro do drawer', async () => {
    mockPatch.mockRejectedValue(erro(422, { error_code: 'VALIDATION_ERROR', message: 'CEP deve ter 8 dígitos', details: { campo: 'cep' } }));
    montar();
    fireEvent.click(await screen.findByTestId('perfil-editar-dados'));
    const drawer = await screen.findByRole('dialog');
    fireEvent.change(within(drawer).getByLabelText('Bairro'), { target: { value: 'Centro' } });
    await act(async () => {
      fireEvent.click(within(drawer).getByRole('button', { name: 'Salvar meus dados' }));
    });
    expect(await within(drawer).findByRole('alert')).toHaveTextContent('CEP deve ter 8 dígitos');
  });
});

describe('foto', () => {
  it('envia a foto escolhida e mostra a nova', async () => {
    mockPost.mockResolvedValue({ data: { message: 'Foto atualizada.', foto_url: 'https://api/photo' } });
    montar();
    await screen.findByTestId('perfil-meus-dados');
    const input = screen.getByTestId('perfil-foto-input') as HTMLInputElement;
    const file = new File([new Uint8Array(1000)], 'eu.jpg', { type: 'image/jpeg' });
    await act(async () => {
      fireEvent.change(input, { target: { files: [file] } });
    });
    expect(mockPost).toHaveBeenCalledWith('/api/v1/medium/perfil/foto', expect.any(FormData), expect.anything());
    const fd = mockPost.mock.calls[0][1] as FormData;
    expect((fd.get('file') as File).name).toBe('eu.jpg');
    expect(await screen.findByTestId('perfil-foto')).toHaveAttribute('src', 'https://api/photo');
  });

  it('arquivo que não é imagem não sai do aparelho', async () => {
    montar();
    await screen.findByTestId('perfil-meus-dados');
    const input = screen.getByTestId('perfil-foto-input') as HTMLInputElement;
    await act(async () => {
      fireEvent.change(input, { target: { files: [new File(['x'], 'doc.txt', { type: 'text/plain' })] } });
    });
    expect(mockPost).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('Escolha uma foto');
  });

  it('remover foto (AM-29): confirma na paleta da Área e volta às iniciais', async () => {
    mockDelete.mockResolvedValue({ data: { message: 'Foto removida.', foto_url: null } });
    montar({ ...PERFIL, foto_url: 'https://api/photo' });
    expect(await screen.findByTestId('perfil-foto')).toHaveAttribute('src', 'https://api/photo');

    // Cancelar não apaga.
    fireEvent.click(screen.getByTestId('perfil-remover-foto'));
    let dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveClass('medium-terra');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancelar' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(mockDelete).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId('perfil-remover-foto'));
    dialog = await screen.findByRole('alertdialog');
    await act(async () => {
      fireEvent.click(within(dialog).getByRole('button', { name: 'Remover foto' }));
    });
    expect(mockDelete).toHaveBeenCalledWith('/api/v1/medium/perfil/foto');
    await waitFor(() => expect(screen.queryByTestId('perfil-foto')).not.toBeInTheDocument());
    expect(screen.getByText('AP')).toBeInTheDocument();
    expect(screen.queryByTestId('perfil-remover-foto')).not.toBeInTheDocument();
    expect(mockSuccess).toHaveBeenCalledWith('Foto removida.');
    expect(calledUrls().every((u) => !u.startsWith('/api/v1/admin'))).toBe(true);
  });

  it('sem foto não há "Remover foto"', async () => {
    montar();
    await screen.findByTestId('perfil-meus-dados');
    expect(screen.queryByTestId('perfil-remover-foto')).not.toBeInTheDocument();
  });
});

describe('trocar e-mail', () => {
  it('pede com a senha e avisa que o e-mail só muda depois de confirmar', async () => {
    mockPost.mockResolvedValue({
      data: {
        message: 'ok',
        email_pendente: 'nova@exemplo.com',
        email_pendente_expira_em: '2026-10-08T12:00:00Z',
      },
    });
    montar();
    fireEvent.click(await screen.findByTestId('perfil-trocar-email'));
    const drawer = await screen.findByRole('dialog');
    fireEvent.change(within(drawer).getByLabelText(/Novo e-mail/), { target: { value: 'Nova@Exemplo.com' } });
    fireEvent.change(within(drawer).getByLabelText(/Sua senha atual/), { target: { value: 'Senha-forte-123' } });
    await act(async () => {
      fireEvent.click(within(drawer).getByRole('button', { name: 'Enviar link' }));
    });
    expect(mockPost).toHaveBeenCalledWith(
      '/api/v1/medium/perfil/email',
      { novo_email: 'nova@exemplo.com', senha_atual: 'Senha-forte-123' },
      { skipAutoLogout: true },
    );
    const aviso = await screen.findByTestId('perfil-email-pendente');
    expect(aviso).toHaveTextContent(
      'Enviamos um link para o novo e-mail. O e-mail só muda depois que você confirmar.',
    );
    expect(aviso).toHaveTextContent('nova@exemplo.com');
    // O e-mail de acesso ainda é o antigo.
    expect(screen.getByTestId('perfil-trocar-email')).toHaveTextContent('ana@exemplo.com');
  });

  it('e-mail já usado na casa: mensagem do servidor', async () => {
    mockPost.mockRejectedValue(
      erro(409, { error_code: 'EMAIL_EM_USO', message: 'Este e-mail já é usado por outra conta da casa.' }),
    );
    montar();
    fireEvent.click(await screen.findByTestId('perfil-trocar-email'));
    const drawer = await screen.findByRole('dialog');
    fireEvent.change(within(drawer).getByLabelText(/Novo e-mail/), { target: { value: 'outra@exemplo.com' } });
    fireEvent.change(within(drawer).getByLabelText(/Sua senha atual/), { target: { value: 'x' } });
    await act(async () => {
      fireEvent.click(within(drawer).getByRole('button', { name: 'Enviar link' }));
    });
    expect(await within(drawer).findByRole('alert')).toHaveTextContent('Este e-mail já é usado por outra conta da casa.');
  });

  it('pedido pendente aparece e dá para desistir', async () => {
    mockDelete.mockResolvedValue({ status: 204 });
    montar({ ...PERFIL, email_pendente: 'nova@exemplo.com', email_pendente_expira_em: '2026-10-08T12:00:00Z' });
    const aviso = await screen.findByTestId('perfil-email-pendente');
    await act(async () => {
      fireEvent.click(within(aviso).getByRole('button', { name: 'Desistir da troca' }));
    });
    expect(mockDelete).toHaveBeenCalledWith('/api/v1/medium/perfil/email');
    await waitFor(() => expect(screen.queryByTestId('perfil-email-pendente')).not.toBeInTheDocument());
  });
});

describe('trocar senha', () => {
  it('senha atual errada mostra o erro sem sair', async () => {
    mockPost.mockRejectedValue(erro(400, { error_code: 'SENHA_INCORRETA', message: 'A senha atual não confere.' }));
    montar();
    fireEvent.click(await screen.findByTestId('perfil-trocar-senha'));
    const drawer = await screen.findByRole('dialog');
    fireEvent.change(within(drawer).getByLabelText(/Senha atual/), { target: { value: 'errada' } });
    fireEvent.change(within(drawer).getByLabelText(/^Nova senha/), { target: { value: 'Outra-senha-456' } });
    fireEvent.change(within(drawer).getByLabelText(/Confirmar a nova senha/), { target: { value: 'Outra-senha-456' } });
    await act(async () => {
      fireEvent.click(within(drawer).getByRole('button', { name: 'Trocar senha' }));
    });
    expect(mockPost).toHaveBeenCalledWith(
      '/api/v1/medium/perfil/senha',
      { senha_atual: 'errada', nova_senha: 'Outra-senha-456' },
      { skipAutoLogout: true },
    );
    expect(await within(drawer).findByRole('alert')).toHaveTextContent('A senha atual não confere.');
    expect(mockRouter.push).not.toHaveBeenCalled();
  });

  it('senha fraca não chega a ser enviada; deu certo → login', async () => {
    mockPost.mockResolvedValue({ data: { message: 'ok' } });
    montar();
    fireEvent.click(await screen.findByTestId('perfil-trocar-senha'));
    const drawer = await screen.findByRole('dialog');
    fireEvent.change(within(drawer).getByLabelText(/Senha atual/), { target: { value: 'Senha-forte-123' } });
    fireEvent.change(within(drawer).getByLabelText(/^Nova senha/), { target: { value: 'fraca' } });
    fireEvent.change(within(drawer).getByLabelText(/Confirmar a nova senha/), { target: { value: 'fraca' } });
    await act(async () => {
      fireEvent.click(within(drawer).getByRole('button', { name: 'Trocar senha' }));
    });
    expect(mockPost).not.toHaveBeenCalled();

    fireEvent.change(within(drawer).getByLabelText(/^Nova senha/), { target: { value: 'Outra-senha-456' } });
    fireEvent.change(within(drawer).getByLabelText(/Confirmar a nova senha/), { target: { value: 'Outra-senha-456' } });
    await act(async () => {
      fireEvent.click(within(drawer).getByRole('button', { name: 'Trocar senha' }));
    });
    expect(mockPost).toHaveBeenCalledWith(
      '/api/v1/medium/perfil/senha',
      { senha_atual: 'Senha-forte-123', nova_senha: 'Outra-senha-456' },
      { skipAutoLogout: true },
    );
    await waitFor(() => expect(mockRouter.push).toHaveBeenCalledWith('/login?senha_alterada=1'));
    expect(localStorage.getItem('user')).toBeNull();
  });
});

describe('impersonando', () => {
  it('só leitura: sem editar, trocar foto, e-mail ou senha', async () => {
    sessionStorage.setItem('impersonating', '1');
    montar({ ...PERFIL, foto_url: 'https://api/photo' });
    await screen.findByTestId('perfil-meus-dados');
    expect(screen.queryByTestId('perfil-remover-foto')).not.toBeInTheDocument();
    expect(screen.getByTestId('perfil-somente-leitura')).toBeInTheDocument();
    expect(screen.queryByTestId('perfil-editar-dados')).not.toBeInTheDocument();
    expect(screen.queryByTestId('perfil-trocar-foto')).not.toBeInTheDocument();
    expect(screen.queryByTestId('perfil-trocar-email')).not.toBeInTheDocument();
    expect(screen.queryByTestId('perfil-trocar-senha')).not.toBeInTheDocument();
    expect(screen.getByText('ana@exemplo.com')).toBeInTheDocument();
  });
});
