/**
 * GiraCard — uma gira na lista de Giras, falando a língua do terreiro.
 *
 * Mostra a data em destaque, o estado em palavras ("Senhas abertas", "Senhas abrem 12/03 às
 * 18:00", "Acontecendo agora"…), a linha do tempo da emissão (abre → fecha → gira), a contagem
 * "12 de 50 senhas · 3 na fila" e **um** botão primário por estado:
 *
 *   sem senhas configuradas      → Configurar senhas
 *   emissão agendada / encerrada → Liberar agora
 *   senhas abertas               → Compartilhar link
 *   dia da gira (a partir de 3h antes) → Abrir Porta
 *
 * O resto (editar, excluir, ver senhas…) fica no menu "Mais ações". Cada ação respeita a
 * permissão recebida — sem permissão o botão nem aparece (CLAUDE.md).
 */
import React from 'react';
import Link from 'next/link';
import {
  CalendarClock,
  Copy,
  DoorOpen,
  Ellipsis,
  LockOpen,
  Rocket,
  Share2,
  SlidersHorizontal,
  Ticket,
  Trash2,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CamadaDeAbrir, CLASSE_CONTEUDO_SOBRE_A_CAMADA } from '@/components/admin/CartaoClicavel';
import { Card } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export interface GiraCardData {
  id: string;
  nome: string;
  data_inicio: string;
  is_active: boolean;
  local?: string | null;
  max_tickets?: number | null;
  release_start_at?: string | null;
  release_end_at?: string | null;
}

export type GiraPhase =
  | 'inativa'
  | 'encerrada'
  | 'sem_senhas'
  | 'agendada'
  | 'emissao_encerrada'
  | 'aberta'
  | 'hoje';

export type GiraPrimaryAction = 'configure' | 'release' | 'share' | 'porta';

const HOUR = 60 * 60 * 1000;
/** A gira "vira" dia de Porta 3h antes do início. */
const PORTA_LEAD_MS = 3 * HOUR;
/** Depois de 12h do início a gira conta como realizada. */
const ENDED_AFTER_MS = 12 * HOUR;

function sameLocalDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function time(d: Date): string {
  return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function shortDate(d: Date): string {
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

/** "hoje às 18:00", "amanhã às 18:00", "12/03 às 18:00". */
export function whenLabel(d: Date, now: Date = new Date()): string {
  if (sameLocalDay(d, now)) return `hoje às ${time(d)}`;
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  if (sameLocalDay(d, tomorrow)) return `amanhã às ${time(d)}`;
  return `${shortDate(d)} às ${time(d)}`;
}

export function giraPhase(gira: GiraCardData, now: Date = new Date()): GiraPhase {
  if (!gira.is_active) return 'inativa';
  const start = new Date(gira.data_inicio);
  const t = now.getTime();
  if (!Number.isNaN(start.getTime()) && t > start.getTime() + ENDED_AFTER_MS) return 'encerrada';
  if (!gira.max_tickets) return 'sem_senhas';
  if (!Number.isNaN(start.getTime()) && t >= start.getTime() - PORTA_LEAD_MS) return 'hoje';
  const releaseStart = gira.release_start_at ? new Date(gira.release_start_at) : null;
  const releaseEnd = gira.release_end_at ? new Date(gira.release_end_at) : null;
  if (releaseStart && t < releaseStart.getTime()) return 'agendada';
  if (releaseEnd && t > releaseEnd.getTime()) return 'emissao_encerrada';
  return 'aberta';
}

type Tone = 'success' | 'info' | 'warning' | 'primary' | 'muted';

export function giraStatusLabel(gira: GiraCardData, now: Date = new Date()): { label: string; tone: Tone } {
  const phase = giraPhase(gira, now);
  const start = new Date(gira.data_inicio);
  switch (phase) {
    case 'inativa':
      return { label: 'Gira desativada', tone: 'muted' };
    case 'encerrada':
      return { label: 'Gira realizada', tone: 'muted' };
    case 'sem_senhas':
      return { label: 'Senhas ainda não configuradas', tone: 'warning' };
    case 'agendada':
      return {
        label: `Senhas abrem ${whenLabel(new Date(gira.release_start_at as string), now)}`,
        tone: 'info',
      };
    case 'emissao_encerrada':
      return { label: 'Pedidos de senha encerrados', tone: 'muted' };
    case 'aberta':
      return { label: 'Senhas abertas no link', tone: 'success' };
    case 'hoje':
      return now.getTime() < start.getTime()
        ? { label: `Gira ${whenLabel(start, now)}`, tone: 'primary' }
        : { label: 'Acontecendo agora', tone: 'primary' };
  }
}

export interface GiraCardPermissions {
  canEdit: boolean;
  canDelete: boolean;
  canViewPorta: boolean;
  canViewTickets: boolean;
}

export interface GiraCardProps {
  gira: GiraCardData;
  /** Senhas já emitidas (quando conhecido). */
  issued?: number | null;
  /** Senhas aguardando atendimento no dia (quando conhecido). */
  waiting?: number | null;
  permissions: GiraCardPermissions;
  onShare: (gira: GiraCardData) => void;
  onConfigure: (gira: GiraCardData) => void;
  onRelease: (gira: GiraCardData) => void;
  onEdit: (gira: GiraCardData) => void;
  onDelete: (gira: GiraCardData) => void;
  /** Beta "Repetir em outra data" (Laboratório): só aparece quando a casa ligou a beta. */
  onRepeat?: (gira: GiraCardData) => void;
  /** Endereço do terreiro: mostrado quando a gira não tem "local" próprio. */
  fallbackLocal?: string | null;
  /** Ação extra ao lado do botão primário (ex.: "Chamada" da corrente, AM-17). */
  extraAction?: React.ReactNode;
  /** Itens do "Mais ações" só no celular (Escala e Chamada saem do cartão, J2 v2 · 08). */
  menuNoCelular?: React.ReactNode;
  now?: Date;
  className?: string;
}

/** Ação primária do estado, já considerando permissões (null = nenhuma). */
export function primaryActionFor(phase: GiraPhase, p: GiraCardPermissions): GiraPrimaryAction | null {
  switch (phase) {
    case 'sem_senhas':
      return p.canEdit ? 'configure' : null;
    case 'agendada':
    case 'emissao_encerrada':
      return p.canEdit ? 'release' : 'share';
    case 'aberta':
      return 'share';
    case 'hoje':
      return p.canViewPorta ? 'porta' : 'share';
    default:
      return null;
  }
}

const ACTION_META: Record<GiraPrimaryAction, { label: string; icon: LucideIcon }> = {
  configure: { label: 'Configurar senhas', icon: SlidersHorizontal },
  release: { label: 'Liberar agora', icon: LockOpen },
  share: { label: 'Compartilhar link', icon: Share2 },
  porta: { label: 'Abrir a Porta', icon: DoorOpen },
};

/** "19h", "19h30" — a hora como o terreiro fala (jornadas v2). */
export function horaCurta(d: Date): string {
  const h = d.getHours();
  const m = d.getMinutes();
  return m ? `${h}h${String(m).padStart(2, '0')}` : `${h}h`;
}

/** "hoje 18h", "amanhã 18h", "sex 14/11, 12h". */
export function quandoCurto(d: Date, now: Date = new Date()): string {
  if (sameLocalDay(d, now)) return `hoje ${horaCurta(d)}`;
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  if (sameLocalDay(d, tomorrow)) return `amanhã ${horaCurta(d)}`;
  const dia = d.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '');
  return `${dia} ${shortDate(d)}, ${horaCurta(d)}`;
}

type SeloTom = 'info' | 'sucesso' | 'atencao' | 'marca' | 'neutro';

/** O SeloDaGira do design system: a situação em uma ou duas palavras. */
export function seloDaGira(
  gira: GiraCardData,
  issued?: number | null,
  now: Date = new Date(),
): { label: string; tom: SeloTom } {
  const phase = giraPhase(gira, now);
  const start = new Date(gira.data_inicio);
  switch (phase) {
    case 'inativa':
      return { label: 'Desativada', tom: 'neutro' };
    case 'encerrada':
      return { label: 'Encerrada', tom: 'neutro' };
    case 'sem_senhas':
    case 'agendada':
      return { label: 'Agendada', tom: 'info' };
    case 'emissao_encerrada':
      return { label: 'Senhas fechadas', tom: 'neutro' };
    case 'aberta':
      return gira.max_tickets && typeof issued === 'number' && issued >= gira.max_tickets
        ? { label: 'Lotada', tom: 'atencao' }
        : { label: 'Senhas abertas', tom: 'sucesso' };
    case 'hoje':
      return now.getTime() < start.getTime() ? { label: 'Hoje', tom: 'marca' } : { label: 'Ao vivo', tom: 'marca' };
  }
}

const SELO_CLASS: Record<SeloTom, string> = {
  info: 'border-info/30 bg-info/10 text-info-strong',
  sucesso: 'border-success/30 bg-success/10 text-success-strong',
  atencao: 'border-warning/40 bg-warning/15 text-warning-strong',
  marca: 'border-primary/30 bg-primary/10 text-brand',
  neutro: 'border-border bg-muted text-muted-foreground',
};

/** A linha do tempo em frase: "Senhas abrem sex 14/11, 12h → fecham sáb 18h → gira 19h". */
export function linhaDoTempo(gira: GiraCardData, now: Date = new Date()): string {
  const phase = giraPhase(gira, now);
  const start = new Date(gira.data_inicio);
  const abre = gira.release_start_at ? new Date(gira.release_start_at) : null;
  const fecha = gira.release_end_at ? new Date(gira.release_end_at) : null;
  const gira_ = `gira ${sameLocalDay(start, fecha ?? start) ? horaCurta(start) : quandoCurto(start, now)}`;
  switch (phase) {
    case 'inativa':
      return 'Gira desativada';
    case 'encerrada':
      return 'Gira realizada';
    case 'sem_senhas':
      return 'Senhas ainda não configuradas';
    case 'agendada':
      return [abre && `Senhas abrem ${quandoCurto(abre, now)}`, fecha && `fecham ${quandoCurto(fecha, now)}`, gira_]
        .filter(Boolean)
        .join(' → ');
    case 'aberta':
      return [fecha ? `Senhas abertas até ${quandoCurto(fecha, now)}` : 'Senhas abertas', gira_].join(' → ');
    case 'emissao_encerrada':
      return [fecha ? `Senhas fecharam ${quandoCurto(fecha, now)}` : 'Senhas fechadas', gira_].join(' → ');
    case 'hoje':
      if (now.getTime() >= start.getTime()) return 'Acontecendo agora';
      return fecha && fecha.getTime() <= now.getTime()
        ? `Senhas fecharam ${quandoCurto(fecha, now)} → gira ${horaCurta(start)}`
        : `Gira ${quandoCurto(start, now)}`;
  }
}

export function GiraCard({
  gira,
  issued,
  waiting,
  permissions,
  onShare,
  onConfigure,
  onRelease,
  onEdit,
  onDelete,
  onRepeat,
  fallbackLocal,
  extraAction,
  menuNoCelular,
  now = new Date(),
  className,
}: GiraCardProps) {
  const local = gira.local?.trim() || fallbackLocal?.trim() || '';
  const phase = giraPhase(gira, now);
  const primary = primaryActionFor(phase, permissions);
  const start = new Date(gira.data_inicio);
  const validStart = !Number.isNaN(start.getTime());
  const isPast = phase === 'encerrada' || phase === 'inativa';
  const max = gira.max_tickets ?? 0;
  const pct = max > 0 && typeof issued === 'number' ? Math.min(100, (issued / max) * 100) : null;

  const runAction = (action: GiraPrimaryAction) => {
    if (action === 'share') onShare(gira);
    else if (action === 'configure') onConfigure(gira);
    else if (action === 'release') onRelease(gira);
  };

  const primaryButton = (() => {
    if (!primary) return null;
    const { label, icon: Icon } = ACTION_META[primary];
    if (primary === 'porta') {
      return (
        <Button asChild className="h-11 px-4 text-[0.9375rem] font-semibold">
          <Link href={`/admin/porta?gira=${encodeURIComponent(gira.id)}`}>
            {label} <Icon aria-hidden />
          </Link>
        </Button>
      );
    }
    return (
      <Button type="button" className="h-11 px-4 text-[0.9375rem] font-semibold" onClick={() => runAction(primary)}>
        {label} <Icon aria-hidden />
      </Button>
    );
  })();

  // Itens do menu: tudo o que não é o botão primário e que a permissão libera.
  const menu: React.ReactNode[] = [];
  if (primary !== 'share' && gira.max_tickets && !isPast) {
    menu.push(
      <DropdownMenuItem key="share" onSelect={() => onShare(gira)}>
        <Share2 aria-hidden /> Compartilhar link
      </DropdownMenuItem>,
    );
  }
  if (primary !== 'porta' && permissions.canViewPorta && gira.max_tickets) {
    menu.push(
      <DropdownMenuItem key="porta" asChild>
        <Link href={`/admin/porta?gira=${encodeURIComponent(gira.id)}`}>
          <DoorOpen aria-hidden /> Abrir a Porta
        </Link>
      </DropdownMenuItem>,
    );
  }
  if (permissions.canViewTickets) {
    menu.push(
      <DropdownMenuItem key="senhas" asChild>
        <Link href={`/admin/tickets?gira=${encodeURIComponent(gira.id)}`}>
          <Ticket aria-hidden /> Ver senhas
        </Link>
      </DropdownMenuItem>,
    );
  }
  if (primary !== 'configure' && permissions.canEdit) {
    menu.push(
      <DropdownMenuItem key="configure" onSelect={() => onConfigure(gira)}>
        <CalendarClock aria-hidden /> Configurar senhas
      </DropdownMenuItem>,
    );
  }
  if (primary !== 'release' && permissions.canEdit && gira.max_tickets && !isPast) {
    menu.push(
      <DropdownMenuItem key="release" onSelect={() => onRelease(gira)}>
        <Rocket aria-hidden /> Liberar agora
      </DropdownMenuItem>,
    );
  }
  if (permissions.canEdit) {
    menu.push(
      <DropdownMenuItem key="edit" onSelect={() => onEdit(gira)}>
        Editar a gira
      </DropdownMenuItem>,
    );
  }
  if (onRepeat) {
    menu.push(
      <DropdownMenuItem key="repeat" onSelect={() => onRepeat(gira)}>
        <Copy aria-hidden /> Repetir em outra data
        <span className="ml-auto text-xs font-medium text-muted-foreground">beta</span>
      </DropdownMenuItem>,
    );
  }
  if (permissions.canDelete) {
    if (menu.length > 0) menu.push(<DropdownMenuSeparator key="sep" />);
    menu.push(
      <DropdownMenuItem key="delete" variant="destructive" onSelect={() => onDelete(gira)}>
        <Trash2 aria-hidden /> Excluir a gira
      </DropdownMenuItem>,
    );
  }

  const selo = seloDaGira(gira, issued, now);
  // Ocupação só com senha saindo (design ético: nada de barra vazia em gira que nem abriu).
  const mostraOcupacao =
    max > 0 && typeof issued === 'number' && (phase === 'aberta' || phase === 'hoje' || phase === 'emissao_encerrada');

  return (
    // Clique para editar (04/11/2026): o cartão da gira abre a edição; as ações seguem como botões e no ⋮.
    <Card
      data-testid="gira-card"
      data-phase={phase}
      className={cn(
        'gap-0 rounded-[14px] py-0 shadow-none',
        permissions.canEdit && [
          CLASSE_CONTEUDO_SOBRE_A_CAMADA,
          'cursor-pointer transition-[transform,box-shadow,border-color] duration-150 hover:-translate-y-0.5 hover:border-primary hover:shadow-md motion-reduce:hover:translate-y-0',
        ],
        phase === 'hoje' && 'border-primary/60',
        isPast && 'opacity-80',
        className,
      )}
    >
      {permissions.canEdit && <CamadaDeAbrir rotulo={`Editar ${gira.nome}`} aoAbrir={() => onEdit(gira)} />}
      <div className="flex flex-col gap-3.5 p-5">
        <div className="flex items-start gap-3">
          {validStart && (
            <div aria-hidden className="flex w-16 shrink-0 flex-col gap-0.5">
              <span className="font-display text-[2.125rem] leading-none tracking-[-0.03em] text-foreground tabular-nums">
                {start.getDate()}
              </span>
              <span className="text-[0.8125rem] font-medium text-muted-foreground">
                {start.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '')} ·{' '}
                {start.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '')}
              </span>
            </div>
          )}
          <div className="flex min-w-0 flex-1 flex-col items-start gap-1">
            <h3 className="w-full truncate text-[1.1875rem] font-semibold text-foreground">{gira.nome}</h3>
            <p className="text-sm text-muted-foreground">
              {validStart ? horaCurta(start) : ''}
              {local && (
                <span data-testid="gira-local" title={local}>
                  {validStart ? ' · ' : ''}
                  {local}
                </span>
              )}
            </p>
            <Badge variant="outline" className={cn('mt-0.5 whitespace-normal', SELO_CLASS[selo.tom])}>
              {selo.label}
            </Badge>
          </div>
        </div>

        <p className="text-sm font-medium text-muted-foreground" data-testid="gira-timeline">
          {linhaDoTempo(gira, now)}
        </p>

        {mostraOcupacao && (
          <div className="flex flex-col gap-1.5">
            <p className="text-sm font-semibold text-foreground" data-testid="gira-counts">
              <span className="tabular-nums">{issued}</span> de {max} senhas
              {typeof waiting === 'number' && phase === 'hoje' && (
                <>
                  {' · '}
                  <span className="tabular-nums">{waiting}</span> na fila
                </>
              )}
            </p>
            {pct !== null && <Progress value={pct} className="h-1.5" aria-label="Senhas emitidas" />}
          </div>
        )}

        {(primaryButton || extraAction || menu.length > 0) && (
          <div className="flex flex-wrap items-center gap-2">
            {primaryButton}
            <span className="flex-1" />
            {extraAction && <span className={cn(menuNoCelular ? 'hidden sm:contents' : 'contents')}>{extraAction}</span>}
            {menu.length > 0 && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="size-11"
                    data-tour="giras-acoes"
                    aria-label={`Mais ações da gira ${gira.nome}`}
                  >
                    <Ellipsis aria-hidden />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="min-w-60 [&_[role=menuitem]]:py-2 [&_[role=menuitem]]:text-[0.9375rem]">
                  {menuNoCelular && <div className="sm:hidden">{menuNoCelular}</div>}
                  {menu}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}

export default GiraCard;
