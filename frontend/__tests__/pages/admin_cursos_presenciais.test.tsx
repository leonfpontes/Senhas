/**
 * /admin/cursos-presenciais — mensalidade padrão vem como string ("120.00", Decimal do
 * Pydantic v2): a tabela mostrava "—" e o formulário abria com R$ 0,00. Busca todas as páginas.
 */
import React from 'react';
import { render, screen } from '@testing-library/react';

jest.mock('next/router', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), pathname: '/admin/cursos-presenciais', query: {}, isReady: true }),
}));

const mockGet = jest.fn();
jest.mock('@/services/api_client', () => ({
  apiClient: {
    get: (...a: unknown[]) => mockGet(...a),
    post: jest.fn().mockResolvedValue({ data: {} }),
    put: jest.fn().mockResolvedValue({ data: {} }),
    delete: jest.fn().mockResolvedValue({ data: {} }),
  },
  extractApiErrorMessage: (_e: unknown, f: string) => f,
}));

jest.mock('@/pages/admin/admin_layout', () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
jest.mock('@/hooks/useSubscription', () => ({ useSubscription: () => ({ can: () => true, loading: false }) }));
jest.mock('@/hooks/usePermissions', () => ({ usePermissions: () => ({ can: () => true }) }));
jest.mock('@/contexts/SnackbarContext', () => {
  const s = { showSuccess: jest.fn(), showError: jest.fn(), showInfo: jest.fn() };
  return { useSnackbar: () => s };
});

import CursosPresenciaisPage from '@/pages/admin/cursos-presenciais';

const CURSO = {
  id: 'c1', tenant_id: 't1', titulo: 'Desenvolvimento mediúnico', ementa: null,
  data_inicio: '2026-10-10T22:00:00+00:00', data_fim: null, max_participantes: 20,
  valor_mensalidade_padrao: '120.00', local: null, observacoes: null, is_active: true,
  gerar_mensalidade: true, tipo_formulario: 'simples', chave_pix: null,
};

describe('Cursos presenciais — listagem', () => {
  beforeEach(() => {
    mockGet.mockReset();
    mockGet.mockResolvedValue({ data: [CURSO] });
  });

  it('mostra a mensalidade padrão vinda como string decimal', async () => {
    render(<CursosPresenciaisPage />);
    expect((await screen.findAllByText('Desenvolvimento mediúnico')).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/R\$\s?120,00/).length).toBeGreaterThan(0);
  });

  it('pede a listagem paginada com o limite máximo do endpoint', async () => {
    render(<CursosPresenciaisPage />);
    await screen.findAllByText('Desenvolvimento mediúnico');
    expect(mockGet).toHaveBeenCalledWith(
      '/api/v1/admin/cursos-presenciais',
      expect.objectContaining({ params: { skip: 0, limit: 100 } }),
    );
  });
});
