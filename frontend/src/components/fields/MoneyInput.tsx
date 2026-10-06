/**
 * MoneyInput — valor monetário em BRL. Substitui `CurrencyInput` (MUI).
 *
 *   <MoneyInput label="Valor" value={valor} onChange={setValor} />
 *
 * - `value` em reais (12.5 = R$ 12,50); `onChange(value)` recebe o número.
 * - Digitação da direita para a esquerda (centavos primeiro), via `onChange` do input — funciona
 *   com teclado físico, virtual (celular) e autofill: "1", "5", "0" → 0,01 → 0,15 → 1,50.
 * - Colar "1.234,56", "1234.56", "R$ 1.234,56" ou "1234" interpreta o valor completo.
 */
import React from 'react';
import { TextField, type TextFieldProps } from './TextField';

const MAX_CENTS = 99_999_999_99;

/** Formata reais como "R$ 1.234,56". */
export function formatBRL(value: number): string {
  const safe = Number.isFinite(value) ? value : 0;
  return `R$ ${safe.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** Dígitos de um texto digitado lidos como centavos: "R$ 1,505" → 15.05. */
export function centsFromDigits(text: string): number {
  const digits = text.replace(/\D/g, '').replace(/^0+(?=\d)/, '');
  if (!digits) return 0;
  const cents = Math.min(parseInt(digits.slice(-12), 10), MAX_CENTS);
  return cents / 100;
}

/**
 * Interpreta um texto colado como valor completo: vírgula é decimal (pt-BR); ponto é decimal só
 * quando é o único separador seguido de 1–2 dígitos ("1234.56"); senão é milhar ("1.234").
 */
export function parseBRL(text: string): number | null {
  const cleaned = text.replace(/[^\d.,-]/g, '');
  if (!/\d/.test(cleaned)) return null;
  const negative = cleaned.trim().startsWith('-');
  let normalized: string;
  if (cleaned.includes(',')) {
    normalized = cleaned.replace(/\./g, '').replace(',', '.');
  } else if (/^-?\d+\.\d{1,2}$/.test(cleaned)) {
    normalized = cleaned;
  } else {
    normalized = cleaned.replace(/\./g, '');
  }
  const n = Math.abs(parseFloat(normalized.replace(/-/g, '')));
  if (!Number.isFinite(n)) return null;
  const cents = Math.min(Math.round(n * 100), MAX_CENTS);
  return (negative ? -1 : 1) * (cents / 100);
}

export interface MoneyInputProps
  extends Omit<TextFieldProps, 'value' | 'onChange' | 'type' | 'multiline' | 'rows' | 'inputMode' | 'defaultValue'> {
  value: number;
  onChange: (value: number) => void;
  /** Permite valores negativos ao colar (padrão: não). */
  allowNegative?: boolean;
}

export const MoneyInput = React.forwardRef<HTMLInputElement, MoneyInputProps>(function MoneyInput(
  { value, onChange, allowNegative = false, onPaste, ...rest },
  ref,
) {
  const display = formatBRL(value);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange(centsFromDigits(e.target.value));
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    onPaste?.(e);
    if (e.defaultPrevented) return;
    const parsed = parseBRL(e.clipboardData.getData('text'));
    if (parsed === null) return;
    e.preventDefault();
    onChange(allowNegative ? parsed : Math.abs(parsed));
  };

  return (
    <TextField
      {...rest}
      ref={ref}
      type="text"
      inputMode="numeric"
      autoComplete="off"
      value={display}
      onChange={handleChange}
      onPaste={handlePaste}
    />
  );
});

export default MoneyInput;
