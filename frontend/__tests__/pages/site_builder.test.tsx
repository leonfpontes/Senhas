/**
 * Site Builder — testes de regressão
 * - meu-site.tsx (editor, shadcn)
 * - [tenantSlug]/index.tsx (site público, SSR)
 * - validateSection (mesmas regras do backend)
 */
import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// ── Mocks globais ─────────────────────────────────────────────────────────────

jest.mock('next/router', () => ({
  useRouter: () => ({
    push: jest.fn(),
    pathname: '/admin/meu-site',
    query: {},
    asPath: '/admin/meu-site',
    events: { on: jest.fn(), off: jest.fn(), emit: jest.fn() },
  }),
}));

jest.mock('next/link', () => {
  return ({ children, href }: any) => <a href={href}>{children}</a>;
});

jest.mock('next/head', () => {
  return ({ children }: any) => <>{children}</>;
});

jest.mock('@/services/api_client', () => ({
  apiClient: {
    get: jest.fn().mockResolvedValue({ data: {} }),
    post: jest.fn().mockResolvedValue({ data: {} }),
    put: jest.fn().mockResolvedValue({ data: {} }),
    delete: jest.fn().mockResolvedValue({ data: {} }),
  },
  extractApiErrorMessage: (_e: unknown, fallback: string) => fallback,
}));

jest.mock('@/hooks/useSubscription', () => ({
  useSubscription: jest.fn(() => ({
    subscription: { plan: 'PRO', features: { site_builder: true } },
    can: (feature: string) => feature === 'site_builder',
    planLabel: 'Pro',
  })),
}));

jest.mock('@/hooks/usePermissions', () => ({
  usePermissions: () => ({ can: () => true, permissions: null, loading: false, refresh: jest.fn() }),
}));

jest.mock('@/pages/admin/admin_layout', () => {
  return function MockAdminLayout({ children }: any) {
    return <div data-testid="admin-layout">{children}</div>;
  };
});

const SITE_DATA = {
  id: 'site-uuid',
  slug: 'terreiro-test',
  status: 'DRAFT',
  template: 'moderno',
  meta_title: 'Terreiro Test',
  meta_description: null,
  updated_at: '2026-04-14T12:00:00Z',
};

const SECTIONS_DATA = {
  sections: [
    { id: 'section-uuid-1', section_type: 'HERO', order_index: 0, config: { title: 'Bem-vindo' } },
    { id: 'section-uuid-2', section_type: 'ABOUT', order_index: 1, config: { body: 'Sobre nós' } },
  ],
  site_updated_at: '2026-04-14T12:00:00Z',
};

function mockApi(site = SITE_DATA, sections = SECTIONS_DATA, versions: unknown[] = []) {
  const { apiClient } = require('@/services/api_client');
  apiClient.get.mockImplementation((url: string) => {
    if (url.includes('/sites/sections')) return Promise.resolve({ data: sections });
    if (url.includes('/sites/images')) return Promise.resolve({ data: [] });
    if (url.includes('/sites/versions')) return Promise.resolve({ data: versions });
    if (url.includes('/admin/sites')) return Promise.resolve({ data: site });
    return Promise.resolve({ data: {} });
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// meu-site.tsx — editor
// ═══════════════════════════════════════════════════════════════════════════════

describe('MeuSitePage — Admin Site Builder', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockApi();
  });

  it('renderiza sem erros', async () => {
    const MeuSite = require('@/pages/admin/meu-site').default;
    render(<MeuSite />);
    expect(await screen.findByRole('heading', { name: 'Meu Site' })).toBeInTheDocument();
  });

  it('exibe indicador de carregamento durante fetch inicial', () => {
    const { apiClient } = require('@/services/api_client');
    apiClient.get.mockImplementation(() => new Promise(() => {}));
    const MeuSite = require('@/pages/admin/meu-site').default;
    render(<MeuSite />);
    expect(screen.getByTestId('site-editor-loading')).toBeInTheDocument();
  });

  it('mostra o bloqueio de plano quando não tem site_builder', () => {
    const { useSubscription } = require('@/hooks/useSubscription');
    useSubscription.mockReturnValueOnce({
      subscription: { plan: 'FREE', features: { site_builder: false } },
      can: () => false,
      planLabel: 'Free',
    });
    const MeuSite = require('@/pages/admin/meu-site').default;
    render(<MeuSite />);
    expect(screen.getByText('Recurso indisponível')).toBeInTheDocument();
    expect(screen.queryByTestId('site-editor')).not.toBeInTheDocument();
  });

  it('carrega e lista as seções após o fetch', async () => {
    const MeuSite = require('@/pages/admin/meu-site').default;
    render(<MeuSite />);
    const list = await screen.findByRole('list', { name: 'Seções do site' });
    expect(within(list).getByRole('button', { name: 'Editar Capa' })).toBeInTheDocument();
    expect(within(list).getByRole('button', { name: 'Editar Sobre o terreiro' })).toBeInTheDocument();
  });

  it('exibe "Publicar site" e o estado Rascunho quando o site está em DRAFT', async () => {
    const MeuSite = require('@/pages/admin/meu-site').default;
    render(<MeuSite />);
    expect(await screen.findByTestId('site-status')).toHaveTextContent('Rascunho');
    expect(screen.getByRole('button', { name: /Publicar site/ })).toBeInTheDocument();
  });

  it('exibe "Publicado e atualizado" e Despublicar no menu quando PUBLISHED', async () => {
    mockApi({ ...SITE_DATA, status: 'PUBLISHED' });
    const MeuSite = require('@/pages/admin/meu-site').default;
    render(<MeuSite />);
    expect(await screen.findByTestId('site-status')).toHaveTextContent('Publicado e atualizado');
    expect(screen.getByRole('button', { name: /Publicar alterações/ })).toBeDisabled();

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Mais ações' }));
    await user.click(await screen.findByRole('menuitem', { name: /Despublicar/ }));
    // Pede confirmação antes de tirar o site do ar.
    expect(await screen.findByRole('alertdialog')).toHaveTextContent('Despublicar site');
    const { apiClient: mockApiClient } = require('@/services/api_client');
    expect(mockApiClient.post).not.toHaveBeenCalledWith('/api/v1/admin/sites/unpublish');
    await user.click(screen.getByRole('button', { name: 'Despublicar' }));
    await waitFor(() => expect(mockApiClient.post).toHaveBeenCalledWith('/api/v1/admin/sites/unpublish'));
  });

  it('exibe o histórico de versões na aba Histórico', async () => {
    mockApi(SITE_DATA, SECTIONS_DATA, [
      { id: 'ver-uuid-1', label: 'Primeira versão', snapshot: [], created_by: 'admin', created_at: '2026-04-14T11:00:00Z' },
    ]);
    const MeuSite = require('@/pages/admin/meu-site').default;
    render(<MeuSite />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('tab', { name: 'Histórico' }));
    expect(await screen.findByText('Primeira versão')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Restaurar/ })).toBeInTheDocument();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// validateSection
// ═══════════════════════════════════════════════════════════════════════════════

describe('validateSection', () => {
  const { validateSection } = require('@/pages/admin/meu-site');

  it('retorna erro para Hero sem título', () => {
    const errors = validateSection({ id: '1', section_type: 'HERO', order_index: 0, config: { title: '' } });
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]).toMatch(/título/i);
  });

  it('retorna vazio para Hero com título', () => {
    expect(validateSection({ id: '1', section_type: 'HERO', order_index: 0, config: { title: 'Bem-vindo' } })).toHaveLength(0);
  });

  it('retorna erro para VIDEO_EMBED com URL do Vimeo', () => {
    const errors = validateSection({ id: '1', section_type: 'VIDEO_EMBED', order_index: 0, config: { youtube_url: 'https://vimeo.com/12345' } });
    expect(errors.length).toBeGreaterThan(0);
  });

  it('retorna vazio para VIDEO_EMBED com URL válida do YouTube', () => {
    expect(
      validateSection({ id: '1', section_type: 'VIDEO_EMBED', order_index: 0, config: { youtube_url: 'https://www.youtube.com/embed/dQw4w9WgXcQ' } }),
    ).toHaveLength(0);
  });

  it('retorna vazio para ABOUT (sem validações obrigatórias)', () => {
    expect(validateSection({ id: '1', section_type: 'ABOUT', order_index: 0, config: {} })).toHaveLength(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// [tenantSlug]/index.tsx — site público
// ═══════════════════════════════════════════════════════════════════════════════

describe('TenantPublicSitePage — seções', () => {
  const PUBLIC_SITE_DATA = {
    id: 'site-uuid',
    slug: 'terreiro-test',
    status: 'PUBLISHED',
    template: 'moderno',
    meta_title: 'Terreiro Oxalá',
    meta_description: 'O terreiro mais acolhedor',
    sections: [
      { id: 's1', section_type: 'HERO', order_index: 0, config: { title: 'Bem-vindo ao Terreiro Oxalá', subtitle: 'Amor e Luz' } },
      { id: 's2', section_type: 'ABOUT', order_index: 1, config: { body: 'Somos um espaço de paz.' } },
      { id: 's3', section_type: 'LOCATION', order_index: 2, config: { address: 'Rua das Palmeiras, 123', maps_url: '' } },
      { id: 's4', section_type: 'CONTACT', order_index: 3, config: { phone: '11999998888', email: 'contato@terreiro.com' } },
    ],
    upcoming_giras: [
      { id: 'gira-uuid-1', nome: 'Gira de Oxalá', data_hora: new Date().toISOString(), descricao: 'Gira especial', has_tickets: true, has_sponsor_tickets: false },
    ],
  };
  const Page = () => require('@/pages/[tenantSlug]/index').default;

  it('renderiza a página pública sem erros', () => {
    const TenantPublicSitePage = Page();
    const { container } = render(<TenantPublicSitePage site={PUBLIC_SITE_DATA} />);
    expect(container).toBeTruthy();
  });

  it('exibe título e subtítulo da capa', () => {
    const TenantPublicSitePage = Page();
    render(<TenantPublicSitePage site={PUBLIC_SITE_DATA} />);
    expect(screen.getByRole('heading', { level: 1, name: 'Bem-vindo ao Terreiro Oxalá' })).toBeInTheDocument();
    expect(screen.getByText('Amor e Luz')).toBeInTheDocument();
  });

  it('exibe texto da seção Sobre', () => {
    const TenantPublicSitePage = Page();
    render(<TenantPublicSitePage site={PUBLIC_SITE_DATA} />);
    expect(screen.getByText('Somos um espaço de paz.')).toBeInTheDocument();
  });

  it('exibe seção de localização com endereço', () => {
    const TenantPublicSitePage = Page();
    render(<TenantPublicSitePage site={PUBLIC_SITE_DATA} />);
    expect(screen.getByText('Rua das Palmeiras, 123')).toBeInTheDocument();
  });

  it('exibe as próximas giras na seção de calendário (SSR, lista do celular e bloco do computador)', () => {
    const siteWithCalendar = {
      ...PUBLIC_SITE_DATA,
      sections: [...PUBLIC_SITE_DATA.sections, { id: 's5', section_type: 'GIRAS_CALENDAR', order_index: 4, config: { display_mode: 'list' } }],
    };
    const TenantPublicSitePage = Page();
    render(<TenantPublicSitePage site={siteWithCalendar} />);
    expect(within(screen.getByTestId('giras-mobile')).getByText('Gira de Oxalá')).toBeInTheDocument();
    expect(within(screen.getByTestId('giras-desktop')).getByText('Gira de Oxalá')).toBeInTheDocument();
  });

  it('renderiza seção de vídeo com iframe youtube-nocookie', () => {
    const siteWithVideo = {
      ...PUBLIC_SITE_DATA,
      sections: [{ id: 's-video', section_type: 'VIDEO_EMBED', order_index: 0, config: { youtube_url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' } }],
      upcoming_giras: [],
    };
    const TenantPublicSitePage = Page();
    const { container } = render(<TenantPublicSitePage site={siteWithVideo} />);
    const iframe = container.querySelector('iframe');
    expect(iframe?.getAttribute('src')).toContain('youtube-nocookie.com/embed/dQw4w9WgXcQ');
  });

  it('mostra estado vazio visível quando o site não tem seções', () => {
    const emptySite = { ...PUBLIC_SITE_DATA, sections: [], upcoming_giras: [] };
    const TenantPublicSitePage = Page();
    render(<TenantPublicSitePage site={emptySite} />);
    expect(screen.getByRole('status')).toHaveTextContent(/ainda está montando o site/);
  });

  it('exibe footer "Powered by GiraHub"', () => {
    const TenantPublicSitePage = Page();
    render(<TenantPublicSitePage site={PUBLIC_SITE_DATA} />);
    expect(screen.getByText(/Powered by/)).toBeInTheDocument();
  });

  it('mostra "Site em preparação" quando o site é null', () => {
    const TenantPublicSitePage = Page();
    render(<TenantPublicSitePage site={null} />);
    expect(screen.getByRole('heading', { name: /Site em preparação/ })).toBeInTheDocument();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// getServerSideProps
// ═══════════════════════════════════════════════════════════════════════════════

describe('getServerSideProps', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  it('retorna site null quando API retorna 404', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 404 }) as any;
    const { getServerSideProps } = require('@/pages/[tenantSlug]/index');
    const result = await getServerSideProps({ params: { tenantSlug: 'nao-existe' } } as any);
    // Sem site e sem terreiro (agenda também 404): "Site em preparação".
    expect(result).toEqual({ props: { site: null, agenda: null } });
  });

  it('sem site publicado, mas com terreiro: props.agenda com as próximas giras', async () => {
    const AGENDA = { tenant_name: 'T', tenant_slug: 'terreiro-test', logo_url: null, primary_color: null, secondary_color: null, upcoming_giras: [] };
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 404 })
      .mockResolvedValueOnce({ ok: true, json: async () => AGENDA }) as any;
    const { getServerSideProps } = require('@/pages/[tenantSlug]/index');
    const result = (await getServerSideProps({ params: { tenantSlug: 'terreiro-test' } } as any)) as any;
    expect(result).toEqual({ props: { site: null, agenda: AGENDA } });
    expect((global.fetch as jest.Mock).mock.calls[1][0]).toMatch(/\/api\/v1\/public\/agenda\/terreiro-test$/);
  });

  it('retorna props.site quando API retorna sucesso', async () => {
    const PUBLIC_SITE = { id: 'x', slug: 'terreiro-test', status: 'PUBLISHED', template: 'moderno', meta_title: null, meta_description: null, sections: [], upcoming_giras: [] };
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => PUBLIC_SITE }) as any;
    const { getServerSideProps } = require('@/pages/[tenantSlug]/index');
    const result = (await getServerSideProps({ params: { tenantSlug: 'terreiro-test' } } as any)) as any;
    expect(result?.props?.site?.slug).toBe('terreiro-test');
    expect((global.fetch as jest.Mock).mock.calls[0][0]).toMatch(/\/api\/v1\/public\/sites\/terreiro-test$/);
  });

  it('retorna site null quando ocorre erro de rede', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('Network error')) as any;
    const { getServerSideProps } = require('@/pages/[tenantSlug]/index');
    const result = await getServerSideProps({ params: { tenantSlug: 'terreiro-test' } } as any);
    expect(result).toEqual({ props: { site: null, agenda: null } });
  });

  afterAll(() => {
    jest.resetModules();
  });
});
