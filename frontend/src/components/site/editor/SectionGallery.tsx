/**
 * SectionGallery — Sheet com a galeria de seções (miniatura + descrição).
 * Tipos únicos já presentes aparecem desabilitados.
 */
import React from 'react';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import type { SectionType } from '../types';
import { SECTION_CATALOG } from '../lib';
import { SectionIcon, SectionThumb } from './sectionIcons';

export interface SectionGalleryProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  existingTypes: string[];
  onAdd: (type: SectionType) => void;
}

export function SectionGallery({ open, onOpenChange, existingTypes, onAdd }: SectionGalleryProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="z-[1300] w-full gap-0 sm:max-w-[600px]">
        <SheetHeader className="border-b border-border">
          <SheetTitle>Adicionar seção</SheetTitle>
          <SheetDescription>Escolha um bloco para o seu site. Você pode mudar a ordem depois.</SheetDescription>
        </SheetHeader>
        <ul className="grid list-none grid-cols-1 gap-3 overflow-y-auto p-4 sm:grid-cols-2" aria-label="Galeria de seções">
          {SECTION_CATALOG.map((entry) => {
            const taken = Boolean(entry.single) && existingTypes.includes(entry.type);
            return (
              <li key={entry.type}>
                <button
                  type="button"
                  disabled={taken}
                  onClick={() => onAdd(entry.type)}
                  aria-label={`Adicionar ${entry.label}`}
                  className={cn(
                    'flex h-full w-full flex-col gap-2 rounded-xl border border-border bg-card p-3 text-left transition-[border-color,box-shadow] hover:border-primary hover:shadow-sm focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none',
                    taken && 'cursor-not-allowed opacity-60 hover:border-border hover:shadow-none',
                  )}
                >
                  <SectionThumb type={entry.type} />
                  <div className="flex items-center gap-2">
                    <SectionIcon type={entry.type} className="text-muted-foreground" />
                    <span className="font-semibold">{entry.label}</span>
                    {taken && (
                      <span className="ml-auto inline-flex items-center gap-1 text-xs text-muted-foreground">
                        <Check className="size-3.5" aria-hidden /> Já adicionada
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">{entry.description}</p>
                </button>
              </li>
            );
          })}
        </ul>
      </SheetContent>
    </Sheet>
  );
}

export default SectionGallery;
