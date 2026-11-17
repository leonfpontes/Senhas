/**
 * Inspector — painel da direita do estúdio com a seção escolhida: nome, ações rápidas
 * (subir, descer, duplicar, ocultar, excluir) e os campos da seção.
 */
import React from 'react';
import { ArrowDown, ArrowUp, Copy, Eye, EyeOff, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { SectionConfig, SiteSection } from '../../types';
import { catalogEntry, isSectionHidden, sectionLabel } from '../../lib';
import { SectionIcon } from '../sectionIcons';
import { SectionEditor } from '../SectionEditor';

export interface InspectorProps {
  section: SiteSection;
  index: number;
  total: number;
  errors: string[];
  canEdit: boolean;
  upload?: (file: File) => Promise<{ id: string; url: string }>;
  onChange: (config: SectionConfig) => void;
  onMove: (direction: 'up' | 'down') => void;
  onDuplicate: () => void;
  onToggleHidden: () => void;
  onDelete: () => void;
  onClose?: () => void;
}

export function Inspector({ section, index, total, errors, canEdit, upload, onChange, onMove, onDuplicate, onToggleHidden, onDelete, onClose }: InspectorProps) {
  const hidden = isSectionHidden(section);
  const single = Boolean(catalogEntry(section.section_type)?.single);
  const label = sectionLabel(section.section_type);
  return (
    <div className="flex min-h-0 flex-1 flex-col" data-testid="studio-inspector">
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-brand/10 text-brand">
          <SectionIcon type={section.section_type} className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-sm font-semibold">{label}</h2>
          <p className="text-xs text-muted-foreground">
            {hidden ? 'Oculta no site' : `Seção ${index + 1} de ${total}`}
          </p>
        </div>
        {onClose && (
          <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Fechar painel da seção" title="Fechar (Esc)">
            <X />
          </Button>
        )}
      </div>
      {canEdit && (
        <div role="toolbar" aria-label={`Ações da seção ${label}`} className="flex items-center gap-1 border-b border-border px-3 py-2">
          <Button variant="ghost" size="icon-sm" onClick={() => onMove('up')} disabled={index === 0} aria-label="Subir" title="Subir (Alt+↑)">
            <ArrowUp />
          </Button>
          <Button variant="ghost" size="icon-sm" onClick={() => onMove('down')} disabled={index === total - 1} aria-label="Descer" title="Descer (Alt+↓)">
            <ArrowDown />
          </Button>
          <Button variant="ghost" size="icon-sm" onClick={onDuplicate} disabled={single} aria-label="Duplicar" title={single ? 'Esta seção só existe uma vez por site' : 'Duplicar (Ctrl+D)'}>
            <Copy />
          </Button>
          <Button variant="ghost" size="sm" onClick={onToggleHidden} title={hidden ? 'Mostrar no site' : 'Ocultar do site'}>
            {hidden ? <Eye aria-hidden /> : <EyeOff aria-hidden />}
            {hidden ? 'Mostrar' : 'Ocultar'}
          </Button>
          <Button variant="ghost" size="sm" className="ml-auto text-destructive hover:text-destructive" onClick={onDelete} title="Excluir (Delete)">
            <Trash2 aria-hidden /> Excluir
          </Button>
        </div>
      )}
      <div className="@container min-h-0 flex-1 overflow-y-auto">
        <SectionEditor section={section} errors={errors} onChange={onChange} upload={upload} hideHeader />
      </div>
    </div>
  );
}

export default Inspector;
