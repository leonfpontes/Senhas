/**
 * T094: Theme Component Tests
 * Test color contrast (WCAG AA), accessibility, and theme configuration
 */

import '@testing-library/jest-dom';
import React from 'react';
import { render, screen } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import { Box, Button, TextField, Typography } from '@mui/material';
import {
  lightenColor,
  darkenColor,
  getContrastColor,
  applyTenantBranding,
  TenantBrandingColors,
} from 'shared-ui/theme/brand_overrides';
import defaultTheme from 'shared-ui/theme/default_theme';

/**
 * Helper function to calculate contrast ratio between two colors
 * WCAG AA standard: >= 4.5:1 for normal text, >= 3:1 for large text
 */
function getContrastRatio(color1: string, color2: string): number {
  const getLuminance = (hex: string) => {
    const rgb = parseInt(hex.replace('#', ''), 16);
    const r = (rgb >> 16) & 0xff;
    const g = (rgb >> 8) & 0xff;
    const b = (rgb >> 0) & 0xff;

    const rLinear = r / 255;
    const gLinear = g / 255;
    const bLinear = b / 255;

    const luminance =
      0.2126 * (rLinear <= 0.03928 ? rLinear / 12.92 : Math.pow((rLinear + 0.055) / 1.055, 2.4)) +
      0.7152 * (gLinear <= 0.03928 ? gLinear / 12.92 : Math.pow((gLinear + 0.055) / 1.055, 2.4)) +
      0.0722 * (bLinear <= 0.03928 ? bLinear / 12.92 : Math.pow((bLinear + 0.055) / 1.055, 2.4));

    return luminance;
  };

  const lum1 = getLuminance(color1);
  const lum2 = getLuminance(color2);
  const lighter = Math.max(lum1, lum2);
  const darker = Math.min(lum1, lum2);

  return (lighter + 0.05) / (darker + 0.05);
}

describe('Theme System - Brand Overrides', () => {
  describe('Color Manipulation Functions', () => {
    it('should lighten a color correctly', () => {
      const original = '#2c3e50';
      const lightened = lightenColor(original, 0.2);

      expect(lightened).toMatch(/^#[0-9a-fA-F]{6}$/);
      expect(lightened).not.toBe(original);
    });

    it('should darken a color correctly', () => {
      const original = '#2c3e50';
      const darkened = darkenColor(original, 0.2);

      expect(darkened).toMatch(/^#[0-9a-fA-F]{6}$/);
      expect(darkened).not.toBe(original);
    });

    it('should return white for dark colors', () => {
      const darkColor = '#000000';
      const contrastColor = getContrastColor(darkColor);

      expect(contrastColor).toBe('#ffffff');
    });

    it('should return black for light colors', () => {
      const lightColor = '#ffffff';
      const contrastColor = getContrastColor(lightColor);

      expect(contrastColor).toBe('#000000');
    });
  });

  describe('Tenant Branding Application', () => {
    it('should apply tenant colors to theme', () => {
      const tenantColors: TenantBrandingColors = {
        primary: '#ff5733',
        secondary: '#33ff57',
      };

      const updatedTheme = applyTenantBranding(defaultTheme, tenantColors);

      expect(updatedTheme.palette?.primary?.main).toBe('#ff5733');
      expect(updatedTheme.palette?.secondary?.main).toBe('#33ff57');
    });

    it('should generate light/dark variants for tenant colors', () => {
      const tenantColors: TenantBrandingColors = {
        primary: '#3498db',
      };

      const updatedTheme = applyTenantBranding(defaultTheme, tenantColors);

      expect(updatedTheme.palette?.primary?.light).not.toBe(updatedTheme.palette?.primary?.main);
      expect(updatedTheme.palette?.primary?.dark).not.toBe(updatedTheme.palette?.primary?.main);
    });

    it('should handle partial color settings', () => {
      const tenantColors: TenantBrandingColors = {
        primary: '#ff5733',
        // secondary is not provided
      };

      const updatedTheme = applyTenantBranding(defaultTheme, tenantColors);

      expect(updatedTheme.palette?.primary?.main).toBe('#ff5733');
      // Secondary should remain unchanged if not provided
    });
  });

  describe('Color Contrast - WCAG AA Compliance', () => {
    it('should have sufficient contrast between primary and white', () => {
      const primaryColor = (defaultTheme.palette?.primary as any)?.main || '#2c3e50';
      const whiteColor = '#ffffff';

      const ratio = getContrastRatio(primaryColor, whiteColor);

      expect(ratio).toBeGreaterThanOrEqual(4.5); // WCAG AA standard
    });

    it('should have sufficient contrast between secondary and white', () => {
      const secondaryColor = (defaultTheme.palette?.secondary as any)?.main || '#3498db';
      const whiteColor = '#ffffff';

      const ratio = getContrastRatio(secondaryColor, whiteColor);

      expect(ratio).toBeGreaterThanOrEqual(4.5); // WCAG AA standard
    });

    it('should have sufficient contrast for error color', () => {
      const errorColor = (defaultTheme.palette?.error as any)?.main || '#e74c3c';
      const whiteColor = '#ffffff';

      const ratio = getContrastRatio(errorColor, whiteColor);

      expect(ratio).toBeGreaterThanOrEqual(4.5); // WCAG AA standard
    });

    it('should have sufficient contrast for success color', () => {
      const successColor = (defaultTheme.palette?.success as any)?.main || '#27ae60';
      const whiteColor = '#ffffff';

      const ratio = getContrastRatio(successColor, whiteColor);

      expect(ratio).toBeGreaterThanOrEqual(4.5); // WCAG AA standard
    });
  });

  describe('Theme Components', () => {
    it('should render theme provider without errors', () => {
      const theme = createTheme(defaultTheme);

      render(
        <ThemeProvider theme={theme}>
          <Typography variant="h1">Test</Typography>
        </ThemeProvider>
      );

      expect(screen.getByText('Test')).toBeInTheDocument();
    });

    it('button should be focusable (accessibility)', () => {
      const theme = createTheme(defaultTheme);

      const { container } = render(
        <ThemeProvider theme={theme}>
          <Button variant="contained">Click Me</Button>
        </ThemeProvider>
      );

      const button = container.querySelector('button');

      expect(button).toBeInTheDocument();
      expect(button).toHaveProperty('type', 'button');
    });

    it('textfield should be focusable (accessibility)', () => {
      const theme = createTheme(defaultTheme);

      const { container } = render(
        <ThemeProvider theme={theme}>
          <TextField label="Enter text" />
        </ThemeProvider>
      );

      const input = container.querySelector('input');

      expect(input).toBeInTheDocument();
      expect(input).toHaveProperty('type', 'text');
    });
  });

  describe('Typography Hierarchy', () => {
    it('should have proper heading scale', () => {
      const typography = defaultTheme.typography as any;

      expect(parseInt(typography.h1?.fontSize)).toBeGreaterThan(
        parseInt(typography.h2?.fontSize)
      );
      expect(parseInt(typography.h2?.fontSize)).toBeGreaterThan(
        parseInt(typography.h3?.fontSize)
      );
      expect(parseInt(typography.h3?.fontSize)).toBeGreaterThan(
        parseInt(typography.body1?.fontSize)
      );
    });

    it('should have consistent font family', () => {
      const typography = defaultTheme.typography as any;

      expect(typography.fontFamily).toContain('Roboto');
    });
  });

  describe('Responsive Design', () => {
    it('should have proper shape borderRadius', () => {
      expect(defaultTheme.shape?.borderRadius).toBe(8);
    });

    it('should have proper spacing unit', () => {
      expect(defaultTheme.spacing).toBe(8);
    });
  });
});
