/**
 * Porta — modo operação do dia da gira (rota /admin/porta).
 *
 * Feita para quem está em pé na entrada, com o celular na mão:
 * - Topo fixo com a gira e o botão grande **"Chamar próximo"** (primeiro da fila na ordem da
 *   API — quem já chegou tem a vez; sem ninguém marcado como chegou, o primeiro da fila) e
 *   **"Sem senha"** (também na barra inferior do celular).
 * - Fluxo de um passo: **Chamar** abre o AttendModal (médium/cambone) e já registra o
 *   atendimento (`/attend`: aguardando → atendido). Não existe etapa "Em atendimento"; um
 *   `called` antigo vindo da API é tratado como aguardando (`normalizeLegacyStatus`).
 * - Fila compacta com menu por senha: Chegou · Chamar · Não veio · Editar.
 * - Desfazer pelo toast logo depois de cada ação.
 * - Indicadores numa linha ("8 aguardando · 12 atendidos · 1 não veio") abrindo um Sheet com o
 *   resumo e os finalizados.
 * - Aviso sonoro quando entra alguém na fila, com botão de mudo; atualização a cada 8s.
 * Vocabulário: Walk-in→Sem senha, Check-in→Chegou, Atender→Chamar, Finalizar→Atendido,
 * Ausente→Não veio. Alvos de toque de 48px (`size="touch"` / `"icon-touch"`).
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { toast } from 'sonner';
import {
  Clock,
  EllipsisVertical,
  LogIn,
  LogOut,
  Megaphone,
  Pencil,
  Search,
  Star,
  Tv,
  Undo2,
  UserPlus,
  UserX,
  Volume2,
  VolumeX,
} from 'lucide-react';

import AdminLayout from './admin_layout';
import AttendModal from '@/components/AttendModal';
import WalkInModal from '@/components/WalkInModal';
import { PermissionDenied } from '@/components/gates';
import { TextField } from '@/components/fields';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { Toggle } from '@/components/ui/toggle';
import { cn } from '@/lib/utils';
import { apiClient, extractApiErrorMessage } from '@/services/api_client';
import { usePermissions } from '@/hooks/usePermissions';
import { giraLabel, pickTodayGira, useGiraContext } from '@/components/admin/GiraContext';
import { PORTA_WALK_IN_EVENT } from '@/components/admin/MobileTabBar';
import { normalizeLegacyStatus, numeroDaSenha, senhaStatusLabel } from '@/components/admin/senhaFormat';
import { PRIORITY_CATEGORY_LABELS, PriorityCategoryType } from 'shared-types';

const POLLING_INTERVAL_MS = 8000;
const MUTE_STORAGE_KEY = 'girahub:porta-som-mudo';

// ── Tipos ─────────────────────────────────────────────────────────────────────

interface MediumOption {
  id: string;
  nome: string;
  is_atendimento: boolean;
}
interface Gira {
  id: string;
  nome: string;
  data_inicio: string;
  is_active: boolean;
}
interface TenantConfig {
  enable_walk_in: boolean;
}

interface DoorStats {
  total: number;
  checked_in: number;
  awaiting: number;
  in_progress: number;
  completed: number;
  no_show: number;
  walk_in: number;
  preferenciais: number;
  patrocinados: number;
}

interface QueueItem {
  id: string;
  numero: number;
  status: string;
  consulente_nome: string | null;
  consulente_email?: string | null;
  consulente_telefone: string | null;
  preferencial: boolean;
  priority_category?: string | null;
  is_sponsor: boolean;
  is_walk_in: boolean;
  is_acompanhante?: boolean;
  numero_formatado: string;
  checkin_em: string | null;
  atendido_em: string | null;
  chamado_em: string | null;
  finalizado_em: string | null;
  medium_nome: string | null;
  cambone_nome: string | null;
  atendimento_descricao: string | null;
  horario_desejado?: string | null;
}

type AttendData = { medium_nome: string; cambone_nome?: string; atendimento_descricao?: string };
type WalkInData = { nome: string; email?: string; telefone?: string; priority_category: string | null };

// ── Helpers ───────────────────────────────────────────────────────────────────

function priorityLabel(item: QueueItem): string {
  if (!item.priority_category) return 'Preferencial';
  return PRIORITY_CATEGORY_LABELS[item.priority_category as PriorityCategoryType] ?? 'Preferencial';
}

const isDone = (t: QueueItem) => t.status === 'completed' || t.status === 'no_show' || t.status === 'cancelled';

/** Próximo a chamar: quem já chegou, na ordem da API; sem ninguém marcado, o primeiro da fila. */
function nextToCall(queue: QueueItem[]): QueueItem | null {
  const waiting = queue.filter((t) => t.status === 'emitted');
  return waiting.find((t) => !!t.checkin_em) ?? waiting[0] ?? null;
}

function normalize(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/** Busca por nome ou número ("42", "0042", "#42"). */
function filterQueue(queue: QueueItem[], search: string): QueueItem[] {
  const q = search.trim();
  if (!q) return queue;
  const needle = q.replace(/^#/, '').toLowerCase();
  const isNumeric = /^\d+$/.test(needle);
  return queue.filter((t) => {
    if (isNumeric) {
      if (String(t.numero) === needle) return true;
      if (t.numero_formatado?.replace(/^#?0*/, '') === needle.replace(/^0*/, '')) return true;
    }
    return normalize(t.consulente_nome ?? '').includes(normalize(needle));
  });
}

function readMuted(): boolean {
  try {
    return window.localStorage.getItem(MUTE_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

function writeMuted(muted: boolean): void {
  try {
    if (muted) window.localStorage.setItem(MUTE_STORAGE_KEY, '1');
    else window.localStorage.removeItem(MUTE_STORAGE_KEY);
  } catch {
    /* storage bloqueado — vale só nesta aba */
  }
}

// ── Peças visuais ─────────────────────────────────────────────────────────────

function Tags({ item }: { item: QueueItem }) {
  return (
    <>
      {item.is_sponsor && (
        <Badge variant="outline" className="border-warning/40 bg-warning/15 text-warning-strong">
          <Star aria-hidden /> Associado
        </Badge>
      )}
      {item.is_walk_in && (
        <Badge variant="outline" className="border-info/30 bg-info/10 text-info-strong">
          Sem senha
        </Badge>
      )}
      {item.is_acompanhante && <Badge variant="outline">Acompanhante</Badge>}
      {item.preferencial && (
        <Badge variant="outline" className="border-warning/40 text-warning-strong">
          <Star aria-hidden /> {priorityLabel(item)}
        </Badge>
      )}
      {item.horario_desejado && (
        <Badge variant="outline">
          <Clock aria-hidden /> {item.horario_desejado}
        </Badge>
      )}
    </>
  );
}

function SectionTitle({ children, count }: { children: React.ReactNode; count: number }) {
  return (
    <h2 className="mb-2 flex items-baseline gap-2 text-base font-semibold">
      {children}
      <span className="text-sm font-normal text-muted-foreground">({count})</span>
    </h2>
  );
}

interface ItemActions {
  canEdit: boolean;
  busy: boolean;
  onCheckin: (t: QueueItem) => void;
  onUndoCheckin: (t: QueueItem) => void;
  onCall: (t: QueueItem) => void;
  onNoShow: (t: QueueItem) => void;
  onUndo: (t: QueueItem) => void;
  onEditAttend: (t: QueueItem) => void;
  onEditWalkIn: (t: QueueItem) => void;
}

/** Menu de ações de uma senha (o que cabe em cada status). */
function ItemMenu({ item, a }: { item: QueueItem; a: ItemActions }) {
  const numero = numeroDaSenha(item);
  const entries: React.ReactNode[] = [];
  if (item.status === 'emitted') {
    entries.push(
      item.checkin_em ? (
        <DropdownMenuItem key="undo-checkin" onSelect={() => a.onUndoCheckin(item)}>
          <LogOut aria-hidden /> Desfazer chegada
        </DropdownMenuItem>
      ) : (
        <DropdownMenuItem key="checkin" onSelect={() => a.onCheckin(item)}>
          <LogIn aria-hidden /> Chegou
        </DropdownMenuItem>
      ),
      <DropdownMenuItem key="call" onSelect={() => a.onCall(item)}>
        <Megaphone aria-hidden /> Chamar
      </DropdownMenuItem>,
      <DropdownMenuItem key="noshow" onSelect={() => a.onNoShow(item)}>
        <UserX aria-hidden /> Não veio
      </DropdownMenuItem>,
    );
  }
  if (item.status === 'completed' || item.status === 'no_show') {
    entries.push(
      <DropdownMenuItem key="undo" onSelect={() => a.onUndo(item)}>
        <Undo2 aria-hidden /> Desfazer
      </DropdownMenuItem>,
    );
  }
  if (item.status === 'completed') {
    entries.push(
      <DropdownMenuItem key="edit-attend" onSelect={() => a.onEditAttend(item)}>
        <Pencil aria-hidden /> Editar atendimento
      </DropdownMenuItem>,
    );
  }
  if (item.is_walk_in && item.status !== 'cancelled') {
    if (entries.length > 0) entries.push(<DropdownMenuSeparator key="sep" />);
    entries.push(
      <DropdownMenuItem key="edit-walkin" onSelect={() => a.onEditWalkIn(item)}>
        <Pencil aria-hidden /> Editar
      </DropdownMenuItem>,
    );
  }
  if (!a.canEdit || entries.length === 0) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-touch"
          disabled={a.busy}
          aria-label={`Ações da senha ${numero}`}
          className="shrink-0"
        >
          <EllipsisVertical aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-48">
        {entries}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function QueueRow({ item, a, isNext }: { item: QueueItem; a: ItemActions; isNext: boolean }) {
  const arrived = !!item.checkin_em;
  return (
    <li
      className={cn(
        'flex min-h-14 items-center gap-3 border-b px-3 py-1.5 last:border-b-0',
        isNext && 'bg-primary/5',
        isDone(item) && 'opacity-60',
      )}
      data-testid="fila-item"
    >
      <span className="w-14 shrink-0 font-mono text-lg font-bold tabular-nums">{numeroDaSenha(item)}</span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{item.consulente_nome || '—'}</p>
        <div className="flex flex-wrap items-center gap-1">
          {item.status === 'emitted' ? (
            arrived ? (
              <Badge variant="outline" className="border-success/30 bg-success/15 text-success-strong">
                Chegou
              </Badge>
            ) : null
          ) : (
            <Badge variant="outline">{senhaStatusLabel(item.status)}</Badge>
          )}
          {isNext && <Badge>Próximo</Badge>}
          <Tags item={item} />
        </div>
      </div>
      <ItemMenu item={item} a={a} />
    </li>
  );
}

function StatBox({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex flex-col items-center rounded-lg border px-2 py-3">
      <span className="text-2xl font-extrabold tabular-nums">{value}</span>
      <span className="text-center text-xs text-muted-foreground">{label}</span>
    </div>
  );
}

// ── Página ────────────────────────────────────────────────────────────────────

export default function PortaPage() {
  const { can: canGroup } = usePermissions();
  const canView = canGroup('porta', 'view');
  return (
    <AdminLayout title="Porta" maxWidth="md">
      {canView ? <PortaContent /> : <PermissionDenied />}
    </AdminLayout>
  );
}

function PortaContent() {
  const router = useRouter();
  const { can: canGroup } = usePermissions();
  const canInsert = canGroup('porta', 'insert');
  const canEdit = canGroup('porta', 'edit');
  const giraCtx = useGiraContext({ load: false });
  const { selectedGiraId: ctxGiraId, setSelectedGiraId: setCtxGiraId } = giraCtx;

  const [giras, setGiras] = useState<Gira[]>([]);
  const [selectedGiraId, setSelectedGiraIdState] = useState<string>('');
  const [stats, setStats] = useState<DoorStats | null>(null);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [queueLoaded, setQueueLoaded] = useState(false);
  // Gira a que a `queue` atual pertence (base do aviso sonoro).
  const [queueGiraId, setQueueGiraId] = useState('');
  const [search, setSearch] = useState('');
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [config, setConfig] = useState<TenantConfig | null>(null);
  const [mediumOptions, setMediumOptions] = useState<MediumOption[]>([]);
  const [camboneOptions, setCamboneOptions] = useState<MediumOption[]>([]);
  const [attendTarget, setAttendTarget] = useState<QueueItem | null>(null);
  const [editTarget, setEditTarget] = useState<QueueItem | null>(null);
  const [walkInCreateOpen, setWalkInCreateOpen] = useState(false);
  const [walkInEditTarget, setWalkInEditTarget] = useState<QueueItem | null>(null);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [muted, setMuted] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  useEffect(() => {
    setMuted(readMuted());
  }, []);

  const selectGira = useCallback(
    (id: string) => {
      setSelectedGiraIdState(id);
      setQueueLoaded(false);
      setQueue([]);
      setStats(null);
      setCtxGiraId(id);
    },
    [setCtxGiraId],
  );

  // ── Carga ────────────────────────────────────────────────────────────────────
  const loadGiras = async () => {
    try {
      const res = await apiClient.get('/api/v1/admin/giras');
      const all: Gira[] = Array.isArray(res?.data) ? res.data : res?.data?.items || [];
      const cutoff = Date.now() - 24 * 60 * 60 * 1000;
      const data = all
        .filter((g) => new Date(g.data_inicio).getTime() >= cutoff)
        // A mais próxima primeiro: a Porta abre na próxima gira, não na mais distante.
        .sort((a, b) => new Date(a.data_inicio).getTime() - new Date(b.data_inicio).getTime());
      setGiras(data);
    } catch {
      toast.error('Erro ao carregar as giras.');
    }
  };

  const loadConfig = async () => {
    try {
      const res = await apiClient.get('/api/v1/admin/door/config');
      setConfig(res?.data ?? null);
    } catch (err) {
      console.error('Erro ao carregar config da porta:', err);
      toast.error('Não foi possível carregar as configurações da Porta ("Sem senha" pode ficar indisponível).');
    }
  };

  const loadMediunOptions = async () => {
    try {
      const [mRes, cRes] = await Promise.all([
        apiClient.get<MediumOption[]>('/api/v1/admin/mediuns/options?only_atendimento=true'),
        apiClient.get<MediumOption[]>('/api/v1/admin/mediuns/options'),
      ]);
      setMediumOptions(Array.isArray(mRes?.data) ? mRes.data : []);
      setCamboneOptions(Array.isArray(cRes?.data) ? cRes.data : []);
    } catch {
      /* opcional */
    }
  };

  const loadStats = useCallback(async () => {
    if (!selectedGiraId) return;
    try {
      const res = await apiClient.get(`/api/v1/admin/giras/${selectedGiraId}/door/stats`);
      setStats(res?.data ?? null);
    } catch {
      /* tenta de novo no próximo ciclo */
    }
  }, [selectedGiraId]);

  const loadQueue = useCallback(async () => {
    if (!selectedGiraId) return;
    try {
      // Fila completa — a busca por nome e número é feita aqui no navegador.
      const res = await apiClient.get(`/api/v1/admin/giras/${selectedGiraId}/door/queue`);
      setQueue(Array.isArray(res?.data?.items) ? res.data.items.map(normalizeLegacyStatus) : []);
      setQueueGiraId(selectedGiraId);
      setLastUpdated(new Date());
    } catch {
      toast.error('Erro ao carregar a fila.');
    } finally {
      setQueueLoaded(true);
    }
  }, [selectedGiraId]);

  const refreshAll = useCallback(() => {
    void loadStats();
    void loadQueue();
  }, [loadStats, loadQueue]);

  useEffect(() => {
    void loadGiras();
    void loadConfig();
    void loadMediunOptions();
    // Só na montagem.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Escolha da gira: ?gira= (link da lista de giras / modo TV) > gira do contexto > gira de hoje.
  useEffect(() => {
    if (!router.isReady || giras.length === 0) return;
    const queryGiraId = typeof router.query.gira === 'string' ? router.query.gira : '';
    if (queryGiraId && giras.some((g) => g.id === queryGiraId)) {
      if (queryGiraId !== selectedGiraId) selectGira(queryGiraId);
      return;
    }
    if (selectedGiraId && giras.some((g) => g.id === selectedGiraId)) return;
    const fromCtx = ctxGiraId && giras.some((g) => g.id === ctxGiraId) ? ctxGiraId : null;
    const today = pickTodayGira(giras);
    const fallback = giras.find((g) => g.is_active) ?? giras[0];
    const chosen = fromCtx ?? today?.id ?? fallback?.id;
    if (chosen) selectGira(chosen);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router.isReady, router.query.gira, giras]);

  // Troca feita em outra tela/no topo (seletor da gira de hoje) → segue aqui também.
  useEffect(() => {
    if (ctxGiraId && ctxGiraId !== selectedGiraId && giras.some((g) => g.id === ctxGiraId)) {
      setSelectedGiraIdState(ctxGiraId);
      setQueueLoaded(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctxGiraId]);

  useEffect(() => {
    if (selectedGiraId) refreshAll();
  }, [selectedGiraId, refreshAll]);

  useEffect(() => {
    if (!selectedGiraId) return;
    const t = setInterval(refreshAll, POLLING_INTERVAL_MS);
    return () => clearInterval(t);
  }, [selectedGiraId, refreshAll]);

  const walkInEnabled = !!selectedGiraId && !!config?.enable_walk_in && canInsert;

  // "Sem senha" pela barra inferior do celular.
  useEffect(() => {
    const open = () => {
      if (walkInEnabled) setWalkInCreateOpen(true);
      else toast.info('"Sem senha" não está disponível para esta gira.');
    };
    window.addEventListener(PORTA_WALK_IN_EVENT, open);
    return () => window.removeEventListener(PORTA_WALK_IN_EVENT, open);
  }, [walkInEnabled]);

  // ── Ações ────────────────────────────────────────────────────────────────────
  const runAction = async (
    ticketId: string,
    request: () => Promise<unknown>,
    successMsg: string,
    undo?: { label?: string; run: () => Promise<unknown>; done: string },
  ) => {
    if (!canEdit) return;
    try {
      setActionLoading(ticketId);
      await request();
      if (undo) {
        toast.success(successMsg, {
          action: {
            label: undo.label ?? 'Desfazer',
            onClick: async () => {
              try {
                await undo.run();
                toast.success(undo.done);
              } catch (err) {
                toast.error(extractApiErrorMessage(err, 'Não foi possível desfazer.'));
              } finally {
                refreshAll();
              }
            },
          },
        });
      } else {
        toast.success(successMsg);
      }
      refreshAll();
    } catch (err) {
      toast.error(extractApiErrorMessage(err, 'Erro ao realizar a ação.'));
    } finally {
      setActionLoading(null);
    }
  };

  const undoTo = (id: string) => () => apiClient.patch(`/api/v1/admin/door/tickets/${id}/undo`);

  const handleCheckin = (t: QueueItem) =>
    runAction(t.id, () => apiClient.patch(`/api/v1/admin/door/tickets/${t.id}/checkin`), `${numeroDaSenha(t)} chegou`, {
      run: () => apiClient.delete(`/api/v1/admin/door/tickets/${t.id}/checkin`),
      done: 'Chegada desfeita',
    });
  const handleUndoCheckin = (t: QueueItem) =>
    runAction(t.id, () => apiClient.delete(`/api/v1/admin/door/tickets/${t.id}/checkin`), 'Chegada desfeita');
  const handleNoShow = (t: QueueItem) =>
    runAction(t.id, () => apiClient.patch(`/api/v1/admin/door/tickets/${t.id}/no-show`), `${numeroDaSenha(t)}: não veio`, {
      run: undoTo(t.id),
      done: 'Senha voltou para a fila',
    });
  const handleUndo = (t: QueueItem) =>
    runAction(t.id, () => apiClient.patch(`/api/v1/admin/door/tickets/${t.id}/undo`), 'Senha voltou para a fila');

  const handleAttendConfirm = (data: AttendData) => {
    const target = attendTarget;
    if (!target) return;
    setAttendTarget(null);
    void runAction(
      target.id,
      () => apiClient.patch(`/api/v1/admin/door/tickets/${target.id}/attend`, data),
      `${numeroDaSenha(target)} atendido`,
      { run: undoTo(target.id), done: 'Senha voltou para a fila' },
    );
  };

  const handleEditAttendInfo = (data: AttendData) => {
    const target = editTarget;
    if (!target) return;
    setEditTarget(null);
    void runAction(
      target.id,
      () => apiClient.patch(`/api/v1/admin/door/tickets/${target.id}/attend-info`, data),
      'Atendimento atualizado',
    );
  };

  const handleCreateWalkIn = async (data: WalkInData) => {
    if (!selectedGiraId || !canInsert) return;
    try {
      setActionLoading('__walkin_create__');
      const res = await apiClient.post(`/api/v1/admin/giras/${selectedGiraId}/door/walk-in`, data);
      const numero = res?.data ? numeroDaSenha(res.data) : '';
      toast.success(numero ? `Senha ${numero} criada para quem chegou sem senha` : 'Senha criada');
      setWalkInCreateOpen(false);
      refreshAll();
    } catch (err) {
      toast.error(extractApiErrorMessage(err, 'Erro ao criar a senha.'));
    } finally {
      setActionLoading(null);
    }
  };

  const handleEditWalkIn = async (data: WalkInData) => {
    if (!walkInEditTarget || !canEdit) return;
    try {
      setActionLoading(walkInEditTarget.id);
      await apiClient.patch(`/api/v1/admin/door/tickets/${walkInEditTarget.id}/walk-in`, data);
      toast.success('Dados atualizados');
      setWalkInEditTarget(null);
      refreshAll();
    } catch (err) {
      toast.error(extractApiErrorMessage(err, 'Erro ao editar.'));
    } finally {
      setActionLoading(null);
    }
  };

  // ── Derivados ────────────────────────────────────────────────────────────────
  const filtered = useMemo(() => filterQueue(queue, search), [queue, search]);
  const next = useMemo(() => nextToCall(queue), [queue]);
  const waiting = filtered.filter((t) => t.status === 'emitted');
  const done = queue.filter(isDone);

  const counts = {
    aguardando: queue.filter((t) => t.status === 'emitted').length,
    atendidos: queue.filter((t) => t.status === 'completed').length,
    naoVeio: queue.filter((t) => t.status === 'no_show').length,
  };

  // ── Aviso sonoro + contagem no título da aba ─────────────────────────────────
  // A base de comparação é a primeira fila carregada DE CADA GIRA: abrir a Porta ou trocar de
  // gira não toca (antes a fila vazia inicial fazia todo mundo parecer "novo").
  const soundBaselineRef = useRef<{ giraId: string; ids: Set<string> } | null>(null);
  const mutedRef = useRef(muted);
  mutedRef.current = muted;
  useEffect(() => {
    if (!queueGiraId) return;
    const currentIds = new Set(queue.filter((t) => t.status === 'emitted').map((t) => t.id));
    const baseline = soundBaselineRef.current;
    const prev = baseline && baseline.giraId === queueGiraId ? baseline.ids : null;
    soundBaselineRef.current = { giraId: queueGiraId, ids: currentIds };
    if (prev && !mutedRef.current && Array.from(currentIds).some((id) => !prev.has(id))) {
      try {
        const audio = new Audio('/sounds/notification.mp3');
        audio.play().catch(() => {
          /* autoplay bloqueado */
        });
      } catch {
        /* ambiente sem Audio */
      }
    }
  }, [queue, queueGiraId]);

  useEffect(() => {
    const base = 'Porta | GiraHub';
    document.title = counts.aguardando > 0 ? `(${counts.aguardando}) ${base}` : base;
    return () => {
      document.title = base;
    };
  }, [counts.aguardando]);

  const toggleMuted = (value: boolean) => {
    setMuted(value);
    writeMuted(value);
  };

  const actions: ItemActions = {
    canEdit,
    busy: false,
    onCheckin: handleCheckin,
    onUndoCheckin: handleUndoCheckin,
    onCall: (t) => setAttendTarget(t),
    onNoShow: handleNoShow,
    onUndo: handleUndo,
    onEditAttend: (t) => setEditTarget(t),
    onEditWalkIn: (t) => setWalkInEditTarget(t),
  };
  const actionsFor = (t: QueueItem): ItemActions => ({ ...actions, busy: actionLoading === t.id });

  const selectedGira = giras.find((g) => g.id === selectedGiraId) ?? null;

  return (
    <div className="flex flex-col gap-4">
      {/* ── Topo fixo: gira + Chamar próximo ── */}
      <div
        data-tour="porta-header"
        className="sticky top-14 z-20 -mx-4 -mt-6 flex flex-col gap-3 border-b bg-background/95 px-4 pt-4 pb-3 backdrop-blur supports-[backdrop-filter]:bg-background/85 sm:-mx-6 sm:px-6"
      >
        <div className="flex items-center gap-2">
          <h1 className="sr-only">Porta</h1>
          <div className="min-w-0 flex-1" data-tour="porta-gira-select">
            {giras.length > 0 ? (
              <Select value={selectedGiraId || undefined} onValueChange={selectGira}>
                <SelectTrigger className="h-12 w-full text-base" aria-label="Gira">
                  <SelectValue placeholder="Escolha a gira" />
                </SelectTrigger>
                <SelectContent>
                  {giras.map((g) => (
                    <SelectItem key={g.id} value={g.id}>
                      {giraLabel(g)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <p className="text-sm text-muted-foreground">Nenhuma gira nas próximas horas.</p>
            )}
          </div>
          <Toggle
            pressed={muted}
            onPressedChange={toggleMuted}
            aria-label={muted ? 'Ligar o aviso sonoro' : 'Silenciar o aviso sonoro'}
            title={muted ? 'Som desligado' : 'Som ligado'}
            className="size-12 shrink-0"
          >
            {muted ? <VolumeX className="size-5" aria-hidden /> : <Volume2 className="size-5" aria-hidden />}
          </Toggle>
          {selectedGiraId && (
            <Button asChild variant="ghost" size="icon-touch" aria-label="Abrir modo TV" title="Modo TV">
              <a href={`/admin/porta/kiosk?gira=${encodeURIComponent(selectedGiraId)}`} target="_blank" rel="noopener noreferrer">
                <Tv aria-hidden />
              </a>
            </Button>
          )}
        </div>

        {selectedGiraId && (
          <div className="flex gap-2">
            {canEdit && (
              <Button
                type="button"
                size="touch"
                // min-w-0 + quebra de linha: no celular estreito o texto quebra dentro do botão
                // em vez de vazar para fora (antes "Chamar próximo · P008" saía pela esquerda).
                className="h-auto min-h-12 min-w-0 flex-1 py-2 text-base leading-tight font-bold whitespace-normal sm:text-lg"
                disabled={!next || actionLoading === next?.id}
                onClick={() => next && setAttendTarget(next)}
              >
                <Megaphone aria-hidden />
                {next ? `Chamar próximo · ${numeroDaSenha(next)}` : 'Ninguém na fila'}
              </Button>
            )}
            {walkInEnabled && (
              <Button
                type="button"
                size="touch"
                variant="outline"
                // No celular, só o ícone (com rótulo acessível) para o "Chamar próximo" caber.
                className={cn(canEdit ? 'max-sm:w-12 max-sm:px-0' : 'flex-1')}
                aria-label="Sem senha"
                title="Atender alguém sem senha"
                data-tour="porta-walkin"
                onClick={() => setWalkInCreateOpen(true)}
              >
                <UserPlus aria-hidden /> <span className={cn(canEdit && 'max-sm:sr-only')}>Sem senha</span>
              </Button>
            )}
          </div>
        )}
      </div>

      {!selectedGiraId ? (
        <div className="flex flex-col items-center gap-3 py-12 text-center">
          <p className="text-muted-foreground">
            {giras.length === 0 ? 'Não há gira hoje nem nas próximas horas.' : 'Escolha uma gira para ver a fila.'}
          </p>
          <Button asChild variant="outline">
            <Link href="/admin/giras">Ver giras</Link>
          </Button>
        </div>
      ) : (
        <>
          {/* ── Indicadores numa linha ── */}
          <button
            type="button"
            data-tour="porta-stats"
            onClick={() => setSummaryOpen(true)}
            className="flex min-h-12 w-full items-center justify-between gap-2 rounded-lg border px-3 text-left text-sm hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
            aria-label={`${counts.aguardando} aguardando, ${counts.atendidos} atendidos, ${counts.naoVeio} não veio. Ver resumo`}
          >
            <span data-testid="porta-indicadores">
              <strong className="tabular-nums">{counts.aguardando}</strong> aguardando ·{' '}
              <strong className="tabular-nums">{counts.atendidos}</strong> atendidos ·{' '}
              <strong className="tabular-nums">{counts.naoVeio}</strong> não veio
            </span>
            <span className="shrink-0 text-xs text-muted-foreground">
              {lastUpdated
                ? `atualizado ${lastUpdated.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`
                : 'carregando…'}
            </span>
          </button>

          <TextField
            data-tour="porta-busca"
            aria-label="Buscar senha por nome ou número"
            placeholder="Buscar por nome ou número…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            startAdornment={<Search aria-hidden />}
            inputClassName="h-12 text-base"
          />

          {!queueLoaded ? (
            <div className="flex flex-col gap-2" role="status" aria-label="Carregando a fila">
              <Skeleton className="h-28 rounded-xl" />
              <Skeleton className="h-14 rounded-xl" />
              <Skeleton className="h-14 rounded-xl" />
            </div>
          ) : (
            <>
              <section data-tour="porta-fila" aria-label="Fila">
                <SectionTitle count={waiting.length}>Fila</SectionTitle>
                {waiting.length === 0 ? (
                  <p className="rounded-xl border border-dashed py-8 text-center text-sm text-muted-foreground">
                    {search ? 'Nenhuma senha encontrada.' : 'Fila vazia.'}
                  </p>
                ) : (
                  <ul className="m-0 list-none overflow-hidden rounded-xl border p-0">
                    {waiting.map((t) => (
                      <QueueRow key={t.id} item={t} a={actionsFor(t)} isNext={next?.id === t.id} />
                    ))}
                  </ul>
                )}
              </section>

              {done.length > 0 && (
                <Button type="button" variant="ghost" className="self-center" onClick={() => setSummaryOpen(true)}>
                  Ver {done.length} finalizada{done.length !== 1 ? 's' : ''}
                </Button>
              )}
            </>
          )}
        </>
      )}

      {/* ── Resumo do dia ── */}
      <Sheet open={summaryOpen} onOpenChange={setSummaryOpen}>
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-md">
          <SheetHeader>
            <SheetTitle>Resumo da gira</SheetTitle>
            <SheetDescription>{selectedGira ? selectedGira.nome : ''}</SheetDescription>
          </SheetHeader>
          <div className="flex flex-col gap-5 px-4 pb-6">
            {stats && (
              <div className="grid grid-cols-3 gap-2" data-testid="porta-resumo">
                <StatBox label="Total" value={stats.total} />
                <StatBox label="Chegaram" value={stats.checked_in} />
                <StatBox label="Atendidos" value={stats.completed} />
                <StatBox label="Não veio" value={stats.no_show} />
                <StatBox label="Sem senha" value={stats.walk_in} />
                <StatBox label="Preferenciais" value={stats.preferenciais} />
                <StatBox label="Associados" value={stats.patrocinados} />
                <StatBox label="Ainda não chegaram" value={stats.awaiting} />
              </div>
            )}
            <div>
              <SectionTitle count={done.length}>Finalizadas</SectionTitle>
              {done.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhuma senha finalizada ainda.</p>
              ) : (
                <ul className="m-0 list-none overflow-hidden rounded-xl border p-0">
                  {done.map((t) => (
                    <QueueRow key={t.id} item={t} a={actionsFor(t)} isNext={false} />
                  ))}
                </ul>
              )}
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* ── Diálogos ── */}
      <AttendModal
        open={!!attendTarget}
        ticketNumero={attendTarget?.numero || 0}
        consulenteNome={attendTarget?.consulente_nome || '—'}
        onConfirm={handleAttendConfirm}
        onClose={() => setAttendTarget(null)}
        loading={actionLoading === attendTarget?.id}
        mediumOptions={mediumOptions}
        camboneOptions={camboneOptions}
      />
      <AttendModal
        open={!!editTarget}
        ticketNumero={editTarget?.numero || 0}
        consulenteNome={editTarget?.consulente_nome || '—'}
        onConfirm={handleEditAttendInfo}
        onClose={() => setEditTarget(null)}
        loading={actionLoading === editTarget?.id}
        editMode
        mediumOptions={mediumOptions}
        camboneOptions={camboneOptions}
        initialValues={{
          medium_nome: editTarget?.medium_nome || '',
          cambone_nome: editTarget?.cambone_nome || '',
          atendimento_descricao: editTarget?.atendimento_descricao || '',
        }}
      />
      <WalkInModal
        open={walkInCreateOpen}
        onClose={() => setWalkInCreateOpen(false)}
        onConfirm={handleCreateWalkIn}
        loading={actionLoading === '__walkin_create__'}
      />
      <WalkInModal
        open={!!walkInEditTarget}
        mode="edit"
        ticketNumero={walkInEditTarget ? numeroDaSenha(walkInEditTarget) : undefined}
        initialValues={{
          nome: walkInEditTarget?.consulente_nome || '',
          email: walkInEditTarget?.consulente_email || '',
          telefone: walkInEditTarget?.consulente_telefone || '',
          priority_category: walkInEditTarget?.priority_category ?? null,
        }}
        onConfirm={handleEditWalkIn}
        onClose={() => setWalkInEditTarget(null)}
        loading={actionLoading === walkInEditTarget?.id}
      />
    </div>
  );
}
