/**
 * Participantes do curso: autorizar imagem e voz virou opcional na inscrição (LGPD, art. 8º, §4º),
 * então a lista avisa quem NÃO autorizou — para a casa não usar a pessoa em fotos e divulgação.
 */
import React from 'react';
import { render, screen, within } from '@testing-library/react';

jest.mock('next/router', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), pathname: '/admin/cursos-presenciais/[id]/participantes', query: { id: 'c1' }, isReady: true }),
}));

const CURSO = {
  id: 'c1', tenant_id: 't1', titulo: 'Desenvolvimento mediúnico', ementa: null,
  data_inicio: '2026-10-10T22:00:00+00:00', data_fim: null, max_participantes: 20,
  valor_mensalidade_padrao: null, local: null, observacoes: null, is_active: true,
  gerar_mensalidade: false, tipo_formulario: 'simples', chave_pix: null,
};

const base = {
  curso_id: 'c1', tenant_id: 't1', email: null, celular: null, data_nascimento: null, valor_mensalidade: null,
  aceita_uso_dados: true, aceita_uso_dados_saude: false, created_at: '2026-10-01T00:00:00Z', updated_at: '2026-10-01T00:00:00Z',
};
const PARTICIPANTES = [
  { ...base, id: 'p1', nome: 'Autorizou Imagem', aceita_uso_imagem: true },
  { ...base, id: 'p2', nome: 'Recusou Imagem', aceita_uso_imagem: false },
];

jest.mock('@/services/fetchAllPages', () => ({ fetchAllPages: () => Promise.resolve(PARTICIPANTES) }));
jest.mock('@/services/api_client', () => ({
  apiClient: {
    get: (url: string) => Promise.resolve({ data: url.endsWith('/c1') ? CURSO : url.includes('resumo') ? {} : [] }),
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

import ParticipantesPage from '@/pages/admin/cursos-presenciais/[id]/participantes';

describe('Participantes — autorização de imagem', () => {
  it('marca só quem não autorizou o uso de imagem e voz', async () => {
    render(<ParticipantesPage />);
    const recusou = (await screen.findAllByText('Recusou Imagem'))[0].closest('span')!.parentElement!;
    expect(within(recusou).getByText('Sem uso de imagem')).toBeInTheDocument();
    const autorizou = screen.getAllByText('Autorizou Imagem')[0].closest('span')!.parentElement!;
    expect(within(autorizou).queryByText('Sem uso de imagem')).not.toBeInTheDocument();
    expect(screen.getAllByText('Sem uso de imagem').length).toBeGreaterThan(0);
  });
});
