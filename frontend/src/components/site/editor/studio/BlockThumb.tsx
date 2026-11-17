/**
 * Miniatura de um bloco da gaveta "Adicionar": desenho esquemático do arranjo, na cor do
 * site, para a casa ver a diferença entre "Fotos em grade" e "Fotos em mosaico" antes de
 * arrastar. Tipos com um jeito só usam a miniatura de sempre (`SectionThumb`).
 */
import React from 'react';
import { Camera, Mail, MessageCircle, Play, PlayCircle, Users } from 'lucide-react';
import { cn } from '@/lib/utils';
import { SectionThumb } from '../sectionIcons';
import type { Block } from './blocks';

const bar = 'rounded-[2px] bg-foreground/20';

function Title({ w = 'w-1/3' }: { w?: string }) {
  return <span className={cn(bar, 'h-1.5 shrink-0', w)} />;
}

function VariantArt({ block, accent }: { block: Block; accent: string }) {
  const v = block.variantId;
  switch (block.type) {
    case 'GALLERY':
      if (v === 'mosaico')
        return (
          <div className="flex h-full gap-1">
            {[
              ['h-3/5', 'h-2/5'],
              ['h-2/5', 'h-3/5'],
              ['h-1/2', 'h-1/2'],
            ].map((col, i) => (
              <div key={i} className="flex flex-1 flex-col gap-1">
                {col.map((h, j) => (
                  <span key={j} className={cn('rounded-[3px] bg-foreground/20', h)} />
                ))}
              </div>
            ))}
          </div>
        );
      if (v === 'faixa')
        return (
          <div className="flex h-full flex-col justify-center gap-1.5">
            <Title />
            <div className="flex h-3/5 gap-1 overflow-hidden">
              <span className="w-[55%] shrink-0 rounded-[3px] bg-foreground/25" />
              <span className="w-[55%] shrink-0 rounded-[3px] bg-foreground/15" />
            </div>
            <div className="flex justify-center gap-0.5">
              <span className="size-1 rounded-full" style={{ background: accent }} />
              <span className="size-1 rounded-full bg-foreground/20" />
              <span className="size-1 rounded-full bg-foreground/20" />
            </div>
          </div>
        );
      return (
        <div className="grid h-full grid-cols-3 gap-1">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <span key={i} className="rounded-[3px] bg-foreground/20" />
          ))}
        </div>
      );
    case 'LINHAS':
      if (v === 'lista')
        return (
          <div className="flex h-full flex-col justify-center gap-1">
            <Title />
            {[0, 1, 2].map((i) => (
              <span key={i} className="flex items-center gap-1">
                <span className="size-2 shrink-0 rounded-full" style={{ background: accent }} />
                <span className={cn(bar, 'h-1.5 flex-1')} />
              </span>
            ))}
          </div>
        );
      return (
        <div className="flex h-full flex-col gap-1.5">
          <Title />
          <div className="grid flex-1 grid-cols-3 gap-1">
            {[0, 1, 2].map((i) => (
              <span key={i} className="flex flex-col gap-0.5 rounded-[3px] border-t-2 bg-foreground/10 p-1" style={{ borderColor: accent }}>
                <span className={cn(bar, 'h-1 w-2/3')} />
                <span className={cn(bar, 'h-1 w-full opacity-60')} />
              </span>
            ))}
          </div>
        </div>
      );
    case 'CONTACT': {
      const icons = [MessageCircle, Mail, Camera];
      if (v === 'buttons')
        return (
          <div className="flex h-full flex-col items-center justify-center gap-1">
            <Title />
            {[0, 1].map((i) => (
              <span key={i} className="h-2.5 w-3/4 rounded-full" style={{ background: i === 0 ? accent : 'rgb(0 0 0 / 0.15)' }} />
            ))}
          </div>
        );
      if (v === 'list')
        return (
          <div className="flex h-full flex-col justify-center gap-1">
            <Title />
            {icons.map((Icon, i) => (
              <span key={i} className="flex items-center gap-1">
                <Icon className="size-2.5 shrink-0" style={{ color: accent }} aria-hidden />
                <span className={cn(bar, 'h-1.5 w-2/3')} />
              </span>
            ))}
          </div>
        );
      return (
        <div className="flex h-full flex-col items-center justify-center gap-1.5">
          <Title />
          <div className="flex w-full gap-1">
            {icons.map((Icon, i) => (
              <span key={i} className="flex h-7 flex-1 items-center justify-center rounded-[3px] border border-foreground/15 bg-background">
                <Icon className="size-3" style={{ color: accent }} aria-hidden />
              </span>
            ))}
          </div>
        </div>
      );
    }
    case 'SOCIAL': {
      const icons = [Camera, Users, PlayCircle];
      if (v === 'icones')
        return (
          <div className="flex h-full flex-col items-center justify-center gap-1.5">
            <Title />
            <div className="flex gap-1.5">
              {icons.map((Icon, i) => (
                <span key={i} className="flex size-5 items-center justify-center rounded-full" style={{ background: accent }}>
                  <Icon className="size-2.5 text-white" aria-hidden />
                </span>
              ))}
            </div>
          </div>
        );
      return (
        <div className="flex h-full flex-col items-center justify-center gap-1.5">
          <Title />
          <div className="flex flex-wrap justify-center gap-1">
            {icons.map((Icon, i) => (
              <span key={i} className="flex h-3.5 items-center gap-0.5 rounded-full px-1.5" style={{ background: accent }}>
                <Icon className="size-2 text-white" aria-hidden />
                <span className="h-1 w-3 rounded-sm bg-white/80" />
              </span>
            ))}
          </div>
        </div>
      );
    }
    case 'VIDEO_EMBED':
      if (v === 'side-by-side')
        return (
          <div className="flex h-full items-center gap-1.5">
            <span className="flex h-4/5 w-3/5 items-center justify-center rounded-[3px] bg-foreground/80">
              <Play className="size-3 fill-white text-white" aria-hidden />
            </span>
            <span className="flex flex-1 flex-col gap-1">
              <span className={cn(bar, 'h-1.5 w-full')} />
              <span className={cn(bar, 'h-1 w-full opacity-60')} />
              <span className={cn(bar, 'h-1 w-2/3 opacity-60')} />
            </span>
          </div>
        );
      return (
        <div className="flex h-full items-center justify-center rounded-[3px] bg-foreground/80">
          <Play className="size-4 fill-white text-white" aria-hidden />
        </div>
      );
    default:
      return null;
  }
}

export function BlockThumb({ block, accent, className }: { block: Block; accent: string; className?: string }) {
  if (!block.variantId) return <SectionThumb type={block.type} className={cn('h-[76px]', className)} />;
  return (
    <div aria-hidden className={cn('h-[76px] w-full overflow-hidden rounded-md border border-border bg-muted p-2', className)}>
      <VariantArt block={block} accent={accent} />
    </div>
  );
}
