/**
 * MaskedInput — TextField do kit com máscara de telefone ou CPF. As funções `maskTelefone`,
 * `maskCpf` e `unmask` moram aqui desde que o wrapper MUI `shared/MaskedInput.tsx` foi removido.
 *
 *   <MaskedInput mask="telefone" label="WhatsApp" value={tel} onChange={setTel} />
 *
 * `onChange` recebe o texto já mascarado; `unmask(value)` devolve só os dígitos para persistir.
 * Para dinheiro use `MoneyInput`.
 */
import React from 'react';
import { TextField, type TextFieldProps } from './TextField';

/** "(11) 98765-4321" a partir de qualquer texto (até 11 dígitos). */
export function maskTelefone(value: string): string {
  const d = value.replace(/\D/g, '').slice(0, 11);
  if (d.length <= 2) return d.length ? `(${d}` : '';
  if (d.length <= 7) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

/** "123.456.789-01" a partir de qualquer texto (até 11 dígitos). */
export function maskCpf(value: string): string {
  const d = value.replace(/\D/g, '').slice(0, 11);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`;
  if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

/** Remove a máscara, devolvendo só os dígitos. */
export function unmask(value: string): string {
  return value.replace(/\D/g, '');
}

export type FieldMask = 'telefone' | 'cpf' | ((raw: string) => string);

const MASKS: Record<Exclude<FieldMask, (raw: string) => string>, (raw: string) => string> = {
  telefone: maskTelefone,
  cpf: maskCpf,
};

const INPUT_MODE: Record<'telefone' | 'cpf', React.HTMLAttributes<HTMLInputElement>['inputMode']> = {
  telefone: 'tel',
  cpf: 'numeric',
};

export function applyFieldMask(value: string, mask: FieldMask): string {
  return typeof mask === 'function' ? mask(value) : MASKS[mask](value);
}

export interface MaskedInputProps
  extends Omit<TextFieldProps, 'value' | 'onChange' | 'multiline' | 'rows' | 'defaultValue'> {
  mask: FieldMask;
  value: string;
  onChange: (maskedValue: string) => void;
}

export const MaskedInput = React.forwardRef<HTMLInputElement, MaskedInputProps>(function MaskedInput(
  { mask, value, onChange, inputMode, ...rest },
  ref,
) {
  return (
    <TextField
      {...rest}
      ref={ref}
      inputMode={inputMode ?? (typeof mask === 'string' ? INPUT_MODE[mask] : undefined)}
      value={applyFieldMask(value ?? '', mask)}
      onChange={(e) => onChange(applyFieldMask(e.target.value, mask))}
    />
  );
});

export default MaskedInput;
