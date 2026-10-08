/**
 * Os providers globais do painel (assinatura, permissões, aniversariantes) só chamam
 * `/api/v1/admin/*` quando a rota é do painel (`/admin/*`) e a conta tem o painel (AM-04).
 *
 * Médium puro nunca dispara chamada de admin (seria 403 em série no console e no Sentry), e na
 * Área do Médium o painel não carrega nada. A rota vem do `next/compat/router` (null fora do
 * Next, ex. testes que não montam o roteador: aí vale o comportamento antigo, sem filtro de rota).
 * A conta vem do perfil carregado ou, enquanto ele não chega, do usuário guardado no login.
 */
import { useRouter } from 'next/compat/router';
import { useProfile } from '@/hooks/useProfile';
import { isAdminRoute, knownWithoutAdminArea, readStoredUser } from '@/lib/areas';

export function useCurrentPathname(): string | null {
  const router = useRouter();
  return router?.pathname ?? null;
}

export function useAdminDataEnabled(): boolean {
  const pathname = useCurrentPathname();
  const { profile } = useProfile();
  if (pathname !== null && !isAdminRoute(pathname)) return false;
  const user = profile ?? readStoredUser();
  return !knownWithoutAdminArea(user);
}
