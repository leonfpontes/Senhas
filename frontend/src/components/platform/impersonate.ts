/**
 * Impersonação a partir da plataforma.
 *
 * `POST /api/v1/platform/impersonate/{user_id}` devolve um JWT de 1h; a nova aba abre
 * `/admin/impersonate` que guarda o token em sessionStorage. O token vai SÓ no fragmento
 * (`#token=…&user=…&tenant=…`), que não sai do navegador (não vai em log de servidor nem no
 * Referer). A página de entrada ainda aceita a query string, só para links antigos.
 *
 * A aba é aberta de forma SÍNCRONA no clique (antes de qualquer `await`) e só depois recebe o
 * endereço: `window.open` depois de um `await` perde o gesto do usuário e o bloqueador de pop-up
 * barra em silêncio. Se o navegador bloquear mesmo assim, a função lança um erro com orientação.
 * Sem `noopener` na chamada (com ele o `window.open` devolve `null` e não dá para navegar a aba);
 * o vínculo é cortado com `opener = null` logo em seguida.
 */
import { apiClient } from '@/services/api_client';

export interface ImpersonateResponse {
  access_token: string;
  user: { id: string; email: string; username: string; role: string };
  tenant: { id: string; name: string; slug: string };
}

export interface TenantUserLite {
  id: string;
  email: string;
  username: string;
  role: string;
  is_active: boolean;
  created_at: string;
}

export const POPUP_BLOCKED_MESSAGE =
  'O navegador bloqueou a nova aba. Permita pop-ups para este site e tente de novo.';

export function buildImpersonateUrl(data: ImpersonateResponse): string {
  const fragment = new URLSearchParams({
    token: data.access_token,
    user: btoa(JSON.stringify(data.user)),
    tenant: btoa(JSON.stringify(data.tenant)),
  });
  return `/admin/impersonate#${fragment.toString()}`;
}

/** Abre a aba vazia ainda dentro do clique; `null` se o navegador bloquear. */
function openPendingTab(): Window | null {
  const win = window.open('about:blank', '_blank');
  if (!win) return null;
  try {
    win.opener = null;
    win.document.title = 'Abrindo sessão…';
    win.document.body.textContent = 'Abrindo a sessão do terreiro…';
  } catch {
    /* aba de outra origem ou documento indisponível: segue sem o aviso */
  }
  return win;
}

function closeTab(win: Window | null) {
  try {
    win?.close();
  } catch {
    /* já fechada */
  }
}

/**
 * Abre uma nova aba operando como o usuário informado.
 * Chamar direto no handler do clique (sem `await` antes) para o pop-up não ser bloqueado.
 */
export async function impersonateUser(userId: string, pendingTab?: Window | null): Promise<ImpersonateResponse> {
  const win = pendingTab === undefined ? openPendingTab() : pendingTab;
  if (!win) throw new Error(POPUP_BLOCKED_MESSAGE);
  try {
    const res = await apiClient.post<ImpersonateResponse>(`/api/v1/platform/impersonate/${userId}`);
    win.location.href = buildImpersonateUrl(res.data);
    return res.data;
  } catch (err) {
    closeTab(win);
    throw err;
  }
}

/** Admin ativo mais antigo do terreiro (mesma regra do contato principal da ativação). */
export function pickTenantAdmin(users: TenantUserLite[]): TenantUserLite | null {
  const active = users.filter((u) => u.is_active && u.role.toUpperCase() === 'ADMIN');
  if (!active.length) return null;
  return [...active].sort((a, b) => a.created_at.localeCompare(b.created_at))[0];
}

/** "Entrar como admin de X": busca os usuários do terreiro e impersona o admin principal. */
export async function impersonateTenantAdmin(tenantId: string): Promise<ImpersonateResponse> {
  const win = openPendingTab();
  if (!win) throw new Error(POPUP_BLOCKED_MESSAGE);
  try {
    const res = await apiClient.get<TenantUserLite[]>(`/api/v1/platform/tenants/${tenantId}/users`);
    const admin = pickTenantAdmin(Array.isArray(res.data) ? res.data : []);
    if (!admin) throw new Error('Este terreiro não tem admin ativo para entrar como.');
    return await impersonateUser(admin.id, win);
  } catch (err) {
    closeTab(win);
    throw err;
  }
}
