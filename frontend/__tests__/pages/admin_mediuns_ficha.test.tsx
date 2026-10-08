/**
 * F-05 — Ficha espiritual no painel: `/admin/mediuns/ficha` (campos, modelos, pendências) e
 * `/admin/mediuns/[id]/ficha` (autorização, ficha e caminhada). Gates de plano (PlanLocked com o
 * plano mínimo do catálogo) e de grupo `ficha_espiritual` sem chamar a API; ações somem sem
 * permissão; sem autorização do médium não há campo editável.
 */
import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';

const mockQuery: { id?: string } = {};
jest.mock('next/router', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), pathname: '/admin/mediuns/ficha', query: mockQuery }),
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
jest.mock('@/contexts/SnackbarContext', () => ({
  useSnackbar: () => ({ showSuccess: jest.fn(), showError: jest.fn() }),
}));

const CAMPO = {
  id: 'c1',
  chave: 'umb_orixa_de_cabeca',
  rotulo: 'Orixá de cabeça',
  tipo: 'texto',
  tradicao: 'umbanda',
  opcoes: null,
  ordem: 1,
  visivel_ao_medium: true,
  medium_pode_sugerir: false,
  arquivado_em: null,
};

function fichaDoMedium(dado: boolean) {
  return {
    medium: { id: 'm1', nome: 'Ana Paula', is_active: true },
    consentimento: { dado, em: dado ? '2026-10-08T10:00:00Z' : null, versao: dado ? '1' : null, versao_atual: '1', revogado_em: null },
    registros_guardados: 0,
    campos: [{ ...CAMPO, valor: dado ? 'Oxóssi' : null }],
    sugestoes: [],
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockPlanCan.mockImplementation(() => true);
  mockGroupCan.mockImplementation(() => true);
  delete mockQuery.id;
  mockPost.mockResolvedValue({ data: [] });
  mockPut.mockResolvedValue({ data: fichaDoMedium(true) });
});

describe('/admin/mediuns/ficha — campos da ficha', () => {
  function setup() {
    mockGet.mockImplementation((url: string) => {
      if (url === '/api/v1/admin/mediuns/ficha-campos') return Promise.resolve({ data: [CAMPO] });
      if (url === '/api/v1/admin/mediuns/ficha-pendencias') {
        return Promise.resolve({
          data: {
            sugestoes: [
              {
                id: 's1', medium_id: 'm1', medium_nome: 'Ana Paula', campo_id: 'c1', campo_rotulo: 'Orixá de cabeça',
                valor_sugerido: 'Oxum', valor_atual: null, criado_em: '2026-10-08T10:00:00Z',
              },
            ],
            revogacoes: [{ medium_id: 'm2', medium_nome: 'Beto', revogado_em: '2026-10-08T10:00:00Z', registros_guardados: 3 }],
          },
        });
      }
      return Promise.resolve({ data: [] });
    });
    const Page = require('@/pages/admin/mediuns/ficha').default;
    return render(<Page />);
  }

  it('sem o plano: PlanLocked com o plano mínimo do catálogo e sem chamar a API', () => {
    mockPlanCan.mockImplementation((f: string) => f !== 'ficha_espiritual');
    setup();
    expect(screen.getByText(/Pro/)).toBeInTheDocument();
    expect(mockGet).not.toHaveBeenCalled();
  });

  it('sem o grupo ficha_espiritual: PermissionDenied e sem chamar a API', () => {
    mockGroupCan.mockImplementation((f: string) => f !== 'ficha_espiritual');
    setup();
    expect(screen.getByText(/não tem permissão/i)).toBeInTheDocument();
    expect(mockGet).not.toHaveBeenCalled();
  });

  it('lista campos, sugestões e autorizações retiradas; modelo e aceitar chamam a API', async () => {
    setup();
    expect(await screen.findByText('Orixá de cabeça', { selector: 'span' })).toBeInTheDocument();
    expect(screen.getByTestId('ficha-sugestao')).toHaveTextContent('Oxum');
    expect(screen.getByTestId('ficha-revogacoes')).toHaveTextContent('Beto');
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Usar modelo de Umbanda' }));
    });
    expect(mockPost).toHaveBeenCalledWith('/api/v1/admin/mediuns/ficha-campos/modelos/umbanda');
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Aceitar/ }));
    });
    expect(mockPost).toHaveBeenCalledWith('/api/v1/admin/mediuns/ficha-sugestoes/s1/aceitar');
  });

  it('só com view: sem botões de criar, modelo, aceitar, editar e apagar', async () => {
    mockGroupCan.mockImplementation((_f: string, a: string) => a === 'view');
    setup();
    await screen.findByTestId('ficha-campo');
    expect(screen.queryByRole('button', { name: /Novo campo/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Usar modelo/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Aceitar/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Apagar dados/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Editar Orixá/ })).not.toBeInTheDocument();
  });
});

describe('/admin/mediuns/[id]/ficha — ficha do médium', () => {
  function setup(dado: boolean) {
    mockQuery.id = 'm1';
    mockGet.mockImplementation((url: string) => {
      if (url === '/api/v1/admin/mediuns/m1/ficha') return Promise.resolve({ data: fichaDoMedium(dado) });
      if (url === '/api/v1/admin/mediuns/m1/marcos') {
        return Promise.resolve({
          data: {
            consentimento: fichaDoMedium(dado).consentimento,
            marcos: dado ? [{ id: 'k1', tipo: 'batismo', titulo: 'Batismo', data: '2019-03-10', visivel_ao_medium: true }] : [],
          },
        });
      }
      return Promise.resolve({ data: {} });
    });
    const Page = require('@/pages/admin/mediuns/[id]/ficha').default;
    return render(<Page />);
  }

  it('sem autorização: nada editável; registrar exige marcar a caixa e manda a versão do texto', async () => {
    setup(false);
    expect(await screen.findByTestId('ficha-sem-autorizacao')).toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: 'Orixá de cabeça' })).not.toBeInTheDocument();
    const registrar = screen.getByRole('button', { name: /Registrar autorização/ });
    expect(registrar).toBeDisabled();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Confirmo a autorização' }));
    await act(async () => {
      fireEvent.click(registrar);
    });
    expect(mockPost).toHaveBeenCalledWith('/api/v1/admin/mediuns/m1/ficha/consentimento', { confirmo: true, versao: '1' });
  });

  it('com autorização: edita e salva só o que mudou', async () => {
    setup(true);
    const input = await screen.findByRole('textbox', { name: 'Orixá de cabeça' });
    fireEvent.change(input, { target: { value: 'Oxóssi e Iemanjá' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Salvar ficha' }));
    });
    expect(mockPut).toHaveBeenCalledWith('/api/v1/admin/mediuns/m1/ficha', {
      valores: [{ campo_id: 'c1', valor: 'Oxóssi e Iemanjá' }],
    });
  });

  it('sem o grupo: PermissionDenied sem chamar a API', () => {
    mockGroupCan.mockImplementation((f: string) => f !== 'ficha_espiritual');
    setup(true);
    expect(screen.getByText(/não tem permissão/i)).toBeInTheDocument();
    expect(mockGet).not.toHaveBeenCalled();
  });

  it('só com view: lê o valor, sem salvar nem registrar autorização', async () => {
    mockGroupCan.mockImplementation((_f: string, a: string) => a === 'view');
    setup(true);
    await waitFor(() => expect(screen.getByText('Oxóssi')).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: 'Salvar ficha' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Registrar que retirou/ })).not.toBeInTheDocument();
  });
});
