/**
 * Fecha o login no navegador depois que o backend abriu a sessão (cookies HttpOnly
 * access_token/refresh_token + auth_state — ver CLAUDE.md). Usado no /login e na
 * reativação de conta, que também já entra direto.
 */
import * as Sentry from '@sentry/nextjs';
import { dispatchTenantBrandingUpdated } from '@/providers/ThemeProvider';

export interface SessionUser {
  id: string;
  role: string;
  tenant_id?: string | null;
  email?: string;
  username?: string;
}

/** Guarda o `user`, avisa os providers e recarrega na área certa. */
export function completeLogin(user: SessionUser): void {
  // access_token chega como cookie HttpOnly — não armazenar em localStorage
  localStorage.setItem('user', JSON.stringify(user));
  Sentry.setUser({ id: user.id, role: user.role });
  if (user.tenant_id) Sentry.setTag('tenant_id', user.tenant_id);
  dispatchTenantBrandingUpdated();
  // Recarga completa para os providers do _app remontarem já com a sessão.
  window.location.href = user.role === 'super_admin' ? '/platform' : '/admin/dashboard';
}
