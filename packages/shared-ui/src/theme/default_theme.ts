/**
 * T081: Default Theme Configuration
 * Material-UI v6 default palette and typography
 * Serves as base for tenant branding overrides
 */

import { ThemeOptions } from '@mui/material/styles';

export const defaultTheme: ThemeOptions = {
  palette: {
    primary: {
      main: '#2c3e50', // Deep blue-gray
      light: '#34495e',
      dark: '#1a252f',
      contrastText: '#ffffff',
    },
    secondary: {
      main: '#3498db', // Bright blue
      light: '#5dade2',
      dark: '#2980b9',
      contrastText: '#ffffff',
    },
    success: {
      main: '#27ae60', // Green
      light: '#2ecc71',
      dark: '#1e8449',
    },
    error: {
      main: '#e74c3c', // Red
      light: '#ec7063',
      dark: '#c0392b',
    },
    warning: {
      main: '#f39c12', // Orange
      light: '#f8b739',
      dark: '#d68910',
    },
    info: {
      main: '#16a085', // Teal
      light: '#1abc9c',
      dark: '#117a65',
    },
    background: {
      default: '#ecf0f1', // Light gray
      paper: '#ffffff', // White
    },
    text: {
      primary: '#2c3e50',
      secondary: '#7f8c8d',
      disabled: '#bdc3c7',
    },
    divider: '#bdc3c7',
  },
  typography: {
    fontFamily: '"Roboto", "Helvetica", "Arial", sans-serif',
    h1: {
      fontSize: '2.5rem',
      fontWeight: 700,
      lineHeight: 1.2,
      letterSpacing: '-0.01562em',
    },
    h2: {
      fontSize: '2rem',
      fontWeight: 700,
      lineHeight: 1.3,
      letterSpacing: '-0.0083em',
    },
    h3: {
      fontSize: '1.75rem',
      fontWeight: 700,
      lineHeight: 1.4,
    },
    h4: {
      fontSize: '1.5rem',
      fontWeight: 700,
      lineHeight: 1.4,
    },
    h5: {
      fontSize: '1.25rem',
      fontWeight: 600,
      lineHeight: 1.5,
    },
    h6: {
      fontSize: '1rem',
      fontWeight: 600,
      lineHeight: 1.6,
    },
    body1: {
      fontSize: '1rem',
      lineHeight: 1.5,
      letterSpacing: '0.03125em',
    },
    body2: {
      fontSize: '0.875rem',
      lineHeight: 1.43,
      letterSpacing: '0.0178571429em',
    },
    button: {
      fontSize: '0.875rem',
      fontWeight: 600,
      lineHeight: 1.75,
      letterSpacing: '0.0892857143em',
      textTransform: 'uppercase',
    },
    caption: {
      fontSize: '0.75rem',
      lineHeight: 1.66,
      letterSpacing: '0.0333333333em',
    },
    overline: {
      fontSize: '0.75rem',
      fontWeight: 600,
      lineHeight: 2.66,
      letterSpacing: '0.1666666667em',
      textTransform: 'uppercase',
    },
  },
  shape: {
    borderRadius: 8,
  },
  spacing: 8,
};

export default defaultTheme;
