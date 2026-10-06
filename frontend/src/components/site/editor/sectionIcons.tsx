/**
 * Ícone (lucide) e miniatura de cada tipo de seção — usados na lista e na galeria.
 */
import React from 'react';
import { BookOpen, CalendarDays, Handshake, LayoutTemplate, MapPin, MessageCircle, Type, Video, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

export const SECTION_ICONS: Record<string, LucideIcon> = {
  HERO: LayoutTemplate,
  ABOUT: BookOpen,
  VIDEO_EMBED: Video,
  GIRAS_CALENDAR: CalendarDays,
  LOCATION: MapPin,
  CONTACT: MessageCircle,
  SPONSOR: Handshake,
  CUSTOM_TEXT: Type,
};

export function SectionIcon({ type, className }: { type: string; className?: string }) {
  const Icon = SECTION_ICONS[type] ?? Type;
  return <Icon className={cn('size-4', className)} aria-hidden />;
}

/** Miniatura esquemática (blocos) da seção, para a galeria. */
export function SectionThumb({ type, className }: { type: string; className?: string }) {
  const bar = 'rounded-sm bg-foreground/25';
  return (
    <div
      aria-hidden
      className={cn('flex h-[72px] w-full flex-col justify-center gap-1.5 overflow-hidden rounded-md border border-border bg-muted p-2', className)}
    >
      {type === 'HERO' && (
        <div className="flex h-full flex-col items-center justify-center gap-1.5 rounded bg-gradient-to-br from-primary to-secondary p-2">
          <span className="h-2 w-2/3 rounded-sm bg-white/90" />
          <span className="h-1.5 w-1/2 rounded-sm bg-white/60" />
          <span className="mt-1 h-2.5 w-1/3 rounded-full bg-white" />
        </div>
      )}
      {type === 'ABOUT' && (
        <div className="flex h-full gap-2">
          <div className="flex flex-1 flex-col gap-1.5">
            <span className={cn(bar, 'h-2 w-1/2')} />
            <span className={cn(bar, 'h-1.5 w-full opacity-60')} />
            <span className={cn(bar, 'h-1.5 w-5/6 opacity-60')} />
            <span className={cn(bar, 'h-1.5 w-2/3 opacity-60')} />
          </div>
          <span className="h-full w-1/3 rounded bg-foreground/15" />
        </div>
      )}
      {type === 'VIDEO_EMBED' && (
        <div className="flex h-full items-center justify-center rounded bg-foreground/80">
          <span className="ml-0.5 size-0 border-y-[6px] border-l-[10px] border-y-transparent border-l-white" />
        </div>
      )}
      {type === 'GIRAS_CALENDAR' && (
        <div className="grid h-full grid-cols-7 gap-0.5">
          {Array.from({ length: 21 }).map((_, i) => (
            <span key={i} className={cn('rounded-[2px]', [3, 10, 17].includes(i) ? 'bg-primary' : 'bg-foreground/10')} />
          ))}
        </div>
      )}
      {type === 'LOCATION' && (
        <div className="flex h-full gap-2">
          <div className="flex flex-1 flex-col justify-center gap-1.5">
            <span className={cn(bar, 'h-2 w-2/3')} />
            <span className={cn(bar, 'h-1.5 w-full opacity-60')} />
            <span className="mt-1 h-2.5 w-1/2 rounded-full bg-foreground/60" />
          </div>
          <div className="flex w-1/2 items-center justify-center rounded bg-emerald-200/60">
            <MapPin className="size-4 text-emerald-700" />
          </div>
        </div>
      )}
      {type === 'CONTACT' && (
        <div className="flex h-full flex-col items-center justify-center gap-1.5">
          <span className={cn(bar, 'h-2 w-1/3')} />
          <div className="flex gap-1.5">
            {[0, 1, 2].map((i) => (
              <span key={i} className="size-6 rounded-md border border-foreground/20 bg-background" />
            ))}
          </div>
        </div>
      )}
      {type === 'SPONSOR' && (
        <div className="flex h-full flex-col items-center justify-center gap-1.5">
          <span className={cn(bar, 'h-2 w-1/3')} />
          <span className={cn(bar, 'h-1.5 w-2/3 opacity-60')} />
          <div className="flex gap-1.5">
            {[0, 1, 2].map((i) => (
              <span key={i} className="h-4 w-8 rounded-sm bg-foreground/15" />
            ))}
          </div>
        </div>
      )}
      {type === 'CUSTOM_TEXT' && (
        <div className="flex h-full flex-col justify-center gap-1.5">
          <span className={cn(bar, 'h-2 w-1/2')} />
          <span className={cn(bar, 'h-1.5 w-full opacity-60')} />
          <span className={cn(bar, 'h-1.5 w-11/12 opacity-60')} />
          <span className={cn(bar, 'h-1.5 w-3/4 opacity-60')} />
        </div>
      )}
    </div>
  );
}
