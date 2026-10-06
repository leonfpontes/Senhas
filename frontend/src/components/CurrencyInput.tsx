/**
 * @deprecated Use `MoneyInput` de `@/components/fields` (`value` + `onChange(value)`).
 * Este arquivo só traduz a API antiga (`onValueChange`, props de TextField do MUI) para o
 * MoneyInput do kit, para as telas financeiras continuarem funcionando até migrarem.
 */
import React from 'react';
import { MoneyInput, type MoneyInputProps } from '@/components/fields/MoneyInput';

export interface CurrencyInputProps
  extends Omit<MoneyInputProps, 'onChange' | 'error' | 'size' | 'label' | 'helperText'> {
  /** Valor em reais (float). Ex: 12.5 representa R$ 12,50. */
  value: number;
  onValueChange: (value: number) => void;
  label?: React.ReactNode;
  helperText?: React.ReactNode;
  error?: boolean;
  size?: 'small' | 'medium';
  /** Ignorado (o MoneyInput ocupa a largura do container por padrão). */
  fullWidth?: boolean;
  /** Ignorado — compatibilidade com a assinatura antiga. */
  margin?: 'none' | 'dense' | 'normal';
  inputProps?: Record<string, unknown>;
}

let warned = false;

export default function CurrencyInput({
  onValueChange,
  fullWidth: _fullWidth,
  margin: _margin,
  inputProps: _inputProps,
  ...rest
}: CurrencyInputProps) {
  if (process.env.NODE_ENV !== 'production' && !warned) {
    warned = true;
    console.warn('[CurrencyInput] deprecado: use MoneyInput de @/components/fields.');
  }
  return <MoneyInput {...rest} onChange={onValueChange} />;
}
