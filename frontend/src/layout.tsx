/**
 * T090: Root Layout with Theme Provider
 * Next.js App Entry Point with Material-UI Theme
 * Configure routing, layout, and global providers
 */

import React from 'react';
import type { ReactNode } from 'react';
import TenantAwareThemeProvider from '@/providers/ThemeProvider';
import './globals.css';

interface RootLayoutProps {
  children: ReactNode;
}

export const metadata = {
  title: 'Senhas - Sistema de Gestão de Senhas',
  description: 'Sistema Multi-Tenant de Gestão de Senhas para Terreiros de Umbanda',
  viewport: 'width=device-width, initial-scale=1.0',
};

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <head>
        <meta charSet="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <meta
          name="description"
          content="Sistema Multi-Tenant de Gestão de Senhas para Terreiros de Umbanda"
        />
        {/* Roboto font from Google Fonts */}
        <link
          rel="preconnect"
          href="https://fonts.googleapis.com"
        />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Roboto:wght@300;400;500;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body suppressHydrationWarning>
        <TenantAwareThemeProvider>
          {children}
        </TenantAwareThemeProvider>
      </body>
    </html>
  );
}
