/**
 * Gaveta "Duplas da noite" da Porta: confirmados da Área no topo, outros recolhidos, sugestão
 * pelo histórico, copiar da última gira e o que vai para o PUT.
 */
import React from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

jest.mock('@/services/api_client', () => ({
  apiClient: { get: jest.fn(), put: jest.fn() },
  extractApiErrorMessage: (_e: unknown, fallback: string) => fallback,
}));

const mockToast: any = Object.assign(jest.fn(), { success: jest.fn(), error: jest.fn(), info: jest.fn() });
jest.mock('sonner', () => ({ toast: mockToast }));

const pessoa = (id: string, nome: string, extra: Record<string, unknown> = {}) => ({
  id,
  nome,
  is_atendimento: true,
  situacao: null,
  escalado_cambone: false,
  ...extra,
});

let PAINEL: any;

function mockApi() {
  const { apiClient } = require('@/services/api_client');
  apiClient.get.mockResolvedValue({ data: PAINEL });
  apiClient.put.mockImplementation((_url: string, body: any) => Promise.resolve({ data: body.duplas }));
  return apiClient;
}

async function renderDrawer(onSaved = jest.fn()) {
  const Drawer = require('@/components/admin/porta/DuplasDaNoiteDrawer').default;
  await act(async () => {
    render(<Drawer open onClose={jest.fn()} giraId="g1" giraNome="Gira de Caboclos" onSaved={onSaved} />);
  });
  await waitFor(() => expect(screen.queryByRole('status', { name: 'Carregando as duplas' })).not.toBeInTheDocument());
  return onSaved;
}

describe('Duplas da noite', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    PAINEL = {
      duplas: [],
      pessoas: [
        pessoa('rita', 'Mãe Rita', { situacao: 'vou' }),
        pessoa('carlos', 'Pai Carlos', { situacao: 'presente' }),
        pessoa('joao', 'Pai João'),
        pessoa('vera', 'Vó Vera', { situacao: 'nao_vou' }),
        pessoa('ana', 'Ana', { is_atendimento: false, escalado_cambone: true }),
        pessoa('beto', 'Beto', { is_atendimento: false }),
      ],
      tem_confirmacoes: true,
      sugestoes: [{ medium_id: 'rita', cambone_id: 'ana', juntos: 8, giras_do_medium: 10 }],
      anterior: { gira_nome: 'Gira de Pretos Velhos', data_inicio: '2026-10-13T22:00:00Z', duplas: [{ medium_id: 'carlos', cambone_id: 'beto' }] },
    };
  });

  it('confirmados da Área no topo; quem não respondeu e quem não vai ficam recolhidos', async () => {
    mockApi();
    await renderDrawer();
    const topo = screen.getByRole('region', { name: 'Confirmados na Área do Médium' });
    expect(within(topo).getAllByTestId('dupla-linha').map((li) => li.textContent)).toEqual([
      expect.stringContaining('Mãe Rita'),
      expect.stringContaining('Pai Carlos'),
    ]);
    // Cambone puro não aparece como médium.
    expect(screen.queryByLabelText('Ana trabalha hoje')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Pai João trabalha hoje')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Outros médiuns do cadastro \(2\)/ }));
    const outros = screen.getByRole('region', { name: 'Outros médiuns do cadastro' });
    expect(within(outros).getAllByTestId('dupla-linha').map((li) => li.textContent)).toEqual([
      expect.stringContaining('Pai João'),
      expect.stringContaining('Vó Vera'),
    ]);
    expect(within(outros).getByText('Não vai')).toBeInTheDocument();
  });

  it('marca o médium, aceita a sugestão do histórico e salva as duplas', async () => {
    const api = mockApi();
    const onSaved = await renderDrawer();

    fireEvent.click(screen.getByLabelText('Mãe Rita trabalha hoje'));
    fireEvent.click(screen.getByLabelText('Pai Carlos trabalha hoje'));
    fireEvent.click(screen.getByRole('button', { name: /Ana\? · junto em 8 de 10 giras/ }));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Salvar duplas' }));
    });

    expect(api.put).toHaveBeenCalledWith('/api/v1/admin/giras/g1/door/duplas', {
      duplas: [
        { medium_id: 'rita', cambone_id: 'ana' },
        { medium_id: 'carlos', cambone_id: null },
      ],
    });
    expect(onSaved).toHaveBeenCalled();
    expect(mockToast.success).toHaveBeenCalledWith('Duplas da noite salvas.');
  });

  it('"Copiar da última gira" e "Usar sugestões" preenchem o rascunho', async () => {
    const api = mockApi();
    await renderDrawer();

    fireEvent.click(screen.getByRole('button', { name: /Copiar da última gira \(13\/10\)/ }));
    expect(screen.getByLabelText('Pai Carlos trabalha hoje')).toBeChecked();
    fireEvent.click(screen.getByLabelText('Mãe Rita trabalha hoje'));
    fireEvent.click(screen.getByRole('button', { name: 'Usar sugestões (1)' }));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Salvar duplas' }));
    });
    expect(api.put).toHaveBeenCalledWith('/api/v1/admin/giras/g1/door/duplas', {
      duplas: [
        { medium_id: 'carlos', cambone_id: 'beto' },
        { medium_id: 'rita', cambone_id: 'ana' },
      ],
    });
  });

  it('sem a Área, mostra o cadastro todo sem separar', async () => {
    PAINEL = { ...PAINEL, tem_confirmacoes: false, pessoas: PAINEL.pessoas.map((p: any) => ({ ...p, situacao: null })) };
    mockApi();
    await renderDrawer();
    expect(screen.getByRole('region', { name: 'Médiuns de atendimento' })).toBeInTheDocument();
    expect(screen.getAllByTestId('dupla-linha')).toHaveLength(4);
    expect(screen.queryByText(/Outros médiuns do cadastro/)).not.toBeInTheDocument();
  });
});
