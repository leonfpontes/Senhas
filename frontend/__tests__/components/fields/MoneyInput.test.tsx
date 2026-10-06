import React, { useState } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { MoneyInput, formatBRL, parseBRL, centsFromDigits } from '@/components/fields/MoneyInput';

function Harness({ initial = 0, onChange }: { initial?: number; onChange?: (v: number) => void }) {
  const [value, setValue] = useState(initial);
  return (
    <>
      <MoneyInput
        label="Valor"
        value={value}
        onChange={(v) => {
          setValue(v);
          onChange?.(v);
        }}
      />
      <output data-testid="out">{value}</output>
    </>
  );
}

const paste = (el: HTMLElement, text: string) =>
  fireEvent.paste(el, { clipboardData: { getData: () => text } });

describe('MoneyInput', () => {
  it('exibe o valor formatado em BRL e associa o rótulo', () => {
    render(<MoneyInput label="Valor" value={1234.5} onChange={() => {}} />);
    const input = screen.getByLabelText('Valor') as HTMLInputElement;
    expect(input.value).toBe('R$ 1.234,50');
    expect(input).toHaveAttribute('inputmode', 'numeric');
  });

  it('digitar da direita para a esquerda: "1", "5", "0" → 0,01 → 0,15 → 1,50', () => {
    render(<Harness />);
    const input = screen.getByLabelText('Valor') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'R$ 0,001' } });
    expect(input.value).toBe('R$ 0,01');
    fireEvent.change(input, { target: { value: 'R$ 0,015' } });
    expect(input.value).toBe('R$ 0,15');
    fireEvent.change(input, { target: { value: 'R$ 0,150' } });
    expect(input.value).toBe('R$ 1,50');
    expect(screen.getByTestId('out')).toHaveTextContent('1.5');
  });

  it('apagar o último dígito desloca os centavos; campo vazio vira 0', () => {
    render(<Harness initial={1.5} />);
    const input = screen.getByLabelText('Valor') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'R$ 1,5' } });
    expect(input.value).toBe('R$ 0,15');
    fireEvent.change(input, { target: { value: '' } });
    expect(input.value).toBe('R$ 0,00');
  });

  it('colar "1.234,56" interpreta o valor completo', () => {
    const onChange = jest.fn();
    render(<Harness onChange={onChange} />);
    const input = screen.getByLabelText('Valor') as HTMLInputElement;
    paste(input, '1.234,56');
    expect(onChange).toHaveBeenLastCalledWith(1234.56);
    expect(input.value).toBe('R$ 1.234,56');
  });

  it('colar outros formatos: "R$ 10", "1234.56", "1.234"', () => {
    const onChange = jest.fn();
    render(<Harness onChange={onChange} />);
    const input = screen.getByLabelText('Valor');
    paste(input, 'R$ 10');
    expect(onChange).toHaveBeenLastCalledWith(10);
    paste(input, '1234.56');
    expect(onChange).toHaveBeenLastCalledWith(1234.56);
    paste(input, '1.234');
    expect(onChange).toHaveBeenLastCalledWith(1234);
  });

  it('mostra erro e texto de ajuda', () => {
    render(<MoneyInput label="Valor" value={0} onChange={() => {}} error="Obrigatório" />);
    const input = screen.getByLabelText('Valor');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByText('Obrigatório')).toBeInTheDocument();
  });
});

describe('helpers', () => {
  it('formatBRL', () => {
    expect(formatBRL(0)).toBe('R$ 0,00');
    expect(formatBRL(1234.5)).toBe('R$ 1.234,50');
    expect(formatBRL(NaN)).toBe('R$ 0,00');
  });
  it('centsFromDigits', () => {
    expect(centsFromDigits('R$ 1,505')).toBe(15.05);
    expect(centsFromDigits('')).toBe(0);
    expect(centsFromDigits('abc')).toBe(0);
  });
  it('parseBRL', () => {
    expect(parseBRL('1.234,56')).toBe(1234.56);
    expect(parseBRL('1234,5')).toBe(1234.5);
    expect(parseBRL('1234.56')).toBe(1234.56);
    expect(parseBRL('1.234')).toBe(1234);
    expect(parseBRL('R$ 10')).toBe(10);
    expect(parseBRL('-5,00')).toBe(-5);
    expect(parseBRL('abc')).toBeNull();
  });
});
