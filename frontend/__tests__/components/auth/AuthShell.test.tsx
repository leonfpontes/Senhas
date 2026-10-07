/**
 * AuthShell — moldura das telas de conta com a identidade da landing: marca que volta para `/`,
 * painel da marca (promessa + depoimento real mais recente) e paleta terra no kit (`auth-terra`).
 */
import React from 'react';
import { render, screen, within } from '@testing-library/react';
import { AuthShell } from '@/components/auth';
import { AUTH_PANEL } from '@/constants/landingCopy';
import { TESTIMONIALS, latestTestimonial, testimonialExcerpt } from '@/constants/testimonials';

jest.mock('next/head', () => ({ __esModule: true, default: ({ children }: { children: React.ReactNode }) => <>{children}</> }));

describe('AuthShell', () => {
  it('marca volta para a landing, título em h1 e atalho no cabeçalho', () => {
    render(
      <AuthShell title="Que bom ver você de novo" headerAction={{ label: 'Criar conta grátis', href: '/cadastro' }}>
        <p>formulário</p>
      </AuthShell>,
    );
    expect(screen.getByRole('link', { name: 'GiraHub — página inicial' })).toHaveAttribute('href', '/');
    expect(screen.getByRole('heading', { level: 1, name: 'Que bom ver você de novo' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Criar conta grátis' })).toHaveAttribute('href', '/cadastro');
    expect(screen.getByRole('main')).toHaveTextContent('formulário');
    // Kit na paleta terra, independente da cor do último terreiro
    expect(screen.getByRole('main').closest('.auth-terra')).not.toBeNull();
  });

  it('painel da marca traz a promessa e o depoimento real mais recente', () => {
    render(
      <AuthShell title="Entrar">
        <p>x</p>
      </AuthShell>,
    );
    const panel = screen.getByRole('complementary', { name: 'Sobre o GiraHub' });
    expect(within(panel).getByText(AUTH_PANEL.promise)).toBeInTheDocument();
    const t = latestTestimonial();
    expect(t).toBeDefined();
    expect(within(panel).getByText(t!.nome)).toBeInTheDocument();
    expect(within(panel).getByText(`“${testimonialExcerpt(t!)}”`)).toBeInTheDocument();
  });
});

describe('depoimento no painel', () => {
  const base = TESTIMONIALS[0];

  it('mais recente pela data de autorização; empate fica com o primeiro da lista', () => {
    const a = { ...base, nome: 'A', autorizadoEm: '2026-10-01' };
    const b = { ...base, nome: 'B', autorizadoEm: '2026-10-05' };
    const c = { ...base, nome: 'C', autorizadoEm: '2026-10-05' };
    expect(latestTestimonial([a, b, c])?.nome).toBe('B');
    expect(latestTestimonial([])).toBeUndefined();
  });

  it('trecho é a primeira frase inteira, ou o começo cortado na palavra', () => {
    expect(testimonialExcerpt({ ...base, texto: 'Mudou a nossa gira. Recomendo a todos!' })).toBe('Mudou a nossa gira.');
    const longo = { ...base, texto: `${'palavra '.repeat(40)}fim.` };
    const trecho = testimonialExcerpt(longo, 50);
    expect(trecho.endsWith('…')).toBe(true);
    expect(trecho.length).toBeLessThanOrEqual(51);
    expect(trecho).not.toMatch(/\s…$/);
  });
});
