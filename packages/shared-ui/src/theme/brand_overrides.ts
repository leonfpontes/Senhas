/**
 * T082: Tenant Branding Overrides
 * Apply tenant-specific colors and customizations to Material-UI theme
 * Provides color manipulation functions for light/dark variants
 */

import { ThemeOptions } from '@mui/material/styles';

/**
 * Helper function to lighten a color (hex)
 * @param color - Hex color string
 * @param amount - Amount to lighten (0-1)
 * @returns Lightened hex color
 */
export function lightenColor(color: string, amount: number): string {
  const usePound = color[0] === '#';
  const col = usePound ? color.slice(1) : color;
  const num = parseInt(col, 16);
  const r = Math.min(255, Math.floor(num / 65536) + Math.round(255 * amount));
  const g = Math.min(255, Math.floor((num / 256) % 256) + Math.round(255 * amount));
  const b = Math.min(255, (num % 256) + Math.round(255 * amount));
  return (usePound ? '#' : '') + (0x1000000 + r * 0x10000 + g * 0x100 + b).toString(16).slice(1);
}

/**
 * Helper function to darken a color (hex)
 * @param color - Hex color string
 * @param amount - Amount to darken (0-1)
 * @returns Darkened hex color
 */
export function darkenColor(color: string, amount: number): string {
  const usePound = color[0] === '#';
  const col = usePound ? color.slice(1) : color;
  const num = parseInt(col, 16);
  const r = Math.max(0, Math.floor(num / 65536) - Math.round(255 * amount));
  const g = Math.max(0, Math.floor((num / 256) % 256) - Math.round(255 * amount));
  const b = Math.max(0, (num % 256) - Math.round(255 * amount));
  return (usePound ? '#' : '') + (0x1000000 + r * 0x10000 + g * 0x100 + b).toString(16).slice(1);
}

/**
 * Calculate contrast text color (black or white) based on background luminance
 * WCAG AA compliant
 */
export function getContrastColor(hexColor: string): string {
  const col = hexColor.replace('#', '');
  const r = parseInt(col.substr(0, 2), 16);
  const g = parseInt(col.substr(2, 2), 16);
  const b = parseInt(col.substr(4, 2), 16);

  // Calculate luminance using WCAG formula
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;

  return luminance > 0.5 ? '#000000' : '#ffffff';
}

/**
 * Interface for tenant branding colors
 */
export interface TenantBrandingColors {
  primary?: string;
  secondary?: string;
  success?: string;
  error?: string;
  warning?: string;
  info?: string;
}

/**
 * T082: Apply tenant branding to Material-UI theme
 * @param baseTheme - Base theme options
 * @param colors - Tenant-specific colors
 * @returns Updated theme with tenant branding
 */
export function applyTenantBranding(
  baseTheme: ThemeOptions,
  colors: TenantBrandingColors
): ThemeOptions {
  const theme = { ...baseTheme };

  if (!theme.palette) {
    theme.palette = {};
  } else {
    theme.palette = { ...theme.palette };
  }

  // Apply primary color with light/dark variants
  if (colors.primary) {
    theme.palette.primary = {
      main: colors.primary,
      light: lightenColor(colors.primary, 0.2),
      dark: darkenColor(colors.primary, 0.2),
      contrastText: getContrastColor(colors.primary),
    };
  }

  // Apply secondary color with light/dark variants
  if (colors.secondary) {
    theme.palette.secondary = {
      main: colors.secondary,
      light: lightenColor(colors.secondary, 0.2),
      dark: darkenColor(colors.secondary, 0.2),
      contrastText: getContrastColor(colors.secondary),
    };
  }

  // Apply status colors
  if (colors.success) {
    theme.palette.success = {
      main: colors.success,
      light: lightenColor(colors.success, 0.2),
      dark: darkenColor(colors.success, 0.2),
    };
  }

  if (colors.error) {
    theme.palette.error = {
      main: colors.error,
      light: lightenColor(colors.error, 0.2),
      dark: darkenColor(colors.error, 0.2),
    };
  }

  if (colors.warning) {
    theme.palette.warning = {
      main: colors.warning,
      light: lightenColor(colors.warning, 0.2),
      dark: darkenColor(colors.warning, 0.2),
    };
  }

  if (colors.info) {
    theme.palette.info = {
      main: colors.info,
      light: lightenColor(colors.info, 0.2),
      dark: darkenColor(colors.info, 0.2),
    };
  }

  return theme;
}

export default applyTenantBranding;
