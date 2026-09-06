/**
 * Tests for the unified public emission flow
 * Testing: UnifiedGiraRedirect (used by /public/[tenant],
 * /public/[tenant]/senha and /public/[tenant]/associado)
 */
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';

const mockReplace = jest.fn();

// Objeto estável — o Next real retorna a mesma referência de useRouter entre
// renders; um objeto novo a cada chamada faria o useCallback([...router]) do
// componente re-disparar o efeito em loop.
const mockRouter = {
  push: jest.fn(),
  replace: mockReplace,
  pathname: '/public/[tenant]',
  query: { tenant: 'test-tenant' },
  asPath: '/public/test-tenant',
  isReady: true,
  events: { on: jest.fn(), off: jest.fn() },
};

// Mock next/router
jest.mock('next/router', () => ({
  useRouter: () => mockRouter,
}));

// Mock API client
jest.mock('@/services/api_client', () => ({
  apiClient: {
    get: jest.fn(),
    post: jest.fn(),
  },
}));

import * as Sentry from '@sentry/nextjs';
import UnifiedGiraRedirect from '@/components/shared/UnifiedGiraRedirect';
import TenantPage from '@/pages/public/[tenant]';

const { apiClient } = jest.requireMock('@/services/api_client');

beforeEach(() => {
  jest.clearAllMocks();
});

describe('UnifiedGiraRedirect', () => {
  it('redirects to the resolved gira page', async () => {
    apiClient.get.mockResolvedValue({ data: { id: 'gira-1' } });
    render(<UnifiedGiraRedirect tipo="comum" />);
    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/public/gira/gira-1');
    });
  });

  it('keeps tipo=associado on the redirect', async () => {
    apiClient.get.mockResolvedValue({ data: { id: 'gira-2' } });
    render(<UnifiedGiraRedirect tipo="associado" />);
    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/public/gira/gira-2?tipo=associado');
    });
  });

  it('shows "Terreiro não encontrado" for an unknown slug (404 Tenant not found)', async () => {
    // Shape do erro rejeitado pelo api_client: {status, message, detail, response}
    apiClient.get.mockRejectedValue({
      status: 404,
      detail: "Tenant 'test-tenant' not found",
    });
    render(<UnifiedGiraRedirect tipo="comum" />);
    await waitFor(() => {
      expect(screen.getByText('Terreiro não encontrado')).toBeInTheDocument();
      // Sem botão de retry: recarregar não conserta um slug errado
      expect(screen.queryByRole('button')).not.toBeInTheDocument();
    });
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('shows the empty state when the tenant has no gira with open emission', async () => {
    apiClient.get.mockRejectedValue({
      status: 404,
      detail: 'No active gira scheduled for this tenant',
    });
    render(<UnifiedGiraRedirect tipo="comum" />);
    await waitFor(() => {
      expect(screen.getByText('Nenhuma gira com emissão aberta')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Atualizar' })).toBeInTheDocument();
    });
  });

  it('still detects a reworded tenant-not-found 404 (robust to message changes)', async () => {
    // A deteccao casa "not found", nao um startsWith posicional — resiste a
    // uma reescrita da mensagem no backend desde que ela mantenha "not found".
    apiClient.get.mockRejectedValue({
      status: 404,
      detail: "Terreiro with slug 'x' not found",
    });
    render(<UnifiedGiraRedirect tipo="comum" />);
    await waitFor(() => {
      expect(screen.getByText('Terreiro não encontrado')).toBeInTheDocument();
    });
  });

  it('shows a real error state for non-404 failures and reports it to Sentry', async () => {
    const err = { status: 500, detail: 'Internal server error' };
    apiClient.get.mockRejectedValue(err);
    render(<UnifiedGiraRedirect tipo="comum" />);
    await waitFor(() => {
      expect(screen.getByText('Erro ao carregar')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Tentar novamente' })).toBeInTheDocument();
    });
    // Ponto de entrada público: a falha nao pode sumir sem rastro
    expect(Sentry.captureException).toHaveBeenCalledWith(err, expect.anything());
  });
});

describe('Tenant Public Page (/public/[tenant])', () => {
  it('renders the redirect flow (legacy page retired)', async () => {
    apiClient.get.mockResolvedValue({ data: { id: 'gira-3' } });
    render(<TenantPage />);
    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/public/gira/gira-3');
    });
  });
});
