/**
 * AM-15 — "Avisos por e-mail" no Perfil da Área: só os tipos disponíveis, liga/desliga na hora
 * (PUT só com o tipo mudado), volta se der erro e fica só leitura impersonando.
 */
import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';

const mockGet = jest.fn();
const mockPut = jest.fn();
jest.mock('@/services/api_client', () => ({
  apiClient: {
    get: (...a: unknown[]) => mockGet(...a),
    put: (...a: unknown[]) => mockPut(...a),
  },
}));

import { AvisosPorEmail } from '@/components/medium/perfil/AvisosPorEmail';

const TODOS = { mensalidade: true, escalas: true, confirmacao: true, faltas: true, avisos: true };

beforeEach(() => {
  jest.clearAllMocks();
});

it('mostra só os tipos disponíveis e desliga um tipo com PUT só dele', async () => {
  mockGet.mockResolvedValue({ data: { preferencias: TODOS, disponiveis: ['escalas', 'avisos'] } });
  mockPut.mockResolvedValue({ data: { preferencias: { ...TODOS, avisos: false }, disponiveis: ['escalas', 'avisos'] } });
  render(<AvisosPorEmail />);
  expect(await screen.findByText('Avisos por e-mail')).toBeInTheDocument();
  expect(mockGet).toHaveBeenCalledWith('/api/v1/medium/preferencias');
  expect(screen.getByText('Escalas e atividades')).toBeInTheDocument();
  expect(screen.getByText('Avisos da casa')).toBeInTheDocument();
  expect(screen.queryByText('Mensalidade')).not.toBeInTheDocument();
  const avisos = screen.getByTestId('aviso-email-avisos');
  expect(avisos).toHaveAttribute('aria-checked', 'true');
  await act(async () => {
    fireEvent.click(avisos);
  });
  expect(mockPut).toHaveBeenCalledWith('/api/v1/medium/preferencias', { avisos: false });
  await waitFor(() => expect(screen.getByTestId('aviso-email-avisos')).toHaveAttribute('aria-checked', 'false'));
});

it('deu erro: volta como estava e explica', async () => {
  mockGet.mockResolvedValue({ data: { preferencias: TODOS, disponiveis: ['mensalidade'] } });
  mockPut.mockRejectedValue({ response: { status: 500, data: {} } });
  render(<AvisosPorEmail />);
  const mensalidade = await screen.findByTestId('aviso-email-mensalidade');
  await act(async () => {
    fireEvent.click(mensalidade);
  });
  expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível mudar agora');
  expect(screen.getByTestId('aviso-email-mensalidade')).toHaveAttribute('aria-checked', 'true');
});

it('impersonando: só leitura, sem botões', async () => {
  mockGet.mockResolvedValue({ data: { preferencias: { ...TODOS, faltas: false }, disponiveis: ['faltas', 'escalas'] } });
  render(<AvisosPorEmail somenteLeitura />);
  expect(await screen.findByTestId('aviso-email-faltas-estado')).toHaveTextContent('Desligado');
  expect(screen.getByTestId('aviso-email-escalas-estado')).toHaveTextContent('Ligado');
  expect(screen.queryByRole('switch')).not.toBeInTheDocument();
  expect(mockPut).not.toHaveBeenCalled();
});

it('nada disponível ou resposta estranha: a seção some', async () => {
  mockGet.mockResolvedValue({ data: { preferencias: TODOS, disponiveis: [] } });
  const { container, rerender } = render(<AvisosPorEmail />);
  await waitFor(() => expect(mockGet).toHaveBeenCalled());
  expect(container).toBeEmptyDOMElement();
  mockGet.mockResolvedValue({ data: {} });
  rerender(<AvisosPorEmail key="2" />);
  await waitFor(() => expect(mockGet).toHaveBeenCalledTimes(2));
  expect(container).toBeEmptyDOMElement();
});
