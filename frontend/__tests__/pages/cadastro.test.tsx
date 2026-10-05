/**
 * Tests for /cadastro — pergunta obrigatória "O que você mais precisa
 * resolver?" (principal_dor), enviada no POST /api/v1/public/onboarding.
 */
import React from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

jest.mock('next/router', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), pathname: '/cadastro', query: {}, isReady: true }),
}));
jest.mock('next/head', () => ({ __esModule: true, default: ({ children }: any) => <>{children}</> }));
jest.mock('next/link', () => ({ children, href }: any) => <a href={href}>{children}</a>);
jest.mock('@/services/api_client', () => ({
  apiClient: { post: jest.fn().mockResolvedValue({ data: { user: { id: 'u1' } } }), get: jest.fn() },
}));
jest.mock('@/providers/ThemeProvider', () => ({ dispatchTenantBrandingUpdated: jest.fn() }));
jest.mock('@/services/analytics', () => ({ trackEvent: jest.fn(), setAnalyticsTag: jest.fn() }));

import Cadastro from '@/pages/cadastro';
import { apiClient } from '@/services/api_client';
import { trackEvent } from '@/services/analytics';

const proximo = () => screen.getByRole('button', { name: /Próximo/ });

function chooseDor(label: string) {
  fireEvent.mouseDown(screen.getByRole('combobox', { name: /O que você mais precisa resolver/ }));
  fireEvent.click(within(screen.getByRole('listbox')).getByText(label));
}

describe('Cadastro — principal_dor', () => {
  let errSpy: jest.SpyInstance;
  beforeEach(() => {
    jest.clearAllMocks();
    // jsdom não implementa navegação (window.location.href = ...)
    errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => errSpy.mockRestore());

  it('lista as seis opções e só libera o próximo passo com uma escolhida', () => {
    render(<Cadastro />);
    fireEvent.change(screen.getByLabelText(/Nome do Terreiro/), { target: { value: 'Casa Nova' } });
    expect(proximo()).toBeDisabled();

    fireEvent.mouseDown(screen.getByRole('combobox', { name: /O que você mais precisa resolver/ }));
    const options = within(screen.getByRole('listbox')).getAllByRole('option');
    expect(options.map((o) => o.textContent)).toEqual([
      'Organizar as senhas e a fila das giras',
      'Organizar os médiuns e a corrente',
      'Controlar mensalidades e o financeiro',
      'Divulgar o terreiro (site e cursos)',
      'Controlar o estoque de materiais',
      'Ainda estou conhecendo',
    ]);
    fireEvent.click(options[2]);
    expect(proximo()).toBeEnabled();
  });

  it('envia principal_dor no cadastro e registra a conversão', async () => {
    render(<Cadastro />);
    fireEvent.change(screen.getByLabelText(/Nome do Terreiro/), { target: { value: 'Casa Nova' } });
    chooseDor('Organizar os médiuns e a corrente');
    fireEvent.click(proximo());

    fireEvent.change(screen.getByLabelText(/Nome completo/), { target: { value: 'Maria Silva' } });
    fireEvent.change(screen.getByLabelText(/Email/), { target: { value: 'maria@example.com' } });
    fireEvent.change(screen.getByLabelText(/WhatsApp/), { target: { value: '11999998888' } });
    fireEvent.change(screen.getByLabelText(/CPF ou CNPJ/), { target: { value: '52998224725' } });
    fireEvent.change(screen.getByLabelText(/^Senha/), { target: { value: 'senhaforte123' } });
    fireEvent.change(screen.getByLabelText(/Confirmar senha/), { target: { value: 'senhaforte123' } });
    fireEvent.click(screen.getByRole('checkbox'));

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Criar minha conta/ }));
    });

    await waitFor(() => expect(apiClient.post).toHaveBeenCalled());
    const [url, payload] = (apiClient.post as jest.Mock).mock.calls[0];
    expect(url).toBe('/api/v1/public/onboarding');
    expect(payload).toMatchObject({ terreiro_nome: 'Casa Nova', principal_dor: 'mediuns' });
    expect(trackEvent).toHaveBeenCalledWith('signup_completed', { principal_dor: 'mediuns' });
  });
});
