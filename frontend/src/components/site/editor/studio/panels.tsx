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
  MousePointerClick,
  Plus,
  Search,
  Sparkles,
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
import { catalogEntry, isSectionHidden, sectionLabel, siteBrandColor } from '../../lib';
import { HERO_FONTS } from '@/constants/heroFonts';
import { activeStyleId, applySiteStyle, setSiteColor, setSiteFonts, siteFonts, type SiteStyle } from '../../styles';
import { SectionIcon } from '../sectionIcons';
import { BlockThumb } from './BlockThumb';
import { BLOCK_CATEGORIES, BLOCK_DRAG_MIME, buildBlocks, encodeBlockDrag, existingFor, filterBlocks, suggestedBlocks, type Block, type BlockCategory } from './blocks';
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

// ── Adicionar (gaveta de blocos) ────────────────────────────────────────────

export interface AddPanelProps {
  sections: SiteSection[];
  novoConstrutor: boolean;
  /** "depois de Capa", "no fim do site"… */
  insertHint: string;
  /** Cor principal do site, para as miniaturas. */
  accent: string;
  /** Clique ou Enter: entra na posição de `insertHint`. */
  onAdd: (block: Block) => void;
  /** Seção única que já existe: leva até ela. */
  onGoTo: (id: string) => void;
  /** Começo e fim do arrastar (a prévia mostra onde o bloco vai entrar). */
  onDragBlock?: (block: Block | null) => void;
}

export function AddPanel({ sections, novoConstrutor, insertHint, accent, onAdd, onGoTo, onDragBlock }: AddPanelProps) {
  const [q, setQ] = useState('');
  const [category, setCategory] = useState<BlockCategory | 'todos'>('todos');
  const [hint, setHint] = useState<Block | null>(null);
  const blocks = useMemo(() => buildBlocks(novoConstrutor), [novoConstrutor]);
  const results = useMemo(() => filterBlocks(blocks, q, category), [blocks, q, category]);
  const suggestions = useMemo(() => (q || category !== 'todos' ? [] : suggestedBlocks(blocks, sections)), [blocks, sections, q, category]);
  const categories = BLOCK_CATEGORIES.filter((c) => blocks.some((b) => b.category === c.id));
  const searching = q.trim().length > 0;

  const card = (b: Block, big = false) => {
    const existing = existingFor(b, sections);
    const name = b.variant ? `${b.label}: ${b.variant}` : b.label;
    return (
      <li key={b.id} className="flex min-w-0">
        <button
          type="button"
          draggable={!existing}
          onDragStart={(e) => {
            e.dataTransfer.effectAllowed = 'copy';
            e.dataTransfer.setData(BLOCK_DRAG_MIME, encodeBlockDrag(b));
            e.dataTransfer.setData('text/plain', name);
            onDragBlock?.(b);
          }}
          onDragEnd={() => onDragBlock?.(null)}
          onClick={() => (existing ? onGoTo(existing.id) : onAdd(b))}
          onMouseEnter={() => setHint(b)}
          onFocus={() => setHint(b)}
          aria-label={existing ? `${name} já está no site: ir até ela` : `Adicionar ${name} ${insertHint}`}
          aria-describedby="studio-add-hint"
          className={cn(
            'group relative flex h-full w-full flex-col gap-1.5 rounded-xl border bg-card p-1.5 text-left transition-[border-color,box-shadow,transform] focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none',
            existing ? 'border-dashed border-border opacity-70 hover:opacity-100' : 'cursor-grab border-border hover:-translate-y-px hover:border-brand hover:shadow-md active:cursor-grabbing',
          )}
        >
          <BlockThumb block={b} accent={accent} className={big ? 'h-[88px]' : undefined} />
          <span className="flex min-w-0 flex-1 items-end gap-1 px-1 pb-0.5">
            <span className="min-w-0 flex-1">
              <span className="line-clamp-2 block text-[13px] leading-tight font-semibold">{b.label}</span>
              <span className="block truncate text-[11px] leading-tight text-muted-foreground">
                {existing ? 'Já está no site' : b.variant || '\u00a0'}
              </span>
            </span>
            {existing ? (
              <Check className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
            ) : (
              <Plus className="size-4 shrink-0 text-muted-foreground transition-colors group-hover:text-brand" aria-hidden />
            )}
          </span>
          {b.isNew && !existing && b.variant === '' && (
            <span className="absolute top-2.5 right-2.5 rounded-full bg-brand px-1.5 py-px text-[9px] font-bold tracking-wide text-white uppercase">Novo</span>
          )}
        </button>
      </li>
    );
  };

  // Seções únicas que já estão no site vão para o fim do grupo.
  const grid = (list: Block[], big = false) => {
    const ordered = [...list.filter((b) => !existingFor(b, sections)), ...list.filter((b) => existingFor(b, sections))];
    return <ul className="m-0 grid list-none grid-cols-2 gap-2 p-0">{ordered.map((b) => card(b, big))}</ul>;
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col" data-testid="studio-add" onMouseLeave={() => setHint(null)}>
      <PanelHeader title="Adicionar" description="Arraste um bloco para o site ou clique para colocar." />
      <div className="flex flex-col gap-2 border-b border-border px-3 py-3">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && results[0] && !existingFor(results[0], sections)) onAdd(results[0]);
              if (e.key === 'Escape' && q) {
                e.stopPropagation();
                setQ('');
              }
            }}
            placeholder="Procurar: fotos, PIX, mapa…"
            className="pl-8"
            aria-label="Procurar bloco"
          />
        </div>
        <div role="tablist" aria-label="Categorias" className="-mx-3 flex gap-1.5 overflow-x-auto px-3 pb-0.5 [scrollbar-width:none]">
          {[{ id: 'todos' as const, label: 'Todos' }, ...categories].map((c) => {
            const on = category === c.id;
            return (
              <button
                key={c.id}
                type="button"
                role="tab"
                aria-selected={on}
                onClick={() => setCategory(c.id)}
                className={cn(
                  'shrink-0 rounded-full border px-2.5 py-1 text-xs font-medium whitespace-nowrap transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none',
                  on ? 'border-foreground bg-foreground text-background' : 'border-border text-muted-foreground hover:border-foreground/40 hover:text-foreground',
                )}
              >
                {c.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {suggestions.length > 0 && (
          <section className="mb-5" aria-labelledby="studio-add-sug">
            <h3 id="studio-add-sug" className="mb-2 flex items-center gap-1.5 px-0.5 text-[11px] font-semibold tracking-wide text-brand uppercase">
              <Sparkles className="size-3.5" aria-hidden /> Falta no seu site
            </h3>
            {grid(suggestions, true)}
          </section>
        )}

        {results.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
            <Search className="size-6 text-muted-foreground/60" aria-hidden />
            <p className="text-sm font-medium">Nada com “{q.trim()}”.</p>
            <p className="text-xs text-muted-foreground">Tente “fotos”, “PIX”, “mapa” ou “WhatsApp”.</p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setQ('');
                setCategory('todos');
              }}
            >
              Ver todos os blocos
            </Button>
          </div>
        ) : searching || category !== 'todos' ? (
          grid(results)
        ) : (
          categories.map((c) => {
            const list = results.filter((b) => b.category === c.id);
            if (list.length === 0) return null;
            return (
              <section key={c.id} className="mb-5" aria-label={c.label}>
                <h3 className="mb-2 px-0.5 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">{c.label}</h3>
                {grid(list)}
              </section>
            );
          })
        )}
      </div>

      <div id="studio-add-hint" className="flex min-h-[64px] items-start gap-2.5 border-t border-border bg-muted/40 px-4 py-3 text-xs" aria-live="polite">
        {hint ? (
          <>
            <SectionIcon type={hint.type} className="mt-0.5 size-4 shrink-0 text-brand" />
            <span className="min-w-0">
              <span className="block font-semibold text-foreground">{hint.variant ? `${hint.label} · ${hint.variant}` : hint.label}</span>
              <span className="text-muted-foreground">{hint.description}</span>
            </span>
          </>
        ) : (
          <>
            <MousePointerClick className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
            <span className="text-muted-foreground">
              Clique para colocar <span className="font-medium text-foreground">{insertHint}</span>, ou arraste até o ponto exato do site.
            </span>
          </>
        )}
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
