/**
 * GirasCalendar — "Próximas giras".
 *
 * - Celular (< 900px de container): lista de cartões, próxima gira em destaque,
 *   "Senhas abrem qui 12h" quando a API expõe a janela, botão de 48px.
 * - Computador: o modo configurado — calendário com navegação de mês e a próxima
 *   gira em destaque (padrão), ou lista / grade / carrossel de cartões.
 * - Detalhe do dia: Popover no computador, Sheet no celular.
 */
import React, { useMemo, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, Ticket } from 'lucide-react';
import { cn } from '@/lib/utils';
import { pickForeground } from '@/lib/brand';
import { buttonVariants } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import type { SectionConfig, SectionContext, SiteGira } from '../types';
import {
  formatGiraDateLong,
  giraTicketUrl,
  hexToRgba,
  nextGira,
  parseSPDate,
  releaseWindowLabel,
  sampleGiras,
  sortGiras,
} from '../lib';
import { SectionBody, SectionShell, SectionTitle } from './SectionShell';

interface GiraCardProps {
  gira: SiteGira;
  config: SectionConfig;
  isPreview: boolean;
  highlight?: boolean;
  compact?: boolean;
  cardBg: string;
  brand: string;
}

function GiraActions({ gira, config, isPreview, brand, compact }: Omit<GiraCardProps, 'cardBg' | 'highlight'>) {
  const showTicket = config.show_ticket_button !== false && gira.has_tickets;
  const showSponsor = config.show_sponsor_button !== false && gira.has_sponsor_tickets;
  if (!showTicket && !showSponsor) return null;
  const inert = isPreview
    ? { tabIndex: -1, 'aria-disabled': true as const, onClick: (e: React.MouseEvent) => e.preventDefault() }
    : {};
  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {showTicket && (
        <a
          href={giraTicketUrl(gira.id)}
          {...inert}
          className={cn(
            buttonVariants({ size: compact ? 'default' : 'touch' }), 'no-underline',
            'bg-[var(--brand)] text-[var(--brand-fg)] hover:bg-[var(--brand)] hover:opacity-90 focus-visible:ring-[var(--brand)]/50',
          )}
          style={{ '--brand': brand, '--brand-fg': pickForeground(brand) } as React.CSSProperties}
        >
          <Ticket aria-hidden />
          Retire sua senha
        </a>
      )}
      {showSponsor && (
        <a
          href={giraTicketUrl(gira.id, 'associado')}
          {...inert}
          className={cn(
            buttonVariants({ variant: 'outline', size: compact ? 'default' : 'touch' }), 'no-underline',
            'border-[var(--fg)]/40 bg-transparent text-[var(--fg)] hover:bg-[var(--fg)]/10 hover:text-[var(--fg)]',
          )}
        >
          Senha de associado
        </a>
      )}
    </div>
  );
}

function GiraCard(props: GiraCardProps) {
  const { gira, config, highlight, cardBg } = props;
  const release = releaseWindowLabel(gira);
  return (
    <article
      className={cn(
        'rounded-xl border border-black/10 p-4 text-[var(--fg)] shadow-sm',
        highlight && 'border-[var(--brand)] ring-2 ring-[var(--brand)]/30',
      )}
      style={{ background: cardBg, '--brand': props.brand } as React.CSSProperties}
      aria-label={gira.nome}
    >
      {highlight && (
        <p className="mb-1 text-xs font-semibold tracking-wide uppercase opacity-70">Próxima gira</p>
      )}
      <h3 className="leading-snug" style={{ fontSize: Number(config.title_font_size || 20), fontWeight: Number(config.title_font_weight || 700) }}>
        {gira.nome}
        {gira._sample && <span className="ml-2 align-middle text-xs font-normal opacity-60">(exemplo)</span>}
      </h3>
      {gira.data_hora && (
        <time dateTime={gira.data_hora} className="mt-1 block opacity-70 first-letter:uppercase" style={{ fontSize: Number(config.body_font_size || 14) }}>
          {formatGiraDateLong(gira.data_hora)}
        </time>
      )}
      {gira.descricao && (
        <SectionBody config={config} defaultSize={14} className="mt-2 opacity-85">
          {gira.descricao}
        </SectionBody>
      )}
      {release && (
        <p className="mt-2 inline-flex items-center gap-1 rounded-full bg-[var(--fg)]/10 px-2.5 py-1 text-xs font-semibold">
          <Ticket className="size-3.5" aria-hidden />
          {release}
        </p>
      )}
      <GiraActions {...props} />
    </article>
  );
}

function EmptyGiras({ config }: { config: SectionConfig }) {
  return (
    <div role="status" className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-black/15 px-4 py-8 text-center">
      <CalendarDays className="size-8 opacity-50" aria-hidden />
      <SectionBody config={config} defaultSize={15} className="opacity-70">
        Nenhuma gira agendada no momento. Volte em breve!
      </SectionBody>
    </div>
  );
}

const DAY_LABELS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

function MonthCalendar({
  giras,
  config,
  isPreview,
  brand,
  cardBg,
}: {
  giras: SiteGira[];
  config: SectionConfig;
  isPreview: boolean;
  brand: string;
  cardBg: string;
}) {
  const today = useMemo(() => parseSPDate(new Date().toISOString()), []);
  const [offset, setOffset] = useState(0);
  const [openDay, setOpenDay] = useState<number | null>(null);
  const isNarrowViewport = useMediaQuery('(max-width: 899px)');

  const view = new Date(today.year, today.month + offset, 1);
  const year = view.getFullYear();
  const month = view.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const monthName = view.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });

  const byDay = useMemo(() => {
    const map = new Map<number, SiteGira[]>();
    for (const g of giras) {
      if (!g.data_hora) continue;
      const sp = parseSPDate(g.data_hora);
      if (sp.year === year && sp.month === month) {
        map.set(sp.day, [...(map.get(sp.day) ?? []), g]);
      }
    }
    return map;
  }, [giras, year, month]);

  const cells: (number | null)[] = Array(firstDay).fill(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  const calBg = String(config.calendar_bg_color || '#f8f8f8');
  const calText = pickForeground(calBg, String(config.calendar_text_color || '#111111'));
  const highlight = String(config.calendar_highlight_color || brand);
  const highlightFg = pickForeground(highlight);
  const bodySize = Number(config.body_font_size || 14);

  const dayDetails = (day: number) => (
    <div className="flex flex-col gap-3">
      {(byDay.get(day) ?? []).map((g) => (
        <GiraCard key={g.id} gira={g} config={config} isPreview={isPreview} brand={brand} cardBg={cardBg} compact />
      ))}
    </div>
  );

  return (
    <div
      className="rounded-2xl p-3 text-[var(--cal-fg)] @min-[900px]:p-5"
      style={{ background: calBg, '--cal-fg': calText, '--hl': highlight, '--hl-fg': highlightFg } as React.CSSProperties}
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <button
          type="button"
          aria-label="Mês anterior"
          onClick={() => setOffset((o) => o - 1)}
          className="flex size-10 items-center justify-center rounded-full hover:bg-black/10 focus-visible:ring-[3px] focus-visible:ring-[var(--hl)]/50 focus-visible:outline-none"
        >
          <ChevronLeft className="size-5" aria-hidden />
        </button>
        <p className="text-base font-semibold first-letter:uppercase" aria-live="polite">
          {monthName}
        </p>
        <button
          type="button"
          aria-label="Próximo mês"
          onClick={() => setOffset((o) => o + 1)}
          className="flex size-10 items-center justify-center rounded-full hover:bg-black/10 focus-visible:ring-[3px] focus-visible:ring-[var(--hl)]/50 focus-visible:outline-none"
        >
          <ChevronRight className="size-5" aria-hidden />
        </button>
      </div>
      <div role="grid" aria-label={`Calendário de ${monthName}`} className="grid grid-cols-7 gap-1">
        {DAY_LABELS.map((lbl) => (
          <div key={lbl} role="columnheader" className="py-1 text-center text-xs font-semibold opacity-50">
            {lbl}
          </div>
        ))}
        {cells.map((day, i) => {
          if (day === null) return <div key={`e-${i}`} role="gridcell" aria-hidden className="min-h-11" />;
          const dayGiras = byDay.get(day) ?? [];
          const hasGira = dayGiras.length > 0;
          const isToday = offset === 0 && day === today.day;
          const cell = (
            <button
              type="button"
              role="gridcell"
              aria-label={hasGira ? `Dia ${day}: ${dayGiras.map((g) => g.nome).join(', ')}` : `Dia ${day}`}
              aria-expanded={hasGira ? openDay === day : undefined}
              disabled={!hasGira}
              onClick={() => setOpenDay(day)}
              className={cn(
                'flex min-h-11 w-full items-center justify-center rounded-lg transition-opacity focus-visible:ring-[3px] focus-visible:ring-[var(--hl)]/60 focus-visible:outline-none disabled:cursor-default',
                hasGira ? 'bg-[var(--hl)] font-bold text-[var(--hl-fg)] hover:opacity-85' : 'bg-transparent',
                isToday && !hasGira && 'ring-1 ring-[var(--cal-fg)]/40',
              )}
              style={{ fontSize: bodySize }}
            >
              {day}
            </button>
          );
          if (!hasGira || isNarrowViewport) return <React.Fragment key={day}>{cell}</React.Fragment>;
          return (
            <Popover key={day} open={openDay === day} onOpenChange={(o) => setOpenDay(o ? day : null)}>
              <PopoverTrigger asChild>{cell}</PopoverTrigger>
              <PopoverContent className="z-[1400] w-[min(92vw,360px)] p-3">{dayDetails(day)}</PopoverContent>
            </Popover>
          );
        })}
      </div>

      {isNarrowViewport && (
        <Sheet open={openDay !== null} onOpenChange={(o) => !o && setOpenDay(null)}>
          <SheetContent side="bottom" className="z-[1400] max-h-[85vh] overflow-y-auto rounded-t-2xl">
            <SheetHeader>
              <SheetTitle>Giras do dia {openDay}</SheetTitle>
            </SheetHeader>
            <div className="px-4 pb-6">{openDay !== null && dayDetails(openDay)}</div>
          </SheetContent>
        </Sheet>
      )}
    </div>
  );
}

export function GirasCalendar({ config, ctx }: { config: SectionConfig; ctx: SectionContext }) {
  const isPreview = ctx.mode === 'preview';
  const giras = useMemo(
    () => sortGiras(ctx.giras.length === 0 && isPreview ? sampleGiras() : ctx.giras),
    [ctx.giras, isPreview],
  );
  const next = nextGira(giras);
  const displayMode = String(config.display_mode || 'calendar');
  const title = String(config.title || 'Próximas giras');
  const brand = String(config.calendar_highlight_color || ctx.brandColor || '#4f46e5');
  const cardBg = hexToRgba(String(config.card_bg_color || '#ffffff'), 100);

  const cardList = (className: string, itemClassName?: string) => (
    <ul className={cn('list-none p-0', className)}>
      {giras.map((g) => (
        <li key={g.id} className={itemClassName}>
          <GiraCard gira={g} config={config} isPreview={isPreview} brand={brand} cardBg={cardBg} highlight={g.id === next?.id} />
        </li>
      ))}
    </ul>
  );

  return (
    <SectionShell config={config} defaultBg="#ffffff" aria-label="Próximas giras" data-section="giras">
      <SectionTitle config={config} defaultSize={28}>
        {title}
      </SectionTitle>

      {giras.length === 0 ? (
        <EmptyGiras config={config} />
      ) : (
        <>
          {/* Celular: sempre lista, próxima gira primeiro e em destaque. */}
          <div data-testid="giras-mobile" className="@min-[900px]:hidden">
            {cardList('flex flex-col gap-3')}
          </div>

          {/* Computador: modo configurado. */}
          <div data-testid="giras-desktop" className="hidden @min-[900px]:block">
            {displayMode === 'calendar' && (
              <div className="flex flex-col gap-6">
                {next && <GiraCard gira={next} config={config} isPreview={isPreview} brand={brand} cardBg={cardBg} highlight />}
                <MonthCalendar giras={giras} config={config} isPreview={isPreview} brand={brand} cardBg={cardBg} />
                <p className="text-sm opacity-60">
                  Dias destacados têm gira. {isPreview ? 'No site, clicar no dia mostra os detalhes.' : 'Clique no dia para ver os detalhes.'}
                </p>
              </div>
            )}
            {displayMode === 'list' && cardList('flex flex-col gap-4')}
            {displayMode === 'card-grid' && cardList('grid grid-cols-2 gap-4 @min-[1100px]:grid-cols-3')}
            {displayMode === 'card-carousel' &&
              cardList('flex snap-x snap-mandatory gap-4 overflow-x-auto pb-2', 'w-[320px] shrink-0 snap-start')}
          </div>
        </>
      )}
    </SectionShell>
  );
}

export default GirasCalendar;
