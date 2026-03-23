/**
 * Lightweight mock for @mui/icons-material subpath imports (e.g. /ConfirmationNumber).
 *
 * In pnpm workspaces where @mui/icons-material lives in frontend/node_modules/@mui/
 * but @mui/material is only at the root, Jest fails to resolve the @mui/material/useTheme
 * subpath that icon files import internally (this path is defined via the package.json
 * exports map, which Jest doesn't always resolve correctly across workspace boundaries).
 *
 * Mocking icons is a standard approach recommended by MUI for testing — icon rendering
 * is a visual concern, not business logic.
 */
const React = require('react');

const MockIcon = React.forwardRef(function MockIcon(props, ref) {
  return React.createElement('svg', { ...props, ref, 'data-testid': 'mock-icon' });
});

MockIcon.displayName = 'MockIcon';

module.exports = MockIcon;
module.exports.default = MockIcon;
module.exports.ReactComponent = MockIcon;
