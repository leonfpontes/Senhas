import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { SnackbarProvider, useSnackbar } from '../../contexts/SnackbarContext';

function Harness() {
  const { showSuccess, showError } = useSnackbar();
  return (
    <>
      <button onClick={() => showSuccess('Tudo certo')}>ok</button>
      <button onClick={() => showError('Deu ruim')}>err</button>
    </>
  );
}

describe('SnackbarContext', () => {
  it('showSuccess exibe mensagem de sucesso', async () => {
    render(
      <SnackbarProvider>
        <Harness />
      </SnackbarProvider>,
    );
    fireEvent.click(screen.getByText('ok'));
    expect(await screen.findByText('Tudo certo')).toBeInTheDocument();
  });

  it('showError exibe mensagem de erro', async () => {
    render(
      <SnackbarProvider>
        <Harness />
      </SnackbarProvider>,
    );
    fireEvent.click(screen.getByText('err'));
    expect(await screen.findByText('Deu ruim')).toBeInTheDocument();
  });
});
