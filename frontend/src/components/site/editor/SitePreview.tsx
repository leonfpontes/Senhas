/**
 * SitePreview — prévia do rascunho com as MESMAS seções do site público.
 *
 * Como funciona: o `PublicSite` é renderizado dentro de um quadro de largura fixa
 * (375px celular / 1280px computador) e reduzido com `transform: scale()` para
 * caber no painel. As seções respondem à largura do quadro (container queries),
 * então o quadro de 375px mostra o layout de celular mesmo numa tela grande. A
 * barra "Retirar senha" do celular é desenhada por fora da área rolável, como no
 * site de verdade.
 */
import React, { useLayoutEffect, useRef, useState } from 'react';
import { Monitor, Smartphone } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import type { PublicSiteData } from '../types';
import { siteBrandColor } from '../lib';
import { PublicSite } from '../PublicSite';
import { MobileCtaBar } from '../MobileCtaBar';

export type PreviewViewport = 'mobile' | 'desktop';

const FRAME_WIDTH: Record<PreviewViewport, number> = { mobile: 375, desktop: 1280 };

export interface SitePreviewProps {
  site: PublicSiteData;
  viewport: PreviewViewport;
  onViewportChange: (v: PreviewViewport) => void;
  className?: string;
}

function useElementSize<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => setSize({ width: el.clientWidth, height: el.offsetHeight });
    update();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, size] as const;
}

export function SitePreview({ site, viewport, onViewportChange, className }: SitePreviewProps) {
  const [hostRef, host] = useElementSize<HTMLDivElement>();
  const [contentRef, content] = useElementSize<HTMLDivElement>();
  const frameWidth = FRAME_WIDTH[viewport];
  const available = Math.max(0, host.width - 16);
  const scale = available > 0 ? Math.min(1, available / frameWidth) : 1;
  const brandColor = siteBrandColor(site.sections);
  const isMobile = viewport === 'mobile';

  return (
    <div className={cn('flex h-full min-h-0 flex-col', className)} data-testid="site-preview">
      <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
        <p className="text-sm font-medium">
          Prévia <span className="text-muted-foreground">· {isMobile ? 'celular' : 'computador'}</span>
        </p>
        <ToggleGroup type="single" variant="outline" size="sm" value={viewport} onValueChange={(v) => v && onViewportChange(v as PreviewViewport)} aria-label="Tamanho da prévia">
          <ToggleGroupItem value="mobile" aria-label="Celular">
            <Smartphone />
          </ToggleGroupItem>
          <ToggleGroupItem value="desktop" aria-label="Computador">
            <Monitor />
          </ToggleGroupItem>
        </ToggleGroup>
      </div>

      <div ref={hostRef} className="min-h-0 flex-1 overflow-hidden bg-muted p-2">
        <div
          className={cn(
            'relative mx-auto h-full overflow-hidden bg-background shadow-md',
            isMobile ? 'rounded-[28px] border-[6px] border-foreground/80' : 'rounded-lg border border-border',
          )}
          style={{ width: Math.round(frameWidth * scale) + (isMobile ? 12 : 2) }}
        >
          <div className="absolute inset-0 overflow-x-hidden overflow-y-auto" data-testid="site-preview-scroll">
            <div style={{ height: Math.ceil(content.height * scale), position: 'relative' }}>
              <div
                ref={contentRef}
                style={{ width: frameWidth, transform: `scale(${scale})`, transformOrigin: 'top left', position: 'absolute', top: 0, left: 0 }}
              >
                <PublicSite site={site} mode="preview" className={cn('min-h-0', isMobile && 'pb-20')} />
              </div>
            </div>
          </div>
          {isMobile && (
            <div className="absolute bottom-0 left-0" style={{ width: frameWidth, transform: `scale(${scale})`, transformOrigin: 'bottom left' }}>
              <MobileCtaBar slug={site.slug} brandColor={brandColor} variant="inline" inert />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default SitePreview;
