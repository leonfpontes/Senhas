import React from 'react';
import { AppProps } from 'next/app';
import TenantAwareThemeProvider from '@/providers/ThemeProvider';
import { SubscriptionProvider } from '@/hooks/useSubscription';
import { ProfileProvider } from '@/hooks/useProfile';

function MyApp({ Component, pageProps }: AppProps) {
  return (
    <TenantAwareThemeProvider>
      <ProfileProvider>
        <SubscriptionProvider>
          <Component {...pageProps} />
        </SubscriptionProvider>
      </ProfileProvider>
    </TenantAwareThemeProvider>
  );
}

export default MyApp;
