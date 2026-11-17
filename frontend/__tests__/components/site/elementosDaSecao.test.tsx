/**
 * Beta "Novo construtor do site": a casa escolhe o que aparece em cada seção (chaves
 * `show_*` na config, padrão ligado). Regras puras, seções no site e na prévia, barra do
 * celular e o painel da seção no estúdio (interruptores e abas Conteúdo/Estilo).
 */
import React from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

jest.mock('next/router', () => ({
  useRouter: () => ({ push: jest.fn(), pathname: '/admin/meu-site', query: {}, asPath: '/admin/meu-site', events: { on: jest.fn(), off: jest.fn(), emit: jest.fn() } }),
}));
jest.mock('next/head', () => ({ children }: any) => <>{children}</>);
jest.mock('next/link', () => ({ children, href }: any) => <a href={href}>{children}</a>);
jest.mock('@/services/api_client', () => ({
  apiClient: { get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn() },
  extractApiErrorMessage: (_e: unknown, fallback: string) => fallback,
}));
jest.mock('@/hooks/useMediaQuery', () => ({ useMediaQuery: (q: string) => !q.includes('max-width') }));
jest.mock('@/components/admin/ShareLinkDialog', () => ({ ShareLinkDialog: () => null }));

import { SECTION_ELEMENTS, elementPatch, elementsFor, hiddenCount, isElementOn, mobileCta, shows } from '@/components/site/elements';
import { Hero } from '@/components/site/sections/Hero';
import { Contact } from '@/components/site/sections/Contact';
import { Location } from '@/components/site/sections/Location';
import { Ajudar } from '@/components/site/sections/Ajudar';
import { Social } from '@/components/site/sections/Social';
import { GirasCalendar } from '@/components/site/sections/GirasCalendar';
import { PublicSite } from '@/components/site/PublicSite';
import { SiteStudio } from '@/components/site/editor/studio/SiteStudio';
import { SECTION_CATALOG } from '@/components/site/lib';
import type { PublicSiteData, SectionContext, SiteSection } from '@/components/site/types';

const ctx = (over: Partial<SectionContext> = {}): SectionContext => ({ mode: 'public', slug: 'casa', giras: [], ...over });

describe('regras dos elementos', () => {
  it('padrão ligado: só false esconde (sites que já existem não mudam)', () => {
    expect(shows({}, 'show_title')).toBe(true);
    expect(shows({ show_title: true }, 'show_title')).toBe(true);
    expect(shows({ show_title: false }, 'show_title')).toBe(false);
    expect(shows({ show_title: null }, 'show_title')).toBe(true);
  });

  it('toda seção do catálogo tem a lista de elementos, e as chaves começam com show_', () => {
    for (const e of SECTION_CATALOG) {
      expect(SECTION_ELEMENTS[e.type].length).toBeGreaterThan(0);
      for (const el of SECTION_ELEMENTS[e.type]) expect(el.key).toMatch(/^show_[a-z_]+$/);
    }
  });

  it('elemento que só vale num layout aparece só nele', () => {
    expect(elementsFor('VIDEO_EMBED', { layout: 'video-only' }).map((e) => e.key)).toEqual(['show_title']);
    expect(elementsFor('VIDEO_EMBED', { layout: 'side-by-side' }).map((e) => e.key)).toContain('show_side_text');
    expect(elementsFor('GIRAS_CALENDAR', { display_mode: 'list' }).map((e) => e.key)).not.toContain('show_calendar_note');
  });

  it('o logo da capa fala pelo "Com logo" antigo e pela chave nova', () => {
    const logo = SECTION_ELEMENTS.HERO.find((e) => e.key === 'show_logo')!;
    expect(isElementOn(logo, {})).toBe(false);
    expect(isElementOn(logo, { logo_mode: 'logo' })).toBe(true);
    expect(isElementOn(logo, { logo_mode: 'logo', show_logo: false })).toBe(false);
    expect(elementPatch(logo, true)).toEqual({ logo_mode: 'logo', show_logo: true });
    expect(elementPatch(logo, false)).toEqual({ show_logo: false });
    expect(elementPatch(SECTION_ELEMENTS.ABOUT[0], false)).toEqual({ show_title: false });
  });

  it('conta os escondidos', () => {
    expect(hiddenCount('CONTACT', { show_email: false, show_instagram: false })).toBe(2);
  });

  it('barra do celular: na capa, padrão ligado, com o texto do botão', () => {
    expect(mobileCta([])).toEqual({ show: true, label: 'Retirar senha' });
    expect(mobileCta([{ section_type: 'HERO', config: { cta_label: 'Pegar senha' } }])).toEqual({ show: true, label: 'Pegar senha' });
    expect(mobileCta([{ section_type: 'HERO', config: { show_mobile_cta: false } }]).show).toBe(false);
  });
});

describe('seções respeitam os elementos', () => {
  it('capa sem botão, com nome escondido só para os olhos e texto do botão próprio', () => {
    const { rerender } = render(<Hero config={{ title: 'Casa de Oxalá', show_cta: false }} ctx={ctx()} />);
    expect(screen.queryByTestId('hero-cta')).not.toBeInTheDocument();

    rerender(<Hero config={{ title: 'Casa de Oxalá', show_title: false, cta_label: 'Pegar minha senha' }} ctx={ctx()} />);
    const h1 = screen.getByRole('heading', { level: 1, name: 'Casa de Oxalá' });
    expect(h1).toHaveClass('sr-only');
    expect(screen.getByTestId('hero-cta')).toHaveTextContent('Pegar minha senha');

    rerender(<Hero config={{ title: 'X', subtitle: 'Axé', show_subtitle: false, logo_mode: 'logo', logo_image_url: '/img/l', show_logo: false }} ctx={ctx()} />);
    expect(screen.queryByText('Axé')).not.toBeInTheDocument();
    expect(document.querySelector('img[src="/img/l"]')).not.toBeInTheDocument();
  });

  it('contato some com o canal desligado e com o título', () => {
    render(<Contact config={{ title: 'Fale com a casa', phone: '11999998888', email: 'a@b.com', show_email: false, show_title: false }} ctx={ctx()} />);
    expect(screen.getByRole('link', { name: /WhatsApp/ })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /E-mail/ })).not.toBeInTheDocument();
    expect(screen.queryByText('Fale com a casa')).not.toBeInTheDocument();
  });

  it('como chegar sem mapa e sem botão do Google Maps', () => {
    render(<Location config={{ street: 'Rua A', number: '10', city: 'SP', show_map: false, show_maps_button: false }} ctx={ctx({ mode: 'preview' })} />);
    expect(screen.queryByText('O mapa aparece no site publicado')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Google Maps/ })).not.toBeInTheDocument();
    expect(screen.getByText('Rua A, 10')).toBeInTheDocument();
  });

  it('como ajudar sem botão de copiar mantém a chave visível', () => {
    render(<Ajudar config={{ pix_chave: 'casa@pix.com', show_copy_button: false }} ctx={ctx()} />);
    expect(screen.getByText('casa@pix.com')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Copiar/ })).not.toBeInTheDocument();
  });

  it('redes: cada rede tem o seu interruptor', () => {
    render(<Social config={{ instagram: '@casa', youtube: '@casa', show_youtube: false }} ctx={ctx()} />);
    expect(screen.getByRole('link', { name: /Instagram/ })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /YouTube/ })).not.toBeInTheDocument();
  });

  it('próximas giras sem título e sem descrição', () => {
    const giras = [{ id: 'g1', nome: 'Gira de Caboclos', data_hora: '2030-01-10T22:00:00Z', descricao: 'Aberta ao público', has_tickets: true }] as any;
    render(<GirasCalendar config={{ title: 'Agenda', show_title: false, show_description: false }} ctx={ctx({ giras })} />);
    expect(screen.queryByText('Agenda')).not.toBeInTheDocument();
    expect(screen.queryByText('Aberta ao público')).not.toBeInTheDocument();
    expect(screen.getAllByText('Gira de Caboclos').length).toBeGreaterThan(0);
  });
});

describe('barra do celular no site público', () => {
  const site = (heroConfig: Record<string, unknown>): PublicSiteData =>
    ({
      id: 's',
      slug: 'casa',
      status: 'PUBLISHED',
      template: 'moderno',
      meta_title: null,
      meta_description: null,
      upcoming_giras: [],
      sections: [{ id: 'h', section_type: 'HERO', order_index: 0, config: { title: 'Casa', ...heroConfig } }],
    }) as PublicSiteData;

  it('aparece por padrão, com o texto do botão da capa', () => {
    render(<PublicSite site={site({ cta_label: 'Quero minha senha' })} mode="public" />);
    expect(screen.getByTestId('mobile-cta-bar')).toHaveTextContent('Quero minha senha');
  });

  it('some quando a casa desliga', () => {
    render(<PublicSite site={site({ show_mobile_cta: false })} mode="public" />);
    expect(screen.queryByTestId('mobile-cta-bar')).not.toBeInTheDocument();
  });
});

describe('painel da seção no estúdio', () => {
  const SITE = { id: 's1', slug: 'casa', status: 'DRAFT', template: 'moderno', meta_title: null, meta_description: null, updated_at: '2026-11-17T10:00:00' };
  function mockApi(sections: SiteSection[]) {
    const { apiClient } = require('@/services/api_client');
    apiClient.get.mockImplementation((url: string) => {
      if (url.includes('/admin/sites/sections')) return Promise.resolve({ data: { sections, site_updated_at: SITE.updated_at } });
      if (url.includes('/admin/sites/versions')) return Promise.resolve({ data: [] });
      if (url.includes('/admin/sites')) return Promise.resolve({ data: SITE });
      return Promise.resolve({ data: [] });
    });
    apiClient.put.mockResolvedValue({ data: { sections, site_updated_at: SITE.updated_at } });
  }

  it('desligar o botão da capa tira da prévia; ligar devolve; abas separam conteúdo e estilo', async () => {
    mockApi([{ id: 'h', section_type: 'HERO', order_index: 0, config: { title: 'Casa de Oxalá' } }]);
    render(<SiteStudio canEdit canInsert />);
    const user = userEvent.setup();
    const layers = await screen.findByTestId('studio-layers');
    await user.click(within(layers).getByRole('button', { name: /^Capa/ }));

    const inspector = screen.getByTestId('studio-inspector');
    const elementos = within(inspector).getByTestId('studio-elements');
    expect(within(elementos).getByText('4 de 5')).toBeInTheDocument();

    const botao = within(elementos).getByRole('switch', { name: /Botão "Retirar senha"/ });
    expect(screen.getByTestId('hero-cta')).toBeInTheDocument();
    expect(within(inspector).getByLabelText('Texto do botão')).toBeInTheDocument();
    await user.click(botao);
    expect(screen.queryByTestId('hero-cta')).not.toBeInTheDocument();
    expect(within(inspector).queryByLabelText('Texto do botão')).not.toBeInTheDocument();
    await user.click(botao);
    expect(screen.getByTestId('hero-cta')).toBeInTheDocument();

    // Conteúdo: textos. Estilo: cores e fundo.
    expect(within(inspector).getByLabelText(/Título/)).toBeInTheDocument();
    expect(within(inspector).queryByText('Fundo')).not.toBeInTheDocument();
    await user.click(within(inspector).getByRole('tab', { name: 'Estilo' }));
    expect(within(inspector).getByText('Fundo')).toBeInTheDocument();
    expect(within(inspector).queryByLabelText(/Subtítulo/)).not.toBeInTheDocument();
  });
});
