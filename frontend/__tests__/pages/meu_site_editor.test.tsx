/**
 * /admin/meu-site — editor: assistente quando vazio, "Publicar alterações"
 * (salva e publica), confirmação ao excluir seção, guards de permissão.
 */
import React from 'react';
import { render, screen, waitFor, within, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

jest.mock('next/router', () => ({
  useRouter: () => ({
    push: jest.fn(),
    pathname: '/admin/meu-site',
    query: {},
    asPath: '/admin/meu-site',
    events: { on: jest.fn(), off: jest.fn(), emit: jest.fn() },
  }),
}));
jest.mock('next/head', () => {
  return ({ children }: any) => <>{children}</>;
});
jest.mock('next/link', () => {
  return ({ children, href }: any) => <a href={href}>{children}</a>;
});

jest.mock('@/services/api_client', () => ({
  apiClient: { get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn() },
  extractApiErrorMessage: (_e: unknown, fallback: string) => fallback,
}));

let mockCanFeature = true;
jest.mock('@/hooks/useSubscription', () => ({
  useSubscription: () => ({ can: () => mockCanFeature, loading: false, planLabel: 'Pro' }),
}));

let mockPerms: Record<string, boolean> = { view: true, insert: true, edit: true, delete: true };
jest.mock('@/hooks/usePermissions', () => ({
  usePermissions: () => ({ can: (_f: string, action: string) => !!mockPerms[action], loading: false }),
}));

jest.mock('@/pages/admin/admin_layout', () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => <div data-testid="admin-layout">{children}</div>,
}));

import MeuSitePage from '@/pages/admin/meu-site';

const SITE = {
  id: 'site-1',
  slug: 'casa-de-oxala',
  status: 'DRAFT',
  template: 'moderno',
  meta_title: null,
  meta_description: null,
  updated_at: '2026-10-01T10:00:00',
};

const SECTIONS = {
  sections: [
    { id: 'sec-hero', section_type: 'HERO', order_index: 0, config: { title: 'Casa de Oxalá' } },
    { id: 'sec-contact', section_type: 'CONTACT', order_index: 1, config: { phone: '11999990000' } },
  ],
  site_updated_at: '2026-10-01T10:00:00',
};

function mockApi({ site = SITE, sections = SECTIONS as { sections: unknown[]; site_updated_at: string } } = {}) {
  const { apiClient } = require('@/services/api_client');
  apiClient.get.mockImplementation((url: string) => {
    if (url.includes('/admin/sites/sections')) return Promise.resolve({ data: sections });
    if (url.includes('/admin/sites/versions')) return Promise.resolve({ data: [] });
    if (url.includes('/admin/sites/images')) return Promise.resolve({ data: [] });
    if (url.includes('/admin/sites')) return Promise.resolve({ data: site });
    if (url.includes('/tenant/branding')) return Promise.resolve({ data: { tenant_nome: 'Casa de Oxalá', logo_url: null, primary_color: '#0f172a', secondary_color: '#ec4899' } });
    if (url.includes('/tenant/config')) return Promise.reject({ response: { status: 403 } });
    if (url.includes('/admin/giras')) return Promise.resolve({ data: [] });
    return Promise.resolve({ data: {} });
  });
  apiClient.put.mockResolvedValue({ data: sections });
  apiClient.post.mockResolvedValue({ data: { ...site, status: 'PUBLISHED' } });
}

describe('Meu Site — editor', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCanFeature = true;
    mockPerms = { view: true, insert: true, edit: true, delete: true };
    mockApi();
  });

  it('mostra o assistente quando o site não tem seções e cria o site pré-preenchido', async () => {
    mockApi({ sections: { sections: [], site_updated_at: SITE.updated_at } });
    render(<MeuSitePage />);
    expect(await screen.findByTestId('setup-wizard')).toBeInTheDocument();
    expect(screen.getByText(/Vamos montar seu site/)).toBeInTheDocument();

    const create = await screen.findByRole('button', { name: /Criar meu site/ });
    await waitFor(() => expect(create).toBeEnabled());
    // o nome do terreiro vindo da API aparece no resumo
    expect(screen.getByText('Casa de Oxalá')).toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(create);

    const list = await screen.findByRole('list', { name: 'Seções do site' });
    expect(within(list).getByRole('button', { name: 'Editar Capa' })).toBeInTheDocument();
    expect(within(list).getByRole('button', { name: 'Editar Próximas giras' })).toBeInTheDocument();
    expect(within(list).getByRole('button', { name: 'Editar Como chegar' })).toBeInTheDocument();
    expect(within(list).getByRole('button', { name: 'Editar Contato' })).toBeInTheDocument();
    expect(screen.queryByTestId('setup-wizard')).not.toBeInTheDocument();
  });

  it('"Começar do zero" fecha o assistente e abre a galeria com miniaturas', async () => {
    mockApi({ sections: { sections: [], site_updated_at: SITE.updated_at } });
    render(<MeuSitePage />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: /Começar do zero/ }));
    const gallery = await screen.findByRole('list', { name: 'Galeria de seções' });
    expect(within(gallery).getByRole('button', { name: 'Adicionar Capa' })).toBeInTheDocument();
    expect(within(gallery).getByText(/botão "Retirar senha"/)).toBeInTheDocument();
    await user.click(within(gallery).getByRole('button', { name: 'Adicionar Texto livre' }));
    expect(await screen.findByRole('button', { name: 'Editar Texto livre' })).toBeInTheDocument();
  });

  it('"Publicar site" salva as alterações pendentes (PUT /sections) e publica (POST /publish)', async () => {
    const { apiClient } = require('@/services/api_client');
    render(<MeuSitePage />);
    const user = userEvent.setup();

    // edita o título da capa → alteração pendente
    await user.click(await screen.findByRole('button', { name: 'Editar Capa' }));
    const title = await screen.findByLabelText(/^Título/);
    await user.clear(title);
    await user.type(title, 'Casa de Oxalá e Caboclos');

    await user.click(screen.getByRole('button', { name: /Publicar site/ }));

    await waitFor(() => expect(apiClient.post).toHaveBeenCalledWith('/api/v1/admin/sites/publish'));
    const putCall = apiClient.put.mock.calls.find((c: unknown[]) => c[0] === '/api/v1/admin/sites/sections');
    expect(putCall).toBeTruthy();
    expect(putCall[1].sections[0].config.title).toBe('Casa de Oxalá e Caboclos');
    expect(putCall[1].site_version).toBe(SITE.updated_at);
    expect(await screen.findByTestId('site-status')).toHaveTextContent('Publicado e atualizado');
  });

  it('com o site publicado, editar mostra "Alterações não publicadas" e o botão "Publicar alterações" salva sem repetir /publish', async () => {
    const { apiClient } = require('@/services/api_client');
    mockApi({ site: { ...SITE, status: 'PUBLISHED' } });
    render(<MeuSitePage />);
    const user = userEvent.setup();
    expect(await screen.findByTestId('site-status')).toHaveTextContent('Publicado e atualizado');

    await user.click(screen.getByRole('button', { name: 'Editar Capa' }));
    await user.type(await screen.findByLabelText(/^Título/), '!');
    expect(screen.getByTestId('site-status')).toHaveTextContent('Rascunho com alterações não publicadas');

    await user.click(screen.getByRole('button', { name: /Publicar alterações/ }));
    await waitFor(() => expect(apiClient.put).toHaveBeenCalledWith('/api/v1/admin/sites/sections', expect.anything()));
    expect(apiClient.post).not.toHaveBeenCalledWith('/api/v1/admin/sites/publish');
    expect(await screen.findByTestId('site-status')).toHaveTextContent('Publicado e atualizado');
  });

  it('bloqueia a publicação com erro de validação e avisa inline', async () => {
    mockApi({ sections: { sections: [{ id: 'sec-hero', section_type: 'HERO', order_index: 0, config: { title: '' } }], site_updated_at: SITE.updated_at } });
    render(<MeuSitePage />);
    expect(await screen.findByText('Corrija 1 erro para publicar')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Publicar site/ })).toBeDisabled();
  });

  it('excluir seção pede confirmação e só remove depois de confirmar', async () => {
    render(<MeuSitePage />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Excluir Contato' }));

    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveTextContent(/Excluir a seção/);
    await user.click(within(dialog).getByRole('button', { name: 'Cancelar' }));
    expect(screen.getByRole('button', { name: 'Editar Contato' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Excluir Contato' }));
    await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Excluir' }));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Editar Contato' })).not.toBeInTheDocument());
  });

  it('salva automaticamente o rascunho (debounce) quando o site não está publicado', async () => {
    jest.useFakeTimers();
    const { apiClient } = require('@/services/api_client');
    render(<MeuSitePage />);
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    await user.click(await screen.findByRole('button', { name: 'Editar Capa' }));
    await user.type(await screen.findByLabelText(/^Título/), '!');
    expect(apiClient.put).not.toHaveBeenCalled();
    await act(async () => {
      jest.advanceTimersByTime(2000);
    });
    await waitFor(() => expect(apiClient.put).toHaveBeenCalledWith('/api/v1/admin/sites/sections', expect.anything()));
    jest.useRealTimers();
  });

  it('sem permissão de edição esconde publicar, adicionar e excluir', async () => {
    mockPerms = { view: true, insert: false, edit: false, delete: false };
    render(<MeuSitePage />);
    expect(await screen.findByRole('button', { name: 'Editar Capa' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Publicar/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Adicionar seção/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Excluir Contato' })).not.toBeInTheDocument();
    expect(screen.getByText(/somente leitura/i)).toBeInTheDocument();
  });

  it('sem permissão de view mostra o aviso e não chama a API', async () => {
    mockPerms = { view: false };
    const { apiClient } = require('@/services/api_client');
    render(<MeuSitePage />);
    expect(await screen.findByText(/não tem permissão para visualizar o Meu Site/)).toBeInTheDocument();
    expect(apiClient.get).not.toHaveBeenCalled();
  });

  it('sem feature no plano mostra o PlanLocked', () => {
    mockCanFeature = false;
    render(<MeuSitePage />);
    expect(screen.getByText('Recurso indisponível')).toBeInTheDocument();
  });
});
