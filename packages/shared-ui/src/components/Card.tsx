/**
 * T086: Card Component
 * Reusable card container with shadow and border styling
 */

'use client';

import React from 'react';
import {
  Card as MuiCard,
  CardContent,
  CardHeader,
  CardActions,
  Box,
  BoxProps,
} from '@mui/material';

export interface CardProps extends BoxProps {
  title?: string;
  subtitle?: string;
  children: React.ReactNode;
  actions?: React.ReactNode;
  elevation?: number;
  variant?: 'outlined' | 'elevation';
  border?: boolean;
}

/**
 * T086: Card Component
 * Reusable card with optional header, content, and actions
 */
export const Card: React.FC<CardProps> = ({
  title,
  subtitle,
  children,
  actions,
  elevation = 1,
  variant = 'elevation',
  border = false,
  ...boxProps
}) => {
  return (
    <MuiCard
      variant={variant}
      elevation={elevation}
      sx={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        border: border ? '1px solid #e0e0e0' : 'none',
        borderRadius: 2,
        transition: 'all 0.3s ease',
        '&:hover': {
          boxShadow:
            elevation > 0
              ? '0 4px 16px rgba(0, 0, 0, 0.15)'
              : '0 2px 8px rgba(0, 0, 0, 0.1)',
        },
        ...boxProps.sx,
      }}
      {...boxProps}
    >
      {/* Header */}
      {title && (
        <CardHeader
          title={title}
          subheader={subtitle}
          sx={{
            pb: 1,
            '& .MuiCardHeader-subheader': {
              mt: 0.5,
            },
          }}
        />
      )}

      {/* Content */}
      <CardContent
        sx={{
          flex: 1,
          pb: actions ? 1 : 3,
          '&:last-child': {
            pb: actions ? 1 : 3,
          },
        }}
      >
        {children}
      </CardContent>

      {/* Actions */}
      {actions && (
        <CardActions
          sx={{
            justifyContent: 'flex-end',
            pt: 0,
          }}
        >
          {actions}
        </CardActions>
      )}
    </MuiCard>
  );
};

export default Card;
