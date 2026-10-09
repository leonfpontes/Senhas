/**
 * MensalidadeGatewayCard (F-02/AM-22) — "Receber a mensalidade automaticamente":
 * - nenhum provedor configurado na plataforma e nada conectado → o card some;
 * - plano sem `mensalidade_automatica` → "a partir do plano Pro", sem botão de conectar;
 * - conectar pede a senha; senha errada (400 SENHA_INCORRETA) fica no diálogo; a certa vai para o
 *   cadastro do Stripe (link devolvido pelo servidor);
 * - conectada: situação do PIX; sem `financeiro:edit` não há botões.
 */
import React from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

const mockRouter: any = { query: {}, pathname: '/admin/financeiro/config' };
jest.mock('next/router', () => ({ useRouter: () => mockRouter }));
jest.mock('next/link', () => {
  const MockLink = ({ children, href, ...rest }: any) => (
    <a href={typeof href === 'string' ? href : href?.pathname} {...rest}>
      {children}
    </a>
  );
  return MockLink;
});
const mockGet = jest.fn();
const mockPost = jest.fn();
jest.mock('@/services/api_client', () => ({
  apiClient: { get: (...a: unknown[]) => mockGet(...a), post: (...a: unknown[]) => mockPost(...a) },
  extractApiErrorMessage: (_e: unknown, f: string) => f,
}));
const mockSuccess = jest.fn();
jest.mock('@/contexts/SnackbarContext', () => ({
  useSnackbar: () => ({ showSuccess: mockSuccess, showError: jest.fn() }),
}));

import { MensalidadeGatewayCard } from '@/components/financeiro/MensalidadeGatewayCard';

const ATIVO = {
  provedor: 'stripe',
  provedor_label: 'Stripe',
  status: 'ativo',
  pix_disponivel: true,
  boleto_disponivel: false,
  cadastro_completo: true,
  recebimentos_ativos: true,
  cobrando: true,
  conectado_em: '2026-10-09T12:00:00Z',
  conectado_por_nome: 'Mãe Joana',
  desconectado_em: null,
};

describe('MensalidadeGatewayCard', () => {
  const assign = jest.fn();
  beforeAll(() => {
    Object.defineProperty(window, 'location', { value: { ...window.location, assign }, writable: true });
  });
  beforeEach(() => {
    jest.clearAllMocks();
    mockRouter.query = {};
  });

  it('sem provedor configurado e sem conta conectada, não aparece', async () => {
    mockGet.mockResolvedValue({ data: { provedores_disponiveis: [], plano_inclui: true, gateway: null } });
    const { container } = render(<MensalidadeGatewayCard canEdit />);
    await waitFor(() => expect(mockGet).toHaveBeenCalledWith('/api/v1/admin/financeiro/gateway'));
    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });

  it('fora do plano: avisa o plano mínimo e não oferece conectar', async () => {
    mockGet.mockResolvedValue({ data: { provedores_disponiveis: ['stripe'], plano_inclui: false, gateway: null } });
    render(<MensalidadeGatewayCard canEdit />);
    expect(await screen.findByTestId('gateway-plano')).toHaveTextContent('Disponível a partir do plano Pro');
    expect(screen.queryByRole('button', { name: /Conectar Stripe/ })).not.toBeInTheDocument();
  });

  it('conectar pede a senha; a errada fica no diálogo e a certa vai para o cadastro do Stripe', async () => {
    mockGet.mockResolvedValue({ data: { provedores_disponiveis: ['stripe'], plano_inclui: true, gateway: null } });
    mockPost
      .mockRejectedValueOnce({ status: 400, response: { status: 400, data: { error_code: 'SENHA_INCORRETA' } } })
      .mockResolvedValueOnce({
        data: { url: 'https://connect.stripe.com/setup/e/acct_x/abc', gateway: { ...ATIVO, status: 'pendente', cadastro_completo: false } },
      });
    render(<MensalidadeGatewayCard canEdit />);

    fireEvent.click(await screen.findByRole('button', { name: 'Conectar Stripe' }));
    const dialog = await screen.findByRole('alertdialog');
    fireEvent.change(within(dialog).getByLabelText('Sua senha'), { target: { value: 'errada' } });
    await act(async () => {
      fireEvent.click(within(dialog).getByRole('button', { name: 'Continuar no Stripe' }));
    });
    expect(await within(dialog).findByText('Senha incorreta. Confira e tente de novo.')).toBeInTheDocument();
    expect(mockPost).toHaveBeenCalledWith(
      '/api/v1/admin/financeiro/gateway/stripe/conectar',
      { senha: 'errada' },
      { skipAutoLogout: true },
    );
    expect(assign).not.toHaveBeenCalled();

    fireEvent.change(within(dialog).getByLabelText('Sua senha'), { target: { value: 'certa' } });
    await act(async () => {
      fireEvent.click(within(dialog).getByRole('button', { name: 'Continuar no Stripe' }));
    });
    await waitFor(() => expect(assign).toHaveBeenCalledWith('https://connect.stripe.com/setup/e/acct_x/abc'));
  });

  it('conectada: mostra o PIX ligado; sem permissão de editar não há botões', async () => {
    mockGet.mockResolvedValue({ data: { provedores_disponiveis: ['stripe'], plano_inclui: true, gateway: ATIVO } });
    render(<MensalidadeGatewayCard canEdit={false} />);
    const box = await screen.findByTestId('gateway-conectado');
    expect(box).toHaveTextContent('Conectada');
    expect(box).toHaveTextContent('PIX automático ligado.');
    expect(screen.queryByRole('button', { name: /Desconectar/ })).not.toBeInTheDocument();
  });

  it('volta do cadastro do Stripe: confere a conta e desconectar pede a senha', async () => {
    mockRouter.query = { tab: 'mensalidade', stripe: 'retorno' };
    mockGet.mockResolvedValue({
      data: { provedores_disponiveis: ['stripe'], plano_inclui: true, gateway: { ...ATIVO, status: 'pendente' } },
    });
    mockPost.mockImplementation((url: string) =>
      url.endsWith('/stripe/atualizar')
        ? Promise.resolve({ data: ATIVO })
        : Promise.resolve({ data: { provedores_disponiveis: ['stripe'], plano_inclui: true, gateway: { ...ATIVO, status: 'desconectado' } } }),
    );
    render(<MensalidadeGatewayCard canEdit />);
    await waitFor(() => expect(mockPost).toHaveBeenCalledWith('/api/v1/admin/financeiro/gateway/stripe/atualizar'));
    expect(await screen.findByText('PIX automático ligado.')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Desconectar/ }));
    const dialog = await screen.findByRole('alertdialog');
    fireEvent.change(within(dialog).getByLabelText('Sua senha'), { target: { value: 'certa' } });
    await act(async () => {
      fireEvent.click(within(dialog).getByRole('button', { name: 'Desconectar' }));
    });
    expect(mockPost).toHaveBeenCalledWith('/api/v1/admin/financeiro/gateway/desconectar', { senha: 'certa' }, { skipAutoLogout: true });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Conectar Stripe' })).toBeInTheDocument());
  });
});
