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
import { MobileCtaBar } from '../../MobileCtaBar';
import { mobileCta } from '../../elements';
import { isSectionHidden, siteBrandColor } from '../../lib';
import type { SiteEditing } from '../../EditableFrame';
import { BLOCK_DRAG_MIME, dropIndexFor } from './blocks';

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
  /** Bloco sendo arrastado da gaveta "Adicionar" (nome para o aviso), ou null. */
  draggingLabel?: string | null;
  /** Bloco solto na tela: `raw` é o dado do arrastar, `index` a posição entre as seções. */
  onDropBlock?: (raw: string, index: number) => void;
}

interface DropMark {
  index: number;
  /** Posição da linha, relativa à área da tela. */
  y: number;
  left: number;
  width: number;
}

const hasBlock = (e: React.DragEvent) => Array.from(e.dataTransfer.types).includes(BLOCK_DRAG_MIME);

export function StudioCanvas({ site, device, editing, scrollToId, scrollKey, className, draggingLabel, onDropBlock }: StudioCanvasProps) {
  const [hostRef, host] = useElementSize<HTMLDivElement>();
  const [mark, setMark] = useState<DropMark | null>(null);
  const acceptsDrop = Boolean(onDropBlock && editing?.canEdit);

  useEffect(() => {
    if (!draggingLabel) setMark(null);
  }, [draggingLabel]);

  /** Onde o bloco entra: entre as seções, pela altura do ponteiro. Rola a tela perto das bordas. */
  const track = (e: React.DragEvent) => {
    const hostEl = hostRef.current;
    const sc = scrollRef.current;
    if (!hostEl || !sc) return;
    const frames = Array.from(sc.querySelectorAll<HTMLElement>('[data-edit-frame]'));
    const hb = hostEl.getBoundingClientRect();
    const sb = sc.getBoundingClientRect();
    if (e.clientY < sb.top + 64) sc.scrollTop -= 16;
    else if (e.clientY > sb.bottom - 64) sc.scrollTop += 16;
    if (frames.length === 0) {
      setMark({ index: 0, y: sb.top - hb.top + 48, left: 24, width: Math.max(0, hb.width - 48) });
      return;
    }
    const rects = frames.map((f) => f.getBoundingClientRect());
    const index = dropIndexFor(
      e.clientY,
      rects.map((r) => r.top + r.height / 2),
    );
    const y = index === 0 ? rects[0].top : index === rects.length ? rects[rects.length - 1].bottom : (rects[index - 1].bottom + rects[index].top) / 2;
    const clampedY = Math.min(Math.max(y, sb.top + 4), sb.bottom - 4);
    setMark((m) => {
      const next = { index, y: clampedY - hb.top, left: rects[0].left - hb.left, width: rects[0].width };
      return m && m.index === next.index && Math.abs(m.y - next.y) < 1 && m.left === next.left ? m : next;
    });
  };
  const scrollRef = useRef<HTMLDivElement>(null);
  const frame = DEVICE_WIDTH[device];
  const isMobile = device === 'mobile';
  const cta = mobileCta(site.sections.filter((s) => !isSectionHidden(s)));
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
    <div
      ref={hostRef}
      className={cn('relative flex min-h-0 min-w-0 flex-1 flex-col bg-areia-100 dark:bg-muted', className)}
      data-testid="studio-canvas"
      onDragOver={(e) => {
        if (!acceptsDrop || !hasBlock(e)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
        track(e);
      }}
      onDragLeave={(e) => {
        if (!hostRef.current?.contains(e.relatedTarget as Node | null)) setMark(null);
      }}
      onDrop={(e) => {
        if (!acceptsDrop || !hasBlock(e)) return;
        e.preventDefault();
        const raw = e.dataTransfer.getData(BLOCK_DRAG_MIME);
        const at = mark?.index;
        setMark(null);
        if (raw && at !== undefined) onDropBlock?.(raw, at);
      }}
    >
      {acceptsDrop && draggingLabel && (
        <div className="pointer-events-none absolute inset-x-0 top-3 z-40 flex justify-center" aria-hidden>
          <span className="rounded-full bg-foreground/85 px-3 py-1 text-xs font-medium text-background shadow-md">
            {mark ? 'Solte para colocar aqui' : 'Leve até o site e solte entre as seções'}
          </span>
        </div>
      )}
      {acceptsDrop && draggingLabel && mark && (
        <div
          className="pointer-events-none absolute z-40 flex items-center"
          style={{ top: mark.y, left: mark.left, width: mark.width, transform: 'translateY(-50%)' }}
          data-testid="studio-drop-mark"
          aria-hidden
        >
          <span className="size-3 shrink-0 rounded-full border-2 border-brand bg-background" />
          <span className="h-[3px] flex-1 bg-brand" />
          <span className="absolute left-1/2 -translate-x-1/2 rounded-full bg-brand px-3 py-1 text-xs font-semibold whitespace-nowrap text-white shadow-lg">
            + {draggingLabel}
          </span>
          <span className="size-3 shrink-0 rounded-full border-2 border-brand bg-background" />
        </div>
      )}
      <div
        ref={scrollRef}
        className={cn('min-h-0 flex-1 overflow-x-hidden overflow-y-auto', draggingLabel && '[&_[data-insert-button]]:hidden')}
        data-testid="site-preview-scroll"
      >
        <div className={cn('mx-auto flex justify-center', pad ? 'py-6' : 'py-0')}>
          <div
            className={cn(
              'relative overflow-hidden bg-background shadow-[0_8px_40px_rgba(38,23,15,0.18)]',
              isMobile && pad ? 'rounded-[32px] border-[8px] border-[#26170F]' : pad ? 'rounded-xl' : '',
            )}
          >
            <ScaledFrame width={frame} scale={scale}>
              <PublicSite site={site} mode="preview" editing={editing} className={cn('min-h-[70vh]', isMobile && 'pb-6')} />
              {/* No celular, a barra "Retirar senha" do site (se a casa deixou ligada). */}
              {isMobile && cta.show && (
                <MobileCtaBar slug={site.slug} brandColor={siteBrandColor(site.sections)} variant="inline" inert label={cta.label} className="sticky bottom-0" />
              )}
            </ScaledFrame>
          </div>
        </div>
      </div>
    </div>
  );
}

export default StudioCanvas;
