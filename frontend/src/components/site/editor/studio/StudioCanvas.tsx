/**
 * StudioCanvas — a tela do estúdio: o site de verdade (`PublicSite`) no tamanho do aparelho
 * escolhido (computador, tablet ou celular), reduzido para caber, com edição direto nele.
 *
 * Como na `SitePreview`, o site é desenhado num quadro de largura fixa e reduzido com
 * `transform: scale()`; as seções respondem à largura do quadro (container queries).
 * Ao escolher uma seção pela lista, a tela rola até ela.
 */
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import type { PublicSiteData } from '../../types';
import { PublicSite } from '../../PublicSite';
import type { SiteEditing } from '../../EditableFrame';

export type StudioDevice = 'desktop' | 'tablet' | 'mobile';

export const DEVICE_WIDTH: Record<StudioDevice, number> = { desktop: 1280, tablet: 820, mobile: 390 };
export const DEVICE_LABEL: Record<StudioDevice, string> = { desktop: 'Computador', tablet: 'Tablet', mobile: 'Celular' };

export function useElementSize<T extends HTMLElement>() {
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

/** Conteúdo de largura fixa reduzido para `scale`, ocupando a altura já reduzida. */
export function ScaledFrame({ width, scale, children }: { width: number; scale: number; children: React.ReactNode }) {
  const [contentRef, content] = useElementSize<HTMLDivElement>();
  return (
    <div style={{ height: Math.ceil(content.height * scale), position: 'relative', width: Math.round(width * scale) }}>
      <div
        ref={contentRef}
        style={
          {
            width,
            transform: `scale(${scale})`,
            transformOrigin: 'top left',
            position: 'absolute',
            top: 0,
            left: 0,
            '--ui-scale': String(scale > 0 ? Math.min(2.5, 1 / scale) : 1),
          } as React.CSSProperties
        }
      >
        {children}
      </div>
    </div>
  );
}

export interface StudioCanvasProps {
  site: PublicSiteData;
  device: StudioDevice;
  /** Sem `editing` a tela é só visualização (modo "Visualizar"). */
  editing?: SiteEditing;
  /** Muda quando a casa escolhe uma seção fora da tela (lista, conferência): rola até ela. */
  scrollToId?: string | null;
  scrollKey?: number;
  className?: string;
}

export function StudioCanvas({ site, device, editing, scrollToId, scrollKey, className }: StudioCanvasProps) {
  const [hostRef, host] = useElementSize<HTMLDivElement>();
  const scrollRef = useRef<HTMLDivElement>(null);
  const frame = DEVICE_WIDTH[device];
  const isMobile = device === 'mobile';
  const pad = host.width < 640 ? 0 : 48;
  const scale = host.width > 0 ? Math.min(1, (host.width - pad) / frame) : 1;

  useEffect(() => {
    if (!scrollToId || !scrollRef.current) return;
    const el = scrollRef.current.querySelector<HTMLElement>(`[data-edit-frame="${scrollToId}"]`);
    if (!el) return;
    const box = scrollRef.current.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    if (r.top < box.top + 8 || r.top > box.bottom - 80) {
      const sc = scrollRef.current;
      const top = sc.scrollTop + (r.top - box.top) - 24;
      if (typeof sc.scrollTo === 'function') sc.scrollTo({ top, behavior: 'smooth' });
      else sc.scrollTop = top;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scrollKey]);

  return (
    <div ref={hostRef} className={cn('relative flex min-h-0 min-w-0 flex-1 flex-col bg-areia-100 dark:bg-muted', className)} data-testid="studio-canvas">
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto" data-testid="site-preview-scroll">
        <div className={cn('mx-auto flex justify-center', pad ? 'py-6' : 'py-0')}>
          <div
            className={cn(
              'relative overflow-hidden bg-background shadow-[0_8px_40px_rgba(38,23,15,0.18)]',
              isMobile && pad ? 'rounded-[32px] border-[8px] border-[#26170F]' : pad ? 'rounded-xl' : '',
            )}
          >
            <ScaledFrame width={frame} scale={scale}>
              <PublicSite site={site} mode="preview" editing={editing} className={cn('min-h-[70vh]', isMobile && 'pb-6')} />
            </ScaledFrame>
          </div>
        </div>
      </div>
    </div>
  );
}

export default StudioCanvas;
