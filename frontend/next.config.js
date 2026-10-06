const path = require('path');
// SDK 10: importar de `@sentry/nextjs/config` (o import pela raiz do pacote é
// deprecado, imprime aviso no build e deixa de funcionar no v11).
const { withSentryConfig } = require('@sentry/nextjs/config');

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // swcMinify removido no Next 15 (SWC minify é o padrão);
  // outputFileTracingRoot saiu de experimental para top-level no Next 15.
  output: 'standalone',
  outputFileTracingRoot: path.join(__dirname, '../'),
  transpilePackages: ['shared-types'],
  generateBuildId: async () => {
    const { execSync } = require('child_process');
    try {
      return execSync('git rev-parse --short HEAD').toString().trim();
    } catch {
      return `build-${Date.now()}`;
    }
  },
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api',
    // Versão da UI (rodapé da sidebar e menu do usuário) — lida do package.json, ver src/lib/version.ts.
    NEXT_PUBLIC_UI_VERSION: require('./package.json').version,
  },
  // Production: immutable cache for hashed assets.
  // In development, never force immutable caching on /_next/static because it breaks HMR.
  // Proxy /api/:path* to backend (enables <img src="/api/..."> to work locally)
  async rewrites() {
    const backendBase = process.env.INTERNAL_API_URL || 'http://localhost:8000';
    return [
      {
        source: '/api/:path*',
        destination: `${backendBase}/api/:path*`,
      },
    ];
  },
  async headers() {
    if (process.env.NODE_ENV !== 'production') {
      return [
        {
          source: '/_next/static/:path*',
          headers: [
            {
              key: 'Cache-Control',
              value: 'no-store, no-cache, must-revalidate',
            },
          ],
        },
        {
          source: '/:path*',
          headers: [
            {
              key: 'X-Build-Id',
              value: process.env.BUILD_ID || 'dev',
            },
          ],
        },
      ];
    }

    return [
      {
        source: '/_next/static/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
        ],
      },
      {
        source: '/:path*',
        headers: [
          {
            key: 'X-Build-Id',
            value: process.env.BUILD_ID || 'dev',
          },
        ],
      },
    ];
  },
  // Polling-based file watching for Docker on Windows
  webpack: (config, { dev }) => {
    if (dev) {
      config.watchOptions = {
        poll: 1000,
        aggregateTimeout: 300,
      };
    }
    return config;
  },
};

module.exports = withSentryConfig(nextConfig, {
  // Logs do plugin só quando há DSN. O SDK é sempre empacotado; sem DSN no
  // build (NEXT_PUBLIC_SENTRY_DSN é ARG do Dockerfile) ele só não envia nada.
  // O plugin de build roda sempre, salvo `sourcemaps.disable`.
  silent: !process.env.NEXT_PUBLIC_SENTRY_DSN,
  // Upload de source maps — requer SENTRY_AUTH_TOKEN no build; sem token o
  // plugin pula o upload com aviso, sem quebrar o build.
  authToken: process.env.SENTRY_AUTH_TOKEN,
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  // Não expor código-fonte em prod. `hideSourceMaps` foi removido no SDK 9:
  // agora o SDK sempre gera source maps "hidden" no cliente (sem o comentário
  // sourceMappingURL) e os apaga do bundle depois do upload. Explícito aqui
  // pra não depender do default.
  sourcemaps: {
    deleteSourcemapsAfterUpload: true,
  },
  widenClientFileUpload: true,
});

