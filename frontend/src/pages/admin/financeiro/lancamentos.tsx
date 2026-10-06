/**
 * Admin Financeiro — Lançamentos (contas a pagar e a receber numa tela só).
 *
 * `?tipo=pagar|receber` escolhe a aba; `/financeiro/contas-pagar` e `/financeiro/contas-receber`
 * redirecionam para cá. Mesmas chamadas de API das telas antigas.
 */
'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import type { ColumnDef } from '@tanstack/react-table';
import {
  AlertTriangle,
  ArrowDownToLine,
  ArrowUpFromLine,
  CheckCircle2,
  MoreHorizontal,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
} from 'lucide-react';
import AdminLayout from '../admin_layout';
import CrudDrawer from '../../../components/CrudDrawer';
import { useSubscription } from '../../../hooks/useSubscription';
import { usePermissions } from '../../../hooks/usePermissions';
import { useSnackbar } from '../../../contexts/SnackbarContext';
import { apiClient, extractApiErrorMessage } from '../../../services/api_client';
import { ConfirmDialog } from '@/components/admin/ConfirmDialog';
import { DataTable } from '@/components/admin/DataTable';
import { KpiCard } from '@/components/admin/KpiCard';
import { PageHeader } from '@/components/admin/PageHeader';
import { PermissionDenied, PlanLocked } from '@/components/gates';
import { DateField, MoneyInput, TextField } from '@/components/fields';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { brDateParts, formatBRL, formatDateBr, monthRangeIso, todayBr } from '@/lib/dateBr';

// ─── Tipos ────────────────────────────────────────────────────────────────────

export type TipoLancamento = 'pagar' | 'receber';

interface Categoria { id: string; nome: string; tipo: string; cor: string | null }
interface ContaBancaria { id: string; nome: string; banco: string | null }
interface ContaFinanceira {
  id: string;
  tipo: string;
  descricao: string;
  valor: number;
  data_vencimento: string;
  data_competencia: string | null;
  status: 'pendente' | 'pago' | 'vencido' | 'cancelado';
  data_pagamento: string | null;
  valor_pago: number | null;
  categoria_id: string | null;
  categoria_nome: string | null;
  conta_bancaria_id: string | null;
  conta_bancaria_nome: string | null;
  recorrencia: string | null;
  observacoes: string | null;
  created_at: string;
  /** Espelho de Mensalidade: somente leitura aqui (o backend responde 409 a editar/baixar/excluir). */
  origem_mensalidade?: boolean;
}
interface Resumo {
  total_pagar_pendente: number;
  total_pagar_vencido: number;
  total_pagar_pago_mes: number;
  total_receber_pendente: number;
  total_receber_vencido: number;
  total_receber_pago_mes: number;
}

const EMPTY_FORM = {
  descricao: '',
  valor: 0,
  data_vencimento: '',
  data_competencia: '',
  categoria_id: '',
  conta_bancaria_id: '',
  recorrencia: 'unica',
  observacoes: '',
};
const EMPTY_BAIXA = { data_pagamento: '', valor_pago: 0, conta_bancaria_id: '' };

const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

const TEXTO: Record<TipoLancamento, {
  aba: string;
  subtitulo: string;
  kpiPendente: string;
  kpiPago: string;
  statusPago: string;
  drawerSubtitulo: string;
  placeholder: string;
}> = {
  pagar: {
    aba: 'Saídas',
    subtitulo: 'Contas a pagar: despesas, vencimentos e baixas',
    kpiPendente: 'A pagar',
    kpiPago: 'Pago este mês',
    statusPago: 'Pago',
    drawerSubtitulo: 'Conta a pagar (saída)',
    placeholder: 'Ex.: Aluguel do salão, energia elétrica...',
  },
  receber: {
    aba: 'Entradas',
    subtitulo: 'Contas a receber: doações, aluguéis e recebimentos',
    kpiPendente: 'A receber',
    kpiPago: 'Recebido este mês',
    statusPago: 'Recebido',
    drawerSubtitulo: 'Conta a receber (entrada)',
    placeholder: 'Ex.: Doação mensal, aluguel do espaço...',
  },
};

function StatusBadge({ status, tipo }: { status: ContaFinanceira['status']; tipo: TipoLancamento }) {
  switch (status) {
    case 'pago':
      return <Badge className="border-transparent bg-success text-success-foreground">{TEXTO[tipo].statusPago}</Badge>;
    case 'vencido':
      return <Badge variant="destructive">Vencido</Badge>;
    case 'cancelado':
      return <Badge variant="outline">Cancelado</Badge>;
    default:
      return <Badge className="border-transparent bg-warning text-warning-foreground">Pendente</Badge>;
  }
}

export function parseTipo(raw: unknown): TipoLancamento {
  return raw === 'receber' ? 'receber' : 'pagar';
}

// ─── Página ───────────────────────────────────────────────────────────────────

export default function LancamentosPage() {
  return (
    <AdminLayout title="Lançamentos">
      <LancamentosContent />
    </AdminLayout>
  );
}

function LancamentosContent() {
  const router = useRouter();
  const { can } = useSubscription();
  const { can: canGroup } = usePermissions();
  const { showSuccess, showError } = useSnackbar();

  const planAllows = can('contas_financeiras');
  const canView = canGroup('contas_financeiras', 'view');
  const canInsert = canGroup('contas_financeiras', 'insert');
  const canEdit = canGroup('contas_financeiras', 'edit');
  const canDelete = canGroup('contas_financeiras', 'delete');

  const tipo = parseTipo(router.query.tipo);
  const texto = TEXTO[tipo];
  const setTipo = (next: TipoLancamento) => {
    if (next === tipo) return;
    router.replace({ pathname: router.pathname, query: { ...router.query, tipo: next } }, undefined, { shallow: true });
  };

  const [contas, setContas] = useState<ContaFinanceira[]>([]);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [contasBanc, setContasBanc] = useState<ContaBancaria[]>([]);
  const [resumo, setResumo] = useState<Resumo | null>(null);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [catFilter, setCatFilter] = useState<string>('all');
  const hojeParts = brDateParts();
  const [mesFilter, setMesFilter] = useState(String(hojeParts.month));
  const [anoFilter, setAnoFilter] = useState(String(hojeParts.year));

  // Sheet — criar/editar
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerMode, setDrawerMode] = useState<'create' | 'edit'>('create');
  const [editTarget, setEditTarget] = useState<ContaFinanceira | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);
  const [drawerError, setDrawerError] = useState<string | null>(null);

  // Sheet — dar baixa
  const [baixaTarget, setBaixaTarget] = useState<ContaFinanceira | null>(null);
  const [baixaForm, setBaixaForm] = useState(EMPTY_BAIXA);
  const [savingBaixa, setSavingBaixa] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<ContaFinanceira | null>(null);
  const [deleting, setDeleting] = useState(false);

  // ── Fetch ──────────────────────────────────────────────────────────────────

  const fetchAll = useCallback(async () => {
    if (!planAllows || !canView) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const ym = `${anoFilter}-${mesFilter.padStart(2, '0')}`;
      const { start, end } = monthRangeIso(ym);
      const params: Record<string, string> = { tipo, data_vencimento_de: start, data_vencimento_ate: end };
      if (statusFilter !== 'all') params.status = statusFilter;
      if (catFilter !== 'all') params.categoria_id = catFilter;
      const [contasRes, resumoRes, catRes, cbRes] = await Promise.all([
        apiClient.get<ContaFinanceira[]>('/api/v1/admin/financeiro/contas', { params }),
        apiClient.get<Resumo>('/api/v1/admin/financeiro/contas/resumo', { params: { mes: mesFilter, ano: anoFilter } }),
        apiClient.get<Categoria[]>('/api/v1/admin/financeiro/categorias'),
        apiClient.get<ContaBancaria[]>('/api/v1/admin/financeiro/contas-bancarias'),
      ]);
      setContas(contasRes.data);
      setResumo(resumoRes.data);
      setCategorias(catRes.data.filter((c) => c.tipo === tipo || c.tipo === 'ambos'));
      setContasBanc(cbRes.data);
    } catch {
      showError('Erro ao carregar lançamentos.');
    } finally {
      setLoading(false);
    }
  }, [planAllows, canView, tipo, statusFilter, catFilter, mesFilter, anoFilter, showError]);

  useEffect(() => {
    if (!router.isReady) return;
    fetchAll();
  }, [router.isReady, fetchAll]);

  // Categoria filtrada pode não existir no outro tipo.
  useEffect(() => {
    setCatFilter('all');
  }, [tipo]);

  // ── Sheet criar/editar ─────────────────────────────────────────────────────

  const openCreate = () => {
    setForm({ ...EMPTY_FORM, data_vencimento: todayBr() });
    setTouched({});
    setDrawerError(null);
    setEditTarget(null);
    setDrawerMode('create');
    setDrawerOpen(true);
  };

  const openEdit = (c: ContaFinanceira) => {
    setForm({
      descricao: c.descricao,
      valor: c.valor,
      data_vencimento: c.data_vencimento,
      data_competencia: c.data_competencia ?? '',
      categoria_id: c.categoria_id ?? '',
      conta_bancaria_id: c.conta_bancaria_id ?? '',
      recorrencia: c.recorrencia ?? 'unica',
      observacoes: c.observacoes ?? '',
    });
    setTouched({});
    setDrawerError(null);
    setEditTarget(c);
    setDrawerMode('edit');
    setDrawerOpen(true);
  };

  const setField = <K extends keyof typeof EMPTY_FORM>(field: K, value: (typeof EMPTY_FORM)[K]) => {
    setForm((p) => ({ ...p, [field]: value }));
    setTouched((p) => ({ ...p, [field]: true }));
  };

  const isDirty =
    drawerMode === 'create'
      ? form.descricao !== '' || form.valor > 0
      : editTarget != null &&
        (form.descricao !== editTarget.descricao ||
          form.valor !== editTarget.valor ||
          form.data_vencimento !== editTarget.data_vencimento ||
          form.data_competencia !== (editTarget.data_competencia ?? '') ||
          form.categoria_id !== (editTarget.categoria_id ?? '') ||
          form.conta_bancaria_id !== (editTarget.conta_bancaria_id ?? '') ||
          form.recorrencia !== (editTarget.recorrencia ?? 'unica') ||
          form.observacoes !== (editTarget.observacoes ?? ''));

  const handleSave = async () => {
    setTouched({ descricao: true, valor: true, data_vencimento: true });
    if (!form.descricao.trim() || form.valor <= 0 || !form.data_vencimento) {
      setDrawerError('Preencha os campos obrigatórios: descrição, valor e data de vencimento.');
      return;
    }
    if (drawerMode === 'create' && !canInsert) return;
    if (drawerMode === 'edit' && !canEdit) return;
    setSaving(true);
    setDrawerError(null);
    try {
      const payload = {
        tipo,
        descricao: form.descricao,
        valor: form.valor,
        data_vencimento: form.data_vencimento,
        data_competencia: form.data_competencia || null,
        categoria_id: form.categoria_id || null,
        conta_bancaria_id: form.conta_bancaria_id || null,
        recorrencia: form.recorrencia === 'unica' ? null : form.recorrencia || null,
        observacoes: form.observacoes || null,
      };
      if (drawerMode === 'edit' && editTarget) {
        await apiClient.put(`/api/v1/admin/financeiro/contas/${editTarget.id}`, payload);
        showSuccess('Lançamento atualizado.');
      } else {
        await apiClient.post('/api/v1/admin/financeiro/contas', payload);
        showSuccess('Lançamento criado.');
        // Leva o filtro para o mês do vencimento do lançamento criado.
        const [y, m] = form.data_vencimento.split('-');
        setMesFilter(String(parseInt(m, 10)));
        setAnoFilter(y);
      }
      setDrawerOpen(false);
      fetchAll();
    } catch (e) {
      setDrawerError(extractApiErrorMessage(e, 'Erro ao salvar o lançamento. Tente novamente.'));
    } finally {
      setSaving(false);
    }
  };

  // ── Dar baixa ──────────────────────────────────────────────────────────────

  const openBaixa = (c: ContaFinanceira) => {
    setBaixaTarget(c);
    setBaixaForm({ data_pagamento: todayBr(), valor_pago: c.valor, conta_bancaria_id: c.conta_bancaria_id ?? '' });
  };
  const baixaSaveDisabled = !baixaForm.data_pagamento || baixaForm.valor_pago <= 0;

  const handleBaixa = async () => {
    if (baixaSaveDisabled || !baixaTarget || !canEdit) return;
    setSavingBaixa(true);
    try {
      await apiClient.post(`/api/v1/admin/financeiro/contas/${baixaTarget.id}/baixa`, {
        data_pagamento: baixaForm.data_pagamento,
        valor_pago: baixaForm.valor_pago,
        conta_bancaria_id: baixaForm.conta_bancaria_id || null,
      });
      showSuccess('Baixa registrada.');
      setBaixaTarget(null);
      fetchAll();
    } catch (e) {
      showError(extractApiErrorMessage(e, 'Erro ao dar baixa.'));
    } finally {
      setSavingBaixa(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget || !canDelete) return;
    setDeleting(true);
    try {
      await apiClient.delete(`/api/v1/admin/financeiro/contas/${deleteTarget.id}`);
      showSuccess('Lançamento excluído.');
      setDeleteTarget(null);
      fetchAll();
    } catch {
      showError('Erro ao excluir.');
    } finally {
      setDeleting(false);
    }
  };

  // ── KPIs ───────────────────────────────────────────────────────────────────

  const kpi = useMemo(() => {
    if (!resumo) return { pendente: 0, vencido: 0, pago: 0 };
    return tipo === 'pagar'
      ? { pendente: resumo.total_pagar_pendente, vencido: resumo.total_pagar_vencido, pago: resumo.total_pagar_pago_mes }
      : { pendente: resumo.total_receber_pendente, vencido: resumo.total_receber_vencido, pago: resumo.total_receber_pago_mes };
  }, [resumo, tipo]);

  // ── Tabela ─────────────────────────────────────────────────────────────────

  const podeBaixar = (c: ContaFinanceira) =>
    canEdit && !c.origem_mensalidade && c.status !== 'pago' && c.status !== 'cancelado';
  const showActions = canEdit || canDelete;

  // Conta gerada pela Mensalidade: sem editar/baixar/excluir aqui — a mudança é feita lá.
  const EspelhoMensalidade = () => (
    <Link
      href="/admin/financeiro/mensalidades"
      title="Gerado pela Mensalidade — registre pagamento, isenção ou correção em Financeiro → Mensalidades"
      className="whitespace-nowrap text-xs text-muted-foreground underline underline-offset-2"
    >
      Editar em Mensalidades
    </Link>
  );

  const RowMenu = ({ c }: { c: ContaFinanceira }) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={`Mais ações de ${c.descricao}`}>
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {canEdit && (
          <DropdownMenuItem onSelect={() => openEdit(c)}>
            <Pencil />
            Editar
          </DropdownMenuItem>
        )}
        {canDelete && (
          <DropdownMenuItem variant="destructive" onSelect={() => setDeleteTarget(c)}>
            <Trash2 />
            Excluir
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );

  const columns = useMemo<ColumnDef<ContaFinanceira>[]>(() => {
    const cols: ColumnDef<ContaFinanceira>[] = [
      {
        accessorKey: 'descricao',
        header: 'Descrição',
        cell: ({ row }) => (
          <div className="flex min-w-0 flex-col">
            <span className="truncate font-medium">{row.original.descricao}</span>
            <span className="truncate text-xs text-muted-foreground">{row.original.categoria_nome ?? 'Sem categoria'}</span>
          </div>
        ),
      },
      { accessorKey: 'valor', header: 'Valor', meta: { align: 'right' }, cell: ({ getValue }) => formatBRL(getValue<number>()) },
      { accessorKey: 'data_vencimento', header: 'Vencimento', cell: ({ getValue }) => formatDateBr(getValue<string>()) },
      { accessorKey: 'status', header: 'Status', cell: ({ getValue }) => <StatusBadge status={getValue<ContaFinanceira['status']>()} tipo={tipo} /> },
      {
        id: 'pagamento',
        header: tipo === 'pagar' ? 'Pagamento' : 'Recebimento',
        accessorFn: (c) => c.data_pagamento ?? '',
        cell: ({ row }) =>
          row.original.data_pagamento ? (
            <span className="whitespace-nowrap">
              {formatDateBr(row.original.data_pagamento)}
              {row.original.valor_pago != null && (
                <span className="text-muted-foreground"> · {formatBRL(row.original.valor_pago)}</span>
              )}
            </span>
          ) : (
            '—'
          ),
      },
    ];
    if (showActions) {
      cols.push({
        id: 'acoes',
        header: '',
        enableSorting: false,
        meta: { align: 'right' },
        cell: ({ row }) => (
          <div className="flex items-center justify-end gap-1">
            {podeBaixar(row.original) && (
              <Button variant="outline" size="sm" onClick={() => openBaixa(row.original)}>
                <CheckCircle2 />
                Dar baixa
              </Button>
            )}
            {row.original.origem_mensalidade ? <EspelhoMensalidade /> : <RowMenu c={row.original} />}
          </div>
        ),
      });
    }
    return cols;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tipo, showActions, canEdit, canDelete]);

  const renderCard = (c: ContaFinanceira) => (
    <div className="flex flex-col gap-2 p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 flex-col">
          <span className="truncate font-medium">{c.descricao}</span>
          <span className="truncate text-xs text-muted-foreground">{c.categoria_nome ?? 'Sem categoria'}</span>
        </div>
        <StatusBadge status={c.status} tipo={tipo} />
      </div>
      <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
        <dt className="text-muted-foreground">Valor</dt>
        <dd className="text-right font-medium">{formatBRL(c.valor)}</dd>
        <dt className="text-muted-foreground">Vencimento</dt>
        <dd className="text-right">{formatDateBr(c.data_vencimento)}</dd>
        {c.data_pagamento && (
          <>
            <dt className="text-muted-foreground">{tipo === 'pagar' ? 'Pago em' : 'Recebido em'}</dt>
            <dd className="text-right">
              {formatDateBr(c.data_pagamento)}
              {c.valor_pago != null ? ` · ${formatBRL(c.valor_pago)}` : ''}
            </dd>
          </>
        )}
      </dl>
      {showActions && (
        <div className="flex items-center justify-end gap-1">
          {podeBaixar(c) && (
            <Button variant="outline" size="sm" onClick={() => openBaixa(c)}>
              <CheckCircle2 />
              Dar baixa
            </Button>
          )}
          {c.origem_mensalidade ? <EspelhoMensalidade /> : <RowMenu c={c} />}
        </div>
      )}
    </div>
  );

  // ── Gates ──────────────────────────────────────────────────────────────────

  if (!planAllows) return <PlanLocked feature="Lançamentos financeiros" minPlan="Pro" />;
  if (!canView) return <PermissionDenied message="Você não tem permissão para visualizar os lançamentos financeiros." />;

  const anos = Array.from({ length: 5 }, (_, i) => hojeParts.year - 2 + i);

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Lançamentos"
        subtitle={texto.subtitulo}
        actions={
          <>
            <Button variant="outline" onClick={fetchAll} disabled={loading} aria-label="Atualizar">
              <RefreshCw className={loading ? 'animate-spin' : undefined} />
              <span className="hidden sm:inline">Atualizar</span>
            </Button>
            {canInsert && (
              <Button onClick={openCreate}>
                <Plus />
                Novo lançamento
              </Button>
            )}
          </>
        }
      />

      <ToggleGroup
        type="single"
        variant="outline"
        value={tipo}
        onValueChange={(v) => v && setTipo(v as TipoLancamento)}
        aria-label="Tipo de lançamento"
        className="w-full sm:w-auto"
      >
        <ToggleGroupItem value="receber" className="flex-1 sm:flex-none sm:px-4" aria-label="Entradas (contas a receber)">
          <ArrowDownToLine className="text-success" />
          Entradas
        </ToggleGroupItem>
        <ToggleGroupItem value="pagar" className="flex-1 sm:flex-none sm:px-4" aria-label="Saídas (contas a pagar)">
          <ArrowUpFromLine className="text-destructive" />
          Saídas
        </ToggleGroupItem>
      </ToggleGroup>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <KpiCard label={texto.kpiPendente} value={formatBRL(kpi.pendente)} icon={tipo === 'pagar' ? <ArrowUpFromLine /> : <ArrowDownToLine />} color="var(--warning)" subtitle="pendente no mês" loading={loading} />
        <KpiCard label="Vencido" value={formatBRL(kpi.vencido)} icon={<AlertTriangle />} color="var(--destructive)" subtitle="em atraso" loading={loading} />
        <KpiCard label={texto.kpiPago} value={formatBRL(kpi.pago)} icon={<CheckCircle2 />} color="var(--success)" subtitle="mês corrente" loading={loading} />
      </div>

      <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-end">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="filtro-mes">Mês</Label>
          <Select value={mesFilter} onValueChange={setMesFilter}>
            <SelectTrigger id="filtro-mes" size="sm" className="w-full sm:w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MESES.map((n, i) => (
                <SelectItem key={i + 1} value={String(i + 1)}>
                  {n}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="filtro-ano">Ano</Label>
          <Select value={anoFilter} onValueChange={setAnoFilter}>
            <SelectTrigger id="filtro-ano" size="sm" className="w-full sm:w-28">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {anos.map((y) => (
                <SelectItem key={y} value={String(y)}>
                  {y}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="filtro-status">Status</Label>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger id="filtro-status" size="sm" className="w-full sm:w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="pendente">Pendente</SelectItem>
              <SelectItem value="vencido">Vencido</SelectItem>
              <SelectItem value="pago">{texto.statusPago}</SelectItem>
              <SelectItem value="cancelado">Cancelado</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="filtro-categoria">Categoria</Label>
          <Select value={catFilter} onValueChange={setCatFilter}>
            <SelectTrigger id="filtro-categoria" size="sm" className="w-full sm:w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas</SelectItem>
              {categorias.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.nome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <DataTable
        columns={columns}
        data={contas}
        getRowId={(c) => c.id}
        loading={loading}
        pageSize={25}
        renderCard={renderCard}
        emptyMessage="Nenhum lançamento neste mês."
        emptyDescription={canInsert ? 'Use "Novo lançamento" para registrar o primeiro.' : undefined}
      />

      {/* Sheet — criar/editar */}
      <CrudDrawer
        open={drawerOpen}
        onClose={() => {
          setDrawerOpen(false);
          setDrawerError(null);
        }}
        title={drawerMode === 'create' ? 'Novo lançamento' : 'Editar lançamento'}
        subtitle={texto.drawerSubtitulo}
        icon={tipo === 'pagar' ? <ArrowUpFromLine /> : <ArrowDownToLine />}
        onSave={handleSave}
        saving={saving}
        saveDisabled={drawerMode === 'edit' && !isDirty}
        isDirty={isDirty}
        error={drawerError}
      >
        <div className="flex flex-col gap-4">
          <TextField
            label="Descrição"
            placeholder={texto.placeholder}
            value={form.descricao}
            onChange={(e) => setField('descricao', e.target.value)}
            required
            error={touched.descricao && !form.descricao.trim() && 'Obrigatório'}
            autoFocus
          />
          <MoneyInput
            label="Valor"
            value={form.valor}
            onChange={(v) => setField('valor', v)}
            required
            error={touched.valor && form.valor <= 0 && 'Obrigatório'}
          />
          <DateField
            label="Data de vencimento"
            value={form.data_vencimento || null}
            onChange={(iso) => setField('data_vencimento', iso ?? '')}
            required
            error={touched.data_vencimento && !form.data_vencimento && 'Obrigatório'}
          />
          <DateField
            label="Mês de referência"
            value={form.data_competencia || null}
            onChange={(iso) => setField('data_competencia', iso ?? '')}
            helperText="Opcional — período a que o lançamento se refere, quando difere do vencimento"
          />
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="form-categoria">Categoria</Label>
            <Select value={form.categoria_id || 'none'} onValueChange={(v) => setField('categoria_id', v === 'none' ? '' : v)}>
              <SelectTrigger id="form-categoria" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Sem categoria</SelectItem>
                {categorias.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {categorias.length === 0 && (
              <Alert variant="info" className="mt-1">
                <AlertDescription>
                  Nenhuma categoria cadastrada. Crie em{' '}
                  <Link href="/admin/financeiro/config" className="font-semibold underline underline-offset-2">
                    Financeiro → Configuração
                  </Link>
                  .
                </AlertDescription>
              </Alert>
            )}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="form-conta">Conta bancária</Label>
            <Select value={form.conta_bancaria_id || 'none'} onValueChange={(v) => setField('conta_bancaria_id', v === 'none' ? '' : v)}>
              <SelectTrigger id="form-conta" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Nenhuma</SelectItem>
                {contasBanc.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.nome}
                    {c.banco ? ` — ${c.banco}` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="form-recorrencia">Recorrência</Label>
            <Select value={form.recorrencia} onValueChange={(v) => setField('recorrencia', v)}>
              <SelectTrigger id="form-recorrencia" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="unica">Única</SelectItem>
                <SelectItem value="mensal">Mensal</SelectItem>
                <SelectItem value="anual">Anual</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <TextField
            label="Observações"
            placeholder="Informações adicionais sobre este lançamento..."
            value={form.observacoes}
            onChange={(e) => setField('observacoes', e.target.value)}
            multiline
            rows={3}
          />
        </div>
      </CrudDrawer>

      {/* Sheet — dar baixa */}
      <CrudDrawer
        open={baixaTarget !== null}
        onClose={() => setBaixaTarget(null)}
        title="Dar baixa"
        subtitle={baixaTarget ? `${baixaTarget.descricao} — ${formatBRL(baixaTarget.valor)}` : ''}
        icon={<CheckCircle2 />}
        onSave={handleBaixa}
        saving={savingBaixa}
        saveDisabled={baixaSaveDisabled}
        saveLabel="Dar baixa"
        isDirty={false}
      >
        <div className="flex flex-col gap-4">
          <DateField
            label={tipo === 'pagar' ? 'Data do pagamento' : 'Data do recebimento'}
            value={baixaForm.data_pagamento || null}
            onChange={(iso) => setBaixaForm((f) => ({ ...f, data_pagamento: iso ?? '' }))}
            required
            max={todayBr()}
          />
          <MoneyInput
            label={tipo === 'pagar' ? 'Valor pago' : 'Valor recebido'}
            value={baixaForm.valor_pago}
            onChange={(v) => setBaixaForm((f) => ({ ...f, valor_pago: v }))}
            required
          />
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="baixa-conta">Conta bancária</Label>
            <Select
              value={baixaForm.conta_bancaria_id || 'none'}
              onValueChange={(v) => setBaixaForm((f) => ({ ...f, conta_bancaria_id: v === 'none' ? '' : v }))}
            >
              <SelectTrigger id="baixa-conta" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Nenhuma</SelectItem>
                {contasBanc.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </CrudDrawer>

      <ConfirmDialog
        open={deleteTarget !== null}
        title="Excluir lançamento"
        message={
          <>
            Deseja excluir <strong>{deleteTarget?.descricao}</strong>? Esta ação não pode ser desfeita.
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
