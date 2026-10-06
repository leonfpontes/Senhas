/**
 * Admin Estoque — Movimentações: histórico com filtros em Popover, registro/edição via
 * `MovimentacaoDrawer` (Combobox de item + DateTimeField) e exclusão com ConfirmDialog.
 */
'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import {
  ArrowDownToLine,
  ArrowUpDown,
  ArrowUpFromLine,
  Filter,
  MoreHorizontal,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import AdminLayout from '../admin_layout';
import { useSubscription } from '../../../hooks/useSubscription';
import { usePermissions } from '../../../hooks/usePermissions';
import { useSnackbar } from '../../../contexts/SnackbarContext';
import { apiClient, extractApiErrorMessage } from '../../../services/api_client';
import { fetchAllPages } from '../../../services/fetchAllPages';
import { ConfirmDialog } from '@/components/admin/ConfirmDialog';
import { DataTable } from '@/components/admin/DataTable';
import { PageHeader } from '@/components/admin/PageHeader';
import { PermissionDenied, PlanLocked } from '@/components/gates';
import { Combobox, DateField, TextField } from '@/components/fields';
import { MovimentacaoDrawer, nowLocalIso, type EstoqueItemRef, type MovimentacaoFormValues } from '@/components/estoque/MovimentacaoDrawer';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { formatDateTimeBr } from '@/lib/dateBr';
import { minPlanFor } from '@/constants/plans';

interface Movimentacao {
  id: string;
  item_id: string;
  item_nome: string | null;
  tipo: 'entrada' | 'saida';
  quantidade: number;
  motivo: string | null;
  data_movimentacao: string;
  requisitante: string | null;
  created_at: string;
}

interface Filtros {
  item: string | null;
  tipo: 'all' | 'entrada' | 'saida';
  de: string | null;
  ate: string | null;
}

const EMPTY_FILTROS: Filtros = { item: null, tipo: 'all', de: null, ate: null };

function TipoBadge({ tipo }: { tipo: Movimentacao['tipo'] }) {
  return tipo === 'entrada' ? (
    <Badge className="gap-1 border-transparent bg-success text-success-foreground">
      <ArrowDownToLine aria-hidden /> Entrada
    </Badge>
  ) : (
    <Badge variant="destructive" className="gap-1">
      <ArrowUpFromLine aria-hidden /> Saída
    </Badge>
  );
}

export default function AdminEstoqueMovimentacoesPage() {
  return (
    <AdminLayout title="Movimentações de Estoque">
      <AdminEstoqueMovimentacoesContent />
    </AdminLayout>
  );
}

function AdminEstoqueMovimentacoesContent() {
  const { can, loading: subLoading } = useSubscription();
  const { can: canGroup } = usePermissions();
  const { showSuccess, showError } = useSnackbar();
  const canView = canGroup('estoque', 'view');
  const canInsert = canGroup('estoque', 'insert');
  const canEdit = canGroup('estoque', 'edit');
  const canDelete = canGroup('estoque', 'delete');

  const [movimentacoes, setMovimentacoes] = useState<Movimentacao[]>([]);
  const [items, setItems] = useState<EstoqueItemRef[]>([]);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [filtros, setFiltros] = useState<Filtros>(EMPTY_FILTROS);
  const [draft, setDraft] = useState<Filtros>(EMPTY_FILTROS);
  const [filtrosOpen, setFiltrosOpen] = useState(false);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Movimentacao | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Movimentacao | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 400);
    return () => clearTimeout(t);
  }, [search]);

  const loadItems = useCallback(async () => {
    if (!canView) return;
    try {
      setItems(await fetchAllPages<EstoqueItemRef>('/api/v1/admin/estoque/itens', { pageSize: 500 }));
    } catch {
      /* silencioso */
    }
  }, [canView]);

  const loadMovimentacoes = useCallback(async () => {
    if (!canView) {
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      const params: Record<string, string> = {};
      if (filtros.item) params.item_id = filtros.item;
      if (filtros.tipo !== 'all') params.tipo = filtros.tipo;
      if (filtros.de) params.date_from = new Date(`${filtros.de}T00:00:00`).toISOString();
      if (filtros.ate) params.date_to = new Date(`${filtros.ate}T23:59:59`).toISOString();
      if (debouncedSearch.trim()) params.search = debouncedSearch.trim();
      // Backend corta em 100 por padrão: busca todas as páginas do filtro atual.
      setMovimentacoes(await fetchAllPages<Movimentacao>('/api/v1/admin/estoque/movimentacoes', { params, pageSize: 500 }));
    } catch {
      showError('Erro ao carregar movimentações');
    } finally {
      setLoading(false);
    }
  }, [canView, filtros, debouncedSearch, showError]);

  useEffect(() => {
    loadItems();
  }, [loadItems]);
  useEffect(() => {
    loadMovimentacoes();
  }, [loadMovimentacoes]);

  const openCreate = async () => {
    await loadItems();
    setEditTarget(null);
    setDrawerOpen(true);
  };

  const openEdit = (m: Movimentacao) => {
    setEditTarget(m);
    setDrawerOpen(true);
  };

  const drawerInitial = useMemo<Partial<MovimentacaoFormValues> | undefined>(() => {
    if (!editTarget) return undefined;
    return {
      item_id: editTarget.item_id,
      tipo: editTarget.tipo,
      quantidade: String(editTarget.quantidade),
      data_movimentacao: nowLocalIso(new Date(editTarget.data_movimentacao)),
      motivo: editTarget.motivo ?? '',
      requisitante: editTarget.requisitante ?? '',
    };
  }, [editTarget]);

  const handleDelete = async () => {
    if (!deleteTarget || !canDelete) return;
    setDeleting(true);
    try {
      await apiClient.delete(`/api/v1/admin/estoque/movimentacoes/${deleteTarget.id}`);
      showSuccess('Movimentação excluída.');
      setDeleteTarget(null);
      loadItems();
      loadMovimentacoes();
    } catch (e) {
      showError(extractApiErrorMessage(e, 'Erro ao excluir movimentação.'));
    } finally {
      setDeleting(false);
    }
  };

  const filtrosAtivos = (filtros.item ? 1 : 0) + (filtros.tipo !== 'all' ? 1 : 0) + (filtros.de ? 1 : 0) + (filtros.ate ? 1 : 0);
  const itemOptions = useMemo(() => items.map((i) => ({ value: i.id, label: i.nome })), [items]);

  const showActions = canEdit || canDelete;

  const RowMenu = ({ m }: { m: Movimentacao }) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={`Ações da movimentação de ${m.item_nome ?? 'item'}`}>
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {canEdit && (
          <DropdownMenuItem onSelect={() => openEdit(m)}>
            <Pencil />
            Editar
          </DropdownMenuItem>
        )}
        {canDelete && (
          <DropdownMenuItem variant="destructive" onSelect={() => setDeleteTarget(m)}>
            <Trash2 />
            Excluir
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );

  const columns = useMemo<ColumnDef<Movimentacao>[]>(() => {
    const cols: ColumnDef<Movimentacao>[] = [
      { accessorKey: 'data_movimentacao', header: 'Data', cell: ({ getValue }) => <span className="whitespace-nowrap">{formatDateTimeBr(getValue<string>())}</span> },
      { accessorKey: 'item_nome', header: 'Item', cell: ({ row }) => <span className="font-medium">{row.original.item_nome || row.original.item_id}</span> },
      { accessorKey: 'tipo', header: 'Tipo', cell: ({ getValue }) => <TipoBadge tipo={getValue<Movimentacao['tipo']>()} /> },
      { accessorKey: 'quantidade', header: 'Qtd.', meta: { align: 'right' } },
      { accessorKey: 'requisitante', header: 'Requisitante', cell: ({ getValue }) => <span className="text-muted-foreground">{getValue<string | null>() || '—'}</span> },
      { accessorKey: 'motivo', header: 'Motivo', enableSorting: false, cell: ({ getValue }) => <span className="text-muted-foreground">{getValue<string | null>() || '—'}</span> },
    ];
    if (showActions) {
      cols.push({ id: 'acoes', header: '', enableSorting: false, meta: { align: 'right' }, cell: ({ row }) => <RowMenu m={row.original} /> });
    }
    return cols;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showActions, canEdit, canDelete]);

  const renderCard = (m: Movimentacao) => (
    <div className="flex items-start gap-3 p-3">
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="truncate font-medium">{m.item_nome || m.item_id}</span>
          <TipoBadge tipo={m.tipo} />
          <span className="text-sm font-semibold">{m.tipo === 'entrada' ? '+' : '−'}{m.quantidade}</span>
        </div>
        <span className="text-xs text-muted-foreground">
          {formatDateTimeBr(m.data_movimentacao)}
          {m.requisitante ? ` · ${m.requisitante}` : ''}
        </span>
        {m.motivo && <span className="text-xs text-muted-foreground">{m.motivo}</span>}
      </div>
      {showActions && <RowMenu m={m} />}
    </div>
  );

  if (subLoading) {
    return (
      <div className="mt-8 flex flex-col gap-3" aria-busy="true">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }
  if (!can('estoque_controle')) return <PlanLocked feature="Controle de estoque" minPlan={minPlanFor('estoque_controle').label} />;
  if (!canView) return <PermissionDenied message="Você não tem permissão para visualizar movimentações de estoque." />;

  return (
    <div className="flex flex-col gap-4">
      <div data-tour="estoque-mov-header">
        <PageHeader
          title="Movimentações"
          subtitle={`${movimentacoes.length} ${movimentacoes.length === 1 ? 'registro' : 'registros'} no filtro atual`}
          actions={
            <>
              <Button variant="outline" onClick={loadMovimentacoes} disabled={loading} aria-label="Atualizar">
                <RefreshCw className={loading ? 'animate-spin' : undefined} />
                <span className="hidden sm:inline">Atualizar</span>
              </Button>
              {canInsert && (
                <Button data-tour="estoque-mov-nova" onClick={openCreate}>
                  <Plus />
                  Registrar
                </Button>
              )}
            </>
          }
        />
      </div>

      <div data-tour="estoque-mov-filtros" className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <TextField
          aria-label="Buscar por nome do item"
          placeholder="Buscar por nome do item..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          startAdornment={<Search />}
          size="small"
          className="sm:max-w-xs"
        />
        <Popover
          open={filtrosOpen}
          onOpenChange={(o) => {
            setFiltrosOpen(o);
            if (o) setDraft(filtros);
          }}
        >
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" aria-label="Filtros">
              <Filter />
              Filtros
              {filtrosAtivos > 0 && <Badge className="ml-1 px-1.5">{filtrosAtivos}</Badge>}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="flex w-80 flex-col gap-3">
            <Combobox label="Item" options={itemOptions} value={draft.item} onChange={(v) => setDraft((d) => ({ ...d, item: v }))} placeholder="Todos os itens" clearable size="small" />
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="filtro-tipo">Tipo</Label>
              <Select value={draft.tipo} onValueChange={(v) => setDraft((d) => ({ ...d, tipo: v as Filtros['tipo'] }))}>
                <SelectTrigger id="filtro-tipo" size="sm" className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="entrada">Entrada</SelectItem>
                  <SelectItem value="saida">Saída</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <DateField label="De" size="small" value={draft.de} max={draft.ate ?? undefined} onChange={(v) => setDraft((d) => ({ ...d, de: v }))} />
              <DateField label="Até" size="small" value={draft.ate} min={draft.de ?? undefined} onChange={(v) => setDraft((d) => ({ ...d, ate: v }))} />
            </div>
            <div className="flex justify-between gap-2 pt-1">
              <Button variant="ghost" size="sm" onClick={() => { setDraft(EMPTY_FILTROS); setFiltros(EMPTY_FILTROS); setFiltrosOpen(false); }}>
                <X />
                Limpar
              </Button>
              <Button size="sm" onClick={() => { setFiltros(draft); setFiltrosOpen(false); }}>
                Aplicar
              </Button>
            </div>
          </PopoverContent>
        </Popover>
        {filtrosAtivos > 0 && (
          <Button variant="ghost" size="sm" onClick={() => setFiltros(EMPTY_FILTROS)}>
            <X />
            Limpar filtros
          </Button>
        )}
      </div>

      <div data-tour="estoque-mov-tabela">
        <DataTable
          columns={columns}
          data={movimentacoes}
          getRowId={(m) => m.id}
          loading={loading}
          pageSize={25}
          renderCard={renderCard}
          emptyIcon={<ArrowUpDown className="size-10 text-ghost" aria-hidden />}
          emptyMessage={filtrosAtivos > 0 || debouncedSearch ? 'Nenhuma movimentação para os filtros.' : 'Nenhuma movimentação registrada.'}
          emptyDescription={canInsert && !filtrosAtivos && !debouncedSearch ? 'Use "Registrar" para lançar a primeira entrada ou saída.' : undefined}
        />
      </div>

      <MovimentacaoDrawer
        open={drawerOpen}
        onClose={() => { setDrawerOpen(false); setEditTarget(null); }}
        items={items}
        initial={drawerInitial}
        editId={editTarget?.id ?? null}
        lockItem={!!editTarget}
        onSaved={(mode) => {
          showSuccess(mode === 'edit' ? 'Movimentação atualizada!' : 'Movimentação registrada!');
          loadItems();
          loadMovimentacoes();
        }}
      />

      <ConfirmDialog
        open={deleteTarget !== null}
        title="Excluir movimentação"
        message={
          <>
            Excluir a {deleteTarget?.tipo === 'entrada' ? 'entrada' : 'saída'} de <strong>{deleteTarget?.quantidade}</strong> de{' '}
            <strong>{deleteTarget?.item_nome ?? 'item'}</strong>? O saldo do item será recalculado.
          </>
        }
        confirmText="Excluir"
        destructive
        loading={deleting}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
