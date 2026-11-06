/**
 * Site público no celular — lista de próximas giras + CTA fixo "Retirar senha".
 * O layout celular/computador é CSS (container queries); aqui conferimos o que
 * está no HTML do SSR: os dois blocos de giras, a barra fixa e o CTA do hero.
 */
import React from 'react';
import { render, screen, within } from '@testing-library/react';

jest.mock('next/head', () => {
  return ({ children }: any) => <>{children}</>;
});
jest.mock('next/link', () => {
  return ({ children, href }: any) => <a href={href}>{children}</a>;
});

import TenantPublicSitePage from '@/pages/[tenantSlug]/index';

const in5days = new Date(Date.now() + 5 * 86400000).toISOString();
const in12days = new Date(Date.now() + 12 * 86400000).toISOString();

const SITE = {
  id: 'site-1',
  slug: 'casa-de-oxala',
  status: 'PUBLISHED',
  template: 'moderno',
  meta_title: 'Casa de Oxalá',
  meta_description: 'Terreiro de umbanda',
  sections: [
    { id: 'h', section_type: 'HERO', order_index: 0, config: { title: 'Casa de Oxalá', bg_type: 'solid', bg_color: '#0f172a' } },
    { id: 'g', section_type: 'GIRAS_CALENDAR', order_index: 1, config: {} },
    { id: 'hidden', section_type: 'CUSTOM_TEXT', order_index: 2, config: { title: 'Não deve aparecer', body: 'x', hidden: true } },
  ],
  upcoming_giras: [
    { id: 'g2', nome: 'Gira de Pretos-Velhos', data_hora: in12days, descricao: null, has_tickets: true, has_sponsor_tickets: false },
    { id: 'g1', nome: 'Gira de Caboclos', data_hora: in5days, descricao: 'Traga uma vela', has_tickets: true, has_sponsor_tickets: false },
  ],
};

describe('Site público no celular', () => {
  it('mostra a barra fixa "Retirar senha" apontando para /public/{slug}/senha', () => {
    render(<TenantPublicSitePage site={SITE} />);
    const bar = screen.getByTestId('mobile-cta-bar');
    expect(bar.className).toMatch(/fixed/);
    expect(bar.className).toMatch(/md:hidden/);
    expect(within(bar).getByRole('link', { name: /Retirar senha/ })).toHaveAttribute('href', '/public/casa-de-oxala/senha');
  });

  it('o hero também tem o CTA "Retirar senha" (48px: size touch)', () => {
    render(<TenantPublicSitePage site={SITE} />);
    const cta = screen.getByTestId('hero-cta');
    expect(cta).toHaveAttribute('href', '/public/casa-de-oxala/senha');
    expect(cta.className).toMatch(/h-12/);
  });

  it('lista as próximas giras em ordem de data, com a próxima em destaque e botão de 48px', () => {
    render(<TenantPublicSitePage site={SITE} />);
    const mobile = screen.getByTestId('giras-mobile');
    const cards = within(mobile).getAllByRole('article');
    expect(cards).toHaveLength(2);
    expect(cards[0]).toHaveTextContent('Gira de Caboclos');
    expect(cards[0]).toHaveTextContent('Próxima gira');
    expect(cards[1]).toHaveTextContent('Gira de Pretos-Velhos');
    const btn = within(cards[0]).getByRole('link', { name: /Retire sua senha/ });
    expect(btn).toHaveAttribute('href', '/public/gira/g1');
    expect(btn.className).toMatch(/h-12/);
  });

  it('no computador o bloco mostra o calendário com a próxima gira em destaque', () => {
    render(<TenantPublicSitePage site={SITE} />);
    const desktop = screen.getByTestId('giras-desktop');
    expect(within(desktop).getByRole('grid')).toBeInTheDocument();
    expect(within(desktop).getByText('Próxima gira')).toBeInTheDocument();
  });

  it('não renderiza seções desligadas (config.hidden)', () => {
    render(<TenantPublicSitePage site={SITE} />);
    expect(screen.queryByText('Não deve aparecer')).not.toBeInTheDocument();
  });

  it('sem giras mostra estado vazio visível', () => {
    render(<TenantPublicSitePage site={{ ...SITE, upcoming_giras: [] }} />);
    expect(screen.getByRole('status')).toHaveTextContent(/Nenhuma gira agendada/);
  });
});
