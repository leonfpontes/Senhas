/**
 * Organic-growth footer shown on public pages (ticket emission, etc.) so
 * consulentes recognize the GiraHub brand across different terreiros and
 * can click through to the marketing site.
 */
'use client';

import { Box, Typography } from '@mui/material';

const GIRAHUB_URL = 'https://girahub.com.br';

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
  }
}

export default function PoweredByGiraHubFooter() {
  const handleClick = () => {
    window.gtag?.('event', 'click_powered_by_girahub', {
      event_category: 'organic_growth',
      event_label: 'public_ticket_footer',
    });
  };

  return (
    <Box
      component="a"
      href={`${GIRAHUB_URL}?utm_source=senha&utm_medium=footer&utm_campaign=organic_referral`}
      target="_blank"
      rel="noopener noreferrer"
      onClick={handleClick}
      sx={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 0.75,
        mt: 4,
        py: 2,
        textDecoration: 'none',
        opacity: 0.65,
        transition: 'opacity 0.15s',
        '&:hover': { opacity: 1 },
      }}
    >
      <Box component="img" src="/favicon.svg" alt="" sx={{ width: 16, height: 16 }} />
      <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: 12 }}>
        Powered by{' '}
        <Box component="span" sx={{ fontWeight: 700, color: 'primary.main' }}>
          GiraHub
        </Box>
      </Typography>
    </Box>
  );
}
