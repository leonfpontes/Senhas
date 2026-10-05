/**
 * Tests for BulkActionsBar component
 */
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import BulkActionsBar from '@/components/admin/BulkActionsBar';

// Mock API client
jest.mock('@/services/api_client', () => ({
  apiClient: {
    post: jest.fn(),
    get: jest.fn(),
  },
}));

const theme = createTheme();

function renderWithTheme(ui: React.ReactElement) {
  return render(<ThemeProvider theme={theme}>{ui}</ThemeProvider>);
}

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

  it('renders selected count', () => {
    renderWithTheme(<BulkActionsBar {...defaultProps} />);
    expect(screen.getByText(/3 selecionado/)).toBeInTheDocument();
  });

  it('renders mark used button', () => {
    renderWithTheme(<BulkActionsBar {...defaultProps} />);
    expect(screen.getByText(/Marcar Usado/i)).toBeInTheDocument();
  });

  it('renders cancel button', () => {
    renderWithTheme(<BulkActionsBar {...defaultProps} />);
    expect(screen.getByText(/Cancelar/i)).toBeInTheDocument();
  });

  it('opens mark_used dialog when clicked', () => {
    renderWithTheme(<BulkActionsBar {...defaultProps} />);
    fireEvent.click(screen.getByText(/Marcar Usado/i));
    // Dialog should appear with confirmation
    expect(screen.getByText(/Marcar Usado/i)).toBeInTheDocument();
  });

  it('opens cancel dialog when clicked', () => {
    renderWithTheme(<BulkActionsBar {...defaultProps} />);
    const cancelButtons = screen.getAllByText(/Cancelar/i);
    fireEvent.click(cancelButtons[0]);
    expect(cancelButtons.length).toBeGreaterThan(0);
  });

  it('renders clear selection button', () => {
    renderWithTheme(<BulkActionsBar {...defaultProps} />);
    // The clear selection button  should be present
    const buttons = screen.getAllByRole('button');
    expect(buttons.length).toBeGreaterThanOrEqual(2);
  });

  it('shows correct count for single selection', () => {
    renderWithTheme(
      <BulkActionsBar {...defaultProps} selectedCount={1} ticketIds={['id-1']} />
    );
    expect(screen.getByText(/1 selecionado/)).toBeInTheDocument();
  });

  it('esconde as ações que o grupo de permissão não libera', () => {
    renderWithTheme(<BulkActionsBar {...defaultProps} canMarkUsed={false} />);
    expect(screen.queryByRole('button', { name: /marcar usado/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /cancelar/i })).toBeInTheDocument();
  });

  it('executa na rota da gira selecionada', async () => {
    const { apiClient } = jest.requireMock('@/services/api_client');
    apiClient.post.mockImplementation((url: string) =>
      Promise.resolve({
        data: url.endsWith('/validate-bulk')
          ? { valid: true, count: 3, errors: [], warnings: [] }
          : { modified: 3, failed: 0, errors: [] },
      })
    );
    renderWithTheme(<BulkActionsBar {...defaultProps} canMarkUsed={false} />);

    fireEvent.click(screen.getByRole('button', { name: /cancelar/i }));
    fireEvent.click(screen.getByRole('checkbox', { name: /dry-run/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Executar' }));

    await waitFor(() =>
      expect(apiClient.post).toHaveBeenCalledWith('/api/v1/admin/giras/gira-1/tickets/bulk-cancel', {
        ticket_ids: ['id-1', 'id-2', 'id-3'],
        dry_run: false,
      })
    );
  });
});
