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
  const [profile, setProfile] = useState<UserProfile | null>(() => {
    // Initialise from localStorage so the sidebar avatar renders immediately
    // without waiting for the network round-trip.
    if (typeof window === 'undefined') return null;
    try {
      const stored =
        sessionStorage.getItem('user') || localStorage.getItem('user');
      return stored ? (JSON.parse(stored) as UserProfile) : null;
    } catch {
      return null;
    }
  });
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
    fetchProfile();
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
