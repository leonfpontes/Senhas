import React, { useState } from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Combobox, type ComboboxOption } from '@/components/fields/Combobox';

const options: ComboboxOption[] = [
  { value: 'm1', label: 'Maria de Oxum', description: 'Cambone' },
  { value: 'm2', label: 'João de Ogum' },
  { value: 'm3', label: 'Pedro das Matas', disabled: true },
];

function Harness({ initial = null as string | null, onChange, clearable = false }: {
  initial?: string | null;
  onChange?: jest.Mock;
  clearable?: boolean;
}) {
  const [value, setValue] = useState<string | null>(initial);
  return (
    <Combobox
      label="Médium"
      options={options}
      value={value}
      clearable={clearable}
      onChange={(v) => {
        setValue(v);
        onChange?.(v);
      }}
    />
  );
}

describe('Combobox', () => {
  it('mostra o placeholder sem valor e o rótulo da opção selecionada', () => {
    const { rerender } = render(<Combobox label="Médium" options={options} value={null} onChange={() => {}} />);
    expect(screen.getByRole('combobox', { name: 'Médium' })).toHaveTextContent('Selecione...');
    rerender(<Combobox label="Médium" options={options} value="m2" onChange={() => {}} />);
    expect(screen.getByRole('combobox', { name: 'Médium' })).toHaveTextContent('João de Ogum');
  });

  it('abre a lista, filtra pela busca e seleciona com clique', async () => {
    const user = userEvent.setup();
    const onChange = jest.fn();
    render(<Harness onChange={onChange} />);

    await user.click(screen.getByRole('combobox', { name: 'Médium' }));
    const search = await screen.findByPlaceholderText('Buscar...');
    expect(screen.getByText('Maria de Oxum')).toBeInTheDocument();
    expect(screen.getByText('Cambone')).toBeInTheDocument();

    await user.type(search, 'ogum');
    await waitFor(() => expect(screen.queryByText('Maria de Oxum')).not.toBeInTheDocument());
    expect(screen.getByText('João de Ogum')).toBeInTheDocument();

    await user.click(screen.getByText('João de Ogum'));
    expect(onChange).toHaveBeenCalledWith('m2');
    await waitFor(() => expect(screen.queryByPlaceholderText('Buscar...')).not.toBeInTheDocument());
    expect(screen.getByRole('combobox', { name: 'Médium' })).toHaveTextContent('João de Ogum');
  });

  it('mostra o texto de vazio quando a busca não encontra nada', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole('combobox', { name: 'Médium' }));
    await user.type(await screen.findByPlaceholderText('Buscar...'), 'zzz');
    expect(await screen.findByText('Nenhuma opção encontrada.')).toBeInTheDocument();
  });

  it('seleciona pelo teclado (setas + Enter)', async () => {
    const user = userEvent.setup();
    const onChange = jest.fn();
    render(<Harness onChange={onChange} />);
    await user.click(screen.getByRole('combobox', { name: 'Médium' }));
    await screen.findByPlaceholderText('Buscar...');
    await user.keyboard('{ArrowDown}{Enter}');
    await waitFor(() => expect(onChange).toHaveBeenCalledWith('m2'));
  });

  it('opção desabilitada não pode ser selecionada', async () => {
    const user = userEvent.setup();
    const onChange = jest.fn();
    render(<Harness onChange={onChange} />);
    await user.click(screen.getByRole('combobox', { name: 'Médium' }));
    const disabled = await screen.findByText('Pedro das Matas');
    expect(disabled.closest('[role="option"]')).toHaveAttribute('aria-disabled', 'true');
    await user.click(disabled);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('clearable: o "x" limpa a seleção sem abrir a lista', () => {
    const onChange = jest.fn();
    render(<Harness initial="m1" clearable onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Limpar seleção' }));
    expect(onChange).toHaveBeenCalledWith(null);
    expect(screen.queryByPlaceholderText('Buscar...')).not.toBeInTheDocument();
  });

  it('exibe erro, ajuda e estado desabilitado', () => {
    render(
      <Combobox label="Médium" options={options} value={null} onChange={() => {}} error="Obrigatório" disabled />
    );
    const trigger = screen.getByRole('combobox', { name: 'Médium' });
    expect(trigger).toBeDisabled();
    expect(trigger).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByText('Obrigatório')).toBeInTheDocument();
  });
});
