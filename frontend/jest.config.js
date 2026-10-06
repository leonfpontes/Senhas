/**
 * Jest Configuration for Frontend Testing
 */

const nextJest = require('next/jest');

const createJestConfig = nextJest({
  // Provide the path to your Next.js app to load next.config.js and .env files in your test environment
  dir: './',
});

// Add any custom config to be passed to Jest
const customJestConfig = {
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  testEnvironment: 'jest-environment-jsdom',
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^shared-types$': '<rootDir>/../packages/shared-types/src/index.ts',
    // @sentry/nextjs reads next/router's `.events` at import time (browserTracingIntegration),
    // which doesn't exist in jsdom — crashes any test that imports a page using Sentry.setUser().
    '^@sentry/nextjs$': '<rootDir>/__mocks__/sentry-nextjs-mock.js',
  },
  testMatch: ['**/__tests__/**/*.[jt]s?(x)', '**/?(*.)+(spec|test).[jt]s?(x)'],
  moduleDirectories: ['node_modules', '<rootDir>/../node_modules'],
};

// createJestConfig is exported this way to ensure that next/jest can load the Next.js config which is async
module.exports = createJestConfig(customJestConfig);
