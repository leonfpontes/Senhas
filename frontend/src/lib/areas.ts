/**
 * Áreas da conta (AM-04): painel do terreiro × Área do Médium.
 *
 * As áreas vêm do servidor (`areas` no login, em `/auth/me` e `/auth/profile` — AM-02), nunca
 * do token. Aqui ficam as regras do navegador: para onde mandar depois do login (plano §6.4) e
 * quando as telas/providers do painel podem chamar `/api/v1/admin/*` (médium puro nunca chama).
 *
 * Sem escolha lembrada (D-04 revisto em 23/10/2026): quem tem as duas áreas escolhe a cada login.
 * A escolha gravada em `girahub:area:{userId}` — e regravada pelo "Trocar de área" — fazia quem
 * passou pela Área uma vez cair nela em todo login, sem ver o painel.
 */
import type { UserAreas } from '@/hooks/useProfile';
import { trackEvent } from '@/services/analytics';

export type AreaChoice = 'admin' | 'medium';

export const AREA_HOME: Record<AreaChoice, string> = {
  admin: '/admin/dashboard',
  medium: '/medium',
};

export const ESCOLHER_AREA_PATH = '/escolher-area';

/** Aviso neutro de quem não tem área nenhuma (médium cujo terreiro perdeu o plano ou a chave). */
export const AREA_MEDIUM_INDISPONIVEL =
  'A Área do Médium não está disponível agora. Fale com a direção da casa.';

/** Usuário como guardado no navegador (login, perfil). */
export interface AreaUser {
  id?: string;
  role?: string;
  areas?: UserAreas | null;
}

const BACKOFFICE_ROLES = ['admin', 'operator'];

/** Tem o painel do terreiro. Sem `areas` (sessão antiga), decide pelo papel. */
export function hasAdminArea(user: AreaUser | null | undefined): boolean {
  if (!user) return false;
  if (user.role === 'super_admin') return true;
  if (user.areas) return Boolean(user.areas.admin);
  return BACKOFFICE_ROLES.includes(user.role ?? '');
}

export function hasMediumArea(user: AreaUser | null | undefined): boolean {
  return Boolean(user?.areas?.medium);
}

/**
 * Sabemos que a conta NÃO tem o painel (médium puro, ou papel `medium` numa sessão sem `areas`).
 * Sem informação (perfil ainda não chegou, papel desconhecido) devolve false: quem decide é o
 * servidor, e o painel continua funcionando como antes.
 */
export function knownWithoutAdminArea(user: AreaUser | null | undefined): boolean {
  if (!user || user.role === 'super_admin') return false;
  if (user.areas) return !user.areas.admin;
  return user.role === 'medium';
}

/**
 * Rota depois do login (plano §6.4):
 * super admin → /platform; só painel → /admin/dashboard; só médium → /medium; as duas →
 * /escolher-area (sempre); nenhuma → /medium (que mostra o aviso neutro, sem oferta de upgrade
 * ao médium).
 */
export function routeAfterLogin(user: AreaUser): string {
  if (user.role === 'super_admin') return '/platform';
  const admin = hasAdminArea(user);
  const medium = hasMediumArea(user);
  if (admin && medium) return ESCOLHER_AREA_PATH;
  if (admin) return AREA_HOME.admin;
  return AREA_HOME.medium;
}

/**
 * Escolha (tela /escolher-area) ou troca de área (menus): registra o evento `area_escolhida` e
 * devolve a rota da área.
 */
export function chooseArea(area: AreaChoice, origem: 'escolha' | 'troca'): string {
  trackEvent('area_escolhida', { area, origem });
  return AREA_HOME[area];
}

/** "Trocar de área": mesma sessão, só muda a rota. */
export function switchArea(area: AreaChoice): string {
  return chooseArea(area, 'troca');
}

export function isAdminRoute(pathname: string): boolean {
  return pathname === '/admin' || pathname.startsWith('/admin/');
}

export function isMediumRoute(pathname: string): boolean {
  return pathname === '/medium' || pathname.startsWith('/medium/');
}

/** Usuário guardado no navegador: impersonação (sessionStorage) antes do login normal. */
export function readStoredUser(): AreaUser | null {
  if (typeof window === 'undefined') return null;
  for (const read of [
    () => window.sessionStorage.getItem('user'),
    () => window.localStorage.getItem('user'),
  ]) {
    try {
      const raw = read();
      if (raw) return JSON.parse(raw) as AreaUser;
    } catch {
      /* ignora e tenta o próximo */
    }
  }
  return null;
}
