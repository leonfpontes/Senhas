/**
 * /admin/estoque/grupos — tela piloto shadcn/Tailwind convivendo com o CrudDrawer do MUI.
 * Cobre: lista, vazio, carregando, sem permissão, guards de ação e exclusão via AlertDialog.
 */
import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';

jest.mock('next/router', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), pathname: '/admin/estoque/grupos', query: {}, isReady: true }),
}));

jest.mock('@/services/api_client', () => ({
  apiClient: {
    get: jest.fn(),
    post: jest.fn().mockResolvedValue({ data: {} }),
    put: jest.fn().mockResolvedValue({ data: {} }),
    delete: jest.fn().mockResolvedValue({ data: {} }),
  },
}));

jest.mock('@/pages/admin/admin_layout', () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => <div data-testid="admin-layout">{children}</div>,
}));

let mockCanFeature = true;
let mockSubLoading = false;
jest.mock('@/hooks/useSubscription', () => ({
  useSubscription: () => ({ can: () => mockCanFeature, loading: mockSubLoading, planLabel: 'Básico' }),
}));

let mockPerms: Record<string, boolean> = { view: true, insert: true, edit: true, delete: true };
jest.mock('@/hooks/usePermissions', () => ({
  usePermissions: () => ({ can: (_f: string, action: string) => !!mockPerms[action] }),
}));

const mockShowSuccess = jest.fn();
const mockShowError = jest.fn();
jest.mock('@/contexts/SnackbarContext', () => ({
  useSnackbar: () => ({ showSuccess: mockShowSuccess, showError: mockShowError, showInfo: jest.fn() }),
}));

jest.mock('@/components/CrudDrawer', () => ({
  __esModule: true,
  default: ({ children, open, title, onSave }: { children: React.ReactNode; open: boolean; title: string; onSave: () => void }) =>
    open ? (
      <div data-testid="crud-drawer" aria-label={title}>
        {children}
        <button onClick={onSave}>{`salvar: ${title}`}</button>
      </div>
    ) : null,
}));

import AdminEstoqueGruposPage from '@/pages/admin/estoque/grupos';

const GRUPOS = [
  { id: 'g1', nome: 'Velas', descricao: 'Velas de 7 dias e palito' },
  { id: 'g2', nome: 'Ervas', descricao: null },
];

describe('Admin Estoque — Grupos', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCanFeature = true;
    mockSubLoading = false;
    mockPerms = { view: true, insert: true, edit: true, delete: true };
    const { apiClient } = require('@/services/api_client');
    apiClient.get.mockResolvedValue({ data: GRUPOS });
  });

  it('lista os grupos com contador e ações', async () => {
    render(<AdminEstoqueGruposPage />);

    expect(await screen.findByText('Velas')).toBeInTheDocument();
    expect(screen.getByText('Ervas')).toBeInTheDocument();
    expect(screen.getByText('—')).toBeInTheDocument();
    expect(screen.getByText('2 grupos')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Novo Grupo/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Editar Velas' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Excluir Velas' })).toBeInTheDocument();
    expect(screen.getByText('Ações')).toBeInTheDocument();
    // data-tour preservados para o tour da tela
    expect(document.querySelector('[data-tour="estoque-grupos-header"]')).toBeInTheDocument();
    expect(document.querySelector('[data-tour="estoque-grupos-novo"]')).toBeInTheDocument();
    expect(document.querySelector('[data-tour="estoque-grupos-tabela"]')).toBeInTheDocument();
    // cores do terreiro chegam pelos tokens, não por cor fixa
    expect(screen.getByRole('button', { name: /Novo Grupo/ }).className).toMatch(/bg-primary/);
  });

  it('mostra o estado vazio quando não há grupos', async () => {
    const { apiClient } = require('@/services/api_client');
    apiClient.get.mockResolvedValue({ data: [] });
    render(<AdminEstoqueGruposPage />);

    expect(await screen.findByTestId('estoque-grupos-empty')).toBeInTheDocument();
    expect(screen.getByText('Nenhum grupo cadastrado. Crie o primeiro!')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('mostra skeleton enquanto carrega', () => {
    const { apiClient } = require('@/services/api_client');
    apiClient.get.mockReturnValue(new Promise(() => {}));
    render(<AdminEstoqueGruposPage />);
    expect(screen.getByTestId('estoque-grupos-loading')).toBeInTheDocument();
  });

  it('sem permissão de view mostra aviso e não chama a API', async () => {
    mockPerms = { view: false };
    const { apiClient } = require('@/services/api_client');
    render(<AdminEstoqueGruposPage />);

    expect(await screen.findByText(/não tem permissão para visualizar grupos/)).toBeInTheDocument();
    expect(apiClient.get).not.toHaveBeenCalled();
  });

  it('sem feature no plano mostra o UpgradePrompt', async () => {
    mockCanFeature = false;
    const { apiClient } = require('@/services/api_client');
    render(<AdminEstoqueGruposPage />);
    expect(screen.getByText('Recurso indisponível')).toBeInTheDocument();
    // o efeito de carga ainda roda (canView=true); espera resolver para não vazar act()
    await waitFor(() => expect(apiClient.get).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByText('Recurso indisponível')).toBeInTheDocument());
  });

  it('oculta botões de ação (não só desabilita) sem insert/edit/delete', async () => {
    mockPerms = { view: true };
    render(<AdminEstoqueGruposPage />);

    expect(await screen.findByText('Velas')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Novo Grupo/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Editar/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Excluir/ })).not.toBeInTheDocument();
    expect(screen.queryByText('Ações')).not.toBeInTheDocument();
  });

  it('abre o CrudDrawer do MUI e cria um grupo', async () => {
    const { apiClient } = require('@/services/api_client');
    render(<AdminEstoqueGruposPage />);
    await screen.findByText('Velas');

    fireEvent.click(screen.getByRole('button', { name: /Novo Grupo/ }));
    const drawer = screen.getByTestId('crud-drawer');
    expect(drawer).toHaveAttribute('aria-label', 'Novo Grupo');

    fireEvent.change(screen.getByLabelText(/Nome do grupo/), { target: { value: 'Bebidas' } });
    fireEvent.click(screen.getByText('salvar: Novo Grupo'));

    await waitFor(() =>
      expect(apiClient.post).toHaveBeenCalledWith('/api/v1/admin/estoque/grupos', { nome: 'Bebidas', descricao: null }),
    );
    expect(mockShowSuccess).toHaveBeenCalledWith('Grupo criado com sucesso!');
  });

  it('exclui via AlertDialog após confirmar', async () => {
    const { apiClient } = require('@/services/api_client');
    render(<AdminEstoqueGruposPage />);
    await screen.findByText('Velas');

    fireEvent.click(screen.getByRole('button', { name: 'Excluir Velas' }));
    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveTextContent('Excluir Grupo');
    expect(dialog).toHaveTextContent('Velas');

    fireEvent.click(screen.getByRole('button', { name: 'Excluir' }));

    await waitFor(() => expect(apiClient.delete).toHaveBeenCalledWith('/api/v1/admin/estoque/grupos/g1'));
    expect(mockShowSuccess).toHaveBeenCalledWith('Grupo excluído.');
  });

  it('erro ao carregar vai para o snackbar global', async () => {
    const { apiClient } = require('@/services/api_client');
    apiClient.get.mockRejectedValue(new Error('boom'));
    render(<AdminEstoqueGruposPage />);
    await waitFor(() => expect(mockShowError).toHaveBeenCalledWith('Erro ao carregar grupos'));
  });
});
