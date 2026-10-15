/**
 * /status — linguagem leiga e nunca "tudo operacional" quando a verificação falha.
 */
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';

jest.mock('@/services/api_client', () => ({ apiClient: { get: jest.fn() } }));

import StatusPage from '@/pages/status';

const { apiClient } = jest.requireMock('@/services/api_client');

const data = {
  overall: 'operational',
  generated_at: '2026-10-06T10:00:00Z',
  components: [
    { name: 'Emissão de Senhas', description: 'x', status: 'operational', latency_ms: 42 },
    { name: 'Banco de Dados', description: 'y', status: 'degraded', latency_ms: null },
  ],
};

beforeEach(() => jest.clearAllMocks());

describe('Página de status', () => {
  it('mostra o resumo e cada serviço em linguagem leiga', async () => {
    apiClient.get.mockResolvedValue({ data });
    render(<StatusPage />);

    expect(await screen.findByText('Tudo funcionando')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Status dos serviços' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Emissão de senhas: funcionando/ })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Armazenamento de dados: com lentidão/ })).toBeInTheDocument();
    expect(screen.getByText('42 ms')).toBeInTheDocument();
    // Sem histórico de atividade nem "% no ar" (pentest L9).
    expect(screen.queryByText(/90 dias/)).not.toBeInTheDocument();
    expect(screen.queryByText(/no ar \(30 dias\)/)).not.toBeInTheDocument();
    expect(apiClient.get).toHaveBeenCalledWith('/api/v1/platform/status');
  });

  it('quando a consulta falha diz "Não foi possível verificar" e oferece tentar de novo', async () => {
    apiClient.get.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({ data });
    render(<StatusPage />);

    expect(await screen.findByText('Não foi possível verificar')).toBeInTheDocument();
    expect(screen.queryByText('Tudo funcionando')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));
    expect(await screen.findByText('Tudo funcionando')).toBeInTheDocument();
  });
});
