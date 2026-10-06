/**
 * Tests for /cadastro — tela única (react-hook-form + zod no blur), dor e "como conheceu" como
 * chips opcionais, regra de senha do backend, POST /api/v1/public/onboarding e redirecionamento
 * para a primeira gira.
 */
import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';

const mockQuery: Record<string, string> = {};
jest.mock('next/router', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), pathname: '/cadastro', query: mockQuery, isReady: true }),
}));
jest.mock('next/head', () => ({ __esModule: true, default: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
jest.mock('next/link', () => ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a>);
jest.mock('@/services/api_client', () => ({
  apiClient: { post: jest.fn(), get: jest.fn() },
}));
jest.mock('@/providers/ThemeProvider', () => ({ dispatchTenantBrandingUpdated: jest.fn() }));
jest.mock('@/services/analytics', () => ({ trackEvent: jest.fn(), setAnalyticsTag: jest.fn() }));

import Cadastro from '@/pages/cadastro';
import { apiClient } from '@/services/api_client';
import { trackEvent } from '@/services/analytics';
import { buildOnboardingPayload, cadastroSchema, CADASTRO_DEFAULTS, validarDocumento } from '@/components/auth/cadastroForm';

const STRONG = 'SenhaForte#2026';

function fillRequired() {
  fireEvent.change(screen.getByLabelText(/Nome do terreiro/), { target: { value: 'Casa Nova' } });
  fireEvent.change(screen.getByLabelText(/Seu nome/), { target: { value: 'Maria Silva' } });
  fireEvent.change(screen.getByLabelText(/Seu WhatsApp/), { target: { value: '11999998888' } });
  fireEvent.change(screen.getByLabelText(/^Senha/), { target: { value: STRONG } });
  fireEvent.change(screen.getByLabelText(/^E-mail/), { target: { value: 'maria@example.com' } });
  fireEvent.change(screen.getByLabelText(/CPF ou CNPJ/), { target: { value: '52998224725' } });
  fireEvent.click(screen.getByRole('checkbox', { name: /Li e aceito/ }));
}

describe('Cadastro — tela única', () => {
  let errSpy: jest.SpyInstance;
  beforeEach(() => {
    jest.clearAllMocks();
    Object.keys(mockQuery).forEach((k) => delete mockQuery[k]);
    (apiClient.post as jest.Mock).mockResolvedValue({ data: { user: { id: 'u1' } } });
    // jsdom não implementa navegação: troca window.location por um objeto simples
    delete (window as unknown as { location?: unknown }).location;
    (window as unknown as { location: { href: string } }).location = { href: '' };
    errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => errSpy.mockRestore());

  it('pede e-mail e CPF/CNPJ por último, dizendo que liberam o mês grátis', () => {
    render(<Cadastro />);
    const labels = Array.from(document.querySelectorAll('label')).map((l) => l.textContent ?? '');
    const idxSenha = labels.findIndex((l) => /^Senha/.test(l));
    const idxEmail = labels.findIndex((l) => /^E-mail/.test(l));
    const idxDoc = labels.findIndex((l) => /CPF ou CNPJ/.test(l));
    expect(idxSenha).toBeGreaterThan(-1);
    expect(idxEmail).toBeGreaterThan(idxSenha);
    expect(idxDoc).toBeGreaterThan(idxEmail);
    expect(screen.getAllByText(/liberar seu mês grátis/).length).toBeGreaterThan(0);
  });

  it('dor e "como nos conheceu" são chips opcionais com as seis opções de dor', () => {
    render(<Cadastro />);
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

  it('valida no blur com a regra de senha do backend', async () => {
    render(<Cadastro />);
    const senha = screen.getByLabelText(/^Senha/);
    fireEvent.change(senha, { target: { value: 'senhaforte123' } });
    await act(async () => {
      fireEvent.blur(senha);
    });
    expect(await screen.findByText(/Falta: uma letra maiúscula, um símbolo/)).toBeInTheDocument();

    const terreiro = screen.getByLabelText(/Nome do terreiro/);
    await act(async () => {
      fireEvent.blur(terreiro);
    });
    expect(await screen.findByText(/pelo menos 3 letras/)).toBeInTheDocument();
  });

  it('envia principal_dor, registra a conversão e vai para a primeira gira', async () => {
    render(<Cadastro />);
    fillRequired();
    fireEvent.click(screen.getByRole('radio', { name: 'Organizar os médiuns e a corrente' }));
    fireEvent.click(screen.getByRole('radio', { name: 'Instagram' }));

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Criar minha conta/ }));
    });

    await waitFor(() => expect(apiClient.post).toHaveBeenCalled());
    const [url, payload] = (apiClient.post as jest.Mock).mock.calls[0];
    expect(url).toBe('/api/v1/public/onboarding');
    expect(payload).toMatchObject({
      terreiro_nome: 'Casa Nova',
      responsavel_nome: 'Maria Silva',
      whatsapp: '11999998888',
      documento: '52998224725',
      principal_dor: 'mediuns',
      como_conheceu: 'instagram',
      aceite_termos: true,
    });
    expect(trackEvent).toHaveBeenCalledWith('signup_completed', { principal_dor: 'mediuns' });
    await waitFor(() => expect(window.location.href).toBe('/admin/giras?nova=1'));
  });

  it('sem dor escolhida registra "nao_informado"', async () => {
    render(<Cadastro />);
    fillRequired();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Criar minha conta/ }));
    });
    await waitFor(() => expect(trackEvent).toHaveBeenCalledWith('signup_completed', { principal_dor: 'nao_informado' }));
  });

  it('com ?plan=pro cria a conta e segue para o pagamento', async () => {
    mockQuery.plan = 'pro';
    (apiClient.post as jest.Mock).mockImplementation((url: string) =>
      Promise.resolve({ data: url.includes('checkout') ? { checkout_url: 'https://pagamento/x' } : { user: { id: 'u1' } } }),
    );
    render(<Cadastro />);
    expect(screen.getByText(/Plano escolhido: Pro/)).toBeInTheDocument();
    fillRequired();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Criar conta e assinar Pro/ }));
    });
    await waitFor(() => expect(apiClient.post).toHaveBeenCalledWith('/api/v1/admin/billing/checkout', { plan: 'pro' }));
    expect(window.location.href).toBe('https://pagamento/x');
  });
});

describe('cadastroForm (zod)', () => {
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
});
