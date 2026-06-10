/**
 * ProfileContext — provides the authenticated user profile to all admin pages.
 *
 * Mounted once in _app.tsx so every navigation avoids repeating the
 * GET /api/v1/auth/profile call that AdminLayoutInner previously triggered on
 * every mount.
 */
import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { apiClient } from '../services/api_client';

export interface UserProfile {
  id: string;
  email: string;
  username: string;
  full_name?: string | null;
  profile_photo_url?: string | null;
  tenant_id?: string | null;
  tenant_name?: string | null;
  role?: string;
}

interface ProfileContextValue {
  profile: UserProfile | null;
  loading: boolean;
  refresh: () => void;
}

const ProfileContext = createContext<ProfileContextValue>({
  profile: null,
  loading: true,
  refresh: () => {},
});

const hasAuthToken = (): boolean => {
  if (typeof window === 'undefined') return false;
  return (
    Boolean(sessionStorage.getItem('access_token')) ||
    Boolean(localStorage.getItem('access_token'))
  );
};

export function ProfileProvider({ children }: { children: React.ReactNode }) {
  // Always start with null — the lazy initializer that read localStorage was
  // causing a React hydration mismatch: SSR renders with null (window undefined)
  // but the client hydration re-ran the initializer and got a stored user,
  // making the Avatar text differ ("A" vs "E").
  // localStorage is loaded safely in the useEffect below (client-only).
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchProfile = useCallback(async () => {
    if (!hasAuthToken()) {
      setLoading(false);
      return;
    }
    try {
      const response = await apiClient.get<UserProfile>('/api/v1/auth/profile');
      const data = response.data;
      setProfile(data);

      // Guard: do not overwrite localStorage during impersonation to avoid
      // corrupting the superadmin's own session.
      const isImpersonating =
        typeof sessionStorage !== 'undefined' &&
        Boolean(sessionStorage.getItem('impersonating'));

      if (!isImpersonating) {
        const existing = localStorage.getItem('user');
        localStorage.setItem(
          'user',
          JSON.stringify({ ...(existing ? JSON.parse(existing) : {}), ...data }),
        );
      }
    } catch {
      // Keep the cached profile from localStorage on transient errors.
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Preload from storage client-side so the avatar renders immediately while
    // the API call is still in-flight. This runs only after hydration (no SSR).
    try {
      const stored = sessionStorage.getItem('user') || localStorage.getItem('user');
      if (stored) setProfile(JSON.parse(stored) as UserProfile);
    } catch {}
    fetchProfile();
    // fetchProfile is stable (useCallback with []), safe to omit from deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-fetch whenever a new token is stored (e.g. after signup or login via
  // client-side navigation). Ensures sidebar avatar/name updates without F5.
  useEffect(() => {
    const handleAuthChange = () => {
      fetchProfile();
    };
    window.addEventListener('tenant-branding-updated', handleAuthChange);
    return () => {
      window.removeEventListener('tenant-branding-updated', handleAuthChange);
    };
  }, [fetchProfile]);

  return (
    <ProfileContext.Provider value={{ profile, loading, refresh: fetchProfile }}>
      {children}
    </ProfileContext.Provider>
  );
}

export function useProfile() {
  return useContext(ProfileContext);
}
