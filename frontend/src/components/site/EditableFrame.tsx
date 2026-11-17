/**
 * EditableFrame — moldura de cada seção na prévia do novo construtor (beta
 * "Novo construtor do site"): contorno ao passar o mouse, clique seleciona, barra de
 * ações na seção selecionada e um "+" entre seções para inserir outra ali.
 *
 * A prévia é reduzida com `transform: scale()`; a barra e o "+" usam `--ui-scale`
 * (o inverso da escala, definido pela `SitePreview`) para manter o tamanho de toque.
 */
import React from 'react';
import { ArrowDown, ArrowUp, Eye, EyeOff, Plus, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface SiteEditing {
  selectedId: string | null;
  onSelect: (id: string) => void;
  onMove: (id: string, direction: 'up' | 'down') => void;
  onToggleHidden: (id: string) => void;
  onDelete: (id: string) => void;
  /** Abre a galeria para inserir uma seção na posição `index` (0 = antes da primeira). */
  onInsert: (index: number) => void;
  /** Grava parte da config de uma seção (edição de texto direto na prévia). */
  onPatch: (id: string, patch: Record<string, unknown>) => void;
  /** Rótulo da seção ("Capa", "Sobre o terreiro"…). */
  labelOf: (type: string) => string;
  canEdit: boolean;
}

const BRAND = '#2E6A4E';

function ToolButton({ label, onClick, children, danger }: { label: string; onClick: () => void; children: React.ReactNode; danger?: boolean }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={cn(
        'inline-flex size-8 items-center justify-center rounded-md text-white hover:bg-white/20 focus-visible:outline-2 focus-visible:outline-white',
        danger && 'hover:bg-[#b42318]',
      )}
    >
      {children}
    </button>
  );
}

export function InsertButton({ onClick, label = 'Adicionar seção aqui' }: { onClick: () => void; label?: string }) {
  return (
    <div className="relative z-20 h-0">
      <div className="pointer-events-none absolute inset-x-0 -top-4 flex h-8 items-center justify-center">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onClick();
          }}
          className="pointer-events-auto relative inline-flex items-center gap-1 rounded-full px-3 py-1 text-sm font-medium text-white opacity-75 shadow-md transition-opacity hover:opacity-100 focus-visible:opacity-100"
          style={{ background: BRAND, transform: 'scale(var(--ui-scale, 1))' }}
        >
          <Plus className="size-4" aria-hidden /> {label}
        </button>
      </div>
    </div>
  );
}

export function EditableFrame({
  id,
  type,
  index,
  total,
  hidden,
  editing,
  children,
}: {
  id: string;
  type: string;
  index: number;
  total: number;
  hidden: boolean;
  editing: SiteEditing;
  children: React.ReactNode;
}) {
  const selected = editing.selectedId === id;
  return (
    <div
      data-edit-frame={id}
      data-selected={selected || undefined}
      className={cn('group/frame relative', hidden && 'opacity-45')}
      onClickCapture={() => {
        if (!selected) editing.onSelect(id);
      }}
    >
      {children}
      <div
        aria-hidden
        className={cn(
          'pointer-events-none absolute inset-0 z-10 transition-shadow',
          selected ? 'shadow-[inset_0_0_0_3px_#2E6A4E]' : 'group-hover/frame:shadow-[inset_0_0_0_2px_rgba(46,106,78,0.6)]',
        )}
      />
      <div
        className={cn(
          'absolute top-2 left-2 z-20 origin-top-left rounded-md px-2 py-1 text-xs font-semibold text-white',
          selected ? 'opacity-100' : 'opacity-0 group-hover/frame:opacity-100',
        )}
        style={{ background: BRAND, transform: 'scale(var(--ui-scale, 1))' }}
      >
        {editing.labelOf(type)}
        {hidden && ' · oculta'}
      </div>
      {selected && editing.canEdit && (
        <div
          role="toolbar"
          aria-label={`Ações da seção ${editing.labelOf(type)}`}
          className="absolute top-2 right-2 z-20 flex origin-top-right items-center gap-0.5 rounded-lg p-1 shadow-lg"
          style={{ background: BRAND, transform: 'scale(var(--ui-scale, 1))' }}
        >
          <ToolButton label="Subir" onClick={() => editing.onMove(id, 'up')}>
            <ArrowUp className={cn('size-4', index === 0 && 'opacity-40')} />
          </ToolButton>
          <ToolButton label="Descer" onClick={() => editing.onMove(id, 'down')}>
            <ArrowDown className={cn('size-4', index === total - 1 && 'opacity-40')} />
          </ToolButton>
          <ToolButton label={hidden ? 'Mostrar no site' : 'Ocultar do site'} onClick={() => editing.onToggleHidden(id)}>
            {hidden ? <Eye className="size-4" /> : <EyeOff className="size-4" />}
          </ToolButton>
          <ToolButton label="Excluir seção" onClick={() => editing.onDelete(id)} danger>
            <Trash2 className="size-4" />
          </ToolButton>
        </div>
      )}
    </div>
  );
}
