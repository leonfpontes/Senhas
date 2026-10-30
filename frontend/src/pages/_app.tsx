import '@/styles/globals.css';

import React from 'react';
import { AppProps } from 'next/app';
import { TourProvider } from '@reactour/tour';
import TenantAwareThemeProvider from '@/providers/ThemeProvider';
import { SubscriptionProvider } from '@/hooks/useSubscription';
import { ProfileProvider } from '@/hooks/useProfile';
import { BirthdayProvider } from '@/providers/BirthdayProvider';
import { PermissionsProvider } from '@/hooks/usePermissions';
import { MediumProvider } from '@/components/medium/MediumProvider';
import { SnackbarProvider } from '@/contexts/SnackbarContext';
import { Toaster } from '@/components/ui/sonner';
import ClarityAnalytics from '@/components/shared/ClarityAnalytics';
import ServiceWorkerRegistrar from '@/components/shared/ServiceWorkerRegistrar';
import PassagemDeEntrada from '@/components/shared/PassagemDeEntrada';
import MarketingTags from '@/components/shared/MarketingTags';
import CookieConsent from '@/components/shared/CookieConsent';
import { tourStyles } from '@/tours/tourStyles';

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
      {/* Providers do painel (tema do terreiro, assinatura, permissões, aniversariantes) só chamam
          /api/v1/admin/* em rota /admin/* e para quem tem o painel; o MediumProvider só chama
          /api/v1/medium/me em /medium/* (AM-04/AM-06 — médium puro nunca chama o admin). */}
      <TenantAwareThemeProvider>
        <ProfileProvider>
          <MediumProvider>
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
          </MediumProvider>
        </ProfileProvider>
      </TenantAwareThemeProvider>
    </>
  );
}

export default MyApp;
