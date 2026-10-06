import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import CrudDrawer from '@/components/CrudDrawer';

const baseProps = {
  open: true,
  onClose: jest.fn(),
  onSave: jest.fn(),
  title: 'Novo médium',
};

beforeEach(() => jest.clearAllMocks());

describe('CrudDrawer (shadcn Sheet, mesma API)', () => {
  it('renderiza título, subtítulo, ícone e conteúdo quando aberto', () => {
    render(
      <CrudDrawer {...baseProps} subtitle="Preencha os dados" icon={<svg data-testid="icone" />}>
        <input aria-label="Nome" />
      </CrudDrawer>,
    );
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Novo médium')).toBeInTheDocument();
    expect(screen.getByText('Preencha os dados')).toBeInTheDocument();
    expect(screen.getByTestId('icone')).toBeInTheDocument();
    expect(screen.getByLabelText('Nome')).toBeInTheDocument();
  });

  it('não renderiza nada quando fechado', () => {
    render(
      <CrudDrawer {...baseProps} open={false}>
        <div>conteúdo</div>
      </CrudDrawer>,
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByText('conteúdo')).not.toBeInTheDocument();
  });

  it('Salvar chama onSave e respeita saveLabel/saveDisabled', () => {
    const onSave = jest.fn();
    const { rerender } = render(
      <CrudDrawer {...baseProps} onSave={onSave} saveLabel="Criar">
        <div />
      </CrudDrawer>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Criar' }));
    expect(onSave).toHaveBeenCalledTimes(1);

    rerender(
      <CrudDrawer {...baseProps} onSave={onSave} saveLabel="Criar" saveDisabled>
        <div />
      </CrudDrawer>,
    );
    expect(screen.getByRole('button', { name: 'Criar' })).toBeDisabled();
  });

  it('enquanto salva, desabilita Salvar/Cancelar/fechar', () => {
    render(
      <CrudDrawer {...baseProps} saving>
        <div />
      </CrudDrawer>,
    );
    expect(screen.getByRole('button', { name: 'Salvar' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancelar' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'fechar' })).toBeDisabled();
  });

  it('exibe a mensagem de erro acima do formulário', () => {
    render(
      <CrudDrawer {...baseProps} error="Nome já cadastrado">
        <div />
      </CrudDrawer>,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Nome já cadastrado');
  });

  it('sem alterações, Cancelar e o X fecham direto', () => {
    const onClose = jest.fn();
    render(
      <CrudDrawer {...baseProps} onClose={onClose}>
        <div />
      </CrudDrawer>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'fechar' }));
    expect(onClose).toHaveBeenCalledTimes(2);
    expect(screen.queryByText('Descartar alterações?')).not.toBeInTheDocument();
  });

  it('com isDirty, pede confirmação; "Continuar editando" mantém aberto', async () => {
    const onClose = jest.fn();
    render(
      <CrudDrawer {...baseProps} onClose={onClose} isDirty>
        <div />
      </CrudDrawer>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(onClose).not.toHaveBeenCalled();
    expect(await screen.findByRole('alertdialog')).toBeInTheDocument();
    expect(screen.getByText('Descartar alterações?')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Continuar editando' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('com isDirty, "Descartar" fecha o drawer', async () => {
    const onClose = jest.fn();
    render(
      <CrudDrawer {...baseProps} onClose={onClose} isDirty>
        <div />
      </CrudDrawer>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'fechar' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Descartar' }));
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });

  it('Escape com isDirty também passa pela confirmação', async () => {
    const onClose = jest.fn();
    render(
      <CrudDrawer {...baseProps} onClose={onClose} isDirty>
        <div />
      </CrudDrawer>,
    );
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(await screen.findByRole('alertdialog')).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });
});
