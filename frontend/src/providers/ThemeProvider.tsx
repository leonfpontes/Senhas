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

import { apiClient } from '@/services/api_client';
import { applyBrand } from '@/lib/brand';
import { isAdminRoute, knownWithoutAdminArea, readStoredUser } from '@/lib/areas';
import { useCurrentPathname } from '@/hooks/useAdminDataEnabled';

// Igual ao default do backend (TenantConfig.primary_color) e ao theme-color do _document.
const DEFAULT_PRIMARY = '#4f46e5';
const DEFAULT_SECONDARY = '#ec4899';
const DEFAULT_FONT = '#FFFFFF';
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
  font_color?: string | null;
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
  const fontColor = typeof config.font_color === 'string' ? config.font_color : DEFAULT_FONT;

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
 * Contexto do terreiro (cores, logo, nome) + cores aplicadas como variáveis CSS (applyBrand).
 */
export const TenantAwareThemeProvider: React.FC<TenantAwareThemeProviderProps> =
  ({ children }) => {
    const [tenantConfig, setTenantConfig] = useState<TenantThemeConfig | undefined>(undefined);
    const [isBrandingReady, setIsBrandingReady] = useState(false);
    // O branding vem de /api/v1/admin/tenant/branding: só no painel e para quem tem o painel
    // (AM-04). Na Área do Médium a marca vem de /api/v1/medium/me (MediumProvider).
    const pathname = useCurrentPathname();
    const brandingRoute = pathname === null || isAdminRoute(pathname);

    const refreshBranding = useCallback(async () => {
      if (typeof window === 'undefined') {
        return;
      }

      if (!brandingRoute || knownWithoutAdminArea(readStoredUser())) {
        setIsBrandingReady(true);
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
        const response = await apiClient.get<AdminTenantConfigResponse>('/api/v1/admin/tenant/branding');
        setTenantConfig(buildTenantThemeConfig(response.data));
      } catch {
        setTenantConfig(undefined);
      } finally {
        setIsBrandingReady(true);
      }
    }, [brandingRoute]);

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

    // Cores do terreiro → tokens CSS do shadcn/Tailwind (--primary, --secondary, ...).
    // Roda a cada mudança de branding (login, troca de tenant, evento tenant-branding-updated).
    useEffect(() => {
      applyBrand(document.documentElement, {
        primary: tenantConfig?.colors?.primary || DEFAULT_PRIMARY,
        secondary: tenantConfig?.colors?.secondary || DEFAULT_SECONDARY,
        font: tenantConfig?.colors?.font || DEFAULT_FONT,
      });
    }, [tenantConfig]);

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
        {children}
      </TenantContext.Provider>
    );
  };

export default TenantAwareThemeProvider;
