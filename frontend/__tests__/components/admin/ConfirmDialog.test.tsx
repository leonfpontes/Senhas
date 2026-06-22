import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import { ConfirmDialog } from '@/components/admin/ConfirmDialog';

const theme = createTheme();

function wrap(ui: React.ReactElement) {
  return render(<ThemeProvider theme={theme}>{ui}</ThemeProvider>);
}

const noop = jest.fn();

beforeEach(() => jest.clearAllMocks());

describe('ConfirmDialog', () => {
  it('is not visible when open=false', () => {
    wrap(
      <ConfirmDialog open={false} title="Excluir" message="Tem certeza?" onConfirm={noop} onCancel={noop} />
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('renders title and message when open', () => {
    wrap(
      <ConfirmDialog open title="Excluir Item" message="Deseja excluir?" onConfirm={noop} onCancel={noop} />
    );
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Excluir Item')).toBeInTheDocument();
    expect(screen.getByText('Deseja excluir?')).toBeInTheDocument();
  });

  it('renders JSX message', () => {
    wrap(
      <ConfirmDialog
        open
        title="Excluir"
        message={<span data-testid="rich-msg">Excluir <strong>João</strong>?</span>}
        onConfirm={noop}
        onCancel={noop}
      />
    );
    expect(screen.getByTestId('rich-msg')).toBeInTheDocument();
  });

  it('calls onConfirm when confirm button clicked', () => {
    const onConfirm = jest.fn();
    wrap(
      <ConfirmDialog open title="Test" message="msg" onConfirm={onConfirm} onCancel={noop} />
    );
    fireEvent.click(screen.getByText('Confirmar'));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('calls onCancel when cancel button clicked', () => {
    const onCancel = jest.fn();
    wrap(
      <ConfirmDialog open title="Test" message="msg" onConfirm={noop} onCancel={onCancel} />
    );
    fireEvent.click(screen.getByText('Cancelar'));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('uses custom confirmText and cancelText', () => {
    wrap(
      <ConfirmDialog
        open title="Test" message="msg"
        confirmText="Sim, excluir" cancelText="Não"
        onConfirm={noop} onCancel={noop}
      />
    );
    expect(screen.getByText('Sim, excluir')).toBeInTheDocument();
    expect(screen.getByText('Não')).toBeInTheDocument();
  });

  it('shows Aguarde... and disables buttons when loading', () => {
    wrap(
      <ConfirmDialog open title="Test" message="msg" loading onConfirm={noop} onCancel={noop} />
    );
    expect(screen.getByText('Aguarde...')).toBeInTheDocument();
    const buttons = screen.getAllByRole('button');
    buttons.forEach((btn) => expect(btn).toBeDisabled());
  });

  it('confirm button has error color when destructive', () => {
    wrap(
      <ConfirmDialog open title="Test" message="msg" destructive onConfirm={noop} onCancel={noop} />
    );
    const confirmBtn = screen.getByText('Confirmar').closest('button');
    expect(confirmBtn).toHaveClass('MuiButton-containedError');
  });

  it('confirm button has primary color when not destructive', () => {
    wrap(
      <ConfirmDialog open title="Test" message="msg" onConfirm={noop} onCancel={noop} />
    );
    const confirmBtn = screen.getByText('Confirmar').closest('button');
    expect(confirmBtn).toHaveClass('MuiButton-containedPrimary');
  });
});
