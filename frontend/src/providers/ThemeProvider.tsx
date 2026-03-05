/**
 * T089: TenantAwareThemeProvider
 * Wraps application with tenant-specific Material-UI theme
 * Provides tenant context to all child components
 */

'use client';

import React, { createContext, useContext, useMemo, ReactNode } from 'react';
import { ThemeProvider as SharedThemeProvider } from 'shared-ui/theme/theme_provider';
import { TenantThemeConfig } from 'shared-ui/theme/theme_provider';

/**
 * Tenant Context
 */
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
        <SharedThemeProvider config={tenantConfig}>
          {children}
        </SharedThemeProvider>
      </TenantContext.Provider>
    );
  };

export default TenantAwareThemeProvider;
