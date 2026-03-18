/**
 * T088: Custom Button Components
 * Primary, secondary, and danger button variations with Material-UI v6
 */

'use client';

import React from 'react';
import {
  Button as MuiButton,
  ButtonProps as MuiButtonProps,
  CircularProgress,
  Box,
} from '@mui/material';

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'success';

export interface ButtonProps extends Omit<MuiButtonProps, 'variant' | 'color'> {
  variant?: ButtonVariant;
  loading?: boolean;
  fullWidth?: boolean;
  size?: 'small' | 'medium' | 'large';
  icon?: React.ReactNode;
}

/**
 * Map custom variant to Material-UI variant and color
 */
function getVariantProps(variant: ButtonVariant) {
  const variants: Record<
    ButtonVariant,
    {
      muiVariant: MuiButtonProps['variant'];
      color: MuiButtonProps['color'];
      hoverBgColor: string;
    }
  > = {
    primary: {
      muiVariant: 'contained',
      color: 'primary',
      hoverBgColor: 'primary.dark',
    },
    secondary: {
      muiVariant: 'outlined',
      color: 'primary',
      hoverBgColor: 'action.hover',
    },
    danger: {
      muiVariant: 'contained',
      color: 'error',
      hoverBgColor: 'error.dark',
    },
    success: {
      muiVariant: 'contained',
      color: 'success',
      hoverBgColor: 'success.dark',
    },
  };
  return variants[variant];
}

/**
 * T088: Button Component - Primary
 * Primary action button
 */
export const ButtonPrimary = React.forwardRef<
  HTMLButtonElement,
  ButtonProps
>(
  (
    {
      variant = 'primary',
      loading = false,
      disabled = false,
      children,
      icon,
      ...props
    },
    ref
  ) => {
    const variantProps = getVariantProps(variant);

    return (
      <MuiButton
        ref={ref}
        variant={variantProps.muiVariant}
        color={variantProps.color}
        disabled={disabled || loading}
        sx={{
          textTransform: 'none',
          fontWeight: 600,
          borderRadius: 1,
          px: 3,
          py: 1,
          transition: 'all 0.3s ease',
          display: 'inline-flex',
          alignItems: 'center',
          gap: 1,
          '&:hover': {
            transform: 'translateY(-2px)',
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
          },
          '&:disabled': {
            opacity: 0.6,
          },
          '&.MuiButton-outlined': {
            borderWidth: 2,
            '&:hover': {
              borderWidth: 2,
            },
          },
        }}
        {...props}
      >
        {loading && <CircularProgress size={20} color="inherit" />}
        {icon && !loading && icon}
        {children}
      </MuiButton>
    );
  }
);

ButtonPrimary.displayName = 'ButtonPrimary';

/**
 * T088: Button Component - Secondary
 * Secondary/outline button
 */
export const ButtonSecondary = React.forwardRef<
  HTMLButtonElement,
  Omit<ButtonProps, 'variant'>
>(({ ...props }, ref) => (
  <ButtonPrimary ref={ref} variant="secondary" {...props} />
));

ButtonSecondary.displayName = 'ButtonSecondary';

/**
 * T088: Button Component - Danger
 * Danger/destructive button
 */
export const ButtonDanger = React.forwardRef<
  HTMLButtonElement,
  Omit<ButtonProps, 'variant'>
>(({ ...props }, ref) => (
  <ButtonPrimary ref={ref} variant="danger" {...props} />
));

ButtonDanger.displayName = 'ButtonDanger';

/**
 * T088: Button Component - Success
 * Success button
 */
export const ButtonSuccess = React.forwardRef<
  HTMLButtonElement,
  Omit<ButtonProps, 'variant'>
>(({ ...props }, ref) => (
  <ButtonPrimary ref={ref} variant="success" {...props} />
));

ButtonSuccess.displayName = 'ButtonSuccess';

export default ButtonPrimary;
