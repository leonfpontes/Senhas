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
  DoorOpen,
  EllipsisVertical,
  Pencil,
  Rocket,
  Share2,
  Ticket,
  Trash2,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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

const TONE_CLASS: Record<Tone, string> = {
  success: 'border-success/30 bg-success/15 text-success-strong',
  info: 'border-info/30 bg-info/15 text-info-strong',
  warning: 'border-warning/40 bg-warning/20 text-warning-strong',
  primary: 'border-primary/30 bg-primary/10 text-brand',
  muted: 'text-muted-foreground',
};

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
  /** Endereço do terreiro: mostrado quando a gira não tem "local" próprio. */
  fallbackLocal?: string | null;
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
  configure: { label: 'Configurar senhas', icon: Ticket },
  release: { label: 'Liberar agora', icon: Rocket },
  share: { label: 'Compartilhar link', icon: Share2 },
  porta: { label: 'Abrir Porta', icon: DoorOpen },
};

function Timeline({ gira, now }: { gira: GiraCardData; now: Date }) {
  const points: { key: string; label: string; at: Date }[] = [];
  if (gira.max_tickets && gira.release_start_at) {
    points.push({ key: 'abre', label: 'Senhas abrem', at: new Date(gira.release_start_at) });
  }
  if (gira.max_tickets && gira.release_end_at) {
    points.push({ key: 'fecha', label: 'Senhas fecham', at: new Date(gira.release_end_at) });
  }
  points.push({ key: 'gira', label: 'Gira', at: new Date(gira.data_inicio) });
  const valid = points.filter((p) => !Number.isNaN(p.at.getTime()));
  if (valid.length < 2) return null;

  return (
    <ol aria-label="Linha do tempo da gira" className="m-0 grid list-none grid-cols-3 gap-1 p-0" data-testid="gira-timeline">
      {valid.map((p, i) => {
        const passed = now.getTime() >= p.at.getTime();
        return (
          <li key={p.key} className="relative flex min-w-0 flex-col gap-1">
            <div className="flex items-center">
              <span
                aria-hidden
                className={cn(
                  'size-2.5 shrink-0 rounded-full border-2',
                  passed ? 'border-primary bg-primary' : 'border-border bg-background',
                )}
              />
              {i < valid.length - 1 && (
                <span aria-hidden className={cn('h-0.5 flex-1', passed ? 'bg-primary/60' : 'bg-border')} />
              )}
            </div>
            <span className="truncate text-[0.7rem] text-muted-foreground">{p.label}</span>
            <span className={cn('truncate text-xs font-medium', passed ? 'text-foreground' : 'text-muted-foreground')}>
              {shortDate(p.at)} {time(p.at)}
            </span>
          </li>
        );
      })}
    </ol>
  );
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
  fallbackLocal,
  now = new Date(),
  className,
}: GiraCardProps) {
  const local = gira.local?.trim() || fallbackLocal?.trim() || '';
  const phase = giraPhase(gira, now);
  const status = giraStatusLabel(gira, now);
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
        <Button asChild className="w-full sm:w-auto">
          <Link href={`/admin/porta?gira=${encodeURIComponent(gira.id)}`}>
            <Icon aria-hidden /> {label}
          </Link>
        </Button>
      );
    }
    return (
      <Button type="button" className="w-full sm:w-auto" onClick={() => runAction(primary)}>
        <Icon aria-hidden /> {label}
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
          <DoorOpen aria-hidden /> Abrir Porta
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
        <Pencil aria-hidden /> Editar gira
      </DropdownMenuItem>,
    );
  }
  if (permissions.canDelete) {
    if (menu.length > 0) menu.push(<DropdownMenuSeparator key="sep" />);
    menu.push(
      <DropdownMenuItem key="delete" variant="destructive" onSelect={() => onDelete(gira)}>
        <Trash2 aria-hidden /> Excluir gira
      </DropdownMenuItem>,
    );
  }

  return (
    <Card
      data-testid="gira-card"
      data-phase={phase}
      className={cn('gap-0 py-0', phase === 'hoje' && 'border-primary/60', isPast && 'opacity-80', className)}
    >
      <div className="flex flex-col gap-4 p-4">
        <div className="flex items-start gap-3">
          {validStart && (
            <div
              aria-hidden
              className={cn(
                'flex w-14 shrink-0 flex-col items-center rounded-lg border py-1.5',
                phase === 'hoje' ? 'border-primary bg-primary text-primary-foreground' : 'bg-muted/40',
              )}
            >
              <span className="text-[0.65rem] font-semibold uppercase">
                {start.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '')}
              </span>
              <span className="text-xl leading-none font-bold tabular-nums">{start.getDate()}</span>
              <span className="text-[0.65rem] uppercase">
                {start.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '')}
              </span>
            </div>
          )}
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-base font-semibold text-foreground">{gira.nome}</h3>
            <p className="text-sm text-muted-foreground">
              {validStart ? `${start.toLocaleDateString('pt-BR', { weekday: 'long' })}, ${time(start)}` : ''}
            </p>
            {local && (
              <p className="truncate text-xs text-muted-foreground" title={local} data-testid="gira-local">
                {local}
              </p>
            )}
            <Badge variant="outline" className={cn('mt-1.5 whitespace-normal', TONE_CLASS[status.tone])}>
              {status.label}
            </Badge>
          </div>
          {menu.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  data-tour="giras-acoes"
                  aria-label={`Mais ações da gira ${gira.nome}`}
                >
                  <EllipsisVertical aria-hidden />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-48">
                {menu}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>

        {!isPast && <Timeline gira={gira} now={now} />}

        {max > 0 && (
          <div className="flex flex-col gap-1.5">
            <p className="text-sm text-foreground" data-testid="gira-counts">
              {typeof issued === 'number' ? (
                <>
                  <strong className="tabular-nums">{issued}</strong> de {max} senhas
                </>
              ) : (
                <>{max} senhas</>
              )}
              {typeof waiting === 'number' && phase === 'hoje' && (
                <>
                  {' · '}
                  <strong className="tabular-nums">{waiting}</strong> na fila
                </>
              )}
            </p>
            {pct !== null && <Progress value={pct} className="h-1.5" aria-label="Senhas emitidas" />}
          </div>
        )}

        {primaryButton && <div className="flex justify-end">{primaryButton}</div>}
      </div>
    </Card>
  );
}

export default GiraCard;
