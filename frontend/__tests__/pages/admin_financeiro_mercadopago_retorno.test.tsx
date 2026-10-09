/**
 * /admin/financeiro/mercadopago-retorno (F-02/AM-22): manda code + state para o callback e volta
 * para a configuração; recusa no Mercado Pago ou erro do backend mostram o aviso com o caminho de volta.
 */
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';

const mockRouter: any = { query: {}, isReady: true, replace: jest.fn(() => Promise.resolve(true)) };
jest.mock('next/router', () => ({ useRouter: () => mockRouter }));
jest.mock('next/link', () => {
  const MockLink = ({ children, href, ...rest }: any) => (
    <a href={typeof href === 'string' ? href : href?.pathname} {...rest}>
      {children}
    </a>
  );
  return MockLink;
});
const mockPost = jest.fn();
jest.mock('@/services/api_client', () => ({
  apiClient: { post: (...a: unknown[]) => mockPost(...a) },
  extractApiErrorMessage: (e: any, f: string) => e?.response?.data?.message || f,
}));
jest.mock('@/pages/admin/admin_layout', () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
let mockPlano = true;
jest.mock('@/hooks/useSubscription', () => ({
  useSubscription: () => ({ can: () => mockPlano, loading: false, planLabel: 'Pro' }),
}));
let mockEdit = true;
jest.mock('@/hooks/usePermissions', () => ({ usePermissions: () => ({ can: () => mockEdit }) }));
const mockSuccess = jest.fn();
jest.mock('@/contexts/SnackbarContext', () => ({
  useSnackbar: () => ({ showSuccess: mockSuccess, showError: jest.fn() }),
}));

import MercadoPagoRetornoPage from '@/pages/admin/financeiro/mercadopago-retorno';

describe('volta do Mercado Pago', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPlano = true;
    mockEdit = true;
  });

  it('troca o código e volta para a configuração', async () => {
    mockRouter.query = { code: 'TG-abc', state: 'st' };
    mockPost.mockResolvedValue({ data: {} });
    render(<MercadoPagoRetornoPage />);
    await waitFor(() =>
      expect(mockPost).toHaveBeenCalledWith('/api/v1/admin/financeiro/gateway/mercadopago/callback', {
        code: 'TG-abc',
        state: 'st',
      }),
    );
    await waitFor(() => expect(mockRouter.replace).toHaveBeenCalledWith('/admin/financeiro/config?tab=mensalidade'));
    expect(mockSuccess).toHaveBeenCalled();
    expect(mockPost).toHaveBeenCalledTimes(1);
  });

  it('casa recusou no Mercado Pago: não chama o backend e oferece voltar', async () => {
    mockRouter.query = { error: 'access_denied' };
    render(<MercadoPagoRetornoPage />);
    expect(await screen.findByText(/não foi autorizada/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Voltar para a configuração' })).toHaveAttribute(
      'href',
      '/admin/financeiro/config?tab=mensalidade',
    );
    expect(mockPost).not.toHaveBeenCalled();
  });

  it('erro do backend (state vencido) aparece; sem permissão de editar não chama nada', async () => {
    mockRouter.query = { code: 'c', state: 's' };
    mockPost.mockRejectedValue({ response: { data: { message: 'O pedido de conexão venceu ou não é seu.' } } });
    const { unmount } = render(<MercadoPagoRetornoPage />);
    expect(await screen.findByText('O pedido de conexão venceu ou não é seu.')).toBeInTheDocument();
    unmount();
    mockPost.mockClear();
    mockEdit = false;
    render(<MercadoPagoRetornoPage />);
    expect(await screen.findByText('Sem permissão')).toBeInTheDocument();
    expect(mockPost).not.toHaveBeenCalled();
  });
});
