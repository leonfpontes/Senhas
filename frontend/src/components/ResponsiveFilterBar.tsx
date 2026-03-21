/**
 * ResponsiveFilterBar — Wraps filter controls with responsive layout.
 *
 * - Mobile: stacks vertically, controls are full-width
 * - Desktop: horizontal row with flexWrap
 */
'use client';

import React from 'react';
import { Box } from '@mui/material';
import type { BoxProps } from '@mui/material';

export interface ResponsiveFilterBarProps extends Omit<BoxProps, 'display'> {
  children: React.ReactNode;
}

export default function ResponsiveFilterBar({
  children,
  sx,
  ...rest
}: ResponsiveFilterBarProps) {
  return (
    <Box
      sx={{
        mb: 3,
        display: 'flex',
        flexWrap: 'wrap',
        gap: { xs: 1.5, sm: 2 },
        alignItems: { xs: 'stretch', sm: 'center' },
        flexDirection: { xs: 'column', sm: 'row' },
        '& .MuiFormControl-root': {
          minWidth: { xs: '100%', sm: 150 },
        },
        '& .MuiTextField-root': {
          minWidth: { xs: '100%', sm: 150 },
        },
        ...sx,
      }}
      {...rest}
    >
      {children}
    </Box>
  );
}
