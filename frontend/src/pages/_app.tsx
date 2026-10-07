import '@/styles/globals.css';

import React from 'react';
import { AppProps } from 'next/app';
import { TourProvider } from '@reactour/tour';
import TenantAwareThemeProvider from '@/providers/ThemeProvider';
import { SubscriptionProvider } from '@/hooks/useSubscription';
import { ProfileProvider } from '@/hooks/useProfile';
import { BirthdayProvider } from '@/providers/BirthdayProvider';
import { PermissionsProvider } from '@/hooks/usePermissions';
import { SnackbarProvider } from '@/contexts/SnackbarContext';
import { Toaster } from '@/components/ui/sonner';
import ClarityAnalytics from '@/components/shared/ClarityAnalytics';
import ServiceWorkerRegistrar from '@/components/shared/ServiceWorkerRegistrar';
import PassagemDeEntrada from '@/components/shared/PassagemDeEntrada';
import MarketingTags from '@/components/shared/MarketingTags';
import CookieConsent from '@/components/shared/CookieConsent';

/**
 * Estilos do popover do tour — responsivos.
 * maxWidth usa min() para não transbordar em telas pequenas.
 */
const tourStyles = {
  popover: (base: React.CSSProperties) => ({
    ...base,
    borderRadius: 12,
    padding: '20px 22px',
    maxWidth: 'min(400px, 90vw)',
    boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
    fontSize: '0.93rem',
    lineHeight: 1.55,
  }),
  badge: (base: React.CSSProperties) => ({
    ...base,
    backgroundColor: '#7c3aed',
  }),
  dot: (base: React.CSSProperties, state?: { current?: boolean }) => ({
    ...base,
    backgroundColor: state?.current ? '#7c3aed' : '#d4d4d4',
  }),
};

function MyApp({ Component, pageProps }: AppProps) {
  return (
    <>
      {/* GA4 + Google Ads (Consent Mode v2, tudo negado até a escolha) e Meta Pixel (só com
          consentimento de marketing) — lib/marketingTags.ts. O banner registra a escolha. */}
      <MarketingTags />
      <CookieConsent />
      {/* PWA (P-01): registra public/sw.js em produção; em dev, desregistra */}
      <ServiceWorkerRegistrar />
      {/* Passagem animada marketing ⇄ telas de conta (só nesse trecho do site) */}
      <PassagemDeEntrada />
      <TenantAwareThemeProvider>
        <ProfileProvider>
          <SubscriptionProvider>
            <PermissionsProvider>
              <SnackbarProvider>
                {/* Microsoft Clarity — só com NEXT_PUBLIC_CLARITY_PROJECT_ID no build E consentimento de estatísticas */}
                <ClarityAnalytics />
                <BirthdayProvider>
                  {/* steps=[] pois cada página os injeta via useTour() ao clicar no ícone ? */}
                  <TourProvider steps={[]} styles={tourStyles}>
                    <Component {...pageProps} />
                  </TourProvider>
                </BirthdayProvider>
                {/* Toasts (Sonner) — `useSnackbar()` e `toast()` desembocam aqui */}
                <Toaster />
              </SnackbarProvider>
            </PermissionsProvider>
          </SubscriptionProvider>
        </ProfileProvider>
      </TenantAwareThemeProvider>
    </>
  );
}

export default MyApp;
