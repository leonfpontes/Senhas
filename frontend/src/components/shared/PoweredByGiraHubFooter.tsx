/**
 * Organic-growth footer shown on public pages (ticket emission, etc.) so
 * consulentes recognize the GiraHub brand across different terreiros and
 * can click through to the marketing site.
 */
'use client';

import React from 'react';

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
    <a
      href={`${GIRAHUB_URL}?utm_source=senha&utm_medium=footer&utm_campaign=organic_referral`}
      target="_blank"
      rel="noopener noreferrer"
      onClick={handleClick}
      data-slot="powered-by"
      className="mt-6 flex items-center justify-center gap-1.5 py-4 text-sm text-muted-foreground no-underline opacity-80 transition-opacity hover:opacity-100 focus-visible:rounded-md focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- ícone estático local de 16px */}
      <img src="/favicon.svg" alt="" width={16} height={16} className="size-4" />
      <span>
        Powered by <span className="font-bold text-foreground">GiraHub</span>
      </span>
    </a>
  );
}
