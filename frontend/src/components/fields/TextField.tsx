/**
 * TextField — Input (ou Textarea com `multiline`) + Label + texto de ajuda + erro.
 * Substitui o `TextField` do MUI nas telas migradas.
 *
 *   <TextField label="Nome" value={nome} onChange={(e) => setNome(e.target.value)}
 *              required error={touched && !nome && 'Obrigatório'} />
 *
 * `onChange` é o evento nativo do input (mesma assinatura do MUI). `startAdornment`/`endAdornment`
 * posicionam um ícone/botão dentro do campo.
 */
import React from 'react';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { FieldWrapper, type FieldBaseProps } from './FieldWrapper';

type NativeInputProps = Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  'id' | 'className' | 'required' | 'disabled' | 'size'
>;

export interface TextFieldProps extends FieldBaseProps, NativeInputProps {
  /** Renderiza um Textarea em vez de Input. */
  multiline?: boolean;
  rows?: number;
  startAdornment?: React.ReactNode;
  endAdornment?: React.ReactNode;
  /** Classes do controle (o `className` vai no wrapper). */
  inputClassName?: string;
  /** `size="small"` reduz a altura para 32px (como o MUI). */
  size?: 'small' | 'medium';
  inputRef?: React.Ref<HTMLInputElement | HTMLTextAreaElement>;
}

export const TextField = React.forwardRef<HTMLInputElement, TextFieldProps>(function TextField(
  {
    label,
    helperText,
    error,
    required,
    disabled,
    id,
    className,
    fullWidth,
    multiline,
    rows = 3,
    startAdornment,
    endAdornment,
    inputClassName,
    size = 'medium',
    inputRef,
    ...inputProps
  },
  ref,
) {
  return (
    <FieldWrapper
      label={label}
      helperText={helperText}
      error={error}
      required={required}
      disabled={disabled}
      id={id}
      className={className}
      fullWidth={fullWidth}
    >
      {(control) =>
        multiline ? (
          <Textarea
            {...control}
            // O `ref` vindo de fora (ex.: `{...register('campo')}` do react-hook-form) precisa chegar ao
            // textarea — sem ele o formulário não lê o valor digitado e acusa "Required".
            ref={(inputRef ?? ref) as React.Ref<HTMLTextAreaElement>}
            rows={rows}
            className={cn('bg-input-bg', inputClassName)}
            {...(inputProps as unknown as React.TextareaHTMLAttributes<HTMLTextAreaElement>)}
          />
        ) : (
          <div className="relative flex w-full items-center">
            {startAdornment && (
              <span className="pointer-events-none absolute left-3 flex items-center text-muted-foreground [&_svg]:size-4">
                {startAdornment}
              </span>
            )}
            <Input
              {...control}
              ref={(inputRef as React.Ref<HTMLInputElement>) ?? ref}
              className={cn(
                'bg-input-bg',
                size === 'small' && 'h-8 text-sm',
                startAdornment && 'pl-9',
                endAdornment && 'pr-10',
                inputClassName,
              )}
              {...inputProps}
            />
            {endAdornment && (
              <span className="absolute right-1.5 flex items-center text-muted-foreground [&_svg]:size-4">
                {endAdornment}
              </span>
            )}
          </div>
        )
      }
    </FieldWrapper>
  );
});

export default TextField;
