/**
 * MiniSite — o site do terreiro em miniatura (só para olhar): a mesma `PublicSite` num
 * quadro de celular reduzido. Usado no começo guiado e na escolha de estilo.
 */
import React from 'react';
import { cn } from '@/lib/utils';
import type { PublicSiteData } from '../types';
import { PublicSite } from '../PublicSite';

export function MiniSite({ site, width = 220, height = 400, className }: { site: PublicSiteData; width?: number; height?: number; className?: string }) {
  const scale = width / 375;
  return (
    <div
      aria-hidden
      className={cn('pointer-events-none relative shrink-0 overflow-hidden rounded-[18px] border-4 border-foreground/80 bg-background shadow-md', className)}
      style={{ width: width + 8, height }}
    >
      <div style={{ width: 375, transform: `scale(${scale})`, transformOrigin: 'top left' }}>
        <PublicSite site={site} mode="preview" className="min-h-0" />
      </div>
    </div>
  );
}
