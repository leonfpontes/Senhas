/**
 * T089: TenantAwareThemeProvider
 * Wraps application with tenant-specific Material-UI theme
 * Provides tenant context to all child components
 */

'use client';

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  ReactNode,
} from 'react';
import { ThemeProvider as MuiThemeProvider, createTheme, responsiveFontSizes } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';

import { apiClient } from '@/services/api_client';

const DEFAULT_PRIMARY = '#6366f1';
const DEFAULT_SECONDARY = '#ec4899';
const TENANT_BRANDING_UPDATED_EVENT = 'tenant-branding-updated';

/**
 * Tenant branding configuration
 */
export interface TenantThemeConfig {
  tenantId: string;
  tenantName: string;
  colors?: {
    primary?: string;
    secondary?: string;
    font?: string;
  };
  logoUrl?: string;
}

interface TenantContextType {
  tenantId?: string;
  tenantName?: string;
  logoUrl?: string;
  config?: TenantThemeConfig;
  refreshBranding: () => Promise<void>;
  isBrandingReady: boolean;
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
      refreshBranding: async () => undefined,
      isBrandingReady: false,
    };
  }
  return context;
};

export const dispatchTenantBrandingUpdated = () => {
  if (typeof window === 'undefined') {
    return;
  }

  window.dispatchEvent(new CustomEvent(TENANT_BRANDING_UPDATED_EVENT));
};

export interface TenantAwareThemeProviderProps {
  children: ReactNode;
}

interface AdminTenantConfigResponse {
  tenant_nome?: string | null;
  logo_url?: string | null;
  primary_color?: string | null;
  secondary_color?: string | null;
  custom_settings?: Record<string, unknown> | null;
}

interface StoredUser {
  tenant_id?: string | null;
  tenant_name?: string | null;
  tenantName?: string | null;
}

interface StoredTenant {
  name?: string | null;
}

const safeJsonParse = <T,>(value: string | null): T | null => {
  if (!value) {
    return null;
  }

  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
};

const getStoredUser = (): StoredUser | null => {
  if (typeof window === 'undefined') {
    return null;
  }

  return (
    safeJsonParse<StoredUser>(sessionStorage.getItem('user')) ||
    safeJsonParse<StoredUser>(localStorage.getItem('user'))
  );
};

const getStoredTenantName = (): string | undefined => {
  if (typeof window === 'undefined') {
    return undefined;
  }

  const impersonatedTenant = safeJsonParse<StoredTenant>(sessionStorage.getItem('impersonate_tenant'));
  return impersonatedTenant?.name || getStoredUser()?.tenant_name || getStoredUser()?.tenantName || undefined;
};

const buildTenantThemeConfig = (config: AdminTenantConfigResponse): TenantThemeConfig => {
  const user = getStoredUser();
  const fontColor =
    typeof config.custom_settings?.font_color === 'string'
      ? config.custom_settings.font_color
      : '#FFFFFF';

  return {
    tenantId: user?.tenant_id || 'tenant',
    tenantName: config.tenant_nome || getStoredTenantName() || 'Meu Terreiro',
    logoUrl: config.logo_url || undefined,
    colors: {
      primary: config.primary_color || DEFAULT_PRIMARY,
      secondary: config.secondary_color || DEFAULT_SECONDARY,
      font: fontColor,
    },
  };
};

/**
 * T089: TenantAwareThemeProvider
 * Combines theme provider with tenant context
 */
export const TenantAwareThemeProvider: React.FC<TenantAwareThemeProviderProps> =
  ({ children }) => {
    const [tenantConfig, setTenantConfig] = useState<TenantThemeConfig | undefined>(undefined);
    const [isBrandingReady, setIsBrandingReady] = useState(false);

    const refreshBranding = useCallback(async () => {
      if (typeof window === 'undefined') {
        return;
      }

      const hasToken =
        Boolean(sessionStorage.getItem('access_token')) ||
        document.cookie.includes('auth_state=1') ||
        Boolean(localStorage.getItem('user'));

      if (!hasToken) {
        setTenantConfig(undefined);
        setIsBrandingReady(true);
        return;
      }

      try {
        const response = await apiClient.get<AdminTenantConfigResponse>('/api/v1/admin/tenant/config');
        setTenantConfig(buildTenantThemeConfig(response.data));
      } catch {
        setTenantConfig(undefined);
      } finally {
        setIsBrandingReady(true);
      }
    }, []);

    useEffect(() => {
      void refreshBranding();
    }, [refreshBranding]);

    useEffect(() => {
      const handleBrandingUpdated = () => {
        void refreshBranding();
      };

      window.addEventListener(TENANT_BRANDING_UPDATED_EVENT, handleBrandingUpdated);
      return () => {
        window.removeEventListener(TENANT_BRANDING_UPDATED_EVENT, handleBrandingUpdated);
      };
    }, [refreshBranding]);

    const theme = useMemo(
      () =>
        responsiveFontSizes(
          createTheme({
            palette: {
              mode: 'light',
              primary: { main: tenantConfig?.colors?.primary || DEFAULT_PRIMARY },
              secondary: { main: tenantConfig?.colors?.secondary || DEFAULT_SECONDARY },
            },
            shape: {
              borderRadius: 16,
            },
          })
        ),
      [tenantConfig]
    );

    const tenantContextValue = useMemo<TenantContextType>(
      () => ({
        tenantId: tenantConfig?.tenantId,
        tenantName: tenantConfig?.tenantName,
        logoUrl: tenantConfig?.logoUrl,
        config: tenantConfig,
        refreshBranding,
        isBrandingReady,
      }),
      [tenantConfig, refreshBranding, isBrandingReady]
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
