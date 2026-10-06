import { Html, Head, Main, NextScript } from 'next/document';

export default function Document() {
  return (
    <Html lang="pt-BR">
      <Head>
        {/* Favicon — PNG/ICO gerados de favicon.svg por scripts/generate-icons.mjs */}
        <link rel="icon" href="/favicon.ico" sizes="any" />
        <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
        <meta name="theme-color" content="#4f46e5" />
        {/* PWA (P-01): a Porta instalada na tela inicial. Service worker em public/sw.js,
            registrado por components/shared/ServiceWorkerRegistrar (só em produção). */}
        <link rel="manifest" href="/manifest.webmanifest" />
        <meta name="application-name" content="GiraHub" />
        <meta name="mobile-web-app-capable" content="yes" />
        {/* iOS/iPadOS: Safari ignora boa parte do manifest — ícone, título e barra vêm daqui. */}
        <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="GiraHub" />
        {/* Fonte da interface: pilha do sistema (--font-sans em globals.css). As fontes do
            site do terreiro são carregadas pela própria página. */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      </Head>
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
