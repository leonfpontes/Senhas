const path = require('path');

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,
  output: 'standalone',
  experimental: {
    outputFileTracingRoot: path.join(__dirname, '../'),
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  transpilePackages: ['shared-types', 'shared-ui', 'jspdf', 'html2canvas'],
  webpack: (config) => {
    // Garante resolução de módulos do node_modules da raiz do monorepo
    // (necessário para pacotes hoistados pelo npm workspaces, ex.: jspdf, html2canvas)
    config.resolve.modules = [
      ...(config.resolve.modules || ['node_modules']),
      path.join(__dirname, 'node_modules'),
      path.join(__dirname, '../node_modules'),
    ];
    return config;
  },
  // Generate unique build ID per build for cache busting
  generateBuildId: async () => {
    return `build-${Date.now()}`;
  },
  modularizeImports: {
    '@mui/icons-material': {
      transform: '@mui/icons-material/{{member}}',
    },
    '@mui/material': {
      transform: '@mui/material/{{member}}',
    },
  },
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api',
  },
  // Production: immutable cache for hashed assets.
  // In development, never force immutable caching on /_next/static because it breaks HMR.
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

module.exports = nextConfig;

