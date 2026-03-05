/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  swcMinify: false,
  experimental: {
    // Disable SWC completely in favor of Babel
    optimizePackageImports: false,
  },
  compiler: {
    removeConsole: false,
    // Strip these entirely, don't rely on SWC
  },
  typescript: {
    tsconfigPath: './tsconfig.json',
    transpileOnly: true,
  },
  transpilePackages: ['shared-types', 'shared-ui'],
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api',
  },
  // Override webpack to skip SWC attempts
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.optimization = {
        ...config.optimization,
        minimize: false, // Disable all minification
      };
    }
    return config;
  },
};

module.exports = nextConfig;

