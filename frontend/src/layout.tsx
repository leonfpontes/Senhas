/**
 * Next.js App Entry Point
 * Configure routing, layout, and providers
 */

import React from 'react';
import type { ReactNode } from 'react';

interface RootLayoutProps {
  children: ReactNode;
}

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="pt-BR">
      <head>
        <title>Senhas - Sistema de Gestão de Senhas</title>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <meta
          name="description"
          content="Sistema Multi-Tenant de Gestão de Senhas para Terreiros de Umbanda"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
