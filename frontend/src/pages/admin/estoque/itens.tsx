/**
 * Admin Estoque — Itens: cadastro, saldo com status, filtro "Críticos", exportação CSV
 * (absorveu `/admin/estoque/relatorio`) e ação "Movimentar" na linha.
 */
'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import type { ColumnDef } from '@tanstack/react-table';
import {
  AlertTriangle,
  Boxes,
  Camera,
  CheckCircle2,
  Download,
  Loader2,
  MoreHorizontal,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  ArrowUpDown,
  Trash2,
  XCircle,
} from 'lucide-react';
import AdminLayout from '../admin_layout';
import { useSubscription } from '../../../hooks/useSubscription';
import { usePermissions } from '../../../hooks/usePermissions';
import { useSnackbar } from '../../../contexts/SnackbarContext';
import { apiClient } from '../../../services/api_client';
import CrudDrawer from '../../../components/CrudDrawer';
import { ConfirmDialog } from '@/components/admin/ConfirmDialog';
import { DataTable } from '@/components/admin/DataTable';
import { KpiCard } from '@/components/admin/KpiCard';
import { PageHeader } from '@/components/admin/PageHeader';
import { PermissionDenied, PlanLocked } from '@/components/gates';
import { MoneyInput, TextField } from '@/components/fields';
import { MovimentacaoDrawer } from '@/components/estoque/MovimentacaoDrawer';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Toggle } from '@/components/ui/toggle';
import { formatBRL, todayBr } from '@/lib/dateBr';
import { minPlanFor } from '@/constants/plans';

const UNIDADES = ['UN', 'KG', 'G', 'L', 'ML', 'M', 'CM', 'CX', 'PCT', 'RO'] as const;
type Unidade = (typeof UNIDADES)[number];

interface Grupo { id: string; nome: string }
interface Item {
  id: string;
  nome: string;
  grupo_id: string | null;
  grupo_nome: string | null;
  descricao: string | null;
  unidade_medida: Unidade;
  estoque_minimo: number;
  custo_unitario: number | null;
  observacoes: string | null;
  tem_foto: boolean;
  saldo: number;
}

interface FormData {
  nome: string;
  grupo_id: string;
  descricao: string;
  unidade_medida: Unidade;
  estoque_minimo: string;
  custo_unitario: number;
  observacoes: string;
  foto_base64: string | null;
  foto_content_type: string | null;
}

const EMPTY_FORM: FormData = {
  nome: '', grupo_id: '', descricao: '', unidade_medida: 'UN', estoque_minimo: '0',
  custo_unitario: 0, observacoes: '', foto_base64: null, foto_content_type: null,
};

export type SaldoStatus = 'ok' | 'atencao' | 'critico';

/** Mesma regra do relatório de posição: crítico = negativo ou zerado com mínimo; atenção = abaixo do mínimo. */
export function saldoStatus(saldo: number, minimo: number): SaldoStatus {
  if (saldo < 0 || (minimo > 0 && saldo === 0)) return 'critico';
  if (minimo > 0 && saldo < minimo) return 'atencao';
  return 'ok';
}

function SaldoBadge({ item }: { item: Item }) {
  const status = saldoStatus(item.saldo, item.estoque_minimo);
  const label = `${item.saldo} ${item.unidade_medida}`;
  if (status === 'critico') return <Badge variant="destructive">{label}</Badge>;
  if (status === 'atencao') return <Badge className="border-transparent bg-warning text-warning-foreground">{label}</Badge>;
  return <Badge className="border-transparent bg-success text-success-foreground">{label}</Badge>;
}

/** Imagem que exige cookie de sessão (não dá para usar <img src> direto). */
function AuthImage({ src, alt, className }: { src: string; alt: string; className?: string }) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    let url: string | null = null;
    apiClient
      .get(src, { responseType: 'blob' })
      .then((res) => {
        if (cancelled) return;
        url = URL.createObjectURL(res.data);
        setBlobUrl(url);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [src]);
  if (!blobUrl) return <div className={`${className ?? ''} bg-muted`} aria-hidden />;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={blobUrl} alt={alt} className={className} />;
}

export default function AdminEstoqueItensPage() {
  return (
    <AdminLayout title="Itens de Estoque">
      <AdminEstoqueItensContent />
    </AdminLayout>
  );
}

function AdminEstoqueItensContent() {
  const router = useRouter();
  const { can, loading: subLoading } = useSubscription();
  const { can: canGroup } = usePermissions();
  const { showSuccess, showError } = useSnackbar();
  const canView = canGroup('estoque', 'view');
  const canInsert = canGroup('estoque', 'insert');
  const canEdit = canGroup('estoque', 'edit');
  const canDelete = canGroup('estoque', 'delete');

  const [items, setItems] = useState<Item[]>([]);
  const [grupos, setGrupos] = useState<Grupo[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [filterGrupo, setFilterGrupo] = useState('all');
  const [search, setSearch] = useState('');
  const [somenteCriticos, setSomenteCriticos] = useState(false);

  // Aceita `?criticos=1` (vindo do antigo relatório).
  useEffect(() => {
    if (router.isReady && router.query.criticos === '1') setSomenteCriticos(true);
  }, [router.isReady, router.query.criticos]);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerMode, setDrawerMode] = useState<'create' | 'edit'>('create');
  const [currentItem, setCurrentItem] = useState<Item | null>(null);
  const [formData, setFormData] = useState<FormData>(EMPTY_FORM);
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [fotoPreview, setFotoPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [movItem, setMovItem] = useState<Item | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Item | null>(null);
  const [deleting, setDeleting] = useState(false);

  const loadGrupos = useCallback(async () => {
    if (!canView) return;
    try {
      const res = await apiClient.get('/api/v1/admin/estoque/grupos');
      setGrupos(res.data);
    } catch {
      /* silencioso */
    }
  }, [canView]);

  const loadItems = useCallback(async () => {
    if (!canView) {
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      const params: Record<string, string> = {};
      if (filterGrupo !== 'all') params.grupo_id = filterGrupo;
      const res = await apiClient.get('/api/v1/admin/estoque/itens', { params });
      setItems(res.data);
    } catch {
      showError('Erro ao carregar itens');
    } finally {
      setLoading(false);
    }
  }, [canView, filterGrupo, showError]);

  useEffect(() => {
    loadGrupos();
  }, [loadGrupos]);
  useEffect(() => {
    loadItems();
  }, [loadItems]);

  // ── Sheet ───────────────────────────────────────────────────────────

  const resetFoto = () => {
    if (fotoPreview?.startsWith('blob:')) URL.revokeObjectURL(fotoPreview);
    setFotoPreview(null);
  };

  const openCreate = () => {
    setFormData(EMPTY_FORM);
    resetFoto();
    setTouched({});
    setCurrentItem(null);
    setDrawerMode('create');
    setDrawerOpen(true);
  };

  const openEdit = async (item: Item) => {
    setCurrentItem(item);
    setFormData({
      nome: item.nome,
      grupo_id: item.grupo_id || '',
      descricao: item.descricao || '',
      unidade_medida: item.unidade_medida,
      estoque_minimo: String(item.estoque_minimo),
      custo_unitario: item.custo_unitario ?? 0,
      observacoes: item.observacoes || '',
      foto_base64: null,
      foto_content_type: null,
    });
    resetFoto();
    setTouched({});
    setDrawerMode('edit');
    setDrawerOpen(true);
    if (item.tem_foto) {
      try {
        const res = await apiClient.get(`/api/v1/admin/estoque/itens/${item.id}/foto`, { responseType: 'blob' });
        setFotoPreview(URL.createObjectURL(res.data));
      } catch {
        setFotoPreview(null);
      }
    }
  };

  const closeDrawer = () => {
    resetFoto();
    setDrawerOpen(false);
    setCurrentItem(null);
  };

  const handleFotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      showError('A foto deve ter no máximo 2 MB.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUri = reader.result as string;
      setFotoPreview(dataUri);
      setFormData((prev) => ({ ...prev, foto_base64: dataUri, foto_content_type: file.type }));
    };
    reader.readAsDataURL(file);
  };

  const handleSave = async () => {
    setTouched({ nome: true, estoque_minimo: true });
    if (!formData.nome.trim()) return;
    if (drawerMode === 'create' && !canInsert) return;
    if (drawerMode === 'edit' && !canEdit) return;
    const minimo = parseInt(formData.estoque_minimo, 10);
    if (Number.isNaN(minimo) || minimo < 0) {
      showError('Estoque mínimo inválido');
      return;
    }
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        nome: formData.nome.trim(),
        grupo_id: formData.grupo_id || null,
        descricao: formData.descricao.trim() || null,
        unidade_medida: formData.unidade_medida,
        estoque_minimo: minimo,
        custo_unitario: formData.custo_unitario > 0 ? formData.custo_unitario : null,
        observacoes: formData.observacoes.trim() || null,
        foto_base64: formData.foto_base64,
        foto_content_type: formData.foto_content_type,
      };
      if (drawerMode === 'create') {
        await apiClient.post('/api/v1/admin/estoque/itens', payload);
        showSuccess('Item criado com sucesso!');
      } else if (currentItem) {
        await apiClient.put(`/api/v1/admin/estoque/itens/${currentItem.id}`, payload);
        showSuccess('Item atualizado!');
      }
      closeDrawer();
      loadItems();
    } catch {
      showError('Erro ao salvar item');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget || !canDelete) return;
    setDeleting(true);
    try {
      await apiClient.delete(`/api/v1/admin/estoque/itens/${deleteTarget.id}`);
      showSuccess('Item excluído.');
      loadItems();
    } catch {
      showError('Erro ao excluir item');
    } finally {
      setDeleting(false);
      setDeleteTarget(null);
    }
  };

  // ── Exportar CSV (do antigo relatório) ─────────────────────────────

  const handleExportCsv = async () => {
    if (!canView) return;
    if (!can('export_csv')) {
      showError(`Exportação CSV disponível a partir do plano ${minPlanFor('export_csv').label}.`);
      return;
    }
    setExporting(true);
    try {
      const params: Record<string, string> = {};
      if (filterGrupo !== 'all') params.grupo_id = filterGrupo;
      const res = await apiClient.get('/api/v1/admin/estoque/relatorio/posicao/csv', { params, responseType: 'blob' });
      const url = URL.createObjectURL(new Blob([res.data], { type: 'text/csv' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `estoque_posicao_${todayBr()}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      showSuccess('CSV exportado.');
    } catch {
      showError('Erro ao exportar CSV');
    } finally {
      setExporting(false);
    }
  };

  // ── Derivados ───────────────────────────────────────────────────────

  const counts = useMemo(() => {
    const c = { ok: 0, atencao: 0, critico: 0 };
    for (const i of items) c[saldoStatus(i.saldo, i.estoque_minimo)] += 1;
    return c;
  }, [items]);

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return items.filter((i) => {
      if (somenteCriticos && saldoStatus(i.saldo, i.estoque_minimo) === 'ok') return false;
      if (term && !i.nome.toLowerCase().includes(term) && !(i.grupo_nome ?? '').toLowerCase().includes(term)) return false;
      return true;
    });
  }, [items, search, somenteCriticos]);

  const showActions = canEdit || canDelete || canInsert;

  const RowActions = ({ item }: { item: Item }) => (
    <div className="flex items-center justify-end gap-1">
      {canInsert && (
        <Button variant="outline" size="sm" onClick={() => setMovItem(item)} aria-label={`Movimentar ${item.nome}`}>
          <ArrowUpDown />
          Movimentar
        </Button>
      )}
      {(canEdit || canDelete) && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label={`Mais ações de ${item.nome}`}>
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {canEdit && (
              <DropdownMenuItem onSelect={() => openEdit(item)}>
                <Pencil />
                Editar
              </DropdownMenuItem>
            )}
            {canEdit && canDelete && <DropdownMenuSeparator />}
            {canDelete && (
              <DropdownMenuItem variant="destructive" onSelect={() => setDeleteTarget(item)}>
                <Trash2 />
                Excluir
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );

  const columns = useMemo<ColumnDef<Item>[]>(() => {
    const cols: ColumnDef<Item>[] = [
      {
        accessorKey: 'nome',
        header: 'Item',
        cell: ({ row }) => {
          const i = row.original;
          return (
            <div className="flex items-center gap-3">
              {i.tem_foto && (
                <AuthImage src={`/api/v1/admin/estoque/itens/${i.id}/foto`} alt="" className="size-9 shrink-0 rounded-md object-cover" />
              )}
              <div className="flex min-w-0 flex-col">
                <span className="truncate font-medium">{i.nome}</span>
                {i.descricao && <span className="truncate text-xs text-muted-foreground">{i.descricao}</span>}
              </div>
            </div>
          );
        },
      },
      { accessorKey: 'grupo_nome', header: 'Grupo', cell: ({ getValue }) => <span className="text-muted-foreground">{getValue<string | null>() || '—'}</span> },
      { accessorKey: 'saldo', header: 'Saldo', cell: ({ row }) => <SaldoBadge item={row.original} /> },
      { accessorKey: 'estoque_minimo', header: 'Mínimo', cell: ({ row }) => <span className="text-muted-foreground">{row.original.estoque_minimo} {row.original.unidade_medida}</span> },
      { accessorKey: 'custo_unitario', header: 'Custo unit.', meta: { align: 'right' }, cell: ({ getValue }) => <span className="text-muted-foreground">{formatBRL(getValue<number | null>())}</span> },
    ];
    if (showActions) {
      cols.push({ id: 'acoes', header: '', enableSorting: false, meta: { align: 'right' }, cell: ({ row }) => <RowActions item={row.original} /> });
    }
    return cols;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showActions, canInsert, canEdit, canDelete]);

  const renderCard = (i: Item) => (
    <div className="flex flex-col gap-2 p-3">
      <div className="flex items-start gap-3">
        {i.tem_foto && <AuthImage src={`/api/v1/admin/estoque/itens/${i.id}/foto`} alt="" className="size-12 shrink-0 rounded-md object-cover" />}
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="truncate font-medium">{i.nome}</span>
          <span className="truncate text-xs text-muted-foreground">{i.grupo_nome || 'Sem grupo'}{i.descricao ? ` · ${i.descricao}` : ''}</span>
        </div>
        <SaldoBadge item={i} />
      </div>
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>Mínimo {i.estoque_minimo} {i.unidade_medida}</span>
        <span>{formatBRL(i.custo_unitario)}</span>
      </div>
      {showActions && <RowActions item={i} />}
    </div>
  );

  // ── Gates ───────────────────────────────────────────────────────────

  if (subLoading) {
    return (
      <div className="mt-8 flex flex-col gap-3" aria-busy="true">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }
  if (!can('estoque_controle')) return <PlanLocked feature="Controle de estoque" minPlan="Pro" />;
  if (!canView) return <PermissionDenied message="Você não tem permissão para visualizar itens de estoque." />;

  return (
    <div className="flex flex-col gap-4">
      <div data-tour="estoque-itens-header">
        <PageHeader
          title="Itens de Estoque"
          subtitle={`${items.length} ${items.length === 1 ? 'item cadastrado' : 'itens cadastrados'}`}
          actions={
            <>
              <Button variant="outline" onClick={loadItems} disabled={loading} aria-label="Atualizar">
                <RefreshCw className={loading ? 'animate-spin' : undefined} />
                <span className="hidden sm:inline">Atualizar</span>
              </Button>
              <Button data-tour="estoque-rel-export" variant="outline" onClick={handleExportCsv} disabled={exporting || loading || items.length === 0}>
                {exporting ? <Loader2 className="animate-spin" /> : <Download />}
                <span className="hidden sm:inline">Exportar CSV</span>
                <span className="sm:hidden">CSV</span>
              </Button>
              {canInsert && (
                <Button data-tour="estoque-itens-novo" onClick={openCreate}>
                  <Plus />
                  Novo item
                </Button>
              )}
            </>
          }
        />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3" data-tour="estoque-rel-kpis">
        <KpiCard label="Em dia" value={counts.ok} icon={<CheckCircle2 />} color="var(--success)" loading={loading} />
        <KpiCard label="Atenção" value={counts.atencao} icon={<AlertTriangle />} color="var(--warning)" loading={loading} subtitle="abaixo do mínimo" />
        <KpiCard label="Críticos" value={counts.critico} icon={<XCircle />} color="var(--destructive)" loading={loading} subtitle="zerados ou negativos" />
      </div>

      <div data-tour="estoque-itens-filtro" className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-end">
        <TextField
          aria-label="Buscar item"
          placeholder="Buscar por nome ou grupo..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          startAdornment={<Search />}
          size="small"
          className="sm:max-w-xs"
        />
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="filtro-grupo" className="sr-only">Grupo</Label>
          <Select value={filterGrupo} onValueChange={setFilterGrupo}>
            <SelectTrigger id="filtro-grupo" size="sm" className="w-full sm:w-48" aria-label="Filtrar por grupo">
              <SelectValue placeholder="Grupo" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os grupos</SelectItem>
              {grupos.map((g) => (
                <SelectItem key={g.id} value={g.id}>{g.nome}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Toggle
          variant="outline"
          size="sm"
          pressed={somenteCriticos}
          onPressedChange={setSomenteCriticos}
          aria-label="Mostrar só itens críticos ou em atenção"
          className="data-[state=on]:bg-destructive/10 data-[state=on]:text-destructive-strong"
        >
          <AlertTriangle />
          Críticos
        </Toggle>
      </div>

      <div data-tour="estoque-itens-tabela">
        <DataTable
          columns={columns}
          data={rows}
          getRowId={(i) => i.id}
          loading={loading}
          pageSize={25}
          renderCard={renderCard}
          emptyIcon={<Boxes className="size-10 text-ghost" aria-hidden />}
          emptyMessage={somenteCriticos ? 'Nenhum item crítico — estoque em dia.' : search ? 'Nenhum item encontrado.' : 'Nenhum item cadastrado.'}
          emptyDescription={!search && !somenteCriticos && canInsert ? 'Use "Novo item" para começar.' : undefined}
        />
      </div>

      <CrudDrawer
        open={drawerOpen}
        title={drawerMode === 'create' ? 'Novo item' : 'Editar item'}
        onClose={closeDrawer}
        onSave={handleSave}
        saving={saving}
        saveDisabled={!formData.nome.trim()}
      >
        <div className="flex flex-col gap-4">
          <TextField
            label="Nome do item"
            value={formData.nome}
            onChange={(e) => setFormData({ ...formData, nome: e.target.value })}
            onBlur={() => setTouched({ ...touched, nome: true })}
            required
            error={touched.nome && !formData.nome.trim() && 'Nome obrigatório'}
            autoFocus
          />
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="item-grupo">Grupo</Label>
            <Select value={formData.grupo_id || 'none'} onValueChange={(v) => setFormData({ ...formData, grupo_id: v === 'none' ? '' : v })}>
              <SelectTrigger id="item-grupo" className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Sem grupo</SelectItem>
                {grupos.map((g) => (
                  <SelectItem key={g.id} value={g.id}>{g.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <TextField label="Descrição" multiline rows={2} value={formData.descricao} onChange={(e) => setFormData({ ...formData, descricao: e.target.value })} />
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="item-unidade">Unidade</Label>
              <Select value={formData.unidade_medida} onValueChange={(v) => setFormData({ ...formData, unidade_medida: v as Unidade })}>
                <SelectTrigger id="item-unidade" className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {UNIDADES.map((u) => (
                    <SelectItem key={u} value={u}>{u}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <TextField
              label="Estoque mínimo"
              type="number"
              inputMode="numeric"
              min={0}
              value={formData.estoque_minimo}
              onChange={(e) => setFormData({ ...formData, estoque_minimo: e.target.value })}
              error={touched.estoque_minimo && (Number.isNaN(parseInt(formData.estoque_minimo, 10)) || parseInt(formData.estoque_minimo, 10) < 0) && 'Inválido'}
            />
          </div>
          <MoneyInput label="Custo unitário" value={formData.custo_unitario} onChange={(v) => setFormData({ ...formData, custo_unitario: v })} helperText="Opcional" />
          <TextField label="Observações" multiline rows={2} value={formData.observacoes} onChange={(e) => setFormData({ ...formData, observacoes: e.target.value })} />
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">Foto</span>
            <div className="flex items-center gap-3">
              {fotoPreview && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={fotoPreview} alt="Pré-visualização da foto" className="size-16 rounded-md border object-cover" />
              )}
              <Button type="button" variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
                <Camera />
                {fotoPreview ? 'Trocar foto' : 'Adicionar foto'}
              </Button>
              <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={handleFotoChange} aria-label="Selecionar foto" />
            </div>
            <p className="text-xs text-muted-foreground">JPG, PNG ou WebP, máx. 2 MB.</p>
          </div>
        </div>
      </CrudDrawer>

      <MovimentacaoDrawer
        open={movItem !== null}
        onClose={() => setMovItem(null)}
        items={items}
        initial={movItem ? { item_id: movItem.id, tipo: 'saida' } : undefined}
        onSaved={() => {
          showSuccess('Movimentação registrada!');
          loadItems();
        }}
      />

      <ConfirmDialog
        open={deleteTarget !== null}
        title="Excluir item"
        message={
          <>
            Tem certeza que deseja excluir <strong>{deleteTarget?.nome}</strong>?
            <span className="mt-1 block text-muted-foreground">O histórico de movimentações será mantido.</span>
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
