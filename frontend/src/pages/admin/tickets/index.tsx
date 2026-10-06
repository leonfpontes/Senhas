/**
 * Senhas — as senhas de uma gira: busca no topo, filtros num Popover, tabela que vira cartão
 * no celular, detalhe (com rastreio do e-mail) em Sheet, ações em lote e fila de espera.
 *
 * A gira de hoje vem pré-selecionada (GiraContext / `?gira=`). Guards por
 * `canGroup('tickets', …)`: sem `view` a tela mostra PermissionDenied; editar/excluir/lote só
 * aparecem com a permissão correspondente. Mesmas rotas de API de antes.
 */
'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import { toast } from 'sonner';
import {
  Check,
  ChevronDown,
  Hourglass,
  Search,
  SlidersHorizontal,
  Star,
  Trash2,
  Zap,
} from 'lucide-react';
import AdminLayout from '../admin_layout';
import BulkActionsBar from '@/components/admin/BulkActionsBar';
import CrudDrawer from '@/components/CrudDrawer';
import { ConfirmDialog, PageHeader } from '@/components/admin';
import { DataTable, type ColumnDef, type PaginationState, type RowSelectionState } from '@/components/admin/DataTable';
import { ContactActions, TicketDetailSheet } from '@/components/admin/TicketDetailSheet';
import { numeroDaSenha, senhaStatusLabel } from '@/components/admin/senhaFormat';
import { giraLabel, pickTodayGira, useGiraContext } from '@/components/admin/GiraContext';
import { PermissionDenied } from '@/components/gates';
import { DateField, TextField } from '@/components/fields';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { apiClient, extractApiErrorMessage } from '@/services/api_client';
import { useSubscription } from '@/hooks/useSubscription';
import { usePermissions } from '@/hooks/usePermissions';
import { PRIORITY_ORDER, PRIORITY_CATEGORY_LABELS, PriorityCategoryType } from 'shared-types';

interface Ticket {
  id: string;
  numero: number;
  status: string;
  consulente_nome?: string;
  consulente_email?: string;
  consulente_telefone?: string;
  preferencial?: boolean;
  priority_category?: string;
  is_sponsor?: boolean;
  is_acompanhante?: boolean;
  observacoes?: string;
  chamado_em?: string;
  finalizado_em?: string;
  medium_nome?: string;
  cambone_nome?: string;
  atendimento_descricao?: string;
  created_at: string;
  resend_email_id?: string;
  email_sent_at?: string;
  email_provider?: string;
}

interface GiraOption {
  id: string;
  nome: string;
  is_active: boolean;
  data_inicio: string;
}

type GiraFilter = 'all' | 'active' | 'inactive';

interface WaitlistItem {
  id: string;
  numero: number;
  consulente_nome?: string;
  consulente_email?: string;
  is_sponsor?: boolean;
  priority_category?: string;
  status: 'aguardando' | 'aguardando_confirmacao' | 'expirado' | 'emitido';
  position?: number;
  promoted_at?: string;
  confirmation_expires_at?: string;
  created_at: string;
}

const PAGE_SIZE = 50;

const STATUS_FILTERS: { value: string; label: string }[] = [
  { value: 'emitted', label: 'Aguardando' },
  { value: 'called', label: 'Em atendimento' },
  { value: 'completed', label: 'Atendidas' },
  { value: 'cancelled', label: 'Canceladas' },
];

const STATUS_TONE: Record<string, string> = {
  emitted: '',
  called: 'border-info/30 bg-info/10 text-info',
  completed: 'border-success/30 bg-success/15 text-success',
  cancelled: 'border-destructive/30 bg-destructive/10 text-destructive',
  no_show: 'border-warning/40 bg-warning/15 text-warning-foreground',
};

const WAITLIST_STATUS_LABEL: Record<WaitlistItem['status'], string> = {
  aguardando: 'Aguardando',
  aguardando_confirmacao: 'Aguardando confirmação',
  expirado: 'Expirado',
  emitido: 'Liberada',
};

function priorityName(category?: string | null): string | null {
  if (!category) return null;
  return PRIORITY_CATEGORY_LABELS[category as PriorityCategoryType] ?? 'Preferencial';
}

const normalize = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Busca livre na página carregada: número ("42", "0042", "#42"), nome ou e-mail. */
function filterTickets(tickets: Ticket[], search: string): Ticket[] {
  const q = search.trim();
  if (!q) return tickets;
  const needle = normalize(q.replace(/^#/, ''));
  return tickets.filter((t) => {
    const numStr = String(t.numero);
    const numPadded = String(t.numero).padStart(4, '0');
    return (
      numStr.includes(needle) ||
      numPadded.includes(needle) ||
      normalize(t.consulente_nome ?? '').includes(needle) ||
      normalize(t.consulente_email ?? '').includes(needle)
    );
  });
}

function StatusBadge({ status }: { status: string }) {
  return (
    <Badge variant="outline" className={cn('whitespace-nowrap', STATUS_TONE[status])}>
      {senhaStatusLabel(status)}
    </Badge>
  );
}

function TicketTags({ t }: { t: Ticket }) {
  return (
    <span className="flex flex-wrap gap-1">
      {t.is_sponsor && (
        <Badge variant="outline" className="border-warning/40 bg-warning/15 text-warning-foreground">
          <Star aria-hidden /> Associado
        </Badge>
      )}
      {t.preferencial && (
        <Badge variant="outline" className="border-warning/40 text-warning-foreground">
          <Star aria-hidden /> {priorityName(t.priority_category) ?? 'Preferencial'}
        </Badge>
      )}
      {t.is_acompanhante && <Badge variant="outline">Acompanhante</Badge>}
    </span>
  );
}

export default function AdminTicketsPage() {
  return (
    <AdminLayout title="Senhas">
      <AdminTicketsContent />
    </AdminLayout>
  );
}

function AdminTicketsContent() {
  const { can } = useSubscription();
  const { can: canGroup } = usePermissions();
  const canView = canGroup('tickets', 'view');
  const canEdit = canGroup('tickets', 'edit');
  const canDelete = canGroup('tickets', 'delete');
  const canBulk = canEdit || canDelete;
  const router = useRouter();
  const giraCtx = useGiraContext({ load: false });

  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: PAGE_SIZE });
  const [total, setTotal] = useState(0);
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [giraId, setGiraIdState] = useState<string>('');
  const [giras, setGiras] = useState<GiraOption[]>([]);
  const [girasLoaded, setGirasLoaded] = useState(false);
  const [giraFilter, setGiraFilter] = useState<GiraFilter>('all');
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');

  // Busca livre (com atraso): filtra a página atual por número, nome ou e-mail — o endpoint
  // /tickets não aceita busca, então o filtro é local.
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput), 400);
    return () => clearTimeout(t);
  }, [searchInput]);

  // Detalhe
  const [detail, setDetail] = useState<Ticket | null>(null);

  // Edição do atendimento
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editTicket, setEditTicket] = useState<Ticket | null>(null);
  const EMPTY_EDIT = { medium_nome: '', cambone_nome: '', atendimento_descricao: '', priority_category: 'none' };
  const [formData, setFormData] = useState(EMPTY_EDIT);
  const [originalData, setOriginalData] = useState(EMPTY_EDIT);
  const [saving, setSaving] = useState(false);

  // Exclusão
  const [deleteTarget, setDeleteTarget] = useState<{ ticket: Ticket; giraId: string } | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Fila de espera
  const [waitlist, setWaitlist] = useState<WaitlistItem[]>([]);
  const [waitlistLoading, setWaitlistLoading] = useState(false);
  const [waitlistOpen, setWaitlistOpen] = useState(false);
  const [waitlistActionId, setWaitlistActionId] = useState<string | null>(null);
  const [releaseConfirmTarget, setReleaseConfirmTarget] = useState<WaitlistItem | null>(null);

  const page = pagination.pageIndex;

  const setGiraId = (id: string) => {
    setGiraIdState(id);
    setPagination((p) => ({ ...p, pageIndex: 0 }));
    setRowSelection({});
    if (id) giraCtx.setSelectedGiraId(id);
  };

  const loadGiras = async () => {
    try {
      const params = new URLSearchParams({ limit: '100' });
      if (giraFilter === 'active') params.append('is_active', 'true');
      if (giraFilter === 'inactive') params.append('is_active', 'false');
      if (dateFrom) params.append('date_from', dateFrom);
      if (dateTo) params.append('date_to', dateTo);
      const response = await apiClient.get(`/api/v1/admin/giras?${params.toString()}`);
      const data: GiraOption[] = Array.isArray(response?.data) ? response.data : response?.data?.items || [];
      setGiras(data);
      // Gira selecionada fora do filtro → limpa.
      if (giraId && !data.some((g) => g.id === giraId)) setGiraIdState('');
    } catch (error) {
      console.error('Error loading giras:', error);
    } finally {
      setGirasLoaded(true);
    }
  };

  const loadWaitlist = async () => {
    if (!giraId || !can('fila_espera')) {
      setWaitlist([]);
      return;
    }
    try {
      setWaitlistLoading(true);
      const response = await apiClient.get(`/api/v1/admin/giras/${giraId}/waitlist`);
      setWaitlist(Array.isArray(response?.data) ? response.data : []);
    } catch (error) {
      console.error('Error loading waitlist:', error);
    } finally {
      setWaitlistLoading(false);
    }
  };

  const handlePromoteWaitlist = async (item: WaitlistItem, requireConfirmation: boolean) => {
    if (!giraId) return;
    setWaitlistActionId(item.id);
    try {
      await apiClient.post(`/api/v1/admin/giras/${giraId}/waitlist/${item.id}/promote`, {
        require_confirmation: requireConfirmation,
      });
      toast.success(
        requireConfirmation
          ? `Senha ${numeroDaSenha(item)} promovida — e-mail de confirmação enviado.`
          : `Senha ${numeroDaSenha(item)} liberada direto, sem precisar de confirmação.`,
      );
      await loadWaitlist();
    } catch (error) {
      toast.error(extractApiErrorMessage(error, 'Erro ao promover a senha da fila.'));
    } finally {
      setWaitlistActionId(null);
    }
  };

  const handleRemoveWaitlist = async (item: WaitlistItem) => {
    if (!giraId) return;
    setWaitlistActionId(item.id);
    try {
      await apiClient.delete(`/api/v1/admin/giras/${giraId}/waitlist/${item.id}`);
      toast.success(`Senha ${numeroDaSenha(item)} removida da fila de espera.`);
      await loadWaitlist();
    } catch (error) {
      toast.error(extractApiErrorMessage(error, 'Erro ao remover a senha da fila.'));
    } finally {
      setWaitlistActionId(null);
    }
  };

  const loadTickets = async () => {
    try {
      setLoading(true);
      if (!giraId || !canView) {
        setTickets([]);
        setTotal(0);
        return;
      }
      let url = `/api/v1/admin/giras/${giraId}/tickets?skip=${page * PAGE_SIZE}&limit=${PAGE_SIZE}`;
      if (statusFilter) url += `&status_filter=${statusFilter}`;
      const response = await apiClient.get(url);
      setTickets(Array.isArray(response?.data?.items) ? response.data.items : []);
      setTotal(typeof response?.data?.total === 'number' ? response.data.total : 0);
    } catch (error) {
      console.error('Error loading tickets:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!canView) return;
    // Sessão normal usa cookie HttpOnly (nunca está no storage, exceto na impersonação).
    const hasAuthToken =
      Boolean(typeof sessionStorage !== 'undefined' && sessionStorage.getItem('access_token')) ||
      Boolean(typeof document !== 'undefined' && document.cookie.includes('auth_state=1'));
    if (!hasAuthToken) {
      router.replace('/login');
      return;
    }
    loadGiras();
    // loadGiras não é memoizada e o router é estável.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [giraFilter, dateFrom, dateTo, canView]);

  // Pré-seleção: ?gira= > gira do contexto > gira de hoje (só na primeira carga da lista).
  const [preselected, setPreselected] = useState(false);
  useEffect(() => {
    if (preselected || !girasLoaded || !router.isReady) return;
    setPreselected(true);
    const fromQuery = typeof router.query.gira === 'string' ? router.query.gira : '';
    const pick =
      (fromQuery && giras.some((g) => g.id === fromQuery) && fromQuery) ||
      (giraCtx.selectedGiraId && giras.some((g) => g.id === giraCtx.selectedGiraId) && giraCtx.selectedGiraId) ||
      pickTodayGira(giras)?.id ||
      '';
    if (pick) setGiraIdState(pick);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [girasLoaded, router.isReady, giras]);

  useEffect(() => {
    loadTickets();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, statusFilter, giraId, canView]);

  useEffect(() => {
    loadWaitlist();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [giraId]);

  // ── Edição / exclusão ───────────────────────────────────────────────────────
  const openAttendEdit = (ticket: Ticket) => {
    const data = {
      medium_nome: ticket.medium_nome || '',
      cambone_nome: ticket.cambone_nome || '',
      atendimento_descricao: ticket.atendimento_descricao || '',
      priority_category: ticket.priority_category || 'none',
    };
    setFormData(data);
    setOriginalData(data);
    setEditTicket(ticket);
    setDrawerOpen(true);
  };

  const handleSaveAttendInfo = async () => {
    if (!editTicket || !canEdit) return;
    setSaving(true);
    try {
      await apiClient.patch(`/api/v1/admin/tickets/${editTicket.id}/attend-info`, {
        medium_nome: formData.medium_nome.trim() || null,
        cambone_nome: formData.cambone_nome.trim() || null,
        atendimento_descricao: formData.atendimento_descricao.trim() || null,
      });
      const priorityChanged = formData.priority_category !== originalData.priority_category;
      if (priorityChanged) {
        await apiClient.patch(`/api/v1/admin/tickets/${editTicket.id}/priority`, {
          priority_category: formData.priority_category === 'none' ? null : formData.priority_category,
        });
      }
      setDrawerOpen(false);
      setDetail(null);
      toast.success(
        priorityChanged
          ? 'Dados salvos. A prioridade mudou — reenvie o e-mail da senha para o consulente receber a confirmação.'
          : 'Atendimento salvo!',
      );
      loadTickets();
    } catch (err) {
      toast.error(extractApiErrorMessage(err, 'Erro ao salvar o atendimento.'));
    } finally {
      setSaving(false);
    }
  };

  const isDirty = JSON.stringify(formData) !== JSON.stringify(originalData);

  const handleDeleteConfirm = async () => {
    if (!deleteTarget || !canDelete) return;
    setDeleting(true);
    try {
      await apiClient.delete(`/api/v1/admin/giras/${deleteTarget.giraId}/tickets/${deleteTarget.ticket.id}`);
      toast.success(`Senha ${numeroDaSenha(deleteTarget.ticket)} excluída. A vaga voltou para a gira.`);
      setDeleteTarget(null);
      setDetail(null);
      loadTickets();
    } catch (err) {
      toast.error(extractApiErrorMessage(err, 'Erro ao excluir a senha.'));
    } finally {
      setDeleting(false);
    }
  };

  // ── Derivados ───────────────────────────────────────────────────────────────
  const displayedTickets = useMemo(() => filterTickets(tickets, search), [tickets, search]);
  const selectedIds = Object.keys(rowSelection).filter((k) => rowSelection[k]);
  const activeFilterCount = [dateFrom, dateTo, statusFilter, giraFilter !== 'all' ? 'g' : ''].filter(Boolean).length;
  const showEmailFor = (t: Ticket) => !!t.consulente_email && can('email_transacional');

  const clearFilters = () => {
    setGiraFilter('all');
    setDateFrom('');
    setDateTo('');
    setStatusFilter('');
    setPagination((p) => ({ ...p, pageIndex: 0 }));
  };

  const columns = useMemo<ColumnDef<Ticket, unknown>[]>(
    () => [
      {
        id: 'numero',
        header: 'Senha',
        accessorFn: (t) => t.numero,
        cell: ({ row }) => <span className="font-mono font-bold tabular-nums">{numeroDaSenha(row.original)}</span>,
        meta: { width: 80 },
      },
      {
        id: 'nome',
        header: 'Nome',
        accessorFn: (t) => t.consulente_nome ?? '',
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate font-medium">{row.original.consulente_nome || '—'}</p>
            {row.original.consulente_email && (
              <p className="truncate text-xs text-muted-foreground">{row.original.consulente_email}</p>
            )}
          </div>
        ),
      },
      {
        id: 'telefone',
        header: 'Telefone',
        enableSorting: false,
        cell: ({ row }) =>
          row.original.consulente_telefone ? (
            <span className="flex items-center gap-2 whitespace-nowrap">
              {row.original.consulente_telefone}
              <ContactActions telefone={row.original.consulente_telefone} nome={row.original.consulente_nome} />
            </span>
          ) : (
            <span className="text-muted-foreground">—</span>
          ),
      },
      {
        id: 'tags',
        header: 'Prioridade',
        enableSorting: false,
        cell: ({ row }) => <TicketTags t={row.original} />,
      },
      {
        id: 'status',
        header: 'Status',
        accessorFn: (t) => t.status,
        cell: ({ row }) => <StatusBadge status={row.original.status} />,
      },
      {
        id: 'emissao',
        header: 'Emitida',
        accessorFn: (t) => t.created_at,
        cell: ({ row }) => (
          <span className="whitespace-nowrap text-muted-foreground">
            {new Date(row.original.created_at).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}
          </span>
        ),
      },
    ],
    [],
  );

  const renderCard = (t: Ticket, ctx: { selected: boolean; toggleSelected: () => void }) => (
    <div className="flex items-start gap-3" data-testid="ticket-card">
      {canBulk && (
        <Checkbox
          aria-label={`Selecionar senha ${numeroDaSenha(t)}`}
          checked={ctx.selected}
          onCheckedChange={() => ctx.toggleSelected()}
          onClick={(e) => e.stopPropagation()}
          className="mt-2"
        />
      )}
      <span className="font-mono text-3xl leading-none font-black tabular-nums">{numeroDaSenha(t)}</span>
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold">{t.consulente_nome || '—'}</p>
        {t.consulente_telefone && (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <span className="truncate">{t.consulente_telefone}</span>
            <ContactActions telefone={t.consulente_telefone} nome={t.consulente_nome} />
          </p>
        )}
        <div className="mt-1.5 flex flex-wrap items-center gap-1">
          <StatusBadge status={t.status} />
          <TicketTags t={t} />
        </div>
      </div>
    </div>
  );

  if (!canView) return <PermissionDenied />;

  const selectedGira = giras.find((g) => g.id === giraId);

  return (
    <div className={cn(selectedIds.length > 0 && 'pb-20')}>
      <PageHeader title="Senhas" subtitle={selectedGira ? giraLabel(selectedGira) : 'Escolha a gira para ver as senhas.'} />

      {/* ── Busca + filtros ── */}
      <div className="mb-3 flex gap-2">
        <TextField
          aria-label="Buscar senha"
          placeholder="Buscar por número, nome ou e-mail…"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          startAdornment={<Search aria-hidden />}
          className="flex-1"
        />
        <Popover>
          <PopoverTrigger asChild>
            <Button type="button" variant="outline" data-tour="tickets-filtros" aria-label="Filtros">
              <SlidersHorizontal aria-hidden />
              <span className="hidden sm:inline">Filtros</span>
              {activeFilterCount > 0 && (
                <Badge className="ml-0.5 h-5 min-w-5 justify-center rounded-full px-1">{activeFilterCount}</Badge>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="filtro-status">Status</Label>
              <Select
                value={statusFilter || 'all'}
                onValueChange={(v) => {
                  setStatusFilter(v === 'all' ? '' : v);
                  setPagination((p) => ({ ...p, pageIndex: 0 }));
                }}
              >
                <SelectTrigger id="filtro-status" className="w-full">
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {STATUS_FILTERS.map((s) => (
                    <SelectItem key={s.value} value={s.value}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="filtro-giras">Giras na lista</Label>
              <Select value={giraFilter} onValueChange={(v) => setGiraFilter(v as GiraFilter)}>
                <SelectTrigger id="filtro-giras" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  <SelectItem value="active">Ativas</SelectItem>
                  <SelectItem value="inactive">Desativadas</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <DateField label="Giras a partir de" value={dateFrom} onChange={(v) => setDateFrom(v ?? '')} />
            <DateField label="Giras até" value={dateTo} onChange={(v) => setDateTo(v ?? '')} />
            {activeFilterCount > 0 && (
              <Button type="button" variant="ghost" size="sm" onClick={clearFilters}>
                Limpar filtros
              </Button>
            )}
          </PopoverContent>
        </Popover>
      </div>

      <div className="mb-4" data-tour="tickets-gira-select">
        <Select value={giraId || undefined} onValueChange={setGiraId}>
          <SelectTrigger className="w-full sm:w-96" aria-label="Gira">
            <SelectValue placeholder={girasLoaded && giras.length === 0 ? 'Nenhuma gira encontrada' : 'Escolha a gira'} />
          </SelectTrigger>
          <SelectContent>
            {giras.map((g) => (
              <SelectItem key={g.id} value={g.id}>
                {giraLabel(g)}
                {!g.is_active ? ' (desativada)' : ''}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* ── Fila de espera ── */}
      {can('fila_espera') && giraId && (
        <Collapsible
          open={waitlistOpen}
          onOpenChange={setWaitlistOpen}
          className="mb-4 rounded-xl border"
          data-tour="tickets-fila-espera"
        >
          <CollapsibleTrigger asChild>
            <button
              type="button"
              className="flex min-h-12 w-full items-center gap-2 px-3 text-left font-semibold hover:bg-accent/50 focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
            >
              <Hourglass className="size-4 text-muted-foreground" aria-hidden />
              <span className="flex-1">Fila de espera</span>
              {waitlist.length > 0 && <Badge variant="secondary">{waitlist.length}</Badge>}
              <ChevronDown className={cn('size-4 transition-transform', waitlistOpen && 'rotate-180')} aria-hidden />
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent className="border-t px-3 py-2">
            {waitlistLoading ? (
              <Skeleton className="h-10" />
            ) : waitlist.length === 0 ? (
              <p className="py-2 text-sm text-muted-foreground">Ninguém na fila de espera desta gira.</p>
            ) : (
              <ul className="m-0 flex list-none flex-col p-0">
                {waitlist.map((item) => (
                  <li key={item.id} className="flex items-center gap-3 border-b py-2 last:border-b-0">
                    <span className="font-mono font-bold tabular-nums">
                      {item.is_sponsor ? 'P' : ''}
                      {String(item.numero).padStart(4, '0')}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{item.consulente_nome || '—'}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {item.position ? `${item.position}º na fila · ` : ''}
                        {WAITLIST_STATUS_LABEL[item.status]}
                      </p>
                    </div>
                    {item.status === 'aguardando' && canEdit && (
                      <>
                        <Button
                          type="button"
                          size="icon-sm"
                          variant="outline"
                          disabled={waitlistActionId === item.id}
                          onClick={() => handlePromoteWaitlist(item, true)}
                          aria-label="Promover (envia e-mail de confirmação, com prazo)"
                          title="Promover (envia e-mail de confirmação, com prazo)"
                        >
                          <Check aria-hidden />
                        </Button>
                        <Button
                          type="button"
                          size="icon-sm"
                          variant="outline"
                          disabled={waitlistActionId === item.id}
                          onClick={() => setReleaseConfirmTarget(item)}
                          aria-label="Liberar direto, sem confirmação"
                          title="Liberar direto, sem confirmação"
                        >
                          <Zap aria-hidden />
                        </Button>
                      </>
                    )}
                    {item.status !== 'expirado' && canDelete && (
                      <Button
                        type="button"
                        size="icon-sm"
                        variant="ghost"
                        disabled={waitlistActionId === item.id}
                        onClick={() => handleRemoveWaitlist(item)}
                        aria-label="Remover da fila"
                        title="Remover da fila"
                      >
                        <Trash2 aria-hidden />
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </CollapsibleContent>
        </Collapsible>
      )}

      {/* ── Lista ── */}
      <div data-tour="tickets-tabela">
        <DataTable<Ticket>
          columns={columns}
          data={displayedTickets}
          getRowId={(t) => t.id}
          loading={loading}
          emptyMessage={giraId ? 'Nenhuma senha encontrada.' : 'Escolha uma gira.'}
          emptyDescription={giraId ? (search ? 'Tente outro número ou nome.' : undefined) : 'As senhas aparecem aqui.'}
          manualPagination
          pagination={pagination}
          onPaginationChange={setPagination}
          rowCount={total}
          enableRowSelection={canBulk && !!giraId}
          rowSelection={rowSelection}
          onRowSelectionChange={setRowSelection}
          renderCard={renderCard}
          onRowClick={(t) => setDetail(t)}
          data-testid="tickets-table"
        />
      </div>

      {giraId && selectedIds.length > 0 && canBulk && (
        <BulkActionsBar
          selectedCount={selectedIds.length}
          ticketIds={selectedIds}
          giraId={giraId}
          canMarkUsed={canEdit}
          canCancel={canDelete}
          onRefresh={loadTickets}
          onClearSelection={() => setRowSelection({})}
        />
      )}

      <TicketDetailSheet
        ticket={detail}
        onOpenChange={(open) => !open && setDetail(null)}
        priorityLabel={priorityName(detail?.priority_category)}
        showEmail={!!detail && showEmailFor(detail)}
        onEdit={canEdit && detail ? () => openAttendEdit(detail) : undefined}
        onDelete={
          canDelete && detail && giraId && (detail.status === 'emitted' || detail.status === 'called')
            ? () => setDeleteTarget({ ticket: detail, giraId })
            : undefined
        }
      />

      <CrudDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title={`Atendimento — senha ${editTicket ? numeroDaSenha(editTicket) : ''}`}
        subtitle="Médium, cambone, observações e atendimento preferencial."
        icon={<Star />}
        onSave={handleSaveAttendInfo}
        saveLabel="Salvar"
        saving={saving}
        isDirty={isDirty}
      >
        <div className="flex flex-col gap-4">
          <TextField
            label="Médium"
            value={formData.medium_nome}
            onChange={(e) => setFormData((p) => ({ ...p, medium_nome: e.target.value }))}
          />
          <TextField
            label="Cambone"
            value={formData.cambone_nome}
            onChange={(e) => setFormData((p) => ({ ...p, cambone_nome: e.target.value }))}
          />
          <TextField
            label="Observações do atendimento"
            multiline
            rows={3}
            value={formData.atendimento_descricao}
            onChange={(e) => setFormData((p) => ({ ...p, atendimento_descricao: e.target.value }))}
          />
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="edit-prioridade">Atendimento preferencial</Label>
            <Select
              value={formData.priority_category}
              onValueChange={(v) => setFormData((p) => ({ ...p, priority_category: v }))}
            >
              <SelectTrigger id="edit-prioridade" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="z-[1400]">
                <SelectItem value="none">Sem prioridade</SelectItem>
                {PRIORITY_ORDER.map((cat) => (
                  <SelectItem key={cat} value={cat}>
                    {PRIORITY_CATEGORY_LABELS[cat]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Ao mudar, reenvie o e-mail da senha para o consulente receber a confirmação.
            </p>
          </div>
        </div>
      </CrudDrawer>

      <ConfirmDialog
        open={!!deleteTarget}
        title="Excluir senha"
        message={
          <>
            Excluir a senha <strong>{deleteTarget ? numeroDaSenha(deleteTarget.ticket) : ''}</strong>
            {deleteTarget?.ticket.consulente_nome ? ` de ${deleteTarget.ticket.consulente_nome}` : ''}? O consulente
            poderá pegar outra senha e a vaga volta para a gira.
            {deleteTarget && !deleteTarget.ticket.is_acompanhante
              ? ' Se a senha tiver acompanhantes, as senhas deles também são canceladas.'
              : ''}
          </>
        }
        confirmText="Excluir senha"
        destructive
        loading={deleting}
        onConfirm={handleDeleteConfirm}
        onCancel={() => setDeleteTarget(null)}
      />

      <ConfirmDialog
        open={!!releaseConfirmTarget}
        title="Liberar senha sem confirmação"
        message={
          <>
            Liberar a senha <strong>{releaseConfirmTarget ? String(releaseConfirmTarget.numero).padStart(4, '0') : ''}</strong>
            {releaseConfirmTarget?.consulente_nome ? ` de ${releaseConfirmTarget.consulente_nome}` : ''} direto? Ela vale
            na hora — o consulente não precisa confirmar pelo e-mail.
          </>
        }
        confirmText="Liberar sem confirmação"
        onConfirm={() => {
          const target = releaseConfirmTarget;
          setReleaseConfirmTarget(null);
          if (target) handlePromoteWaitlist(target, false);
        }}
        onCancel={() => setReleaseConfirmTarget(null)}
      />
    </div>
  );
}
