/**
 * MaskedInput — wrapper sobre o TextField do MUI que aplica máscara de
 * formatação (telefone, CPF ou moeda) via regex no onChange.
 *
 * O `value` exibido é sempre a versão mascarada. O callback `onChange`
 * recebe o valor mascarado (string formatada); use `unmask(value, mask)`
 * para obter apenas os dígitos quando precisar persistir.
 *
 * Não depende de bibliotecas externas (react-input-mask / react-imask não
 * estão no projeto).
 */
import React from 'react';
import TextField, { TextFieldProps } from '@mui/material/TextField';

export type MaskType = 'telefone' | 'cpf' | 'moeda';

export function maskTelefone(value: string): string {
  const d = value.replace(/\D/g, '').slice(0, 11);
  if (d.length <= 2) return d.length ? `(${d}` : '';
  if (d.length <= 7) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

export function maskCpf(value: string): string {
  const d = value.replace(/\D/g, '').slice(0, 11);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`;
  if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

export function maskMoeda(value: string): string {
  const d = value.replace(/\D/g, '');
  if (!d) return '';
  const n = parseInt(d, 10) / 100;
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function applyMask(value: string, mask: MaskType): string {
  switch (mask) {
    case 'telefone': return maskTelefone(value);
    case 'cpf': return maskCpf(value);
    case 'moeda': return maskMoeda(value);
    default: return value;
  }
}

/** Remove a máscara, retornando apenas dígitos. */
export function unmask(value: string): string {
  return value.replace(/\D/g, '');
}

type MaskedInputProps = Omit<TextFieldProps, 'onChange'> & {
  mask: MaskType;
  onChange?: (maskedValue: string) => void;
};

export default function MaskedInput({ mask, onChange, value, ...rest }: MaskedInputProps) {
  return (
    <TextField
      {...rest}
      value={value}
      onChange={(e) => onChange?.(applyMask(e.target.value, mask))}
    />
  );
}
