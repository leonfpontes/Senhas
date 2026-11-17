/**
 * Inspector — painel da direita do estúdio com a seção escolhida: nome, ações rápidas
 * (subir, descer, duplicar, ocultar, excluir) e os campos da seção.
 */
import React, { useId, useState } from 'react';
import {
  AlignLeft,
  ArrowDown,
  ArrowUp,
  CalendarDays,
  Camera,
  Captions,
  Copy,
  Eye,
  EyeOff,
  HandHeart,
  Heading,
  Image as ImageIcon,
  Info,
  ListChecks,
  Mail,
  Map as MapIcon,
  MapPin,
  MessageCircle,
  MousePointerClick,
  Music2,
  PlayCircle,
  Smartphone,
  Sparkles,
  Star,
  Ticket,
  Trash2,
  Users,
  X,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import type { SectionConfig, SiteSection } from '../../types';
import { catalogEntry, isSectionHidden, sectionLabel } from '../../lib';
import { SectionIcon } from '../sectionIcons';
import { SectionEditor } from '../SectionEditor';
import { EditorTabContext, type EditorTab } from '../controls';
import { elementPatch, elementsFor, isElementOn, type SectionElement } from '../../elements';
import { TextAssist, type IaCampo } from './TextAssist';

const ELEMENT_ICONS: Record<string, LucideIcon> = {
  show_title: Heading,
  show_subtitle: AlignLeft,
  show_intro: AlignLeft,
  show_body: AlignLeft,
  show_side_text: AlignLeft,
  show_item_text: AlignLeft,
  show_observacao: Info,
  show_logo: Star,
  show_image: ImageIcon,
  show_captions: Captions,
  show_cta: MousePointerClick,
  show_mobile_cta: Smartphone,
  show_highlight: Sparkles,
  show_description: AlignLeft,
  show_ticket_button: Ticket,
  show_sponsor_button: Ticket,
  show_calendar_note: CalendarDays,
  show_hour: CalendarDays,
  show_address: MapPin,
  show_instructions: Info,
  show_map: MapIcon,
  show_maps_button: MousePointerClick,
  show_whatsapp: MessageCircle,
  show_email: Mail,
  show_instagram: Camera,
  show_facebook: Users,
  show_youtube: PlayCircle,
  show_tiktok: Music2,
  show_pix: HandHeart,
  show_copy_button: Copy,
  show_necessidades: ListChecks,
};

/** "O que aparece nesta seção": um interruptor por elemento, a linha inteira é clicável. */
function ElementSwitches({ section, canEdit, onToggle }: { section: SiteSection; canEdit: boolean; onToggle: (el: SectionElement, on: boolean) => void }) {
  const els = elementsFor(section.section_type, section.config);
  const baseId = useId();
  if (els.length === 0) return null;
  const onCount = els.filter((e) => isElementOn(e, section.config)).length;
  return (
    <section className="border-b border-border px-4 py-3" aria-labelledby={`${baseId}-t`} data-testid="studio-elements">
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <h3 id={`${baseId}-t`} className="text-xs font-semibold text-foreground">
          O que aparece nesta seção
        </h3>
        <span className="text-[11px] text-muted-foreground">
          {onCount} de {els.length}
        </span>
      </div>
      <ul className="m-0 flex list-none flex-col p-0">
        {els.map((el) => {
          const on = isElementOn(el, section.config);
          const Icon = ELEMENT_ICONS[el.key] ?? Eye;
          const id = `${baseId}-${el.key}`;
          return (
            <li key={el.key}>
              <label
                htmlFor={id}
                className={cn(
                  '-mx-2 flex min-h-10 cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 transition-colors hover:bg-muted',
                  !canEdit && 'cursor-default hover:bg-transparent',
                )}
              >
                <Icon className={cn('size-4 shrink-0', on ? 'text-brand' : 'text-muted-foreground/60')} aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className={cn('block text-sm leading-tight', !on && 'text-muted-foreground')}>{el.label}</span>
                  {el.hint && <span className="block text-[11px] leading-tight text-muted-foreground">{el.hint}</span>}
                </span>
                <Switch id={id} checked={on} disabled={!canEdit} onCheckedChange={(v) => onToggle(el, v)} aria-describedby={el.hint ? `${id}-h` : undefined} />
                {el.hint && (
                  <span id={`${id}-h`} className="sr-only">
                    {el.hint}
                  </span>
                )}
              </label>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** Aba escolhida vale para todas as seções enquanto o estúdio está aberto. */
let lastTab: EditorTab = 'conteudo';

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
  /** Beta "Textos do site com IA": campos desta seção com sugestão (vazio = sem ajuda). */
  iaCampos?: IaCampo[];
}

export function Inspector({ section, index, total, errors, canEdit, upload, onChange, onMove, onDuplicate, onToggleHidden, onDelete, onClose, iaCampos }: InspectorProps) {
  const hidden = isSectionHidden(section);
  const single = Boolean(catalogEntry(section.section_type)?.single);
  const label = sectionLabel(section.section_type);
  const [tab, setTabState] = useState<EditorTab>(lastTab);
  const setTab = (t: EditorTab) => {
    lastTab = t;
    setTabState(t);
  };
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
        <ElementSwitches section={section} canEdit={canEdit} onToggle={(el, on) => onChange({ ...section.config, ...elementPatch(el, on) })} />
        <div role="tablist" aria-label="Partes do painel" className="sticky top-0 z-10 flex gap-1 border-b border-border bg-card px-3 pt-2">
          {(
            [
              ['conteudo', 'Conteúdo'],
              ['estilo', 'Estilo'],
            ] as const
          ).map(([id, name]) => (
            <button
              key={id}
              type="button"
              role="tab"
              id={`insp-tab-${id}`}
              aria-selected={tab === id}
              aria-controls="insp-tabpanel"
              onClick={() => setTab(id)}
              className={cn(
                '-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none',
                tab === id ? 'border-brand text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground',
              )}
            >
              {name}
            </button>
          ))}
        </div>
        <div role="tabpanel" id="insp-tabpanel" aria-labelledby={`insp-tab-${tab}`}>
          {tab === 'conteudo' && canEdit && iaCampos && iaCampos.length > 0 && (
            <TextAssist section={section} campos={iaCampos} onChange={onChange} />
          )}
          <EditorTabContext.Provider value={tab}>
            <SectionEditor section={section} errors={errors} onChange={onChange} upload={upload} hideHeader />
          </EditorTabContext.Provider>
        </div>
      </div>
    </div>
  );
}

export default Inspector;
