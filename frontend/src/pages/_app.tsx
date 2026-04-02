import React from 'react';
import { AppProps } from 'next/app';
import { TourProvider } from '@reactour/tour';
import TenantAwareThemeProvider from '@/providers/ThemeProvider';
import { SubscriptionProvider } from '@/hooks/useSubscription';
import { ProfileProvider } from '@/hooks/useProfile';
import { BirthdayProvider } from '@/providers/BirthdayProvider';

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
    <TenantAwareThemeProvider>
      <ProfileProvider>
        <SubscriptionProvider>
          <BirthdayProvider>
            {/* steps=[] pois cada página os injeta via useTour() ao clicar no ícone ? */}
            <TourProvider steps={[]} styles={tourStyles}>
              <Component {...pageProps} />
            </TourProvider>
          </BirthdayProvider>
        </SubscriptionProvider>
      </ProfileProvider>
    </TenantAwareThemeProvider>
  );
}

export default MyApp;
