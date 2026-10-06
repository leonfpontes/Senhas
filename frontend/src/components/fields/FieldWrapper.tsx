/**
 * FieldWrapper — rótulo + controle + texto de ajuda/erro, base de todos os campos do kit.
 * Gera `id`, `aria-describedby` e `aria-invalid` para o controle via render prop.
 */
import React, { useId } from 'react';
import { cn } from '@/lib/utils';
import { Label } from '@/components/ui/label';

export interface FieldBaseProps {
  label?: React.ReactNode;
  /** Texto abaixo do campo (substituído pela mensagem de erro quando `error` é string). */
  helperText?: React.ReactNode;
  /** `true` só marca inválido; string marca e exibe a mensagem. */
  error?: boolean | string;
  required?: boolean;
  disabled?: boolean;
  id?: string;
  className?: string;
  /** Preenche a largura do container (padrão: sim — como o `fullWidth` do MUI). */
  fullWidth?: boolean;
}

export interface FieldControlProps {
  id: string;
  'aria-describedby'?: string;
  'aria-invalid'?: boolean;
  'aria-required'?: boolean;
  disabled?: boolean;
}

interface FieldWrapperProps extends FieldBaseProps {
  children: (control: FieldControlProps) => React.ReactNode;
  /** Classes extras no rótulo (ex.: `sr-only`). */
  labelClassName?: string;
}

export function FieldWrapper({
  label,
  helperText,
  error,
  required,
  disabled,
  id: idProp,
  className,
  fullWidth = true,
  labelClassName,
  children,
}: FieldWrapperProps) {
  const autoId = useId();
  const id = idProp ?? `field-${autoId}`;
  const message = typeof error === 'string' && error ? error : helperText;
  const messageId = message ? `${id}-help` : undefined;
  const invalid = Boolean(error);

  return (
    <div
      data-slot="field"
      data-invalid={invalid || undefined}
      data-disabled={disabled || undefined}
      className={cn('group flex flex-col gap-1.5', fullWidth && 'w-full', className)}
    >
      {label && (
        <Label htmlFor={id} className={cn(invalid && 'text-destructive', labelClassName)}>
          {label}
          {required && (
            <span aria-hidden className="text-destructive">
              *
            </span>
          )}
        </Label>
      )}
      {children({
        id,
        'aria-describedby': messageId,
        'aria-invalid': invalid || undefined,
        'aria-required': required || undefined,
        disabled,
      })}
      {message && (
        <p
          id={messageId}
          data-slot="field-message"
          className={cn('text-xs', invalid ? 'text-destructive' : 'text-muted-foreground')}
        >
          {message}
        </p>
      )}
    </div>
  );
}

export default FieldWrapper;
