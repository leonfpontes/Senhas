/**
 * PasswordField — TextField do kit com botão mostrar/ocultar. Mesmas props do TextField
 * (label, value, onChange, error, helperText, autoComplete...), sem `type` (controlado aqui).
 * Substitui `components/PasswordField.tsx` (MUI) nas telas migradas.
 */
import React, { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { TextField, type TextFieldProps } from './TextField';

export type PasswordFieldProps = Omit<TextFieldProps, 'type' | 'multiline' | 'rows' | 'endAdornment'>;

export const PasswordField = React.forwardRef<HTMLInputElement, PasswordFieldProps>(
  function PasswordField(props, ref) {
    const [show, setShow] = useState(false);

    return (
      <TextField
        {...props}
        ref={ref}
        type={show ? 'text' : 'password'}
        endAdornment={
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            className="size-7 text-muted-foreground"
            aria-label={show ? 'Ocultar senha' : 'Mostrar senha'}
            aria-pressed={show}
            onClick={() => setShow((v) => !v)}
            disabled={props.disabled}
          >
            {show ? <EyeOff /> : <Eye />}
          </Button>
        }
      />
    );
  },
);

export default PasswordField;
