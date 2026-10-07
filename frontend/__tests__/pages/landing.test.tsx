/**
 * Landing (V-03, V-04, V-06, V-07, V-08): seções na ordem, FAQ igual ao JSON-LD, depoimentos só
 * quando existem, WhatsApp só com número configurado.
 */
import React from 'react';
import { render, screen, within } from '@testing-library/react';
import HomePage from '@/pages/index';
import { Hero } from '@/components/landing/Hero';
import { FinalCta } from '@/components/landing/FinalCta';
import { WhatsAppFab } from '@/components/landing/WhatsAppFab';
import { Testimonials } from '@/components/landing/Testimonials';
import { LANDING_FAQ, faqJsonLd } from '@/constants/landingFaq';
import { instagramUrl } from '@/constants/testimonials';
import { normalizeWhatsapp, supportWhatsappLink } from '@/lib/whatsapp';

jest.mock('next/head', () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

beforeAll(() => {
  // framer-motion (whileInView) usa IntersectionObserver, que o jsdom não tem.
  class IO {
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() {
      return [];
    }
  }
  (window as unknown as { IntersectionObserver: unknown }).IntersectionObserver = IO;
});

describe('Landing', () => {
  it('deixa claro o nicho no topo', () => {
    render(<HomePage />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/senha da gira/i);
    expect(screen.getAllByText(/Umbanda, Candomblé/i).length).toBeGreaterThan(0);
  });

  it('mostra as seções na ordem: para quem é → antes e depois → como funciona → planos → dúvidas', () => {
    const { container } = render(<HomePage />);
    const ids = Array.from(container.querySelectorAll('section[id]')).map((s) => s.id);
    const order = ['hero', 'para-quem', 'antes-depois', 'como-funciona', 'planos', 'modulos', 'duvidas'];
    expect(ids.filter((id) => order.includes(id))).toEqual(order);
  });

  it('V-07: antes e depois com as perguntas da casa', () => {
    render(<HomePage />);
    const section = screen.getByRole('region', { name: /da fila no portão/i });
    expect(within(section).getByText(/papelzinho de senha/i)).toBeInTheDocument();
    expect(within(section).getByText(/quantas pessoas cabem hoje/i)).toBeInTheDocument();
  });

  it('V-04: FAQ com todas as perguntas e o mesmo texto do JSON-LD', () => {
    const { container } = render(<HomePage />);
    const faq = screen.getByRole('region', { name: /perguntas que todo terreiro faz/i });
    for (const item of LANDING_FAQ) {
      expect(within(faq).getByRole('button', { name: item.q })).toBeInTheDocument();
    }
    const scripts = Array.from(container.querySelectorAll('script[type="application/ld+json"]')).map((s) =>
      JSON.parse(s.innerHTML),
    );
    const faqLd = scripts.find((s) => s['@type'] === 'FAQPage');
    expect(faqLd.mainEntity).toHaveLength(LANDING_FAQ.length);
    expect(faqLd.mainEntity.map((q: { name: string }) => q.name)).toEqual(LANDING_FAQ.map((f) => f.q));
    expect(faqLd.mainEntity[0].acceptedAnswer.text).toBe(LANDING_FAQ[0].a);
  });

  it('V-04: JSON-LD escapa "<" para não fechar o <script>', () => {
    expect(faqJsonLd([{ q: 'a</script>', a: 'b' }])).not.toContain('</script>');
  });

  it('o menu leva para /planos', () => {
    render(<HomePage />);
    const links = screen.getAllByRole('link', { name: 'Planos' });
    expect(links[0]).toHaveAttribute('href', '/planos');
  });

  it('credita os fotógrafos no rodapé', () => {
    render(<HomePage />);
    expect(screen.getByText(/Fotos ilustrativas/i)).toHaveTextContent(/Reginaldo Lustosa/);
  });
});

describe('V-03 depoimentos', () => {
  it('não aparece sem depoimento autorizado', () => {
    const { container } = render(<Testimonials items={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('mostra nome, casa, cidade e @ com link seguro', () => {
    render(
      <Testimonials
        items={[
          {
            nome: 'Mãe Teste de Oxum',
            casa: 'Casa Teste',
            cidade: 'Campinas',
            uf: 'SP',
            texto: 'Texto de teste.',
            instagram: '@casa.teste',
            autorizadoEm: '2026-10-06',
          },
        ]}
      />,
    );
    expect(screen.getByText('Mãe Teste de Oxum')).toBeInTheDocument();
    expect(screen.getByText(/Casa Teste · Campinas\/SP/)).toBeInTheDocument();
    const ig = screen.getByRole('link', { name: '@casa.teste' });
    expect(ig).toHaveAttribute('href', 'https://instagram.com/casa.teste');
    expect(ig).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('instagramUrl descarta caracteres fora do padrão do Instagram', () => {
    expect(instagramUrl('@casa"><script>')).toBe('https://instagram.com/casascript');
  });
});

describe('V-06 WhatsApp', () => {
  it('normaliza número e acrescenta DDI 55', () => {
    expect(normalizeWhatsapp('(11) 99999-8888')).toBe('5511999998888');
    expect(normalizeWhatsapp('5511999998888')).toBe('5511999998888');
    expect(normalizeWhatsapp('')).toBe('');
  });

  it('link com mensagem pré-preenchida, vazio sem número', () => {
    expect(supportWhatsappLink('Olá terreiro', '5511999998888')).toBe('https://wa.me/5511999998888?text=Ol%C3%A1%20terreiro');
    expect(supportWhatsappLink('Olá', '')).toBe('');
  });

  it('com número: CTA no topo, botão flutuante e no final', () => {
    const href = supportWhatsappLink('oi', '5511999998888');
    render(
      <>
        <Hero whatsapp={href} />
        <FinalCta whatsapp={href} />
        <WhatsAppFab href={href} />
      </>,
    );
    expect(screen.getByRole('link', { name: /falar no whatsapp/i })).toHaveAttribute('href', href);
    expect(screen.getByRole('link', { name: /falar com o girahub no whatsapp/i })).toHaveAttribute('href', href);
    expect(screen.getByRole('link', { name: /tirar dúvidas no whatsapp/i })).toHaveAttribute('href', href);
  });

  it('sem número: nenhum botão de WhatsApp', () => {
    render(
      <>
        <Hero whatsapp="" />
        <FinalCta whatsapp="" />
        <WhatsAppFab href="" />
      </>,
    );
    expect(screen.queryByRole('link', { name: /whatsapp/i })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /ver como funciona/i })).toHaveAttribute('href', '#como-funciona');
  });
});
