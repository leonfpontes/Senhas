/**
 * Tests for /cadastro em passos (Seu terreiro → Você → Acesso → Para começar): validação só do
 * passo atual, "Voltar" mantém os valores, foco no primeiro campo do passo, erro do backend volta
 * ao passo do campo, payload igual ao schema do backend (`OnboardingRequest`), ?plan= preservado,
 * rascunho sem senha/documento e redirecionamento para a primeira gira.
 */
import fs from 'fs';
import path from 'path';
import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';

const mockQuery: Record<string, string> = {};
const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockBack = jest.fn();
jest.mock('next/router', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
    back: mockBack,
    pathname: '/cadastro',
    query: mockQuery,
    isReady: true,
  }),
}));
jest.mock('next/head', () => ({ __esModule: true, default: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
jest.mock('next/link', () => ({ children, href, className }: { children: React.ReactNode; href: string; className?: string }) => (
  <a href={href} className={className}>
    {children}
  </a>
));
// next/image resolve a URL contra window.location, que os testes trocam por um objeto simples.
jest.mock('next/image', () => ({
  __esModule: true,
  // eslint-disable-next-line @next/next/no-img-element
  default: ({ src, alt }: { src: string; alt: string }) => <img src={src} alt={alt} />,
}));
jest.mock('@/services/api_client', () => ({
  apiClient: { post: jest.fn(), get: jest.fn() },
}));
jest.mock('@/providers/ThemeProvider', () => ({ dispatchTenantBrandingUpdated: jest.fn() }));
jest.mock('@/services/analytics', () => ({ trackEvent: jest.fn(), setAnalyticsTag: jest.fn() }));

import Cadastro from '@/pages/cadastro';
import { apiClient } from '@/services/api_client';
import { trackEvent } from '@/services/analytics';
import {
  CADASTRO_DEFAULTS,
  CADASTRO_DRAFT_KEY,
  CADASTRO_STEPS,
  buildOnboardingPayload,
  cadastroSchema,
  parseOnboardingError,
  previewSlug,
  readDraft,
  validarDocumento,
} from '@/components/auth/cadastroForm';

const STRONG = 'SenhaForte#2026';

const continuar = async () => {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: /Continuar/ }));
  });
};

const voltar = async () => {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: /Voltar/ }));
  });
};

const type = (label: RegExp, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });

async function preencherAteOFim() {
  type(/Nome do terreiro/, 'Casa Nova');
  await continuar();
  type(/Seu nome/, 'Maria Silva');
  type(/Seu WhatsApp/, '11999998888');
  type(/^E-mail/, 'maria@example.com');
  await continuar();
  type(/^Senha/, STRONG);
  type(/CPF ou CNPJ/, '52998224725');
  await continuar();
  fireEvent.click(screen.getByRole('checkbox', { name: /Li e aceito/ }));
}

/** Campos do `OnboardingRequest` lidos do próprio backend: [nome, obrigatório?]. */
function backendSchemaFields(): [string, boolean][] {
  const src = fs.readFileSync(path.join(__dirname, '../../../backend/src/api/v1/public/onboarding.py'), 'utf8');
  const body = src.split('class OnboardingRequest(BaseModel):')[1].split('@field_validator')[0];
  return Array.from(body.matchAll(/^ {4}(\w+): ([^\n]+)$/gm)).map((m) => [m[1], !/=\s*None/.test(m[2])]);
}

describe('Cadastro em passos', () => {
  let errSpy: jest.SpyInstance;
  beforeEach(() => {
    jest.clearAllMocks();
    sessionStorage.clear();
    Object.keys(mockQuery).forEach((k) => delete mockQuery[k]);
    (apiClient.post as jest.Mock).mockResolvedValue({ data: { user: { id: 'u1' } } });
    // jsdom não implementa navegação: troca window.location por um objeto simples
    delete (window as unknown as { location?: unknown }).location;
    (window as unknown as { location: { href: string } }).location = { href: '' };
    errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => errSpy.mockRestore());

  it('começa só com o nome do terreiro, o progresso e o mês grátis compacto', () => {
    render(<Cadastro />);
    expect(screen.getByText('Passo 1 de 4')).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: 'Progresso do cadastro' })).toHaveAttribute('aria-valuenow', '1');
    expect(screen.getByLabelText(/Nome do terreiro/)).toBeInTheDocument();
    expect(screen.queryByLabelText(/Seu nome/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/^Senha/)).not.toBeInTheDocument();
    expect(screen.getByText(/1 mês de Premium grátis, sem cartão/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Voltar/ })).not.toBeInTheDocument();
  });

  it('mostra a prévia do link a partir do nome', () => {
    render(<Cadastro />);
    type(/Nome do terreiro/, 'Tenda Caboclo Pena Branca');
    expect(screen.getByText('girahub.com.br/tenda-caboclo-pena-branca')).toBeInTheDocument();
  });

  it('valida só o passo atual: erro ao tentar avançar, some ao corrigir', async () => {
    render(<Cadastro />);
    await continuar();
    expect(await screen.findByText(/pelo menos 3 letras/)).toBeInTheDocument();
    expect(screen.getByText('Passo 1 de 4')).toBeInTheDocument();
    expect(apiClient.post).not.toHaveBeenCalled();

    await act(async () => {
      type(/Nome do terreiro/, 'Casa Nova');
    });
    await waitFor(() => expect(screen.queryByText(/pelo menos 3 letras/)).not.toBeInTheDocument());

    await continuar();
    expect(screen.getByText('Passo 2 de 4')).toBeInTheDocument();
    // Foco vai para o primeiro campo do passo
    expect(screen.getByLabelText(/Seu nome/)).toHaveFocus();
    // Nenhum erro antes de tentar avançar
    expect(screen.queryByText('Informe seu nome.')).not.toBeInTheDocument();

    await continuar();
    expect(await screen.findByText('Informe seu nome.')).toBeInTheDocument();
    expect(screen.getByText('Informe o DDD e o número.')).toBeInTheDocument();
    expect(screen.getByText('Informe seu e-mail.')).toBeInTheDocument();
    // Campos de outros passos não são validados
    expect(screen.queryByText(/CPF ou CNPJ inválido/)).not.toBeInTheDocument();
    expect(screen.getByText('Passo 2 de 4')).toBeInTheDocument();
  });

  it('Enter (envio do formulário) avança e registra o passo concluído', async () => {
    render(<Cadastro />);
    const input = screen.getByLabelText(/Nome do terreiro/);
    fireEvent.change(input, { target: { value: 'Casa Nova' } });
    await act(async () => {
      fireEvent.submit(input.closest('form')!);
    });
    expect(screen.getByText('Passo 2 de 4')).toBeInTheDocument();
    expect(trackEvent).toHaveBeenCalledWith('signup_step_completed', { passo: 1, etapa: 'terreiro' });
    expect(mockPush).toHaveBeenCalledWith(
      { pathname: '/cadastro', query: { passo: '2' } },
      undefined,
      { shallow: true, scroll: false },
    );
  });

  it('"Voltar" mantém o que foi digitado', async () => {
    render(<Cadastro />);
    type(/Nome do terreiro/, 'Casa Nova');
    await continuar();
    type(/Seu nome/, 'Maria Silva');
    type(/Seu WhatsApp/, '11999998888');
    await voltar();
    expect(screen.getByText('Passo 1 de 4')).toBeInTheDocument();
    expect(screen.getByLabelText(/Nome do terreiro/)).toHaveValue('Casa Nova');
    await continuar();
    expect(screen.getByLabelText(/Seu nome/)).toHaveValue('Maria Silva');
    expect(screen.getByLabelText(/Seu WhatsApp/)).toHaveValue('(11) 99999-8888');
  });

  it('senha com a regra do backend e documento no passo "Acesso"', async () => {
    render(<Cadastro />);
    type(/Nome do terreiro/, 'Casa Nova');
    await continuar();
    type(/Seu nome/, 'Maria Silva');
    type(/Seu WhatsApp/, '11999998888');
    type(/^E-mail/, 'maria@example.com');
    await continuar();
    expect(screen.getByText('Passo 3 de 4')).toBeInTheDocument();
    expect(screen.getByText(/liberar seu mês grátis/)).toBeInTheDocument();
    type(/^Senha/, 'senhaforte123');
    type(/CPF ou CNPJ/, '11111111111');
    await continuar();
    expect(await screen.findByText(/Falta: uma letra maiúscula, um símbolo/)).toBeInTheDocument();
    expect(screen.getByText('CPF ou CNPJ inválido.')).toBeInTheDocument();
  });

  it('dor e "como nos conheceu" são chips opcionais no último passo', async () => {
    render(<Cadastro />);
    await preencherAteOFim();
    const dor = screen.getByRole('radiogroup', { name: 'O que você mais precisa resolver?' });
    const chips = Array.from(dor.querySelectorAll('button')).map((b) => b.textContent);
    expect(chips).toEqual([
      'Organizar as senhas e a fila das giras',
      'Organizar os médiuns e a corrente',
      'Controlar mensalidades e o financeiro',
      'Divulgar o terreiro (site e cursos)',
      'Controlar o estoque de materiais',
      'Ainda estou conhecendo',
    ]);
    expect(screen.getByRole('radiogroup', { name: 'Como nos conheceu?' })).toBeInTheDocument();
  });

  it('sem aceite dos termos não envia', async () => {
    render(<Cadastro />);
    await preencherAteOFim();
    fireEvent.click(screen.getByRole('checkbox', { name: /Li e aceito/ })); // desmarca
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Criar minha conta/ }));
    });
    expect(await screen.findByText(/Precisamos do seu aceite/)).toBeInTheDocument();
    expect(apiClient.post).not.toHaveBeenCalled();
  });

  it('envia o payload do schema do backend, registra a conversão e vai para a primeira gira', async () => {
    render(<Cadastro />);
    await preencherAteOFim();
    fireEvent.click(screen.getByRole('radio', { name: 'Organizar os médiuns e a corrente' }));
    fireEvent.click(screen.getByRole('radio', { name: 'Instagram' }));

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Criar minha conta/ }));
    });

    await waitFor(() => expect(apiClient.post).toHaveBeenCalled());
    const [url, payload] = (apiClient.post as jest.Mock).mock.calls[0];
    expect(url).toBe('/api/v1/public/onboarding');
    expect(payload).toEqual({
      terreiro_nome: 'Casa Nova',
      responsavel_nome: 'Maria Silva',
      email: 'maria@example.com',
      whatsapp: '11999998888',
      documento: '52998224725',
      password: STRONG,
      principal_dor: 'mediuns',
      como_conheceu: 'instagram',
      aceite_termos: true,
    });

    const fields = backendSchemaFields();
    const names = fields.map(([n]) => n);
    expect(names.length).toBeGreaterThan(5);
    Object.keys(payload).forEach((k) => expect(names).toContain(k));
    fields.filter(([, required]) => required).forEach(([n]) => expect(payload).toHaveProperty(n));

    expect(trackEvent).toHaveBeenCalledWith('signup_completed', { principal_dor: 'mediuns' });
    await waitFor(() => expect(window.location.href).toBe('/admin/giras?nova=1'));
    expect(sessionStorage.getItem(CADASTRO_DRAFT_KEY)).toBeNull();
  });

  it('sem dor escolhida registra "nao_informado"', async () => {
    render(<Cadastro />);
    await preencherAteOFim();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Criar minha conta/ }));
    });
    await waitFor(() => expect(trackEvent).toHaveBeenCalledWith('signup_completed', { principal_dor: 'nao_informado' }));
  });

  it('e-mail já cadastrado volta para o passo do e-mail com o erro no campo', async () => {
    (apiClient.post as jest.Mock).mockRejectedValueOnce({
      response: { status: 409, data: { detail: 'Este email já está cadastrado' } },
    });
    render(<Cadastro />);
    await preencherAteOFim();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Criar minha conta/ }));
    });

    expect(await screen.findByText('Passo 2 de 4')).toBeInTheDocument();
    const email = screen.getByLabelText(/^E-mail/);
    expect(email).toHaveValue('maria@example.com');
    expect(email).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByText('Este email já está cadastrado')).toBeInTheDocument();
    await waitFor(() => expect(email).toHaveFocus());
    expect(screen.getByRole('link', { name: 'Entrar com este e-mail' })).toHaveAttribute('href', '/login');
    expect(window.location.href).toBe('');
  });

  it('erro sem campo (ex.: limite de tentativas) aparece no passo atual', async () => {
    (apiClient.post as jest.Mock).mockRejectedValueOnce({ response: { status: 429, data: { error: 'Muitas tentativas.' } } });
    render(<Cadastro />);
    await preencherAteOFim();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Criar minha conta/ }));
    });
    expect(await screen.findByRole('alert')).toHaveTextContent('Muitas tentativas.');
    expect(screen.getByText('Passo 4 de 4')).toBeInTheDocument();
  });

  it('com ?plan=pro preserva o plano na URL dos passos e segue para o pagamento', async () => {
    mockQuery.plan = 'pro';
    (apiClient.post as jest.Mock).mockImplementation((url: string) =>
      Promise.resolve({ data: url.includes('checkout') ? { checkout_url: 'https://pagamento/x' } : { user: { id: 'u1' } } }),
    );
    render(<Cadastro />);
    expect(screen.getByText(/Plano escolhido: Pro/)).toBeInTheDocument();
    await preencherAteOFim();
    expect(mockPush).toHaveBeenCalledWith(
      { pathname: '/cadastro', query: { plan: 'pro', passo: '2' } },
      undefined,
      { shallow: true, scroll: false },
    );
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Criar conta e assinar Pro/ }));
    });
    await waitFor(() => expect(apiClient.post).toHaveBeenCalledWith('/api/v1/admin/billing/checkout', { plan: 'pro' }));
    expect(window.location.href).toBe('https://pagamento/x');
  });

  it('guarda rascunho na aba sem senha nem documento e o recupera ao voltar', async () => {
    const { unmount } = render(<Cadastro />);
    type(/Nome do terreiro/, 'Casa Nova');
    await continuar();
    type(/Seu nome/, 'Maria Silva');
    type(/^E-mail/, 'maria@example.com');
    await continuar(); // whatsapp vazio: fica no passo 2

    const saved = JSON.parse(sessionStorage.getItem(CADASTRO_DRAFT_KEY) ?? '{}');
    expect(saved).toEqual({ terreiroNome: 'Casa Nova', nome: 'Maria Silva', email: 'maria@example.com' });
    unmount();

    render(<Cadastro />);
    await waitFor(() => expect(screen.getByLabelText(/Nome do terreiro/)).toHaveValue('Casa Nova'));
  });
});

describe('cadastroForm', () => {
  const valid = {
    ...CADASTRO_DEFAULTS,
    terreiroNome: 'Casa Nova',
    nome: 'Maria',
    whatsapp: '(11) 99999-8888',
    password: STRONG,
    email: 'maria@example.com',
    documento: '529.982.247-25',
    aceiteTermos: true,
  };

  it('aceita um cadastro completo e monta o payload sem máscara', () => {
    expect(cadastroSchema.safeParse(valid).success).toBe(true);
    expect(buildOnboardingPayload(valid)).toMatchObject({ whatsapp: '11999998888', documento: '52998224725' });
    expect(buildOnboardingPayload(valid).principal_dor).toBeUndefined();
  });

  it('rejeita senha fora da regra, documento inválido e sem aceite', () => {
    const r = cadastroSchema.safeParse({ ...valid, password: 'curta', documento: '111.111.111-11', aceiteTermos: false });
    expect(r.success).toBe(false);
    const fields = r.success ? [] : r.error.issues.map((i) => i.path[0]);
    expect(fields).toEqual(expect.arrayContaining(['password', 'documento', 'aceiteTermos']));
  });

  it('valida CPF e CNPJ', () => {
    expect(validarDocumento('529.982.247-25')).toBe(true);
    expect(validarDocumento('11.222.333/0001-81')).toBe(true);
    expect(validarDocumento('123')).toBe(false);
  });

  it('cada campo do schema está em exatamente um passo', () => {
    const all = CADASTRO_STEPS.flatMap((s) => s.fields);
    expect([...all].sort()).toEqual(Object.keys(CADASTRO_DEFAULTS).sort());
    expect(new Set(all).size).toBe(all.length);
  });

  it('traduz as recusas do backend para campo + mensagem', () => {
    expect(parseOnboardingError({ response: { data: { detail: 'Este email já está cadastrado' } } })).toEqual({
      field: 'email',
      message: 'Este email já está cadastrado',
    });
    expect(
      parseOnboardingError({
        response: { data: { detail: 'Já existe uma conta com esse nome de terreiro. Tente um nome diferente.' } },
      }).field,
    ).toBe('terreiroNome');
    expect(
      parseOnboardingError({
        response: {
          data: {
            error_code: 'VALIDATION_ERROR',
            message: 'Erro na validação dos dados',
            details: [{ loc: ['body', 'documento'], msg: 'Value error, CPF inválido' }],
          },
        },
      }),
    ).toEqual({ field: 'documento', message: 'CPF inválido' });
    expect(parseOnboardingError(new Error('Network Error'))).toEqual({
      message: 'Não foi possível criar a conta. Tente novamente.',
    });
  });

  it('prévia do link segue o slug do backend', () => {
    expect(previewSlug('  Ilê Axé Oxóssi & Ogum ')).toBe('ile-axe-oxossi-ogum');
  });

  it('rascunho ignora senha, documento e aceite mesmo se estiverem no armazenamento', () => {
    const storage = {
      getItem: () => JSON.stringify({ terreiroNome: 'Casa', password: 'x', documento: '123', aceiteTermos: true }),
    };
    expect(readDraft(storage)).toEqual({ terreiroNome: 'Casa' });
    expect(readDraft({ getItem: () => '{quebrado' })).toEqual({});
  });
});
