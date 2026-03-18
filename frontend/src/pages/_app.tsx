import React from 'react';
import { AppProps } from 'next/app';
import TenantAwareThemeProvider from '@/providers/ThemeProvider';

function MyApp({ Component, pageProps }: AppProps) {
  return (
    <TenantAwareThemeProvider>
      <Component {...pageProps} />
    </TenantAwareThemeProvider>
  );
}

export default MyApp;
