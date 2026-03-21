/**
 * useResponsive — Common responsive breakpoint helpers.
 * Follows the same pattern used in porta.tsx and admin_layout.tsx.
 */
import { useTheme, useMediaQuery } from '@mui/material';

export function useResponsive() {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));   // < 600px
  const isTablet = useMediaQuery(theme.breakpoints.between('sm', 'md')); // 600-900px
  const isDesktop = useMediaQuery(theme.breakpoints.up('md'));    // >= 900px

  return { isMobile, isTablet, isDesktop } as const;
}
