/**
 * Seções compartilhadas do site (components/site/sections) — Hero, Contact e
 * GirasCalendar — nos modos público e prévia.
 */
import React from 'react';
import { render, screen, within } from '@testing-library/react';
import { Hero } from '@/components/site/sections/Hero';
import { Contact } from '@/components/site/sections/Contact';
import { GirasCalendar } from '@/components/site/sections/GirasCalendar';
import { heroForeground, releaseWindowLabel, toYoutubeEmbedUrl, validateSection } from '@/components/site/lib';
import type { SectionContext, SiteGira } from '@/components/site/types';

jest.mock('next/head', () => {
  return ({ children }: any) => <>{children}</>;
});

const ctx = (over: Partial<SectionContext> = {}): SectionContext => ({ mode: 'public', slug: 'casa-de-oxala', giras: [], ...over });

describe('Hero', () => {
  it('renderiza título, subtítulo e o CTA "Retirar senha" para /public/{slug}/senha', () => {
    render(<Hero config={{ title: 'Casa de Oxalá', subtitle: 'Axé' }} ctx={ctx()} />);
    expect(screen.getByRole('heading', { level: 1, name: 'Casa de Oxalá' })).toBeInTheDocument();
    expect(screen.getByText('Axé')).toBeInTheDocument();
    const cta = screen.getByRole('link', { name: /Retirar senha/ });
    expect(cta).toHaveAttribute('href', '/public/casa-de-oxala/senha');
    expect(cta).not.toHaveAttribute('aria-disabled');
  });

  it('na prévia o CTA fica inerte e o título vazio ganha placeholder', () => {
    render(<Hero config={{}} ctx={ctx({ mode: 'preview' })} />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Nome do terreiro');
    expect(screen.getByTestId('hero-cta')).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByTestId('hero-cta')).toHaveAttribute('tabindex', '-1');
  });

  it('mostra o logo quando configurado', () => {
    render(<Hero config={{ title: 'X', logo_mode: 'logo', logo_image_url: '/api/v1/public/sites/images/abc' }} ctx={ctx()} />);
    expect(document.querySelector('img[src="/api/v1/public/sites/images/abc"]')).toBeInTheDocument();
  });
});

describe('heroForeground (contraste)', () => {
  it('troca a cor configurada quando ela não contrasta com o fundo', () => {
    // texto branco sobre gradiente quase branco → preto
    expect(heroForeground({ bg_type: 'gradient', gradient_from: '#ffffff', gradient_to: '#f1f5f9', font_color: '#ffffff' })).toBe('#000000');
  });
  it('mantém a cor configurada quando contrasta', () => {
    expect(heroForeground({ bg_type: 'solid', bg_color: '#0f172a', font_color: '#ffffff' })).toBe('#ffffff');
  });
});

describe('Contact', () => {
  it('monta links de WhatsApp (com 55), e-mail e Instagram', () => {
    render(<Contact config={{ phone: '(11) 99999-8888', email: 'oi@casa.com', instagram: '@casadeoxala' }} ctx={ctx()} />);
    expect(screen.getByRole('link', { name: /WhatsApp/ })).toHaveAttribute('href', 'https://wa.me/5511999998888');
    expect(screen.getByRole('link', { name: /E-mail/ })).toHaveAttribute('href', 'mailto:oi@casa.com');
    expect(screen.getByRole('link', { name: /Instagram/ })).toHaveAttribute('href', 'https://instagram.com/casadeoxala');
  });

  it('não renderiza nada no site público sem contatos, mas mostra exemplos na prévia', () => {
    const { container, unmount } = render(<Contact config={{}} ctx={ctx()} />);
    expect(container).toBeEmptyDOMElement();
    unmount();
    render(<Contact config={{}} ctx={ctx({ mode: 'preview' })} />);
    expect(screen.getByText('(11) 99999-9999')).toBeInTheDocument();
  });
});

describe('GirasCalendar', () => {
  const in3days = new Date(Date.now() + 3 * 86400000).toISOString();
  const giras: SiteGira[] = [
    { id: 'g1', nome: 'Gira de Caboclos', data_hora: in3days, descricao: 'Aberta', has_tickets: true, has_sponsor_tickets: true },
    { id: 'g2', nome: 'Gira Fechada', data_hora: in3days, descricao: null, has_tickets: false, has_sponsor_tickets: false },
  ];

  it('lista as giras no bloco do celular com a próxima em destaque e botões de senha', () => {
    render(<GirasCalendar config={{}} ctx={ctx({ giras })} />);
    const mobile = screen.getByTestId('giras-mobile');
    expect(within(mobile).getByText('Gira de Caboclos')).toBeInTheDocument();
    expect(within(mobile).getByText('Próxima gira')).toBeInTheDocument();
    expect(within(mobile).getByRole('link', { name: /Retire sua senha/ })).toHaveAttribute('href', '/public/gira/g1');
    expect(within(mobile).getByRole('link', { name: /Senha de associado/ })).toHaveAttribute('href', '/public/gira/g1?tipo=associado');
    // gira sem senhas não ganha botão
    expect(within(mobile).getAllByRole('link', { name: /Retire sua senha/ })).toHaveLength(1);
  });

  it('mostra o calendário com navegação de mês no computador', () => {
    render(<GirasCalendar config={{}} ctx={ctx({ giras })} />);
    const desktop = screen.getByTestId('giras-desktop');
    expect(within(desktop).getByRole('button', { name: 'Mês anterior' })).toBeInTheDocument();
    expect(within(desktop).getByRole('button', { name: 'Próximo mês' })).toBeInTheDocument();
    expect(within(desktop).getByRole('grid')).toBeInTheDocument();
  });

  it('mostra estado vazio visível sem giras no site público', () => {
    render(<GirasCalendar config={{}} ctx={ctx()} />);
    expect(screen.getByRole('status')).toHaveTextContent(/Nenhuma gira agendada/);
  });

  it('na prévia sem giras usa exemplos marcados', () => {
    render(<GirasCalendar config={{}} ctx={ctx({ mode: 'preview' })} />);
    expect(screen.getAllByText('(exemplo)').length).toBeGreaterThan(0);
  });

  it('"Senhas abrem…" aparece quando a janela está no futuro', () => {
    const g: SiteGira = { ...giras[0], release_start_at: new Date(Date.now() + 86400000).toISOString() };
    expect(releaseWindowLabel(g)).toMatch(/^Senhas abrem /);
    expect(releaseWindowLabel({ ...g, release_start_at: null })).toBeNull();
    expect(releaseWindowLabel({ ...g, release_start_at: new Date(Date.now() - 1000).toISOString() })).toBe('Senhas abertas');
  });
});

describe('helpers', () => {
  it('toYoutubeEmbedUrl converte watch/short/embed para youtube-nocookie', () => {
    expect(toYoutubeEmbedUrl('https://www.youtube.com/watch?v=abc123')).toBe('https://www.youtube-nocookie.com/embed/abc123');
    expect(toYoutubeEmbedUrl('https://youtu.be/abc123')).toBe('https://www.youtube-nocookie.com/embed/abc123');
    expect(toYoutubeEmbedUrl('https://www.youtube.com/embed/abc123')).toBe('https://www.youtube-nocookie.com/embed/abc123');
    expect(toYoutubeEmbedUrl('')).toBeNull();
  });
  it('validateSection espelha o backend', () => {
    expect(validateSection({ section_type: 'HERO', config: {} })).toHaveLength(1);
    expect(validateSection({ section_type: 'VIDEO_EMBED', config: { youtube_url: 'https://vimeo.com/1' } })).toHaveLength(1);
  });
});
