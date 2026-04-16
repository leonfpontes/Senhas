import React, { useState } from 'react';
import {
  TextField,
  IconButton,
  InputAdornment,
  TextFieldProps,
} from '@mui/material';
import Visibility from '@mui/icons-material/Visibility';
import VisibilityOff from '@mui/icons-material/VisibilityOff';

/**
 * PasswordField — TextField wrapper with show/hide toggle.
 *
 * - Manages show/hide state internally.
 * - Merges any InputProps passed by the caller (e.g. error adornments).
 * - Forwards all other TextField props transparently.
 * - Does NOT accept `type` — it is always controlled internally.
 */
type PasswordFieldProps = Omit<TextFieldProps, 'type'>;

export default function PasswordField({ InputProps: callerInputProps, ...rest }: PasswordFieldProps) {
  const [show, setShow] = useState(false);

  return (
    <TextField
      {...rest}
      type={show ? 'text' : 'password'}
      InputProps={{
        ...callerInputProps,
        endAdornment: (
          <InputAdornment position="end">
            <IconButton
              aria-label={show ? 'Ocultar senha' : 'Mostrar senha'}
              onClick={() => setShow((v) => !v)}
              edge="end"
              size="small"
            >
              {show ? <VisibilityOff fontSize="small" /> : <Visibility fontSize="small" />}
            </IconButton>
          </InputAdornment>
        ),
      }}
    />
  );
}
