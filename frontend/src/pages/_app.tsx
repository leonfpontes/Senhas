import React from 'react';
import { AppProps } from 'next/app';
import Script from 'next/script';
import { TourProvider } from '@reactour/tour';
import TenantAwareThemeProvider from '@/providers/ThemeProvider';
import { SubscriptionProvider } from '@/hooks/useSubscription';
import { ProfileProvider } from '@/hooks/useProfile';
import { BirthdayProvider } from '@/providers/BirthdayProvider';
import { PermissionsProvider } from '@/hooks/usePermissions';
import { SnackbarProvider } from '@/contexts/SnackbarContext';
import ClarityAnalytics from '@/components/shared/ClarityAnalytics';

/**
 * Estilos do popover do tour — responsivos e compatíveis com MUI.
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
      {/* Google Analytics 4 */}
      <Script strategy="afterInteractive" src="https://www.googletagmanager.com/gtag/js?id=G-BF9G0RFCDB" />
      <Script id="ga4-init" strategy="afterInteractive">
        {`
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          gtag('js', new Date());
          gtag('config', 'G-BF9G0RFCDB');
        `}
      </Script>
      <TenantAwareThemeProvider>
        <ProfileProvider>
          <SubscriptionProvider>
            <PermissionsProvider>
              <SnackbarProvider>
                {/* Microsoft Clarity — só ativo com NEXT_PUBLIC_CLARITY_PROJECT_ID no build */}
                <ClarityAnalytics />
                <BirthdayProvider>
                  {/* steps=[] pois cada página os injeta via useTour() ao clicar no ícone ? */}
                  <TourProvider steps={[]} styles={tourStyles}>
                    <Component {...pageProps} />
                  </TourProvider>
                </BirthdayProvider>
              </SnackbarProvider>
            </PermissionsProvider>
          </SubscriptionProvider>
        </ProfileProvider>
      </TenantAwareThemeProvider>
    </>
  );
}

export default MyApp;
