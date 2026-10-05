/**
 * Microsoft Clarity — gravação de sessão, heatmaps e funis (tier gratuito).
 *
 * - Só carrega quando NEXT_PUBLIC_CLARITY_PROJECT_ID está definido no build
 *   (ARG do Dockerfile ← docker-compose.prod.yml ← .env da VPS).
 * - Marca cada sessão com tags de contexto (tenant, plano, trial, papel,
 *   superfície admin/pública) para filtrar gravações por tenant no painel
 *   do Clarity. Nunca envia e-mail, nome ou CPF: o `identify` recebe o
 *   UUID do usuário, que o próprio SDK faz hash antes de enviar.
 * - Clarity mascara inputs/texto sensível por padrão (modo "Balanced");
 *   os campos de CPF/e-mail da emissão pública já ficam cobertos.
 */
import { useEffect } from 'react';
import Script from 'next/script';
import { useRouter } from 'next/router';
import { useProfile } from '@/hooks/useProfile';
import { useSubscription } from '@/hooks/useSubscription';

declare global {
  interface Window {
    clarity?: (...args: unknown[]) => void;
  }
}

export const CLARITY_PROJECT_ID = process.env.NEXT_PUBLIC_CLARITY_PROJECT_ID || '';

/** Classifica a rota em uma superfície de produto para filtrar no Clarity. */
export function clarityScope(pathname: string): string {
  if (pathname.startsWith('/admin')) return 'admin';
  if (pathname.startsWith('/platform')) return 'platform';
  if (pathname.startsWith('/public')) return 'public';
  if (pathname === '/cadastro') return 'signup';
  if (pathname === '/login' || pathname.startsWith('/forgot-password') || pathname.startsWith('/reset-password')) {
    return 'auth';
  }
  if (pathname === '/' || pathname === '/privacidade' || pathname === '/termos' || pathname === '/status') {
    return 'marketing';
  }
  return 'tenant-site';
}

function setTag(key: string, value: string | null | undefined) {
  if (typeof window === 'undefined' || !window.clarity || !value) return;
  window.clarity('set', key, value);
}

export default function ClarityAnalytics() {
  const router = useRouter();
  const { profile } = useProfile();
  const { subscription } = useSubscription();

  // Superfície (admin/public/signup...) por rota — útil para funis de onboarding.
  useEffect(() => {
    if (!CLARITY_PROJECT_ID) return;
    setTag('scope', clarityScope(router.pathname));
  }, [router.pathname]);

  // Contexto do usuário autenticado — permite filtrar sessões por tenant/plano.
  useEffect(() => {
    if (!CLARITY_PROJECT_ID || !profile) return;
    if (window.clarity) {
      // identify(customId, sessionId?, pageId?, friendlyName?) — o SDK faz hash do customId.
      window.clarity('identify', profile.id, undefined, undefined, profile.tenant_name ?? undefined);
    }
    setTag('tenant_id', profile.tenant_id);
    setTag('tenant', profile.tenant_name);
    setTag('role', profile.role);
  }, [profile]);

  useEffect(() => {
    if (!CLARITY_PROJECT_ID || !subscription) return;
    setTag('plan', subscription.plan);
    setTag('trial', subscription.is_trial ? 'yes' : 'no');
  }, [subscription]);

  if (!CLARITY_PROJECT_ID) return null;

  return (
    <Script id="ms-clarity" strategy="afterInteractive">
      {`
        (function(c,l,a,r,i,t,y){
          c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};
          t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;
          y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);
        })(window, document, "clarity", "script", "${CLARITY_PROJECT_ID}");
      `}
    </Script>
  );
}
