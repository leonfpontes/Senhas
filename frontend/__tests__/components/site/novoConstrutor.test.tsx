/**
 * Beta "Novo construtor do site" (beta_novo_construtor_site): começo guiado, edição direto
 * na prévia, desfazer, estilos, seções novas e conferência antes de publicar.
 */
import React from 'react';
import { render, screen, waitFor, within, fireEvent } from '@testing-library/react';
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
jest.mock('@/hooks/useMediaQuery', () => ({
  // Tela larga: três painéis, prévia no centro.
  useMediaQuery: (q: string) => !q.includes('max-width'),
}));
jest.mock('@/components/admin/ShareLinkDialog', () => ({
  ShareLinkDialog: ({ open, title }: { open: boolean; title?: string }) => (open ? <div role="dialog">{title}</div> : null),
}));

import { SiteEditor } from '@/components/site/editor/SiteEditor';
import { buildChecklist } from '@/components/site/editor/PublishCheck';
import { buildGuidedSections, sobreDasRespostas } from '@/components/site/editor/GuidedSetup';
import { faqJsonLd } from '@/components/site/sections/Faq';
import { socialLinks } from '@/components/site/sections/Social';
import { SITE_STYLES, applySiteStyle } from '@/components/site/styles';
import { sectionCatalog } from '@/components/site/lib';
import type { SiteSection } from '@/components/site/types';

const SITE = { id: 's1', slug: 'casa-de-oxala', status: 'DRAFT', template: 'moderno', meta_title: null, meta_description: null, updated_at: '2026-11-17T10:00:00' };

function mockApi(sections: unknown[]) {
  const { apiClient } = require('@/services/api_client');
  apiClient.get.mockImplementation((url: string) => {
    if (url.includes('/admin/sites/sections')) return Promise.resolve({ data: { sections, site_updated_at: SITE.updated_at } });
    if (url.includes('/admin/sites/versions')) return Promise.resolve({ data: [] });
    if (url.includes('/admin/sites')) return Promise.resolve({ data: SITE });
    if (url.includes('/tenant/branding')) return Promise.resolve({ data: { tenant_nome: 'Casa de Oxalá', primary_color: '#4f46e5', secondary_color: '#818cf8' } });
    if (url.includes('/tenant/config')) return Promise.resolve({ data: { endereco: 'Rua A, 10', reply_to_email: 'casa@exemplo.org' } });
    return Promise.resolve({ data: [] });
  });
  apiClient.put.mockResolvedValue({ data: { sections, site_updated_at: SITE.updated_at } });
}

const RESPOSTAS = {
  nome: 'Casa de Oxalá',
  endereco: 'Rua A, 10',
  email: '',
  whatsapp: '',
  tradicao: 'Umbanda',
  ofertas: ['giras de atendimento', 'cursos e estudos'],
  rotina: [{ dia: 'Sábado', hora: '19h', nome: 'Gira de atendimento' }],
  instagram: '@casa',
  youtube: '',
  facebook: '',
};

describe('funções do novo construtor', () => {
  it('o "Sobre" só usa as respostas da casa', () => {
    expect(sobreDasRespostas(RESPOSTAS)).toBe('Casa de Oxalá é uma casa de Umbanda. Aqui acontecem giras de atendimento e cursos e estudos.');
    expect(sobreDasRespostas({ nome: 'X', tradicao: '', ofertas: [] })).toBe('');
  });

  it('o começo guiado monta rotina, redes e aplica o estilo', () => {
    const drafts = buildGuidedSections(null, RESPOSTAS, SITE_STYLES[0]);
    const tipos = drafts.map((d) => d.section_type);
    expect(tipos).toEqual(['HERO', 'ABOUT', 'ROTINA', 'GIRAS_CALENDAR', 'LOCATION', 'CONTACT', 'SOCIAL']);
    expect(drafts[0].config.site_style).toBe('terra');
    expect(drafts[1].config.title_font_family).toBe("'Fraunces', serif");
  });

  it('aplicar estilo não mexe em texto nem ordem e alterna os fundos', () => {
    const base: SiteSection[] = [
      { id: 'h', section_type: 'HERO', order_index: 0, config: { title: 'Casa' } },
      { id: 'a', section_type: 'ABOUT', order_index: 1, config: { body: 'Texto', font_color: '#123456' } },
      { id: 'c', section_type: 'CONTACT', order_index: 2, config: {} },
    ];
    const out = applySiteStyle(base, SITE_STYLES[1]);
    expect(out.map((s) => s.id)).toEqual(['h', 'a', 'c']);
    expect(out[1].config.body).toBe('Texto');
    expect(out[1].config.font_color).toBeUndefined();
    expect(out[1].config.bg_color).toBe(SITE_STYLES[1].bg);
    expect(out[2].config.bg_color).toBe(SITE_STYLES[1].bgAlt);
  });

  it('a capa com foto mantém a foto ao trocar de estilo', () => {
    const out = applySiteStyle([{ id: 'h', section_type: 'HERO', order_index: 0, config: { bg_type: 'image', bg_image_url: '/img/1' } }], SITE_STYLES[0]);
    expect(out[0].config.bg_type).toBe('image');
  });

  it('FAQ: JSON-LD só com pergunta respondida e sem "<" cru', () => {
    expect(faqJsonLd([{ pergunta: 'Preciso marcar?', resposta: '' }])).toBeNull();
    const ld = faqJsonLd([{ pergunta: 'Pode <b>?', resposta: 'Sim' }])!;
    expect(ld).not.toContain('<');
    expect(JSON.parse(ld).mainEntity[0].acceptedAnswer.text).toBe('Sim');
  });

  it('redes aceitam @usuário ou link', () => {
    const links = socialLinks({ instagram: '@casa', youtube: 'https://youtube.com/@x', whatsapp: '(11) 99999-0000' });
    expect(links.map((l) => l.href)).toEqual(['https://instagram.com/casa', 'https://youtube.com/@x', 'https://wa.me/5511999990000']);
  });

  it('as seções novas só aparecem na galeria com a beta ligada', () => {
    expect(sectionCatalog(false).some((e) => e.type === 'FAQ')).toBe(false);
    expect(sectionCatalog(true).some((e) => e.type === 'FAQ')).toBe(true);
  });

  it('a conferência avisa mas só bloqueia em erro', () => {
    const sections: SiteSection[] = [
      { id: 'h', section_type: 'HERO', order_index: 0, config: { title: '' } },
      { id: 'f', section_type: 'FAQ', order_index: 1, config: { items: [{ pergunta: 'Roupa?', resposta: '' }] } },
    ];
    const items = buildChecklist(SITE, sections, { h: ['A capa precisa de um título.'] });
    expect(items.filter((i) => i.level === 'erro')).toHaveLength(1);
    expect(items.some((i) => i.text.includes('sem resposta'))).toBe(true);
    expect(items.some((i) => i.text.includes('descrição para o Google'))).toBe(true);
  });
});

describe('SiteEditor com a beta ligada', () => {
  beforeEach(() => jest.clearAllMocks());

  it('site vazio abre o começo guiado com os dados da casa', async () => {
    mockApi([]);
    render(<SiteEditor canEdit canInsert novo />);
    expect(await screen.findByTestId('guided-setup')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByLabelText('Nome da casa')).toHaveValue('Casa de Oxalá'));
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /Continuar/ }));
    // Nada vem marcado.
    expect(screen.getAllByRole('checkbox').every((c) => c.getAttribute('aria-checked') === 'false')).toBe(true);
  });

  it('clicar na prévia seleciona a seção; editar o título e desfazer', async () => {
    mockApi([{ id: 'sec-hero', section_type: 'HERO', order_index: 0, config: { title: 'Casa de Oxalá' } }]);
    render(<SiteEditor canEdit canInsert novo />);
    const preview = await screen.findByTestId('site-preview');
    const frame = preview.querySelector('[data-edit-frame="sec-hero"]') as HTMLElement;
    fireEvent.click(frame);
    expect(await screen.findByTestId('section-editor')).toBeInTheDocument();
    expect(within(preview).getByRole('toolbar', { name: /Ações da seção Capa/ })).toBeInTheDocument();

    const title = preview.querySelector('[data-inline-text="title"]') as HTMLElement;
    title.innerText = 'Casa Nova';
    fireEvent.input(title);
    await waitFor(() => expect(screen.getByDisplayValue('Casa Nova')).toBeInTheDocument());

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Desfazer' }));
    await waitFor(() => expect(screen.getByDisplayValue('Casa de Oxalá')).toBeInTheDocument());
  });

  it('"Publicar site" abre a conferência antes de publicar', async () => {
    mockApi([{ id: 'sec-hero', section_type: 'HERO', order_index: 0, config: { title: 'Casa de Oxalá' } }]);
    render(<SiteEditor canEdit canInsert novo />);
    const user = userEvent.setup();
    await user.click(await screen.findByTestId('publish-button'));
    expect(await screen.findByText('No Google')).toBeInTheDocument();
    expect(screen.getByTestId('publish-confirm')).toBeEnabled();
  });
});
