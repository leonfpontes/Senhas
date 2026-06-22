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
    '^shared-ui/(.*)$': '<rootDir>/../packages/shared-ui/src/$1',
    '^shared-ui$': '<rootDir>/../packages/shared-ui/src/index.ts',
    '^shared-types$': '<rootDir>/../packages/shared-types/src/index.ts',
    // pnpm workspaces: @mui/icons-material is in frontend/node_modules/@mui/,
    // but @mui/material is only at the root. Icon files internally import
    // @mui/material/useTheme via the package.json exports map — a subpath Jest
    // can't resolve across workspace boundaries. Mocking all icon subpath imports
    // with a lightweight SVG stub is the standard approach for MUI testing.
    '^@mui/icons-material/(.*)$': '<rootDir>/__mocks__/mui-icon-mock.js',
    // next.config.js `modularizeImports` converts named imports like
    // `import { useTheme } from '@mui/material'` into subpath imports like
    // `import useTheme from '@mui/material/useTheme'`. Most subpaths have their
    // own directory in the package (Button/, AppBar/, useMediaQuery/, etc.),
    // but @mui/material v5.18 does not include a useTheme/ directory.
    // Map it to the CJS entry in the node/ build so Jest can load it.
    // Try frontend-local node_modules first (Docker container layout), fallback to root workspace
    '^@mui/material/useTheme$': '<rootDir>/node_modules/@mui/material/node/styles/useTheme',
    '^@mui/material/useMediaQuery$': '<rootDir>/node_modules/@mui/material/node/useMediaQuery',
  },
  testMatch: ['**/__tests__/**/*.[jt]s?(x)', '**/?(*.)+(spec|test).[jt]s?(x)'],
  moduleDirectories: ['node_modules', '<rootDir>/../node_modules'],
};

// createJestConfig is exported this way to ensure that next/jest can load the Next.js config which is async
module.exports = createJestConfig(customJestConfig);
