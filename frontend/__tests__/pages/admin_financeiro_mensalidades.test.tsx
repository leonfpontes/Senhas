/**
 * /admin/financeiro/mensalidades — AM-12 só aparece com a Área do Médium no plano (piloto):
 * sem `area_medium` a tela fica como antes (nada de fila, selo ou "Conferir"); com ela, a fila
 * "Comprovantes para conferir" e o selo na lista do mês.
 */
import React from 'react';
import { render, screen, within } from '@testing-library/react';

jest.mock('next/router', () => ({
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
    pathname: '/admin/financeiro/mensalidades',
    query: {},
    isReady: true,
  }),
}));
jest.mock('next/link', () => {
  const MockLink = ({ children, href }: any) => <a href={href}>{children}</a>;
  return MockLink;
});

const FILA = '/api/v1/admin/financeiro/mensalidades/comprovantes-para-conferir';
const mockGet = jest.fn();
jest.mock('@/services/api_client', () => ({
  apiClient: { get: (...a: unknown[]) => mockGet(...a), post: jest.fn(), patch: jest.fn() },
  extractApiErrorMessage: (_e: unknown, f: string) => f,
}));
jest.mock('@/pages/admin/admin_layout', () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
let mockFeatures: Record<string, boolean> = {};
jest.mock('@/hooks/useSubscription', () => ({
  useSubscription: () => ({ can: (f: string) => mockFeatures[f] ?? false, loading: false }),
}));
jest.mock('@/hooks/usePermissions', () => ({ usePermissions: () => ({ can: () => true }) }));
jest.mock('@/contexts/SnackbarContext', () => ({
  useSnackbar: () => ({ showSuccess: jest.fn(), showError: jest.fn(), showInfo: jest.fn() }),
}));
jest.mock('recharts', () => {
  const Stub = ({ children }: any) => <div>{children}</div>;
  return new Proxy({}, { get: () => Stub });
});

import MensalidadesPage from '@/pages/admin/financeiro/mensalidades';

const LINHA = {
  mediun_id: 'm1',
  mediun_nome: 'Elaine Souza',
  mensalidade_isento: false,
  pagamento_id: 'p1',
  status: 'PENDENTE',
  data_pagamento: null,
  valor_vigente: 50,
  valor_pago: null,
  comprovante_filename: 'comprovante.jpg',
  observacao: null,
  comprovante_para_conferir: true,
  comprovante_enviado_em: '2026-10-08T17:05:00Z',
};

beforeEach(() => {
  jest.clearAllMocks();
  mockGet.mockImplementation((url: string) => {
    if (url === '/api/v1/admin/financeiro/config')
      return Promise.resolve({ data: { valor_mensal: 50, dia_vencimento: 10, ativo: true } });
    if (url.startsWith('/api/v1/admin/financeiro/mensalidades?'))
      return Promise.resolve({ data: [LINHA] });
    if (url === FILA)
      return Promise.resolve({
        data: [{ ...LINHA, mes: '2026-10', valor: 50, comprovante_mime: 'image/jpeg' }],
      });
    return Promise.resolve({ data: [] });
  });
});

it('sem a Área do Médium no plano: tela como antes, sem fila nem "Conferir"', async () => {
  mockFeatures = { mensalidade_mediun: true };
  render(<MensalidadesPage />);
  expect((await screen.findAllByText('Elaine Souza')).length).toBeGreaterThan(0);
  expect(mockGet.mock.calls.map((c) => c[0])).not.toContain(FILA);
  expect(screen.queryByText('Comprovantes para conferir')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /Conferir/ })).not.toBeInTheDocument();
});

it('com a Área: KPI "Comprovantes para conferir" e selo na lista do mês', async () => {
  mockFeatures = { mensalidade_mediun: true, area_medium: true };
  render(<MensalidadesPage />);
  const fila = await screen.findByTestId('comprovantes-conferir');
  expect(await within(fila).findByText('Elaine Souza')).toBeInTheDocument();
  expect(within(fila).getByText('Comprovantes para conferir')).toBeInTheDocument();
  expect(mockGet).toHaveBeenCalledWith(FILA);
  const tabela = await screen.findByTestId('cobranca-mediuns');
  expect((await within(tabela).findAllByText('Comprovante enviado')).length).toBeGreaterThan(0);
  expect(within(tabela).getAllByRole('button', { name: /Conferir/ }).length).toBeGreaterThan(0);
});
