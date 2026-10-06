import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { ConfirmDialog } from '@/components/admin/ConfirmDialog';

const noop = jest.fn();

beforeEach(() => jest.clearAllMocks());

describe('ConfirmDialog (AlertDialog, mesma API)', () => {
  it('is not visible when open=false', () => {
    render(
      <ConfirmDialog open={false} title="Excluir" message="Tem certeza?" onConfirm={noop} onCancel={noop} />
    );
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('renders title and message when open', () => {
    render(
      <ConfirmDialog open title="Excluir Item" message="Deseja excluir?" onConfirm={noop} onCancel={noop} />
    );
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    expect(screen.getByText('Excluir Item')).toBeInTheDocument();
    expect(screen.getByText('Deseja excluir?')).toBeInTheDocument();
  });

  it('renders JSX message', () => {
    render(
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

  it('calls onConfirm when confirm button clicked (and does not close by itself)', () => {
    const onConfirm = jest.fn();
    const onCancel = jest.fn();
    render(
      <ConfirmDialog open title="Test" message="msg" onConfirm={onConfirm} onCancel={onCancel} />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('calls onCancel when cancel button clicked', () => {
    const onCancel = jest.fn();
    render(
      <ConfirmDialog open title="Test" message="msg" onConfirm={noop} onCancel={onCancel} />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('calls onCancel on Escape', () => {
    const onCancel = jest.fn();
    render(
      <ConfirmDialog open title="Test" message="msg" onConfirm={noop} onCancel={onCancel} />
    );
    fireEvent.keyDown(screen.getByRole('alertdialog'), { key: 'Escape' });
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('uses custom confirmText and cancelText', () => {
    render(
      <ConfirmDialog
        open title="Test" message="msg"
        confirmText="Sim, excluir" cancelText="Não"
        onConfirm={noop} onCancel={noop}
      />
    );
    expect(screen.getByRole('button', { name: 'Sim, excluir' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Não' })).toBeInTheDocument();
  });

  it('shows Aguarde... and disables buttons when loading', () => {
    render(
      <ConfirmDialog open title="Test" message="msg" loading onConfirm={noop} onCancel={noop} />
    );
    expect(screen.getByText('Aguarde...')).toBeInTheDocument();
    screen.getAllByRole('button').forEach((btn) => expect(btn).toBeDisabled());
  });

  it('confirm button uses the destructive variant when destructive', () => {
    render(
      <ConfirmDialog open title="Test" message="msg" destructive onConfirm={noop} onCancel={noop} />
    );
    const confirmBtn = screen.getByRole('button', { name: 'Confirmar' });
    expect(confirmBtn).toHaveAttribute('data-variant', 'destructive');
    expect(confirmBtn.className).toMatch(/bg-destructive/);
  });

  it('confirm button uses the primary variant when not destructive', () => {
    render(
      <ConfirmDialog open title="Test" message="msg" onConfirm={noop} onCancel={noop} />
    );
    const confirmBtn = screen.getByRole('button', { name: 'Confirmar' });
    expect(confirmBtn).toHaveAttribute('data-variant', 'default');
    expect(confirmBtn.className).toMatch(/bg-primary/);
  });
});
