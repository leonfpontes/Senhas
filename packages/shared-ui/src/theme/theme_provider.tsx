/**
 * T080: Theme Provider
 * Material-UI v6 ThemeProvider with tenant branding support
 * Wraps application components with customized theme
 */

'use client';

import React, { useMemo } from 'react';
import { ThemeProvider as MuiThemeProvider, createTheme, ThemeOptions } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import defaultTheme from './default_theme';
import { applyTenantBranding, TenantBrandingColors } from './brand_overrides';

/**
 * Tenant branding configuration interface
 */
export interface TenantThemeConfig {
  tenantId: string;
  tenantName: string;
  colors?: TenantBrandingColors;
  logoUrl?: string;
}

interface ThemeProviderProps {
  children: React.ReactNode;
  config?: TenantThemeConfig;
}

/**
 * T080: Theme Provider Component
 * Provides Material-UI v6 theme to application with tenant customizations
 */
export const ThemeProvider: React.FC<ThemeProviderProps> = ({
  children,
  config,
}) => {
  const theme = useMemo(() => {
    let themeOptions: ThemeOptions = defaultTheme;

    // Apply tenant branding if provided
    if (config?.colors) {
      themeOptions = applyTenantBranding(themeOptions, config.colors);
    }

    // Add component overrides
    themeOptions.components = {
      ...themeOptions.components,
      MuiButton: {
        styleOverrides: {
          root: {
            textTransform: 'none',
            fontWeight: 600,
            borderRadius: 6,
            padding: '8px 16px',
            transition: 'all 0.3s ease',
            '&:hover': {
              boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
            },
          },
          contained: {
            boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)',
          },
          outlined: {
            borderWidth: 2,
            '&:hover': {
              borderWidth: 2,
            },
          },
        },
      },
      MuiCard: {
        styleOverrides: {
          root: {
            boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
            borderRadius: 8,
            transition: 'all 0.3s ease',
            '&:hover': {
              boxShadow: '0 4px 16px rgba(0, 0, 0, 0.12)',
            },
          },
        },
      },
      MuiTextField: {
        styleOverrides: {
          root: {
            '& .MuiOutlinedInput-root': {
              backgroundColor: '#fff',
              borderRadius: 6,
              '&:hover fieldset': {
                borderColor: 'rgba(0, 0, 0, 0.23)',
              },
            },
          },
        },
      },
      MuiAppBar: {
        styleOverrides: {
          root: {
            boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)',
          },
        },
      },
      MuiDrawer: {
        styleOverrides: {
          root: {
            '& .MuiDrawer-paperAnchorLeft': {
              borderRight: '1px solid #e0e0e0',
            },
          },
        },
      },
    };

    return createTheme(themeOptions);
  }, [config]);

  return (
    <MuiThemeProvider theme={theme}>
      <CssBaseline />
      {children}
    </MuiThemeProvider>
  );
};

export default ThemeProvider;
