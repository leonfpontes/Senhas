/**
 * Painéis da barra lateral do estúdio do site (beta "Novo construtor do site"):
 * Seções (camadas), Adicionar, Estilo, Próximos passos e Configurações.
 * Cada painel é uma coluna rolável; o estúdio decide onde mostrar (lateral no computador,
 * gaveta de baixo no celular).
 */
import React, { useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  Check,
  CheckCircle2,
  Circle,
  Copy,
  ExternalLink,
  Eye,
  EyeOff,
  GripVertical,
  Loader2,
  MoreHorizontal,
  Plus,
  Search,
  Trash2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { TextField } from '@/components/fields';
import type { SectionType, SiteInfo, SiteSection } from '../../types';
import { catalogEntry, isSectionHidden, sectionCatalog, sectionLabel, siteBrandColor } from '../../lib';
import { HERO_FONTS } from '@/constants/heroFonts';
import { activeStyleId, applySiteStyle, setSiteColor, setSiteFonts, siteFonts, type SiteStyle } from '../../styles';
import { SectionIcon, SectionThumb } from '../sectionIcons';
import { StyleChoices, useHouseColors } from '../StylePanel';
import { ColorField } from '../controls';
import { googleSnippet } from '../PublishCheck';

export function PanelHeader({ title, description, action }: { title: string; description?: string; action?: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 border-b border-border px-4 py-3">
      <div className="min-w-0 flex-1">
        <h2 className="text-sm font-semibold">{title}</h2>
        {description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
      </div>
      {action}
    </div>
  );
}

/** Resumo do conteúdo da seção, para a lista ("Capa · Terreiro Pai Joaquim"). */
function sectionSummary(s: SiteSection): string {
  const c = s.config;
  const t = typeof c.title === 'string' ? c.title.trim() : '';
  if (s.section_type === 'HERO') return t;
  const label = sectionLabel(s.section_type);
  return t && t !== label ? t : '';
}

// ── Seções (camadas) ────────────────────────────────────────────────────────

export interface LayersPanelProps {
  sections: SiteSection[];
  selectedId: string | null;
  errorsById: Record<string, string[]>;
  canEdit: boolean;
  onSelect: (id: string) => void;
  onMove: (id: string, direction: 'up' | 'down') => void;
  onMoveTo: (id: string, index: number) => void;
  onToggleHidden: (id: string) => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
  onAdd: () => void;
}

export function LayersPanel({ sections, selectedId, errorsById, canEdit, onSelect, onMove, onMoveTo, onToggleHidden, onDuplicate, onDelete, onAdd }: LayersPanelProps) {
  const [dragId, setDragId] = useState<string | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);

  return (
    <div className="flex min-h-0 flex-1 flex-col" data-testid="studio-layers">
      <PanelHeader
        title="Seções do site"
        description={canEdit ? 'Clique para editar. Arraste para mudar a ordem.' : 'Clique para ver os detalhes.'}
      />
      <ol className="m-0 min-h-0 flex-1 list-none overflow-y-auto p-2" aria-label="Seções do site">
        {sections.map((s, i) => {
          const selected = s.id === selectedId;
          const hidden = isSectionHidden(s);
          const errs = errorsById[s.id]?.length ?? 0;
          const summary = sectionSummary(s);
          const single = Boolean(catalogEntry(s.section_type)?.single);
          return (
            <li
              key={s.id}
              draggable={canEdit}
              onDragStart={(e) => {
                setDragId(s.id);
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', s.id);
              }}
              onDragOver={(e) => {
                if (!dragId) return;
                e.preventDefault();
                const r = e.currentTarget.getBoundingClientRect();
                setOverIndex(e.clientY < r.top + r.height / 2 ? i : i + 1);
              }}
              onDrop={(e) => {
                e.preventDefault();
                if (dragId && overIndex !== null) {
                  const from = sections.findIndex((x) => x.id === dragId);
                  onMoveTo(dragId, overIndex > from ? overIndex - 1 : overIndex);
                }
                setDragId(null);
                setOverIndex(null);
              }}
              onDragEnd={() => {
                setDragId(null);
                setOverIndex(null);
              }}
              className={cn(
                'relative',
                dragId === s.id && 'opacity-40',
                overIndex === i && dragId && 'before:absolute before:inset-x-2 before:-top-0.5 before:h-0.5 before:rounded before:bg-brand',
                overIndex === i + 1 && i === sections.length - 1 && dragId && 'after:absolute after:inset-x-2 after:-bottom-0.5 after:h-0.5 after:rounded after:bg-brand',
              )}
            >
              <div
                className={cn(
                  'group flex items-center gap-1 rounded-lg pr-1 transition-colors',
                  selected ? 'bg-brand/10 text-foreground ring-1 ring-brand/40' : 'hover:bg-muted',
                )}
              >
                {canEdit && <GripVertical className="ml-1 size-4 shrink-0 cursor-grab text-muted-foreground/60" aria-hidden />}
                <button
                  type="button"
                  onClick={() => onSelect(s.id)}
                  aria-current={selected || undefined}
                  className="flex min-w-0 flex-1 items-center gap-2 py-2 pl-1 text-left focus-visible:outline-none"
                >
                  <span className={cn('flex size-8 shrink-0 items-center justify-center rounded-md border border-border bg-card', selected && 'border-brand/40 text-brand')}>
                    <SectionIcon type={s.section_type} className="size-4" />
                  </span>
                  <span className={cn('flex min-w-0 flex-col', hidden && 'opacity-55')}>
                    <span className="truncate text-sm font-medium">{sectionLabel(s.section_type)}</span>
                    {(summary || hidden) && (
                      <span className="truncate text-xs text-muted-foreground">{hidden ? 'Oculta no site' : summary}</span>
                    )}
                  </span>
                  {errs > 0 && <AlertCircle className="ml-auto size-4 shrink-0 text-destructive" aria-label={`${errs} erro(s)`} />}
                </button>
                {canEdit && (
                  <>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      className={cn('shrink-0', !hidden && 'opacity-0 group-hover:opacity-100 focus-visible:opacity-100')}
                      aria-label={hidden ? `Mostrar ${sectionLabel(s.section_type)} no site` : `Ocultar ${sectionLabel(s.section_type)} do site`}
                      title={hidden ? 'Mostrar no site' : 'Ocultar do site'}
                      onClick={() => onToggleHidden(s.id)}
                    >
                      {hidden ? <EyeOff /> : <Eye />}
                    </Button>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon-sm" className="shrink-0" aria-label={`Mais ações de ${sectionLabel(s.section_type)}`}>
                          <MoreHorizontal />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem disabled={i === 0} onSelect={() => onMove(s.id, 'up')}>
                          <ArrowUp /> Subir
                        </DropdownMenuItem>
                        <DropdownMenuItem disabled={i === sections.length - 1} onSelect={() => onMove(s.id, 'down')}>
                          <ArrowDown /> Descer
                        </DropdownMenuItem>
                        <DropdownMenuItem disabled={single} onSelect={() => onDuplicate(s.id)}>
                          <Copy /> Duplicar
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem variant="destructive" onSelect={() => onDelete(s.id)}>
                          <Trash2 /> Excluir
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </>
                )}
              </div>
            </li>
          );
        })}
      </ol>
      {canEdit && (
        <div className="border-t border-border p-3">
          <Button variant="outline" className="w-full" onClick={onAdd}>
            <Plus aria-hidden /> Adicionar seção
          </Button>
        </div>
      )}
    </div>
  );
}

// ── Adicionar ───────────────────────────────────────────────────────────────

const GROUPS: { title: string; types: SectionType[] }[] = [
  { title: 'O essencial', types: ['HERO', 'GIRAS_CALENDAR', 'LOCATION', 'CONTACT'] },
  { title: 'Apresentar a casa', types: ['ABOUT', 'ROTINA', 'LINHAS', 'GALLERY', 'VIDEO_EMBED', 'CUSTOM_TEXT'] },
  { title: 'Receber e ser ajudada', types: ['FAQ', 'AJUDAR', 'SOCIAL', 'SPONSOR'] },
];

export function AddPanel({
  sections,
  novoConstrutor,
  insertHint,
  onAdd,
  onGoTo,
}: {
  sections: SiteSection[];
  novoConstrutor: boolean;
  /** "depois de Capa", "no fim do site"… */
  insertHint: string;
  onAdd: (type: SectionType) => void;
  /** Seção única que já existe: leva até ela. */
  onGoTo: (id: string) => void;
}) {
  const [q, setQ] = useState('');
  const catalog = sectionCatalog(novoConstrutor);
  const norm = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const query = norm(q.trim());

  return (
    <div className="flex min-h-0 flex-1 flex-col" data-testid="studio-add">
      <PanelHeader title="Adicionar seção" description={`Entra ${insertHint}.`} />
      <div className="px-3 pt-3">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Procurar (fotos, PIX, mapa…)" className="pl-8" aria-label="Procurar seção" />
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {GROUPS.map((g) => {
          const entries = g.types
            .map((t) => catalog.find((e) => e.type === t))
            .filter((e): e is NonNullable<typeof e> => Boolean(e))
            .filter((e) => !query || norm(`${e.label} ${e.description}`).includes(query));
          if (entries.length === 0) return null;
          return (
            <section key={g.title} className="mb-4">
              <h3 className="mb-2 px-1 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">{g.title}</h3>
              <ul className="m-0 grid list-none grid-cols-1 gap-2 p-0">
                {entries.map((e) => {
                  const existing = e.single ? sections.find((s) => s.section_type === e.type) : undefined;
                  return (
                    <li key={e.type}>
                      <button
                        type="button"
                        onClick={() => (existing ? onGoTo(existing.id) : onAdd(e.type))}
                        aria-label={existing ? `${e.label} já está no site: ir até ela` : `Adicionar ${e.label}`}
                        className="group flex w-full items-center gap-3 rounded-xl border border-border bg-card p-2 text-left transition-[border-color,box-shadow] hover:border-brand hover:shadow-sm focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
                      >
                        <SectionThumb type={e.type} className="w-20 shrink-0" />
                        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                          <span className="flex items-center gap-1.5 text-sm font-semibold">
                            {e.label}
                            {e.beta && !existing && <span className="rounded-full bg-brand/10 px-1.5 py-px text-[10px] font-semibold text-brand">Novo</span>}
                          </span>
                          <span className="line-clamp-2 text-xs text-muted-foreground">{e.description}</span>
                          {existing && (
                            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground">
                              <Check className="size-3" aria-hidden /> Já está no site
                            </span>
                          )}
                        </span>
                        {!existing && <Plus className="size-4 shrink-0 text-muted-foreground group-hover:text-brand" aria-hidden />}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}

// ── Estilo ──────────────────────────────────────────────────────────────────

const COLOR_SWATCHES = ['#2E6A4E', '#86391A', '#26170F', '#A6781F', '#1F3A5F', '#6B2D5C', '#B42318', '#0F172A'];

export function StyleRailPanel({ sections, canEdit, onTransform }: { sections: SiteSection[]; canEdit: boolean; onTransform: (fn: (prev: SiteSection[]) => SiteSection[]) => void }) {
  const house = useHouseColors(true);
  const active = activeStyleId(sections);
  const brand = siteBrandColor(sections);
  const fonts = siteFonts(sections);
  const swatches = useMemo(() => {
    const list = house ? [house.primary, ...COLOR_SWATCHES] : COLOR_SWATCHES;
    return Array.from(new Set(list.map((c) => c.toLowerCase())));
  }, [house]);

  return (
    <div className="flex min-h-0 flex-1 flex-col" data-testid="studio-style">
      <PanelHeader title="Estilo do site" description="Vale para o site inteiro. Textos e fotos ficam como estão, e dá para desfazer." />
      <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto p-4">
        <section className="flex flex-col gap-2">
          <h3 className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">Estilos prontos</h3>
          {canEdit ? (
            <StyleChoices activeId={active} onApply={(st: SiteStyle) => onTransform((prev) => applySiteStyle(prev, st))} />
          ) : (
            <p className="text-sm text-muted-foreground">Você só pode ver o estilo.</p>
          )}
          {!active && sections.length > 0 && <p className="text-xs text-muted-foreground">Estilo atual: personalizado.</p>}
        </section>

        {canEdit && (
          <>
            <section className="flex flex-col gap-3">
              <h3 className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">Cor principal</h3>
              <p className="-mt-2 text-xs text-muted-foreground">Fundo da capa, botões e destaque das giras.</p>
              <div role="radiogroup" aria-label="Cor principal" className="flex flex-wrap gap-2">
                {swatches.map((c) => {
                  const on = brand.toLowerCase() === c;
                  return (
                    <button
                      key={c}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      aria-label={house && c === house.primary.toLowerCase() ? `Cor da casa ${c}` : c}
                      title={house && c === house.primary.toLowerCase() ? 'Cor da casa' : c}
                      onClick={() => onTransform((prev) => setSiteColor(prev, c))}
                      className={cn(
                        'relative size-8 rounded-full border border-black/10 shadow-xs transition-transform hover:scale-110 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none',
                        on && 'ring-2 ring-foreground ring-offset-2 ring-offset-background',
                      )}
                      style={{ background: c }}
                    >
                      {on && <Check className="absolute inset-0 m-auto size-4 text-white drop-shadow" aria-hidden />}
                    </button>
                  );
                })}
              </div>
              <ColorField label="Outra cor" value={brand} onChange={(hex) => onTransform((prev) => setSiteColor(prev, hex))} />
            </section>

            <section className="flex flex-col gap-3">
              <h3 className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">Fontes</h3>
              <FontPicker label="Títulos" value={fonts.title} onChange={(v) => onTransform((prev) => setSiteFonts(prev, { title: v }))} />
              <FontPicker label="Texto" value={fonts.body} onChange={(v) => onTransform((prev) => setSiteFonts(prev, { body: v }))} />
            </section>
          </>
        )}
      </div>
    </div>
  );
}

function FontPicker({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <div className="grid grid-cols-2 gap-1.5" role="radiogroup" aria-label={`Fonte dos ${label.toLowerCase()}`}>
        {HERO_FONTS.slice(0, 12).map((f) => {
          const on = f.value === value;
          return (
            <button
              key={f.value}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => onChange(f.value)}
              className={cn(
                'truncate rounded-lg border px-2 py-1.5 text-left text-sm transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none',
                on ? 'border-brand bg-brand/10' : 'border-border hover:border-foreground/40',
              )}
              style={{ fontFamily: f.value }}
            >
              {f.label.replace(' (padrão)', '')}
            </button>
          );
        })}
      </div>
      {HERO_FONTS.filter((f) => f.importUrl).slice(0, 12).map((f) => (
        // Carrega as fontes para a amostra dos botões.
        <link key={f.value} rel="stylesheet" href={f.importUrl ?? undefined} />
      ))}
    </div>
  );
}

// ── Próximos passos ─────────────────────────────────────────────────────────

export interface NextStep {
  id: string;
  label: string;
  done: boolean;
  /** Seção que resolve o passo (abre ao clicar). */
  sectionId?: string;
  /** Tipo de seção para adicionar, se ainda não existir. */
  addType?: SectionType;
  /** Ação especial do estúdio. */
  action?: 'settings' | 'publish' | 'share';
}

const txt = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
const arr = (v: unknown) => (Array.isArray(v) ? v : []);

/** Passos do site, como a lista "Seu site em X passos" do Wix. Puro, para teste. */
export function buildNextSteps(site: SiteInfo | null, sections: SiteSection[], dirty: boolean): NextStep[] {
  const find = (t: string) => sections.find((s) => s.section_type === t && !isSectionHidden(s));
  const hero = find('HERO');
  const about = find('ABOUT');
  const loc = find('LOCATION');
  const contact = find('CONTACT');
  const gallery = find('GALLERY');
  const published = site?.status === 'PUBLISHED';
  return [
    { id: 'capa', label: 'Capa com o nome da casa', done: Boolean(hero && txt(hero.config.title)), sectionId: hero?.id, addType: hero ? undefined : 'HERO' },
    { id: 'logo', label: 'Logo na capa', done: Boolean(hero && hero.config.logo_mode === 'logo' && hero.config.logo_image_url), sectionId: hero?.id, addType: hero ? undefined : 'HERO' },
    { id: 'sobre', label: 'Contar a história da casa', done: Boolean(about && txt(about.config.body)), sectionId: about?.id, addType: about ? undefined : 'ABOUT' },
    { id: 'endereco', label: 'Endereço com mapa', done: Boolean(loc && (txt(loc.config.address) || txt(loc.config.street))), sectionId: loc?.id, addType: loc ? undefined : 'LOCATION' },
    {
      id: 'contato',
      label: 'WhatsApp, e-mail ou Instagram',
      done: Boolean(contact && (txt(contact.config.phone) || txt(contact.config.email) || txt(contact.config.instagram))),
      sectionId: contact?.id,
      addType: contact ? undefined : 'CONTACT',
    },
    { id: 'fotos', label: 'Fotos da casa', done: Boolean(gallery && arr(gallery.config.items).length > 0), sectionId: gallery?.id, addType: gallery ? undefined : 'GALLERY' },
    { id: 'google', label: 'Descrição para o Google', done: Boolean(txt(site?.meta_description)), action: 'settings' },
    { id: 'publicar', label: published ? (dirty ? 'Publicar as alterações' : 'Site publicado') : 'Publicar o site', done: published && !dirty, action: 'publish' },
    { id: 'divulgar', label: 'Divulgar no WhatsApp e no Instagram', done: false, action: 'share' },
  ];
}

export function NextStepsPanel({ steps, canEdit, onStep }: { steps: NextStep[]; canEdit: boolean; onStep: (step: NextStep) => void }) {
  const countable = steps.filter((s) => s.id !== 'divulgar');
  const done = countable.filter((s) => s.done).length;
  const pct = Math.round((done / countable.length) * 100);
  return (
    <div className="flex min-h-0 flex-1 flex-col" data-testid="studio-steps">
      <PanelHeader title="Próximos passos" description="O que costuma deixar um site de terreiro completo. Nenhum é obrigatório." />
      <div className="flex flex-col gap-2 border-b border-border px-4 py-3">
        <div className="flex items-center justify-between text-sm">
          <span className="font-medium">
            {done} de {countable.length} feitos
          </span>
          <span className="text-muted-foreground">{pct}%</span>
        </div>
        <Progress value={pct} aria-label="Progresso do site" />
      </div>
      <ul className="m-0 min-h-0 flex-1 list-none overflow-y-auto p-2">
        {steps.map((s) => (
          <li key={s.id}>
            <button
              type="button"
              disabled={!canEdit && s.action !== 'share'}
              onClick={() => onStep(s)}
              className="flex w-full items-center gap-3 rounded-lg px-2 py-2.5 text-left text-sm hover:bg-muted focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none disabled:opacity-60"
            >
              {s.done ? <CheckCircle2 className="size-5 shrink-0 text-success-strong" aria-label="Feito" /> : <Circle className="size-5 shrink-0 text-muted-foreground/60" aria-label="A fazer" />}
              <span className={cn('flex-1', s.done && 'text-muted-foreground line-through decoration-muted-foreground/40')}>{s.label}</span>
              {!s.done && (
                <span className="text-xs font-medium text-brand">{s.addType ? 'Adicionar' : s.action === 'publish' ? 'Publicar' : s.action === 'share' ? 'Abrir' : 'Fazer'}</span>
              )}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ── Configurações ───────────────────────────────────────────────────────────

export function SettingsPanel({
  site,
  sections,
  publicUrl,
  canEdit,
  onSave,
}: {
  site: SiteInfo | null;
  sections: SiteSection[];
  publicUrl: string;
  canEdit: boolean;
  onSave: (payload: { meta_title: string | null; meta_description: string | null }) => Promise<boolean>;
}) {
  const [metaTitle, setMetaTitle] = useState(site?.meta_title ?? '');
  const [metaDesc, setMetaDesc] = useState(site?.meta_description ?? '');
  const [saving, setSaving] = useState(false);
  const changed = metaTitle !== (site?.meta_title ?? '') || metaDesc !== (site?.meta_description ?? '');
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const snippet = googleSnippet(site ? { ...site, meta_title: metaTitle || null, meta_description: metaDesc || null } : null, sections, origin);

  const save = async () => {
    setSaving(true);
    await onSave({ meta_title: metaTitle.trim() || null, meta_description: metaDesc.trim() || null });
    setSaving(false);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col" data-testid="studio-settings">
      <PanelHeader title="Configurações do site" />
      <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto p-4">
        <section className="flex flex-col gap-1.5">
          <h3 className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">Endereço</h3>
          <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2">
            <span className="min-w-0 flex-1 truncate font-mono text-xs">{publicUrl.replace(/^https?:\/\//, '')}</span>
            {site?.status === 'PUBLISHED' && (
              <a href={publicUrl} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-foreground" aria-label="Abrir o site publicado">
                <ExternalLink className="size-4" />
              </a>
            )}
          </div>
          <p className="text-xs text-muted-foreground">É o mesmo endereço dos links de senha da casa.</p>
        </section>

        <section className="flex flex-col gap-3">
          <h3 className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">No Google</h3>
          <div className="rounded-lg border border-border bg-card p-3" aria-label="Como aparece no Google">
            <p className="truncate text-xs text-muted-foreground">{snippet.url}</p>
            <p className="truncate text-base text-[#1a0dab] dark:text-[#8ab4f8]">{snippet.title}</p>
            <p className="line-clamp-2 text-xs text-muted-foreground">{snippet.description || 'Escreva uma descrição para aparecer aqui.'}</p>
          </div>
          <TextField label="Título da página" value={metaTitle} onChange={(e) => setMetaTitle(e.target.value)} maxLength={200} disabled={!canEdit} helperText="Aparece na aba do navegador e no Google." />
          <TextField
            label="Descrição"
            multiline
            rows={3}
            value={metaDesc}
            onChange={(e) => setMetaDesc(e.target.value)}
            maxLength={500}
            disabled={!canEdit}
            helperText={`Duas frases sobre a casa e onde fica. ${metaDesc.length}/160 aparecem no Google.`}
          />
          {canEdit && (
            <Button onClick={() => void save()} disabled={!changed || saving} className="self-start">
              {saving && <Loader2 className="animate-spin" aria-hidden />}
              Salvar
            </Button>
          )}
        </section>
      </div>
    </div>
  );
}
