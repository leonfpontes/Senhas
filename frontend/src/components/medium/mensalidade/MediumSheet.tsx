/**
 * Folha de baixo da Área do Médium (mesmo visual do `InstallAreaSheet`): portada para o <body>,
 * leva a paleta `.medium-terra` e a Fraunces junto; alça no topo, título em Fraunces, rolagem
 * própria e área segura do iPhone.
 */
import React from 'react';
import { fraunces } from '@/components/landing/fonts';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { cn } from '@/lib/utils';

export interface MediumSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: React.ReactNode;
  /** Ao lado do título (ex.: emblema do terreiro). */
  leading?: React.ReactNode;
  children: React.ReactNode;
  'data-testid'?: string;
}

export function MediumSheet({
  open,
  onOpenChange,
  title,
  description,
  leading,
  children,
  'data-testid': testId,
}: MediumSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        data-testid={testId}
        className={cn(
          fraunces.variable,
          'medium-terra mx-auto max-h-[92dvh] max-w-xl gap-5 overflow-y-auto rounded-t-3xl bg-card px-4 pt-3 pb-[calc(1.25rem+env(safe-area-inset-bottom))] text-foreground',
        )}
      >
        <span aria-hidden className="mx-auto h-1.5 w-11 rounded-full bg-border" />
        <SheetHeader className="flex-row items-center gap-3 p-0 pr-8 text-left">
          {leading}
          <div className="flex min-w-0 flex-col gap-1">
            <SheetTitle className="font-display text-2xl leading-tight font-bold">
              {title}
            </SheetTitle>
            {description ? (
              <SheetDescription className="text-base">{description}</SheetDescription>
            ) : (
              <SheetDescription className="sr-only">{title}</SheetDescription>
            )}
          </div>
        </SheetHeader>
        {children}
      </SheetContent>
    </Sheet>
  );
}

/** Passo numerado (1, 2, 3) dos sheets da mensalidade. */
export function Passo({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-3 text-base">
      <span
        aria-hidden
        className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary font-display text-sm font-bold text-primary-foreground"
      >
        {n}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-2 pt-1">{children}</div>
    </li>
  );
}
