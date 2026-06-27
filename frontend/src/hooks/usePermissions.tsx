import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { permissionGroupsService } from '../services/permissionGroupsService';
import { PermissionFeature } from '../constants/permissionFeatures';

type PermissionAction = 'view' | 'insert' | 'edit' | 'delete';

type FeaturePermissions = Record<PermissionAction, boolean>;

type UserPermissions = Record<PermissionFeature, FeaturePermissions>;

interface PermissionsContextValue {
  permissions: UserPermissions | null;
  loading: boolean;
  can: (feature: PermissionFeature, action: PermissionAction) => boolean;
  refresh: () => Promise<void>;
}

const PermissionsContext = createContext<PermissionsContextValue>({
  permissions: null,
  loading: true,
  can: () => false,
  refresh: async () => {},
});

const hasAuthToken = (): boolean => {
  if (typeof window === 'undefined') return false;
  return (
    Boolean(sessionStorage.getItem('access_token')) ||
    document.cookie.includes('auth_state=1') ||
    Boolean(localStorage.getItem('user'))
  );
};

export function PermissionsProvider({ children }: { children: React.ReactNode }) {
  const [permissions, setPermissions] = useState<UserPermissions | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchPermissions = useCallback(async () => {
    if (!hasAuthToken()) {
      setLoading(false);
      return;
    }
    try {
      const data = await permissionGroupsService.getMyPermissions();
      setPermissions(data as UserPermissions);
    } catch (error) {
      console.error('Failed to fetch user permissions:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch permissions on mount
  useEffect(() => {
    fetchPermissions();
  }, [fetchPermissions]);

  // Re-fetch on focus / visibilitychange (T1: Stale permissions mitigation)
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        fetchPermissions();
      }
    };

    const handleWindowFocus = () => {
      fetchPermissions();
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleWindowFocus);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleWindowFocus);
    };
  }, [fetchPermissions]);

  // Re-fetch when auth branding is updated (after login/logout/change)
  useEffect(() => {
    const handleAuthChange = () => {
      fetchPermissions();
    };
    window.addEventListener('tenant-branding-updated', handleAuthChange);
    return () => {
      window.removeEventListener('tenant-branding-updated', handleAuthChange);
    };
  }, [fetchPermissions]);

  // Evaluator helper
  const can = useCallback(
    (feature: PermissionFeature, action: PermissionAction): boolean => {
      if (!permissions) return false;
      const featPerms = permissions[feature];
      if (!featPerms) return false;
      return featPerms[action] ?? false;
    },
    [permissions]
  );

  return (
    <PermissionsContext.Provider
      value={{
        permissions,
        loading,
        can,
        refresh: fetchPermissions,
      }}
    >
      {children}
    </PermissionsContext.Provider>
  );
}

export function usePermissions() {
  return useContext(PermissionsContext);
}
