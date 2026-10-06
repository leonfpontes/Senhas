/**
 * CobrancaMensal — controle de cobrança de um mês de referência para uma lista de pessoas
 * (médiuns, associados ou participantes de curso). Mesmo arquétipo nas três telas:
 *
 * - busca por nome + filtro de status;
 * - `DataTable` (cartões no celular) com status efetivo (Pago / Isento / Pendente / Inadimplente);
 * - seleção em lote com barra "Marcar como pago" (confirmação em `ConfirmDialog`);
 * - Sheet (`CrudDrawer`) de registro de pagamento com comprovante e observação;
 * - download do comprovante.
 *
 * A tela dona dos dados faz as chamadas de API (`onRegistrar`) e recarrega em `onChanged`.
 *
 *   <CobrancaMensal mes={mes} items={items} loading={loading} diaVencimento={10}
 *                   valorPadrao={config.valor_mensal} canEdit={canInsertEdit}
 *                   entidade="médium" onRegistrar={registrar} onChanged={reload}
 *                   onDownloadComprovante={baixar} />
 */
'use client';

import React, { useMemo, useState } from 'react';
import type { ColumnDef, RowSelectionState } from '@tanstack/react-table';
import { CheckCircle2, Download, Paperclip, Pencil, Search, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { DataTable } from '@/components/admin/DataTable';
import { ConfirmDialog } from '@/components/admin/ConfirmDialog';
import { KpiCard } from '@/components/admin/KpiCard';
import CrudDrawer from '@/components/CrudDrawer';
import { DateField, MoneyInput, TextField } from '@/components/fields';
import { useSnackbar } from '@/contexts/SnackbarContext';
import { currentMonthBr, formatBRL, formatDateBr, todayBr } from '@/lib/dateBr';

// ─── Tipos ────────────────────────────────────────────────────────────────────

export type CobrancaStatus = 'PAGO' | 'PENDENTE' | 'ISENTO';
export type CobrancaStatusEfetivo = CobrancaStatus | 'INADIMPLENTE';

export interface CobrancaItem {
  id: string;
  nome: string;
  /** Linha secundária no cartão/na célula (e-mail, celular). */
  descricao?: string | null;
  /** Isenção permanente configurada no cadastro (quando o backend informa). */
  isentoPermanente?: boolean;
  status: CobrancaStatus | null;
  data_pagamento: string | null;
  valor_vigente: number | null;
  valor_pago: number | null;
  comprovante_filename: string | null;
  observacao: string | null;
}

export interface CobrancaPagamento {
  status: CobrancaStatus;
  valor_pago?: number | null;
  data_pagamento?: string | null;
  observacao?: string | null;
  comprovante?: File | null;
}

export interface CobrancaKpis {
  esperado: number;
  arrecadado: number;
  inadimplentes: number;
  emAberto: number;
}

export type CobrancaFiltro = 'TODOS' | 'PENDENTE' | 'PAGO' | 'ISENTO';

export interface CobrancaMensalProps {
  /** Mês de referência "YYYY-MM". */
  mes: string;
  items: CobrancaItem[];
  loading?: boolean;
  /** Dia de vencimento no mês (define "Inadimplente" após a data). */
  diaVencimento?: number | null;
  /** Valor sugerido no registro e usado no lote (cai para `valor_vigente` do item). */
  valorPadrao?: number | null;
  /** Pode registrar/editar pagamentos (insert ou edit no grupo). */
  canEdit: boolean;
  /** Nome singular da pessoa cobrada: "médium", "associado", "participante". */
  entidade: string;
  /** Registra o pagamento de um item (a tela faz o POST). */
  onRegistrar: (item: CobrancaItem, pagamento: CobrancaPagamento) => Promise<void>;
  /** Chamado uma vez após salvar ou após o lote — a tela recarrega os dados. */
  onChanged?: () => void | Promise<void>;
  onDownloadComprovante?: (item: CobrancaItem) => void | Promise<void>;
  emptyMessage?: string;
  showSearch?: boolean;
  showFilter?: boolean;
  enableBulk?: boolean;
  className?: string;
  'data-testid'?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Status efetivo: pendente vira "Inadimplente" depois do vencimento do mês. */
export function cobrancaStatusEfetivo(
  item: Pick<CobrancaItem, 'status' | 'isentoPermanente'>,
  mes: string,
  diaVencimento: number | null | undefined,
  hoje: string = todayBr(),
): CobrancaStatusEfetivo {
  if (item.status === 'PAGO') return 'PAGO';
  if (item.status === 'ISENTO' || (item.isentoPermanente && !item.status)) return 'ISENTO';
  const dia = String(diaVencimento ?? 10).padStart(2, '0');
  const vencimento = `${mes}-${dia}`;
  return hoje > vencimento ? 'INADIMPLENTE' : 'PENDENTE';
}

/** KPIs do mês a partir dos itens carregados. Só chame com todas as listas já carregadas. */
export function computeCobrancaKpis(
  grupos: Array<{ items: CobrancaItem[]; valor: number | null | undefined }>,
  mes: string,
  diaVencimento?: number | null,
  hoje: string = todayBr(),
): CobrancaKpis {
  let esperado = 0;
  let arrecadado = 0;
  let inadimplentes = 0;
  for (const { items, valor } of grupos) {
    for (const item of items) {
      const efetivo = cobrancaStatusEfetivo(item, mes, diaVencimento, hoje);
      if (efetivo === 'ISENTO') continue;
      esperado += item.valor_vigente ?? valor ?? 0;
      if (efetivo === 'PAGO') arrecadado += item.valor_pago ?? 0;
      else inadimplentes += 1;
    }
  }
  return { esperado, arrecadado, inadimplentes, emAberto: Math.max(0, esperado - arrecadado) };
}

const STATUS_LABEL: Record<CobrancaStatusEfetivo, string> = {
  PAGO: 'Pago',
  ISENTO: 'Isento',
  PENDENTE: 'Pendente',
  INADIMPLENTE: 'Inadimplente',
};

const STATUS_CLASS: Record<CobrancaStatusEfetivo, string> = {
  PAGO: 'border-transparent bg-success text-success-foreground',
  ISENTO: 'border-transparent bg-muted text-muted-foreground',
  PENDENTE: 'border-transparent bg-warning text-warning-foreground',
  INADIMPLENTE: 'border-transparent bg-destructive text-destructive-foreground',
};

export function CobrancaStatusBadge({ status }: { status: CobrancaStatusEfetivo }) {
  return <Badge className={STATUS_CLASS[status]}>{STATUS_LABEL[status]}</Badge>;
}

/** Grade de KPIs do mês (2×2 no celular, 4 colunas no desktop — sem item solitário). */
export function CobrancaKpisGrid({ kpis, loading }: { kpis: CobrancaKpis | null; loading?: boolean }) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" data-testid="cobranca-kpis">
      <KpiCard label="Esperado" value={kpis ? formatBRL(kpis.esperado) : '—'} loading={loading} />
      <KpiCard label="Arrecadado" value={kpis ? formatBRL(kpis.arrecadado) : '—'} color="var(--success)" loading={loading} />
      <KpiCard
        label="Inadimplentes"
        value={kpis ? kpis.inadimplentes : '—'}
        color={kpis && kpis.inadimplentes > 0 ? 'var(--destructive)' : 'var(--success)'}
        loading={loading}
      />
      <KpiCard label="Em aberto" value={kpis ? formatBRL(kpis.emAberto) : '—'} color="var(--warning)" loading={loading} />
    </div>
  );
}

// ─── Componente ───────────────────────────────────────────────────────────────

export function CobrancaMensal({
  mes,
  items,
  loading = false,
  diaVencimento,
  valorPadrao,
  canEdit,
  entidade,
  onRegistrar,
  onChanged,
  onDownloadComprovante,
  emptyMessage,
  showSearch = true,
  showFilter = true,
  enableBulk = true,
  className,
  'data-testid': testId,
}: CobrancaMensalProps) {
  const { showSuccess, showError } = useSnackbar();
  const hoje = todayBr();

  const [search, setSearch] = useState('');
  const [filtro, setFiltro] = useState<CobrancaFiltro>('TODOS');
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [bulkConfirm, setBulkConfirm] = useState(false);
  const [bulkSaving, setBulkSaving] = useState(false);

  // Sheet de pagamento
  const [drawerItem, setDrawerItem] = useState<CobrancaItem | null>(null);
  const [status, setStatus] = useState<CobrancaStatus>('PENDENTE');
  const [valorPago, setValorPago] = useState(0);
  const [dataPag, setDataPag] = useState<string | null>(null);
  const [obs, setObs] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);

  const vencimentoLabel = useMemo(() => {
    if (diaVencimento == null) return '—';
    return `${String(diaVencimento).padStart(2, '0')}/${mes.slice(5, 7)}/${mes.slice(0, 4)}`;
  }, [diaVencimento, mes]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return items.filter((i) => {
      const efetivo = cobrancaStatusEfetivo(i, mes, diaVencimento, hoje);
      const matchStatus =
        filtro === 'TODOS' ||
        (filtro === 'PENDENTE' ? efetivo === 'PENDENTE' || efetivo === 'INADIMPLENTE' : efetivo === filtro);
      const matchSearch = !term || i.nome.toLowerCase().includes(term);
      return matchStatus && matchSearch;
    });
  }, [items, search, filtro, mes, diaVencimento, hoje]);

  const selectedIds = useMemo(() => Object.keys(rowSelection).filter((k) => rowSelection[k]), [rowSelection]);
  const bulkEnabled = canEdit && enableBulk;

  const openDrawer = (item: CobrancaItem) => {
    setDrawerItem(item);
    setStatus(item.status ?? 'PENDENTE');
    setValorPago(item.valor_pago ?? item.valor_vigente ?? valorPadrao ?? 0);
    setDataPag(item.data_pagamento ? item.data_pagamento.slice(0, 10) : item.status === 'PAGO' ? null : hoje);
    setObs(item.observacao ?? '');
    setFile(null);
  };

  const handleSave = async () => {
    if (!drawerItem) return;
    setSaving(true);
    try {
      await onRegistrar(drawerItem, {
        status,
        valor_pago: status === 'PAGO' ? valorPago : null,
        data_pagamento: status === 'PAGO' ? dataPag : null,
        observacao: obs.trim() || null,
        comprovante: status === 'PAGO' ? file : null,
      });
      showSuccess('Pagamento registrado.');
      setDrawerItem(null);
      await onChanged?.();
    } catch (err) {
      showError((err as { message?: string })?.message || 'Erro ao registrar pagamento.');
    } finally {
      setSaving(false);
    }
  };

  const handleBulk = async () => {
    if (selectedIds.length === 0) return;
    setBulkSaving(true);
    let ok = 0;
    let fail = 0;
    const byId = new Map(items.map((i) => [i.id, i]));
    for (const id of selectedIds) {
      const item = byId.get(id);
      if (!item) continue;
      try {
        await onRegistrar(item, {
          status: 'PAGO',
          data_pagamento: hoje,
          valor_pago: item.valor_vigente ?? valorPadrao ?? null,
        });
        ok += 1;
      } catch {
        fail += 1;
      }
    }
    setBulkSaving(false);
    setBulkConfirm(false);
    setRowSelection({});
    if (fail === 0) showSuccess(`${ok} pagamento${ok === 1 ? '' : 's'} registrado${ok === 1 ? '' : 's'}.`);
    else showError(`${ok} registrado(s), ${fail} falhou(aram).`);
    await onChanged?.();
  };

  const columns = useMemo<ColumnDef<CobrancaItem>[]>(() => {
    const cols: ColumnDef<CobrancaItem>[] = [
      {
        accessorKey: 'nome',
        header: 'Nome',
        meta: { mobile: true },
        cell: ({ row }) => (
          <div className="flex min-w-0 flex-col">
            <span className="flex flex-wrap items-center gap-1.5 font-medium">
              <span className="truncate">{row.original.nome}</span>
              {row.original.isentoPermanente && (
                <Badge variant="outline" className="text-[0.65rem]">
                  isenção permanente
                </Badge>
              )}
            </span>
            {row.original.descricao && (
              <span className="truncate text-xs text-muted-foreground">{row.original.descricao}</span>
            )}
          </div>
        ),
      },
      {
        id: 'status',
        header: 'Status',
        meta: { mobile: true },
        accessorFn: (i) => cobrancaStatusEfetivo(i, mes, diaVencimento, hoje),
        cell: ({ getValue }) => <CobrancaStatusBadge status={getValue<CobrancaStatusEfetivo>()} />,
      },
      {
        id: 'vencimento',
        header: 'Vencimento',
        enableSorting: false,
        cell: () => <span className="text-muted-foreground">{vencimentoLabel}</span>,
      },
      {
        accessorKey: 'data_pagamento',
        header: 'Data do pagamento',
        meta: { mobile: true },
        cell: ({ getValue }) => formatDateBr(getValue<string | null>()),
      },
      {
        accessorKey: 'valor_pago',
        header: 'Valor pago',
        meta: { align: 'right', mobile: true },
        cell: ({ row }) => (row.original.status === 'PAGO' ? formatBRL(row.original.valor_pago) : '—'),
      },
      {
        id: 'comprovante',
        header: 'Comprovante',
        enableSorting: false,
        meta: { align: 'center' },
        cell: ({ row }) =>
          row.original.comprovante_filename ? (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              title={row.original.comprovante_filename}
              aria-label={`Baixar comprovante de ${row.original.nome}`}
              onClick={() => onDownloadComprovante?.(row.original)}
              disabled={!onDownloadComprovante}
            >
              <Download />
            </Button>
          ) : (
            <Paperclip className="mx-auto size-4 text-ghost" aria-hidden />
          ),
      },
    ];
    if (canEdit) {
      cols.push({
        id: 'acoes',
        header: '',
        enableSorting: false,
        meta: { align: 'right' },
        cell: ({ row }) => (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-label={`Registrar pagamento de ${row.original.nome}`}
            onClick={() => openDrawer(row.original)}
          >
            <Pencil />
            Registrar
          </Button>
        ),
      });
    }
    return cols;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mes, diaVencimento, hoje, vencimentoLabel, canEdit, onDownloadComprovante, valorPadrao]);

  const renderCard = (item: CobrancaItem, ctx: { selected: boolean; toggleSelected: () => void }) => {
    const efetivo = cobrancaStatusEfetivo(item, mes, diaVencimento, hoje);
    return (
      <div className="flex flex-col gap-2 p-3">
        <div className="flex items-start gap-3">
          {bulkEnabled && (
            <Checkbox
              checked={ctx.selected}
              onCheckedChange={ctx.toggleSelected}
              aria-label={`Selecionar ${item.nome}`}
              className="mt-1"
            />
          )}
          <div className="flex min-w-0 flex-1 flex-col">
            <span className="flex flex-wrap items-center gap-1.5 font-medium">
              <span className="truncate">{item.nome}</span>
              {item.isentoPermanente && (
                <Badge variant="outline" className="text-[0.65rem]">
                  isenção permanente
                </Badge>
              )}
            </span>
            {item.descricao && <span className="truncate text-xs text-muted-foreground">{item.descricao}</span>}
          </div>
          <CobrancaStatusBadge status={efetivo} />
        </div>
        <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
          <dt className="text-muted-foreground">Vencimento</dt>
          <dd className="text-right">{vencimentoLabel}</dd>
          <dt className="text-muted-foreground">Pagamento</dt>
          <dd className="text-right">{formatDateBr(item.data_pagamento)}</dd>
          <dt className="text-muted-foreground">Valor pago</dt>
          <dd className="text-right">{item.status === 'PAGO' ? formatBRL(item.valor_pago) : '—'}</dd>
        </dl>
        {(canEdit || item.comprovante_filename) && (
          <div className="flex justify-end gap-2">
            {item.comprovante_filename && onDownloadComprovante && (
              <Button type="button" variant="outline" size="sm" onClick={() => onDownloadComprovante(item)}>
                <Download />
                Comprovante
              </Button>
            )}
            {canEdit && (
              <Button type="button" size="sm" onClick={() => openDrawer(item)}>
                <Pencil />
                Registrar
              </Button>
            )}
          </div>
        )}
      </div>
    );
  };

  const mesPassado = mes < currentMonthBr();
  const drawerTitle = drawerItem ? `Registrar pagamento — ${drawerItem.nome}` : 'Registrar pagamento';

  return (
    <div className={cn('flex flex-col gap-3', selectedIds.length > 0 && 'pb-20', className)} data-testid={testId}>
      {(showSearch || showFilter) && (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          {showSearch && (
            <TextField
              aria-label="Buscar por nome"
              placeholder="Buscar por nome..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              startAdornment={<Search />}
              size="small"
              className="sm:max-w-xs"
            />
          )}
          {showFilter && (
            <Select value={filtro} onValueChange={(v) => setFiltro(v as CobrancaFiltro)}>
              <SelectTrigger size="sm" className="w-full sm:w-56" aria-label="Filtrar por status">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="TODOS">Todos os status</SelectItem>
                <SelectItem value="PENDENTE">Pendentes e inadimplentes</SelectItem>
                <SelectItem value="PAGO">Pagos</SelectItem>
                <SelectItem value="ISENTO">Isentos</SelectItem>
              </SelectContent>
            </Select>
          )}
        </div>
      )}

      <DataTable
        columns={columns}
        data={filtered}
        getRowId={(i) => i.id}
        loading={loading}
        pageSize={25}
        enableRowSelection={bulkEnabled}
        rowSelection={rowSelection}
        onRowSelectionChange={setRowSelection}
        renderCard={renderCard}
        emptyMessage={
          emptyMessage ?? (items.length === 0 ? `Nenhum ${entidade} ativo para cobrar.` : 'Nenhum resultado para os filtros.')
        }
        emptyIcon={<CheckCircle2 className="size-10 text-success" aria-hidden />}
      />

      {bulkEnabled && selectedIds.length > 0 && (
        <div
          role="toolbar"
          aria-label="Ações em lote"
          className="fixed inset-x-3 bottom-[calc(env(safe-area-inset-bottom)+64px)] z-40 mx-auto md:bottom-3 flex max-w-2xl flex-wrap items-center gap-2 rounded-lg border bg-card p-3 shadow-lg sm:inset-x-6"
        >
          <span className="flex-1 text-sm font-medium">
            {selectedIds.length} selecionado{selectedIds.length === 1 ? '' : 's'}
          </span>
          <Button type="button" variant="ghost" size="sm" onClick={() => setRowSelection({})} disabled={bulkSaving}>
            <X />
            Limpar
          </Button>
          <Button type="button" size="sm" onClick={() => setBulkConfirm(true)} disabled={bulkSaving}>
            <CheckCircle2 />
            Marcar como pago
          </Button>
        </div>
      )}

      <ConfirmDialog
        open={bulkConfirm}
        title="Marcar como pago"
        message={
          <>
            Registrar o pagamento de <strong>{selectedIds.length}</strong> {entidade}
            {selectedIds.length === 1 ? '' : 's'} em {vencimentoLabel === '—' ? 'este mês' : `${mes.slice(5, 7)}/${mes.slice(0, 4)}`},
            com a data de hoje e o valor vigente?
          </>
        }
        confirmText="Marcar como pago"
        loading={bulkSaving}
        onConfirm={handleBulk}
        onCancel={() => setBulkConfirm(false)}
      />

      {canEdit && (
        <CrudDrawer
          open={drawerItem !== null}
          onClose={() => setDrawerItem(null)}
          title={drawerTitle}
          subtitle={`Mês de referência ${mes.slice(5, 7)}/${mes.slice(0, 4)}`}
          onSave={handleSave}
          saveLabel="Salvar"
          saving={saving}
        >
          <div className="flex flex-col gap-4">
            {drawerItem?.isentoPermanente && (
              <Alert variant="info">
                <AlertDescription>
                  Este {entidade} possui isenção permanente configurada. Registre um status só se precisar
                  sobrescrever este mês.
                </AlertDescription>
              </Alert>
            )}
            {mesPassado && (
              <Alert variant="warning">
                <AlertDescription>Você está editando um mês passado. Confira os dados antes de salvar.</AlertDescription>
              </Alert>
            )}

            <div className="flex flex-col gap-1.5">
              <label htmlFor="cobranca-status" className="text-sm font-medium">
                Status
              </label>
              <Select value={status} onValueChange={(v) => setStatus(v as CobrancaStatus)}>
                <SelectTrigger id="cobranca-status" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="PAGO">Pago</SelectItem>
                  <SelectItem value="PENDENTE">Pendente</SelectItem>
                  <SelectItem value="ISENTO">Isento</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {status === 'PAGO' && (
              <>
                <DateField label="Data do pagamento" value={dataPag} onChange={setDataPag} max={hoje} />
                <MoneyInput label="Valor pago" value={valorPago} onChange={setValorPago} />
                <div className="flex flex-col gap-1.5">
                  <span className="text-sm font-medium">Comprovante</span>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button asChild variant="outline" size="sm">
                      <label className="cursor-pointer">
                        <Paperclip />
                        {file ? 'Trocar arquivo' : 'Anexar arquivo'}
                        <input
                          type="file"
                          className="sr-only"
                          accept=".jpg,.jpeg,.png,.webp,.pdf"
                          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                        />
                      </label>
                    </Button>
                    {file && (
                      <span className="flex items-center gap-1 text-sm text-muted-foreground">
                        <span className="max-w-[12rem] truncate">{file.name}</span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-xs"
                          aria-label="Remover arquivo"
                          onClick={() => setFile(null)}
                        >
                          <X />
                        </Button>
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    JPG, PNG, WebP ou PDF até 5 MB.
                    {drawerItem?.comprovante_filename && !file && ` Atual: ${drawerItem.comprovante_filename}`}
                  </p>
                </div>
              </>
            )}

            <TextField
              label="Observação"
              multiline
              rows={3}
              value={obs}
              onChange={(e) => setObs(e.target.value)}
            />
          </div>
        </CrudDrawer>
      )}
    </div>
  );
}

export default CobrancaMensal;
