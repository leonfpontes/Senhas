import React from 'react';
import TextField, { TextFieldProps } from '@mui/material/TextField';

/** Formata centavos inteiros como string BRL sem o prefixo "R$". */
function centsToDisplay(cents: number): string {
  return (cents / 100).toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export interface CurrencyInputProps extends Omit<TextFieldProps, 'value' | 'onChange' | 'type'> {
  /** Valor em reais (float). Ex: 12.5 representa R$ 12,50. */
  value: number;
  onValueChange: (value: number) => void;
}

/**
 * Campo de entrada de valor monetário em BRL.
 * O preenchimento é feito da direita para a esquerda (centavos primeiro):
 * digitar "1", "5", "0" resulta em R$ 0,01 → R$ 0,15 → R$ 1,50.
 */
export default function CurrencyInput({
  value,
  onValueChange,
  inputProps,
  ...rest
}: CurrencyInputProps) {
  const cents = Math.round(value * 100);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key >= '0' && e.key <= '9') {
      e.preventDefault();
      const next = cents * 10 + parseInt(e.key, 10);
      if (next <= 99_999_999_99) {
        onValueChange(next / 100);
      }
    } else if (e.key === 'Backspace') {
      e.preventDefault();
      onValueChange(Math.floor(cents / 10) / 100);
    } else if (e.key === 'Delete') {
      e.preventDefault();
      onValueChange(0);
    }
    // Bloqueia qualquer outra entrada de texto (letras, símbolos etc.)
    const allowed = ['Tab', 'Enter', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'];
    if (!allowed.includes(e.key) && !(e.key >= '0' && e.key <= '9') && e.key !== 'Backspace' && e.key !== 'Delete') {
      e.preventDefault();
    }
  };

  return (
    <TextField
      {...rest}
      value={`R$ ${centsToDisplay(cents)}`}
      onChange={() => {}}
      onKeyDown={handleKeyDown}
      onPaste={(e) => e.preventDefault()}
      inputProps={{
        ...inputProps,
        inputMode: 'numeric',
        style: { cursor: 'text', ...(inputProps as React.InputHTMLAttributes<HTMLInputElement>)?.style },
      }}
    />
  );
}
