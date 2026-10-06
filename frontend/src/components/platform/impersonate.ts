/**
 * Impersonação a partir da plataforma.
 *
 * `POST /api/v1/platform/impersonate/{user_id}` devolve um JWT de 1h; a nova aba abre
 * `/admin/impersonate` que guarda o token em sessionStorage. O token vai no fragmento
 * (`#token=`), que não sai do navegador (não vai em log de servidor nem no Referer); a query
 * string continua sendo enviada até a página de destino passar a ler o fragmento.
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

export function buildImpersonateUrl(data: ImpersonateResponse): string {
  const token = encodeURIComponent(data.access_token);
  const user = encodeURIComponent(btoa(JSON.stringify(data.user)));
  const tenant = encodeURIComponent(btoa(JSON.stringify(data.tenant)));
  return `/admin/impersonate?token=${token}&user=${user}&tenant=${tenant}#token=${token}`;
}

/** Abre uma nova aba operando como o usuário informado. */
export async function impersonateUser(userId: string): Promise<ImpersonateResponse> {
  const res = await apiClient.post<ImpersonateResponse>(`/api/v1/platform/impersonate/${userId}`);
  window.open(buildImpersonateUrl(res.data), '_blank', 'noopener');
  return res.data;
}

/** Admin ativo mais antigo do terreiro (mesma regra do contato principal da ativação). */
export function pickTenantAdmin(users: TenantUserLite[]): TenantUserLite | null {
  const active = users.filter((u) => u.is_active && u.role.toUpperCase() === 'ADMIN');
  if (!active.length) return null;
  return [...active].sort((a, b) => a.created_at.localeCompare(b.created_at))[0];
}

/** "Entrar como admin de X": busca os usuários do terreiro e impersona o admin principal. */
export async function impersonateTenantAdmin(tenantId: string): Promise<ImpersonateResponse> {
  const res = await apiClient.get<TenantUserLite[]>(`/api/v1/platform/tenants/${tenantId}/users`);
  const admin = pickTenantAdmin(Array.isArray(res.data) ? res.data : []);
  if (!admin) throw new Error('Este terreiro não tem admin ativo para entrar como.');
  return impersonateUser(admin.id);
}
