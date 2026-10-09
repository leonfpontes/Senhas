/**
 * AM-21 — /admin/materiais ("Estudos e documentos"): gates (chave do piloto neutra, PlanLocked
 * sem `biblioteca_medium`, grupo COMUNICADOS), ações só com permissão, formulário por tipo (link
 * obrigatório, `javascript:` barrado na tela, aviso do PDF pelo Drive), público por grupos e
 * reordenar com as setas.
 */
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

jest.mock('next/router', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), pathname: '/admin/materiais', query: {}, asPath: '/admin/materiais' }),
}));
jest.mock('next/link', () => ({ children, href }: any) => <a href={href}>{children}</a>);

const mockGet = jest.fn();
const mockPost = jest.fn();
const mockPut = jest.fn();
const mockDelete = jest.fn();
jest.mock('@/services/api_client', () => ({
  apiClient: {
    get: (...a: unknown[]) => mockGet(...a),
    post: (...a: unknown[]) => mockPost(...a),
    put: (...a: unknown[]) => mockPut(...a),
    delete: (...a: unknown[]) => mockDelete(...a),
  },
  extractApiErrorMessage: (_e: unknown, fallback: string) => fallback,
}));
jest.mock('@/pages/admin/admin_layout', () => ({
  __esModule: true,
  default: ({ children }: any) => <div>{children}</div>,
}));
const mockPlanCan = jest.fn((_f: string) => true);
jest.mock('@/hooks/useSubscription', () => ({
  useSubscription: () => ({ can: mockPlanCan, subscription: { plan: 'pro' }, loading: false }),
}));
const mockGroupCan = jest.fn((_f: string, _a: string) => true);
jest.mock('@/hooks/usePermissions', () => ({
  usePermissions: () => ({ can: mockGroupCan, permissions: null, loading: false, refresh: jest.fn() }),
}));
const mockSuccess = jest.fn();
jest.mock('@/contexts/SnackbarContext', () => ({
  useSnackbar: () => ({ showSuccess: mockSuccess, showError: jest.fn() }),
}));

const base = { created_at: '2026-10-08T12:00:00Z', updated_at: '2026-10-08T12:00:00Z', grupos: [] };
const ITENS = [
  {
    ...base,
    id: 'm1',
    titulo: 'Apostila do desenvolvimento',
    tipo: 'link',
    url: 'https://drive.google.com/file/d/x/view',
    texto: null,
    fonte: 'drive',
    youtube_id: null,
    categoria: 'Fundamentos',
    publico: 'todos',
    ordem: 0,
    publicado: true,
  },
  {
    ...base,
    id: 'm2',
    titulo: 'Ponto de Ogum',
    tipo: 'ponto',
    url: null,
    texto: 'Ogum ê',
    fonte: null,
    youtube_id: null,
    categoria: 'Pontos cantados',
    publico: 'cambones',
    ordem: 1,
    publicado: false,
  },
];
const RESPOSTA = {
  itens: ITENS,
  categorias: ['Estudos', 'Pontos cantados', 'Fundamentos', 'Rezas', 'Avisos gerais'],
  limite: 300,
};

function setup() {
  mockGet.mockImplementation((url: string) => {
    if (url === '/api/v1/admin/materiais') return Promise.resolve({ data: RESPOSTA });
    if (url === '/api/v1/admin/corrente-grupos/opcoes')
      return Promise.resolve({ data: [{ id: 'g1', nome: 'G1', cor: 'ambar', total_membros: 4 }] });
    return Promise.resolve({ data: {} });
  });
  const Page = require('@/pages/admin/materiais').default;
  return render(<Page />);
}

beforeEach(() => {
  jest.clearAllMocks();
  mockPlanCan.mockImplementation(() => true);
  mockGroupCan.mockImplementation(() => true);
  mockPost.mockResolvedValue({ data: {} });
  mockPut.mockResolvedValue({ data: RESPOSTA });
  mockDelete.mockResolvedValue({ data: {} });
});

describe('Estudos e documentos — gates', () => {
  it('sem area_medium: aviso neutro, sem oferta de plano e sem chamar a API', async () => {
    mockPlanCan.mockImplementation((f: string) => f !== 'area_medium');
    setup();
    expect(await screen.findByText('A Área do Médium ainda não está disponível para este terreiro.')).toBeInTheDocument();
    expect(screen.queryByText(/plano/i)).not.toBeInTheDocument();
    expect(mockGet).not.toHaveBeenCalled();
  });

  it('sem biblioteca_medium: PlanLocked com o plano mínimo do catálogo (Pro)', async () => {
    mockPlanCan.mockImplementation((f: string) => f !== 'biblioteca_medium');
    setup();
    expect((await screen.findAllByText(/Pro/)).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Estudos e documentos/).length).toBeGreaterThan(0);
    expect(mockGet).not.toHaveBeenCalled();
  });

  it('sem COMUNICADOS:view mostra PermissionDenied e não busca', async () => {
    mockGroupCan.mockImplementation(() => false);
    setup();
    expect(await screen.findByText('Você não tem permissão para visualizar este módulo.')).toBeInTheDocument();
    expect(mockGet).not.toHaveBeenCalled();
  });

  it('só view: lista sem criar, editar, excluir nem setas', async () => {
    mockGroupCan.mockImplementation((_f: string, a: string) => a === 'view');
    setup();
    expect((await screen.findAllByText('Apostila do desenvolvimento')).length).toBeGreaterThan(0);
    expect(screen.getAllByText('Rascunho').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Só cambones').length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: /Novo material/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Editar/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Excluir/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Subir/ })).not.toBeInTheDocument();
    expect(mockGroupCan).toHaveBeenCalledWith('comunicados', 'view');
  });
});

describe('Estudos e documentos — formulário e ordem', () => {
  it('link é obrigatório, javascript: é barrado e o aviso do PDF aparece', async () => {
    setup();
    await screen.findAllByText('Apostila do desenvolvimento');
    await userEvent.click(screen.getByRole('button', { name: /Novo material/ }));
    expect(screen.getByText(/PDF: use um link do Drive/)).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText(/Título/), 'Apostila nova');
    await userEvent.click(screen.getByRole('button', { name: 'Publicar' }));
    expect(await screen.findByText('Cole o link')).toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText('https://drive.google.com/...'), { target: { value: 'javascript:alert(1)' } });
    await userEvent.click(screen.getByRole('button', { name: 'Publicar' }));
    expect(await screen.findByText('Use um link que comece com http:// ou https://')).toBeInTheDocument();
    expect(mockPost).not.toHaveBeenCalled();

    fireEvent.change(screen.getByPlaceholderText('https://drive.google.com/...'), { target: { value: 'https://drive.google.com/file/d/y/view' } });
    await userEvent.click(screen.getByRole('button', { name: 'Pontos cantados' }));
    await userEvent.click(screen.getByRole('button', { name: 'Publicar' }));
    await waitFor(() => expect(mockPost).toHaveBeenCalled());
    expect(mockPost).toHaveBeenCalledWith('/api/v1/admin/materiais', {
      titulo: 'Apostila nova',
      tipo: 'link',
      url: 'https://drive.google.com/file/d/y/view',
      texto: null,
      categoria: 'Pontos cantados',
      publico: 'todos',
      publicado: true,
    });
  });

  it('ponto cantado pede a letra; público por grupos pede ao menos um grupo', async () => {
    setup();
    await screen.findAllByText('Apostila do desenvolvimento');
    await userEvent.click(screen.getByRole('button', { name: /Novo material/ }));
    await userEvent.click(screen.getByLabelText(/Ponto cantado/));
    await userEvent.type(screen.getByLabelText(/Título/), 'Ponto de Oxóssi');
    await userEvent.click(screen.getByRole('button', { name: 'Publicar' }));
    expect(await screen.findByText('Escreva a letra do ponto')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/Letra do ponto/), { target: { value: 'Okê arô' } });
    await userEvent.click(screen.getByLabelText(/Grupos da corrente/));
    await userEvent.click(screen.getByRole('button', { name: 'Publicar' }));
    expect(await screen.findByText('Escolha pelo menos um grupo')).toBeInTheDocument();
    expect(mockPost).not.toHaveBeenCalled();
  });

  it('as setas mandam a ordem nova', async () => {
    setup();
    await screen.findAllByText('Apostila do desenvolvimento');
    await userEvent.click(screen.getAllByRole('button', { name: 'Descer Apostila do desenvolvimento' })[0]);
    await waitFor(() =>
      expect(mockPut).toHaveBeenCalledWith('/api/v1/admin/materiais/ordem', { ids: ['m2', 'm1'] }),
    );
  });

  it('excluir pede confirmação e chama o DELETE', async () => {
    setup();
    await screen.findAllByText('Apostila do desenvolvimento');
    await userEvent.click(screen.getAllByRole('button', { name: 'Excluir Ponto de Ogum' })[0]);
    await userEvent.click(await screen.findByRole('button', { name: 'Excluir' }));
    await waitFor(() => expect(mockDelete).toHaveBeenCalledWith('/api/v1/admin/materiais/m2'));
  });
});
