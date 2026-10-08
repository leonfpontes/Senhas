import React, { useState } from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MultiCombobox, type MultiComboboxOption } from '@/components/fields/MultiCombobox';

const options: MultiComboboxOption[] = [
  { value: 'g1', label: 'G1', dot: '#b45309' },
  { value: 'g2', label: 'G2', description: '3 médiuns' },
  { value: 'g3', label: 'Ogãs' },
];

function Harness({ onChange, initial = [] as string[] }: { onChange?: jest.Mock; initial?: string[] }) {
  const [value, setValue] = useState<string[]>(initial);
  return (
    <MultiCombobox
      label="Grupos"
      options={options}
      value={value}
      placeholder="Nenhum grupo"
      onChange={(v) => {
        setValue(v);
        onChange?.(v);
      }}
    />
  );
}

describe('MultiCombobox', () => {
  it('escolhe vários, mantém a lista aberta e mostra a contagem e as etiquetas', async () => {
    const user = userEvent.setup();
    const onChange = jest.fn();
    render(<Harness onChange={onChange} />);
    const trigger = screen.getByRole('combobox', { name: 'Grupos' });
    expect(trigger).toHaveTextContent('Nenhum grupo');

    await user.click(trigger);
    await user.click(await screen.findByText('G2'));
    expect(onChange).toHaveBeenLastCalledWith(['g2']);
    await user.click(screen.getByText('Ogãs'));
    expect(onChange).toHaveBeenLastCalledWith(['g2', 'g3']);
    expect(trigger).toHaveTextContent('2 escolhidos');

    // Tocar de novo tira.
    await user.click(within(screen.getByRole('listbox')).getByText('G2'));
    expect(onChange).toHaveBeenLastCalledWith(['g3']);
  });

  it('a etiqueta tem "x" para tirar o item', async () => {
    const user = userEvent.setup();
    const onChange = jest.fn();
    render(<Harness onChange={onChange} initial={['g1', 'g3']} />);
    const lista = screen.getByRole('list', { name: 'Escolhidos' });
    expect(within(lista).getByText('G1')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Tirar G1' }));
    expect(onChange).toHaveBeenLastCalledWith(['g3']);
    await waitFor(() => expect(within(lista).queryByText('G1')).not.toBeInTheDocument());
  });

  it('busca filtra pelo rótulo', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole('combobox', { name: 'Grupos' }));
    await user.type(await screen.findByPlaceholderText('Buscar...'), 'og');
    await waitFor(() => expect(screen.queryByText('G1')).not.toBeInTheDocument());
    expect(screen.getByText('Ogãs')).toBeInTheDocument();
  });
});
