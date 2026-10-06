import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { SnackbarProvider, useSnackbar, showSnackbar } from '../../contexts/SnackbarContext';

jest.mock('sonner', () => ({
  toast: { success: jest.fn(), error: jest.fn(), info: jest.fn(), warning: jest.fn() },
}));

function Harness() {
  const { showSuccess, showError, showInfo, showWarning, showSnackbar: show } = useSnackbar();
  return (
    <>
      <button onClick={() => showSuccess('Tudo certo')}>ok</button>
      <button onClick={() => showError('Deu ruim')}>err</button>
      <button onClick={() => showInfo('Saiba')}>info</button>
      <button onClick={() => showWarning('Cuidado')}>warn</button>
      <button onClick={() => show('Genérico', 'warning')}>generic</button>
      <button onClick={() => show('Sem severidade')}>default</button>
    </>
  );
}

describe('SnackbarContext → toast (Sonner)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('showSuccess chama toast.success', () => {
    const { toast } = jest.requireMock('sonner');
    render(
      <SnackbarProvider>
        <Harness />
      </SnackbarProvider>,
    );
    fireEvent.click(screen.getByText('ok'));
    expect(toast.success).toHaveBeenCalledWith('Tudo certo');
  });

  it('showError / showInfo / showWarning chamam o toast equivalente', () => {
    const { toast } = jest.requireMock('sonner');
    render(
      <SnackbarProvider>
        <Harness />
      </SnackbarProvider>,
    );
    fireEvent.click(screen.getByText('err'));
    fireEvent.click(screen.getByText('info'));
    fireEvent.click(screen.getByText('warn'));
    expect(toast.error).toHaveBeenCalledWith('Deu ruim');
    expect(toast.info).toHaveBeenCalledWith('Saiba');
    expect(toast.warning).toHaveBeenCalledWith('Cuidado');
  });

  it('showSnackbar(message, severity) mapeia a severidade; sem severidade vira info', () => {
    const { toast } = jest.requireMock('sonner');
    render(
      <SnackbarProvider>
        <Harness />
      </SnackbarProvider>,
    );
    fireEvent.click(screen.getByText('generic'));
    expect(toast.warning).toHaveBeenCalledWith('Genérico');
    fireEvent.click(screen.getByText('default'));
    expect(toast.info).toHaveBeenCalledWith('Sem severidade');
  });

  it('funciona fora do provider (fachada sem estado) e como função solta', () => {
    const { toast } = jest.requireMock('sonner');
    render(<Harness />);
    fireEvent.click(screen.getByText('ok'));
    expect(toast.success).toHaveBeenCalledWith('Tudo certo');
    showSnackbar('Direto', 'error');
    expect(toast.error).toHaveBeenCalledWith('Direto');
  });

  it('não renderiza mais Snackbar/Alert do MUI dentro do provider', () => {
    const { container } = render(
      <SnackbarProvider>
        <span>filho</span>
      </SnackbarProvider>,
    );
    expect(container).toHaveTextContent('filho');
    expect(container.querySelector('[role="presentation"]')).toBeNull();
  });
});
