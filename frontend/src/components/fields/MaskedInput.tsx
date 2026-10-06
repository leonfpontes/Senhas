/**
 * MaskedInput — TextField do kit com máscara de telefone ou CPF (reaproveita `maskTelefone` /
 * `maskCpf` de `shared/MaskedInput.tsx`). Substitui o wrapper MUI nas telas migradas.
 *
 *   <MaskedInput mask="telefone" label="WhatsApp" value={tel} onChange={setTel} />
 *
 * `onChange` recebe o texto já mascarado; `unmask(value)` devolve só os dígitos para persistir.
 * Para dinheiro use `MoneyInput`.
 */
import React from 'react';
import { maskCpf, maskTelefone, unmask } from '@/components/shared/MaskedInput';
import { TextField, type TextFieldProps } from './TextField';

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

export { unmask };
export default MaskedInput;
