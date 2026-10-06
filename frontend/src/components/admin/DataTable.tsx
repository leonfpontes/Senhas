/**
 * DataTable — tabela de dados sobre TanStack Table v8 + `Table` do shadcn.
 *
 * - Colunas tipadas (`ColumnDef<T>`), ordenação por clique no cabeçalho, paginação no cliente
 *   (`pageSize`) ou no servidor (`manualPagination` + `pagination`/`onPaginationChange` + `rowCount`),
 *   seleção com checkbox (`enableRowSelection`), `Skeleton` no loading e `EmptyState` sem dados.
 * - Abaixo de 640px vira lista de cartões: `renderCard(row)` quando informado; senão empilha as
 *   colunas marcadas com `meta: { mobile: true }` (ou todas, se nenhuma estiver marcada).
 *
 *   const columns: ColumnDef<User>[] = [
 *     { accessorKey: 'name', header: 'Nome', meta: { mobile: true } },
 *     { accessorKey: 'email', header: 'E-mail', meta: { mobile: true } },
 *     { id: 'actions', header: '', enableSorting: false, meta: { align: 'right' },
 *       cell: ({ row }) => <RowActions user={row.original} /> },
 *   ];
 *   <DataTable columns={columns} data={users} getRowId={(u) => u.id} pageSize={20} />
 */
'use client';

import React, { useMemo, useState } from 'react';
import {
  type ColumnDef,
  type OnChangeFn,
  type PaginationState,
  type Row,
  type RowSelectionState,
  type SortingState,
  type Table as TanstackTable,
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table';
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight, Inbox } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { EmptyState } from '@/components/EmptyState';

// Metadados por coluna reconhecidos pela DataTable (`meta` do ColumnDef).
declare module '@tanstack/react-table' {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface ColumnMeta<TData, TValue> {
    /** Aparece no modo cartão (celular) quando não há `renderCard`. */
    mobile?: boolean;
    align?: 'left' | 'center' | 'right';
    width?: string | number;
    headerClassName?: string;
    cellClassName?: string;
  }
}

export type { ColumnDef, SortingState, PaginationState, RowSelectionState };

export const DATA_TABLE_MOBILE_QUERY = '(max-width: 639px)';
export const DEFAULT_PAGE_SIZE = 20;

export interface DataTableProps<T> {
  columns: ColumnDef<T, unknown>[];
  data: T[];
  /** Id estável da linha (seleção/`key`); padrão: índice. */
  getRowId?: (row: T, index: number) => string;
  loading?: boolean;
  skeletonRows?: number;
  emptyMessage?: string;
  emptyDescription?: React.ReactNode;
  emptyIcon?: React.ReactNode;
  emptyAction?: React.ReactNode;

  /** Ordenação controlada (opcional). Sem `manualSorting`, a tabela ordena no cliente. */
  sorting?: SortingState;
  onSortingChange?: OnChangeFn<SortingState>;
  manualSorting?: boolean;

  /** Paginação no cliente: basta informar `pageSize`. */
  pageSize?: number;
  /** Paginação controlada (obrigatória no modo servidor). */
  pagination?: PaginationState;
  onPaginationChange?: OnChangeFn<PaginationState>;
  /** Servidor: a `data` já é a página atual; informe `rowCount` (ou `pageCount`). */
  manualPagination?: boolean;
  rowCount?: number;
  pageCount?: number;

  /** Seleção por checkbox (coluna extra à esquerda). */
  enableRowSelection?: boolean | ((row: Row<T>) => boolean);
  rowSelection?: RowSelectionState;
  onRowSelectionChange?: OnChangeFn<RowSelectionState>;

  /** Modo cartão (< 640px). */
  renderCard?: (row: T, ctx: { selected: boolean; toggleSelected: () => void }) => React.ReactNode;
  onRowClick?: (row: T) => void;
  dense?: boolean;
  className?: string;
  'data-testid'?: string;
}

/** Texto "1–20 de 50" do rodapé. */
export function pageRangeLabel(pageIndex: number, pageSize: number, total: number): string {
  if (total <= 0) return '0 de 0';
  const from = pageIndex * pageSize + 1;
  const to = Math.min(total, (pageIndex + 1) * pageSize);
  return `${from}–${to} de ${total}`;
}

const ALIGN_CLASS = { left: 'text-left', center: 'text-center', right: 'text-right' } as const;

export function DataTable<T>({
  columns,
  data,
  getRowId,
  loading = false,
  skeletonRows = 6,
  emptyMessage = 'Nenhum registro encontrado.',
  emptyDescription,
  emptyIcon,
  emptyAction,
  sorting: sortingProp,
  onSortingChange,
  manualSorting = false,
  pageSize,
  pagination: paginationProp,
  onPaginationChange,
  manualPagination = false,
  rowCount,
  pageCount,
  enableRowSelection = false,
  rowSelection: rowSelectionProp,
  onRowSelectionChange,
  renderCard,
  onRowClick,
  dense = false,
  className,
  'data-testid': testId,
}: DataTableProps<T>) {
  const isMobile = useMediaQuery(DATA_TABLE_MOBILE_QUERY);

  // Estado interno quando o chamador não controla.
  const [sortingState, setSortingState] = useState<SortingState>([]);
  const [paginationState, setPaginationState] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: pageSize ?? DEFAULT_PAGE_SIZE,
  });
  const [rowSelectionState, setRowSelectionState] = useState<RowSelectionState>({});

  const sorting = sortingProp ?? sortingState;
  const pagination = paginationProp ?? paginationState;
  const rowSelection = rowSelectionProp ?? rowSelectionState;
  const paginated = manualPagination || pageSize !== undefined || paginationProp !== undefined;

  const selectionColumn = useMemo<ColumnDef<T, unknown> | null>(() => {
    if (!enableRowSelection) return null;
    return {
      id: '__select',
      enableSorting: false,
      meta: { width: 40, mobile: false },
      header: ({ table }) => (
        <Checkbox
          aria-label="Selecionar todas as linhas"
          checked={table.getIsAllPageRowsSelected() || (table.getIsSomePageRowsSelected() && 'indeterminate')}
          onCheckedChange={(v) => table.toggleAllPageRowsSelected(!!v)}
        />
      ),
      cell: ({ row }) => (
        <Checkbox
          aria-label="Selecionar linha"
          checked={row.getIsSelected()}
          disabled={!row.getCanSelect()}
          onCheckedChange={(v) => row.toggleSelected(!!v)}
          onClick={(e) => e.stopPropagation()}
        />
      ),
    };
  }, [enableRowSelection]);

  const allColumns = useMemo(
    () => (selectionColumn ? [selectionColumn, ...columns] : columns),
    [selectionColumn, columns],
  );

  const table = useReactTable<T>({
    data,
    columns: allColumns,
    getRowId,
    state: { sorting, pagination, rowSelection },
    onSortingChange: onSortingChange ?? setSortingState,
    onPaginationChange: onPaginationChange ?? setPaginationState,
    onRowSelectionChange: onRowSelectionChange ?? setRowSelectionState,
    enableRowSelection,
    manualSorting,
    // Primeiro clique sempre ascendente (o TanStack começa descendente em colunas numéricas).
    sortDescFirst: false,
    manualPagination,
    rowCount: manualPagination ? rowCount : undefined,
    pageCount: manualPagination && rowCount === undefined ? pageCount : undefined,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: manualSorting ? undefined : getSortedRowModel(),
    getPaginationRowModel: paginated && !manualPagination ? getPaginationRowModel() : undefined,
    autoResetPageIndex: false,
  });

  const rows = table.getRowModel().rows;
  const visibleColumns = table.getVisibleLeafColumns();
  const colCount = visibleColumns.length || 1;
  const total = manualPagination
    ? (rowCount ?? (pageCount !== undefined ? pageCount * pagination.pageSize : data.length))
    : table.getPrePaginationRowModel().rows.length;

  const cellPad = dense ? 'px-2 py-1.5' : 'px-3 py-2.5';

  const footer = paginated && !loading && total > 0 && (
    <PaginationFooter table={table} total={total} />
  );

  // ── Modo cartão (celular) ────────────────────────────────────────────────
  if (isMobile) {
    return (
      <div data-slot="data-table" data-mode="cards" data-testid={testId} className={cn('w-full', className)}>
        {loading ? (
          <div className="flex flex-col gap-3" aria-busy="true">
            {Array.from({ length: Math.min(skeletonRows, 4) }).map((_, i) => (
              <Skeleton key={i} data-testid="data-table-skeleton" className="h-24 w-full rounded-xl" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <EmptyState icon={emptyIcon ?? <Inbox />} title={emptyMessage} description={emptyDescription} action={emptyAction} />
        ) : (
          <ul className="flex flex-col gap-3" role="list">
            {rows.map((row) => (
              <li
                key={row.id}
                data-slot="data-table-card"
                data-state={row.getIsSelected() ? 'selected' : undefined}
                className={cn(
                  'rounded-xl border bg-card p-4 text-card-foreground shadow-sm data-[state=selected]:border-primary/50',
                  onRowClick && 'cursor-pointer active:bg-accent',
                )}
                onClick={onRowClick ? () => onRowClick(row.original) : undefined}
              >
                {renderCard ? (
                  renderCard(row.original, {
                    selected: row.getIsSelected(),
                    toggleSelected: () => row.toggleSelected(),
                  })
                ) : (
                  <StackedCard row={row} />
                )}
              </li>
            ))}
          </ul>
        )}
        {footer}
      </div>
    );
  }

  // ── Tabela ───────────────────────────────────────────────────────────────
  return (
    <div data-slot="data-table" data-mode="table" data-testid={testId} className={cn('w-full', className)}>
      <Table>
        <TableHeader>
          {table.getHeaderGroups().map((hg) => (
            <TableRow key={hg.id} className="hover:bg-transparent">
              {hg.headers.map((header) => {
                const meta = header.column.columnDef.meta;
                const canSort = header.column.getCanSort();
                const sorted = header.column.getIsSorted();
                return (
                  <TableHead
                    key={header.id}
                    scope="col"
                    style={meta?.width !== undefined ? { width: meta.width } : undefined}
                    aria-sort={sorted ? (sorted === 'asc' ? 'ascending' : 'descending') : undefined}
                    className={cn(
                      'h-11 text-[0.72rem] font-bold tracking-[0.06em] text-muted-foreground uppercase',
                      cellPad,
                      ALIGN_CLASS[meta?.align ?? 'left'],
                      meta?.headerClassName,
                    )}
                  >
                    {header.isPlaceholder ? null : canSort ? (
                      <button
                        type="button"
                        onClick={header.column.getToggleSortingHandler()}
                        className={cn(
                          'inline-flex items-center gap-1 rounded-sm uppercase hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none',
                          sorted && 'text-foreground',
                        )}
                      >
                        {flexRender(header.column.columnDef.header, header.getContext())}
                        {sorted === 'asc' ? (
                          <ArrowUp className="size-3.5" aria-hidden />
                        ) : sorted === 'desc' ? (
                          <ArrowDown className="size-3.5" aria-hidden />
                        ) : (
                          <ArrowUpDown className="size-3.5 opacity-50" aria-hidden />
                        )}
                      </button>
                    ) : (
                      flexRender(header.column.columnDef.header, header.getContext())
                    )}
                  </TableHead>
                );
              })}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {loading ? (
            Array.from({ length: skeletonRows }).map((_, i) => (
              <TableRow key={`sk-${i}`} aria-busy="true">
                {visibleColumns.map((col) => (
                  <TableCell key={col.id} className={cellPad}>
                    <Skeleton data-testid="data-table-skeleton" className="h-4 w-full" />
                  </TableCell>
                ))}
              </TableRow>
            ))
          ) : rows.length === 0 ? (
            <TableRow className="hover:bg-transparent">
              <TableCell colSpan={colCount} className="p-0">
                <EmptyState
                  icon={emptyIcon ?? <Inbox />}
                  title={emptyMessage}
                  description={emptyDescription}
                  action={emptyAction}
                />
              </TableCell>
            </TableRow>
          ) : (
            rows.map((row) => (
              <TableRow
                key={row.id}
                data-state={row.getIsSelected() ? 'selected' : undefined}
                className={cn(onRowClick && 'cursor-pointer')}
                onClick={onRowClick ? () => onRowClick(row.original) : undefined}
              >
                {row.getVisibleCells().map((cell) => {
                  const meta = cell.column.columnDef.meta;
                  return (
                    <TableCell
                      key={cell.id}
                      className={cn(cellPad, ALIGN_CLASS[meta?.align ?? 'left'], meta?.cellClassName)}
                    >
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  );
                })}
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
      {footer}
    </div>
  );
}

/** Cartão padrão do celular: pares rótulo/valor das colunas `meta.mobile` (ou todas). */
function StackedCard<T>({ row }: { row: Row<T> }) {
  const cells = row.getVisibleCells();
  const flagged = cells.filter((c) => c.column.columnDef.meta?.mobile);
  const shown = (flagged.length ? flagged : cells.filter((c) => c.column.id !== '__select'));
  const select = cells.find((c) => c.column.id === '__select');

  return (
    <div className="flex items-start gap-3">
      {select && <div className="pt-0.5">{flexRender(select.column.columnDef.cell, select.getContext())}</div>}
      <dl className="grid flex-1 grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
        {shown.map((cell) => {
          const header = cell.column.columnDef.header;
          const label = typeof header === 'string' ? header : cell.column.id;
          return (
            <React.Fragment key={cell.id}>
              <dt className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{label}</dt>
              <dd className="min-w-0 break-words">{flexRender(cell.column.columnDef.cell, cell.getContext())}</dd>
            </React.Fragment>
          );
        })}
      </dl>
    </div>
  );
}

function PaginationFooter<T>({ table, total }: { table: TanstackTable<T>; total: number }) {
  const { pageIndex, pageSize } = table.getState().pagination;
  return (
    <nav
      aria-label="Paginação da tabela"
      data-slot="data-table-pagination"
      className="flex items-center justify-end gap-3 px-2 py-3 text-sm text-muted-foreground"
    >
      <span aria-live="polite">{pageRangeLabel(pageIndex, pageSize, total)}</span>
      <div className="flex items-center gap-1">
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="Página anterior"
          onClick={() => table.previousPage()}
          disabled={!table.getCanPreviousPage()}
        >
          <ChevronLeft />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="Próxima página"
          onClick={() => table.nextPage()}
          disabled={!table.getCanNextPage()}
        >
          <ChevronRight />
        </Button>
      </div>
    </nav>
  );
}

export default DataTable;
