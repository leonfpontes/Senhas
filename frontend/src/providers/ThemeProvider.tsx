/**
 * T089: TenantAwareThemeProvider
 * Wraps application with tenant-specific Material-UI theme
 * Provides tenant context to all child components
 */

'use client';

import React, { createContext, useContext, useMemo, ReactNode } from 'react';
import { ThemeProvider as MuiThemeProvider, createTheme } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';

/**
 * Tenant branding configuration
 */
export interface TenantThemeConfig {
  tenantId: string;
  tenantName: string;
  colors?: {
    primary?: string;
    secondary?: string;
  };
  logoUrl?: string;
}

interface TenantContextType {
  tenantId?: string;
  tenantName?: string;
  logoUrl?: string;
  config?: TenantThemeConfig;
}

const TenantContext = createContext<TenantContextType | undefined>(undefined);

/**
 * Hook to access current tenant context
 */
export const useTenant = () => {
  const context = useContext(TenantContext);
  if (!context) {
    return {
      tenantId: undefined,
      tenantName: undefined,
      logoUrl: undefined,
      config: undefined,
    };
  }
  return context;
};

export interface TenantAwareThemeProviderProps {
  children: ReactNode;
  tenantConfig?: TenantThemeConfig;
}

/**
 * T089: TenantAwareThemeProvider
 * Combines theme provider with tenant context
 */
export const TenantAwareThemeProvider: React.FC<TenantAwareThemeProviderProps> =
  ({ children, tenantConfig }) => {
    const theme = useMemo(
      () =>
        createTheme({
          palette: {
            mode: 'light',
            primary: { main: tenantConfig?.colors?.primary || '#6366f1' },
            secondary: { main: tenantConfig?.colors?.secondary || '#ec4899' },
          },
        }),
      [tenantConfig]
    );

    const tenantContextValue = useMemo<TenantContextType>(
      () => ({
        tenantId: tenantConfig?.tenantId,
        tenantName: tenantConfig?.tenantName,
        logoUrl: tenantConfig?.logoUrl,
        config: tenantConfig,
      }),
      [tenantConfig]
    );

    return (
      <TenantContext.Provider value={tenantContextValue}>
        <MuiThemeProvider theme={theme}>
          <CssBaseline />
          {children}
        </MuiThemeProvider>
      </TenantContext.Provider>
    );
  };

export default TenantAwareThemeProvider;
