/**
 * T087: Custom TextField Component
 * Material-UI TextField with validation styling and error handling
 */

'use client';

import React from 'react';
import {
  TextField as MuiTextField,
  TextFieldProps as MuiTextFieldProps,
  Box,
  FormHelperText,
} from '@mui/material';

export interface TextFieldProps extends Omit<MuiTextFieldProps, 'variant'> {
  error?: boolean;
  helperText?: string;
  validated?: boolean;
  validation?: {
    minLength?: number;
    maxLength?: number;
    pattern?: RegExp;
    customValidator?: (value: string) => string | null;
  };
  icon?: React.ReactNode;
}

/**
 * T087: Custom TextField Component
 * Enhanced TextField with validation styling and visual feedback
 */
export const TextField: React.FC<TextFieldProps> = ({
  error = false,
  helperText,
  validated = false,
  validation,
  icon,
  onChange,
  value,
  ...props
}) => {
  const [internalError, setInternalError] = React.useState(false);
  const [validationMessage, setValidationMessage] = React.useState<string | null>(null);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    let hasError = false;
    let message: string | null = null;

    if (validation) {
      if (validation.minLength && val.length < validation.minLength) {
        hasError = true;
        message = `Minimum ${validation.minLength} characters required`;
      } else if (validation.maxLength && val.length > validation.maxLength) {
        hasError = true;
        message = `Maximum ${validation.maxLength} characters allowed`;
      } else if (validation.pattern && !validation.pattern.test(val)) {
        hasError = true;
        message = 'Invalid format';
      } else if (validation.customValidator) {
        const customError = validation.customValidator(val);
        if (customError) {
          hasError = true;
          message = customError;
        }
      }
    }

    setInternalError(hasError && val.length > 0);
    setValidationMessage(message);
    onChange?.(e);
  };

  const displayError = error || internalError;
  const displayHelperText = validationMessage || helperText;
  const displayValidated = validated && !displayError && (value as string)?.length > 0;

  return (
    <Box
      sx={{
        position: 'relative',
        '& .MuiOutlinedInput-root': {
          borderRadius: 1,
          backgroundColor: '#fff',
          transition: 'all 0.3s ease',
          '&:hover fieldset': {
            borderColor: 'rgba(0, 0, 0, 0.23)',
          },
          '&.Mui-focused fieldset': {
            borderColor: 'primary.main',
            borderWidth: 2,
          },
          '&.Mui-error fieldset': {
            borderColor: 'error.main',
          },
        },
      }}
    >
      <MuiTextField
        {...props}
        value={value}
        onChange={handleChange}
        error={displayError}
        variant="outlined"
        fullWidth
        helperText={displayHelperText}
        FormHelperTextProps={{
          sx: {
            color: displayValidated ? 'success.main' : 'error.main',
            fontSize: '0.75rem',
            mt: 0.5,
          },
        }}
        InputProps={{
          endAdornment: displayValidated ? (
            <Box
              sx={{
                display: 'inline-flex',
                alignItems: 'center',
                color: 'success.main',
                ml: 1,
              }}
            >
              ✓
            </Box>
          ) : icon ? (
            icon
          ) : undefined,
          ...props.InputProps,
        }}
      />
    </Box>
  );
};

export default TextField;
