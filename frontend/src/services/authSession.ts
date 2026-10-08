/**
 * Fecha o login no navegador depois que o backend abriu a sessão (cookies HttpOnly
 * access_token/refresh_token + auth_state — ver CLAUDE.md). Usado no /login e na
 * reativação de conta, que também já entra direto, e na escolha do terreiro quando o mesmo
 * e-mail tem conta em mais de um (AM-05, `selectAccount`). Também concentra o "Sair" (painel e
 * Área do Médium).
 */
import * as Sentry from '@sentry/nextjs';
import { dispatchTenantBrandingUpdated } from '@/providers/ThemeProvider';
import type { UserAreas } from '@/hooks/useProfile';
import { routeAfterLogin } from '@/lib/areas';
import { apiClient, endImpersonation, type ApiRequestConfig } from '@/services/api_client';

export interface SessionUser {
  id: string;
  role: string;
  tenant_id?: string | null;
  email?: string;
  username?: string;
  /** Áreas da conta (AM-02/AM-04), vindas da resposta do login. */
  areas?: UserAreas | null;
}

/** Um terreiro em que a senha conferiu (AM-05) — resposta do `/auth/login` com `choose_account`. */
export interface AccountOption {
  user_id: string;
  terreiro_nome: string;
  terreiro_slug?: string | null;
  logo_url?: string | null;
  areas: { admin: boolean; medium: boolean };
}

/** O e-mail tem conta em mais de um terreiro e a senha conferiu em mais de uma (AM-05). */
export interface AccountChoice {
  choose_account: true;
  /** JWT `account_select` de 5 min — só serve para o `/auth/login/select`. */
  selection_token: string;
  options: AccountOption[];
}

export const LOGIN_SELECT_PATH = '/api/v1/auth/login/select';

export function isAccountChoice(data: unknown): data is AccountChoice {
  const d = data as Partial<AccountChoice> | null | undefined;
  return Boolean(d && d.choose_account === true && typeof d.selection_token === 'string' && Array.isArray(d.options));
}

/**
 * Abre a sessão no terreiro escolhido (`POST /auth/login/select`) e devolve o `user` (com as
 * `areas`) para o `completeLogin`. `skipAutoLogout`: o 401 aqui é "escolha expirada" (a tela volta
 * ao e-mail e senha), nunca sessão vencida — sem isso o api_client tentaria o refresh e deslogaria.
 */
export async function selectAccount(choice: AccountChoice, userId: string): Promise<SessionUser> {
  const res = await apiClient.post(
    LOGIN_SELECT_PATH,
    { selection_token: choice.selection_token, user_id: userId },
    { skipAutoLogout: true } as ApiRequestConfig,
  );
  return { ...(res.data.user as SessionUser), areas: res.data.areas };
}

/**
 * Guarda o `user` (com as `areas`), avisa os providers e recarrega na área certa (AM-04,
 * plano §6.4): super admin → /platform; só painel → /admin/dashboard; só médium → /medium;
 * as duas → escolha lembrada neste aparelho ou /escolher-area; nenhuma → /medium (aviso neutro).
 */
export function completeLogin(user: SessionUser): void {
  // access_token chega como cookie HttpOnly — não armazenar em localStorage
  localStorage.setItem('user', JSON.stringify(user));
  Sentry.setUser({ id: user.id, role: user.role });
  if (user.tenant_id) Sentry.setTag('tenant_id', user.tenant_id);
  dispatchTenantBrandingUpdated();
  // Recarga completa para os providers do _app remontarem já com a sessão.
  window.location.href = routeAfterLogin(user);
}

function safeSessionItem(key: string): string | null {
  try {
    return window.sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

/**
 * "Sair" do menu do usuário (painel e Área do Médium).
 *
 * Impersonação: os cookies deste navegador são do SUPER-ADMIN — o /auth/logout
 * revogaria e apagaria a sessão dele na plataforma. Sair aqui = encerrar só a
 * impersonação (limpa o sessionStorage desta aba e fecha/volta ao login).
 * Fora dela: `POST /api/v1/auth/logout` (apaga os cookies HttpOnly) e depois o `user` local.
 */
export async function logout(push: (url: string) => unknown, onCleared?: () => void): Promise<void> {
  if (safeSessionItem('impersonating')) {
    endImpersonation();
    return;
  }
  try {
    await apiClient.post('/api/v1/auth/logout');
  } catch {
    /* non-critical */
  }
  localStorage.removeItem('user');
  onCleared?.();
  Sentry.setUser(null);
  push('/login');
}
