/**
 * SectionList — lista de seções do site: selecionar, reordenar (↑/↓), ligar/desligar,
 * excluir (confirmação fica no pai) e "Adicionar seção".
 */
import React from 'react';
import { AlertCircle, ChevronDown, ChevronUp, GripVertical, Plus, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { EmptyState } from '@/components/EmptyState';
import type { SiteSection } from '../types';
import { isSectionHidden, sectionLabel } from '../lib';
import { SectionIcon } from './sectionIcons';

export interface SectionListProps {
  sections: SiteSection[];
  selectedId: string | null;
  errorsById: Record<string, string[]>;
  canEdit: boolean;
  onSelect: (id: string) => void;
  onMove: (id: string, direction: 'up' | 'down') => void;
  onToggleHidden: (id: string) => void;
  onDelete: (section: SiteSection) => void;
  onAdd: () => void;
}

export function SectionList({ sections, selectedId, errorsById, canEdit, onSelect, onMove, onToggleHidden, onDelete, onAdd }: SectionListProps) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto">
        {sections.length === 0 ? (
          <EmptyState
            compact
            icon={<Plus />}
            title="Nenhuma seção"
            description="Adicione a primeira seção pela galeria."
            action={canEdit && <Button size="sm" onClick={onAdd}><Plus aria-hidden /> Adicionar seção</Button>}
          />
        ) : (
          <ol className="m-0 list-none p-0" aria-label="Seções do site">
            {sections.map((section, idx) => {
              const label = sectionLabel(section.section_type);
              const selected = section.id === selectedId;
              const hidden = isSectionHidden(section);
              const errors = errorsById[section.id] ?? [];
              return (
                <li
                  key={section.id}
                  className={cn(
                    'group flex items-center gap-1 border-b border-border pr-2 pl-1',
                    selected ? 'bg-accent' : 'hover:bg-accent/60',
                    hidden && 'opacity-60',
                  )}
                >
                  <GripVertical className="size-4 shrink-0 text-ghost" aria-hidden />
                  <button
                    type="button"
                    onClick={() => onSelect(section.id)}
                    aria-current={selected ? 'true' : undefined}
                    aria-label={`Editar ${label}`}
                    className="flex min-h-12 min-w-0 flex-1 items-center gap-2 py-2 text-left text-sm focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
                  >
                    <SectionIcon type={section.section_type} className="shrink-0 text-muted-foreground" />
                    <span className={cn('truncate', selected && 'font-semibold')}>{label}</span>
                    {errors.length > 0 && (
                      <span className="inline-flex items-center gap-1 text-xs text-destructive" title={errors[0]}>
                        <AlertCircle className="size-3.5" aria-hidden />
                        <span className="sr-only">{errors[0]}</span>
                      </span>
                    )}
                  </button>
                  {canEdit && (
                    <div className="flex shrink-0 items-center gap-0.5">
                      <Switch
                        size="sm"
                        checked={!hidden}
                        onCheckedChange={() => onToggleHidden(section.id)}
                        aria-label={hidden ? `Ligar ${label}` : `Desligar ${label}`}
                        className="mr-1"
                      />
                      <Button variant="ghost" size="icon-sm" disabled={idx === 0} onClick={() => onMove(section.id, 'up')} aria-label={`Mover ${label} para cima`}>
                        <ChevronUp />
                      </Button>
                      <Button variant="ghost" size="icon-sm" disabled={idx === sections.length - 1} onClick={() => onMove(section.id, 'down')} aria-label={`Mover ${label} para baixo`}>
                        <ChevronDown />
                      </Button>
                      <Button variant="ghost" size="icon-sm" className="text-destructive hover:text-destructive" onClick={() => onDelete(section)} aria-label={`Excluir ${label}`}>
                        <Trash2 />
                      </Button>
                    </div>
                  )}
                </li>
              );
            })}
          </ol>
        )}
      </div>
      {canEdit && sections.length > 0 && (
        <div className="border-t border-border p-2">
          <Button variant="outline" className="w-full" onClick={onAdd}>
            <Plus aria-hidden /> Adicionar seção
          </Button>
        </div>
      )}
    </div>
  );
}

export default SectionList;
