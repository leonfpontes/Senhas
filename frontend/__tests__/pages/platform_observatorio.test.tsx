/**
 * /platform/observatory (J14 v2 · 19 e 20): os quatro números, as próximas giras e cursos com a ocupação
 * (80% ou mais em destaque), as funcionalidades por terreiro que abrem, e os estados vazio e erro.
 * Só GET /api/v1/platform/tenant-observatory.
 */
import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';

const mockRouter = { push: jest.fn(), replace: jest.fn(), pathname: '/platform/observatory', query: {}, asPath: '/platform/observatory', isReady: true, events: { on: jest.fn(), off: jest.fn() } };
jest.mock('next/router', () => ({ useRouter: () => mockRouter }));
const mockGet = jest.fn();
jest.mock('@/services/api_client', () => ({
  apiClient: { get: (...a: unknown[]) => mockGet(...a), post: jest.fn() },
  extractApiErrorMessage: (_e: unknown, fb: string) => fb,
}));
jest.mock('@/hooks/useProfile', () => ({ useProfile: () => ({ profile: null, loading: false, refresh: jest.fn() }) }));
jest.mock('@/components/support/usePlatformSupportUnread', () => ({ usePlatformSupportUnread: () => 0 }));

import ObservatoryPage from '@/pages/platform/observatory';

const DADOS = {
  retention_summary: { mrr_at_risk: 286, total_at_risk: 5 },
  upcoming_giras: [
    { id: 'g1', nome: 'Gira de Pretos Velhos', data_inicio: '2026-11-14T23:00:00Z', max_tickets: 120, tickets_emitidos: 112, ocupacao_pct: 93.3, tenant_id: 't1', tenant_name: 'Terreiro Filhos de Fé' },
    { id: 'g2', nome: 'Gira de Erês', data_inicio: '2026-11-16T19:00:00Z', max_tickets: 40, tickets_emitidos: 12, ocupacao_pct: 30, tenant_id: 't2', tenant_name: 'Ilê Axé Oyá' },
  ],
  upcoming_cursos: [
    { id: 'c1', titulo: 'Curso de Ervas Sagradas', data_inicio: '2026-11-22T13:00:00Z', max_participantes: 15, inscritos: 14, ocupacao_pct: 93, tenant_id: 't1', tenant_name: 'Terreiro Filhos de Fé' },
  ],
  top_features_by_tenant: [
    { tenant_id: 't1', tenant_name: 'Terreiro Filhos de Fé', total_acoes: 1284, features: [{ resource_type: 'ticket', label: 'Senhas', uso: 612 }] },
    { tenant_id: 't2', tenant_name: 'Ilê Axé Oyá', total_acoes: 318, features: [{ resource_type: 'gira', label: 'Giras', uso: 90 }] },
  ],
};

beforeEach(() => {
  jest.clearAllMocks();
  localStorage.setItem('user', JSON.stringify({ role: 'super_admin' }));
});

describe('Observatório da plataforma', () => {
  it('mostra os quatro números e as listas com a ocupação, só com o endpoint do observatório', async () => {
    mockGet.mockImplementation((url: string) => (url === '/api/v1/platform/tenant-observatory' ? Promise.resolve({ data: DADOS }) : Promise.resolve({ data: [] })));
    render(<ObservatoryPage />);
    expect(await screen.findByText('Gira de Pretos Velhos')).toBeInTheDocument();
    expect(screen.getByText('MRR em risco')).toBeInTheDocument();
    expect(screen.getByText('1 com ocupação alta')).toBeInTheDocument();
    expect(screen.getByText('14 inscritos no total')).toBeInTheDocument();
    const giras = screen.getByTestId('obs-giras');
    expect(within(giras).getByText('93%')).toBeInTheDocument();
    expect(within(giras).getByText('112 de 120')).toBeInTheDocument();
    expect(within(screen.getByTestId('obs-cursos')).getByText('14 de 15')).toBeInTheDocument();
    expect(mockGet.mock.calls.filter((c) => String(c[0]).startsWith('/api/v1/admin'))).toHaveLength(0);
  });

  it('a lista de funcionalidades abre o uso de cada recurso por terreiro', async () => {
    mockGet.mockResolvedValue({ data: DADOS });
    render(<ObservatoryPage />);
    expect(await screen.findByText('Senhas')).toBeInTheDocument();
    const outro = screen.getByRole('button', { name: /Ilê Axé Oyá/ });
    expect(outro).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(outro);
    expect(outro).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('Giras')).toBeInTheDocument();
  });

  it('sem nada no período, mostra o estado vazio sem botão inventado', async () => {
    mockGet.mockResolvedValue({ data: { retention_summary: { mrr_at_risk: 0, total_at_risk: 0 }, upcoming_giras: [], upcoming_cursos: [], top_features_by_tenant: [] } });
    render(<ObservatoryPage />);
    expect(await screen.findByText('Nada para observar ainda')).toBeInTheDocument();
  });

  it('se a consulta falha, avisa e oferece tentar de novo', async () => {
    mockGet.mockRejectedValueOnce(new Error('x')).mockResolvedValue({ data: DADOS });
    render(<ObservatoryPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Tentar de novo' }));
    await waitFor(() => expect(screen.getByText('Gira de Pretos Velhos')).toBeInTheDocument());
  });
});
