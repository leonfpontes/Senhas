/**
 * Tests for BulkActionsBar (fase 1: barra fixa + AlertDialog + toast, mesma API).
 */
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import BulkActionsBar from '@/components/admin/BulkActionsBar';

jest.mock('@/services/api_client', () => ({
  apiClient: {
    post: jest.fn(),
    get: jest.fn(),
  },
  extractApiErrorMessage: (_e: unknown, fallback: string) => fallback,
}));

jest.mock('sonner', () => ({
  toast: { success: jest.fn(), error: jest.fn(), info: jest.fn(), warning: jest.fn() },
}));

describe('BulkActionsBar', () => {
  const defaultProps = {
    selectedCount: 3,
    ticketIds: ['id-1', 'id-2', 'id-3'],
    onRefresh: jest.fn(),
    onClearSelection: jest.fn(),
    giraId: 'gira-1',
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders selected count in a toolbar', () => {
    render(<BulkActionsBar {...defaultProps} />);
    expect(screen.getByRole('toolbar', { name: 'Ações em lote' })).toHaveTextContent('3 selecionado(s)');
  });

  it('renders mark used, cancel and clear buttons', () => {
    render(<BulkActionsBar {...defaultProps} />);
    expect(screen.getByRole('button', { name: /marcar usado/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /cancelar/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /limpar/i })).toBeInTheDocument();
  });

  it('clear button calls onClearSelection', () => {
    render(<BulkActionsBar {...defaultProps} />);
    fireEvent.click(screen.getByRole('button', { name: /limpar/i }));
    expect(defaultProps.onClearSelection).toHaveBeenCalledTimes(1);
  });

  it('opens mark_used dialog with dry-run on by default', () => {
    render(<BulkActionsBar {...defaultProps} />);
    fireEvent.click(screen.getByRole('button', { name: /marcar usado/i }));
    const dialog = screen.getByRole('alertdialog');
    expect(dialog).toHaveTextContent('Marcar Tickets Como Usados');
    expect(dialog).toHaveTextContent('marcar 3 ticket(s) como usado(s)');
    expect(screen.getByRole('checkbox', { name: /dry-run/i })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('button', { name: 'Validar' })).toBeInTheDocument();
  });

  it('opens cancel dialog', () => {
    render(<BulkActionsBar {...defaultProps} />);
    fireEvent.click(screen.getByRole('button', { name: /^cancelar$/i }));
    expect(screen.getByRole('alertdialog')).toHaveTextContent('Cancelar Tickets');
  });

  it('shows correct count for single selection', () => {
    render(<BulkActionsBar {...defaultProps} selectedCount={1} ticketIds={['id-1']} />);
    expect(screen.getByText(/1 selecionado/)).toBeInTheDocument();
  });

  it('esconde as ações que o grupo de permissão não libera', () => {
    render(<BulkActionsBar {...defaultProps} canMarkUsed={false} />);
    expect(screen.queryByRole('button', { name: /marcar usado/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /cancelar/i })).toBeInTheDocument();
  });

  it('dry-run só valida e mostra o resultado', async () => {
    const { apiClient } = jest.requireMock('@/services/api_client');
    apiClient.post.mockResolvedValue({ data: { valid: true, count: 3, errors: [], warnings: ['Um aviso'] } });
    render(<BulkActionsBar {...defaultProps} />);

    fireEvent.click(screen.getByRole('button', { name: /marcar usado/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Validar' }));

    expect(await screen.findByText(/Validação bem-sucedida: 3 ticket/)).toBeInTheDocument();
    expect(screen.getByText('Um aviso')).toBeInTheDocument();
    expect(apiClient.post).toHaveBeenCalledTimes(1);
    expect(apiClient.post).toHaveBeenCalledWith('/api/v1/admin/validate-bulk', {
      ticket_ids: ['id-1', 'id-2', 'id-3'],
      operation: 'mark_used',
    });
    expect(screen.getByRole('button', { name: 'Executar Agora' })).toBeInTheDocument();
  });

  it('executa na rota da gira selecionada e avisa com toast', async () => {
    const { apiClient } = jest.requireMock('@/services/api_client');
    const { toast } = jest.requireMock('sonner');
    apiClient.post.mockImplementation((url: string) =>
      Promise.resolve({
        data: url.endsWith('/validate-bulk')
          ? { valid: true, count: 3, errors: [], warnings: [] }
          : { modified: 3, failed: 0, errors: [] },
      })
    );
    render(<BulkActionsBar {...defaultProps} canMarkUsed={false} />);

    fireEvent.click(screen.getByRole('button', { name: /cancelar/i }));
    fireEvent.click(screen.getByRole('checkbox', { name: /dry-run/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Executar' }));

    await waitFor(() =>
      expect(apiClient.post).toHaveBeenCalledWith('/api/v1/admin/giras/gira-1/tickets/bulk-cancel', {
        ticket_ids: ['id-1', 'id-2', 'id-3'],
        dry_run: false,
      })
    );
    expect(await screen.findByText(/Operação concluída: 3 ticket/)).toBeInTheDocument();
    expect(toast.success).toHaveBeenCalledWith(expect.stringContaining('3 ticket(s) cancelado(s)'));
  });

  it('erro de validação aparece no diálogo', async () => {
    const { apiClient } = jest.requireMock('@/services/api_client');
    apiClient.post.mockResolvedValue({ data: { valid: false, errors: ['Ticket já usado'], warnings: [] } });
    render(<BulkActionsBar {...defaultProps} />);

    fireEvent.click(screen.getByRole('button', { name: /marcar usado/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Validar' }));

    expect(await screen.findByText('Ticket já usado')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Fechar' })).toBeInTheDocument();
  });
});
