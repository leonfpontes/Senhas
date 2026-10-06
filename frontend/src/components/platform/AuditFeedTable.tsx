/**
 * AuditFeedTable — tabela do feed de auditoria (DataTable do kit) + diálogo de detalhes.
 * Usada na Auditoria consolidada e na aba Auditoria do Tenant 360.
 */
import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import { Info } from 'lucide-react';
import { cn } from '@/lib/utils';
import { DataTable, type ColumnDef } from '@/components/admin/DataTable';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { ActionBadge, FormatDetails, isFailedLogin, resourceLabel, type FeedEntry } from './auditFormat';
import { ToneBadge } from './PlanBadge';
import { fmtDateTime } from './format';

interface AuditFeedTableProps {
  entries: FeedEntry[];
  loading?: boolean;
  /** Oculta a coluna do terreiro (na aba do Tenant 360). */
  hideTenant?: boolean;
  emptyMessage?: string;
}

function dateParts(iso: string): { date: string; time: string } {
  const d = new Date(iso);
  return {
    date: d.toLocaleDateString('pt-BR'),
    time: d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
  };
}

export function TenantCell({ entry }: { entry: FeedEntry }) {
  if (!entry.tenant_id) return <span className="text-sm font-medium">{entry.tenant_name}</span>;
  return (
    <span className="flex flex-col">
      <Link href={`/platform/tenants/${entry.tenant_id}`} className="text-sm font-medium text-foreground underline-offset-4 hover:underline">
        {entry.tenant_name}
      </Link>
      {entry.tenant_slug && <span className="text-xs text-muted-foreground">{entry.tenant_slug}</span>}
    </span>
  );
}

export function AuditFeedTable({ entries, loading = false, hideTenant = false, emptyMessage = 'Nenhum evento encontrado no período selecionado.' }: AuditFeedTableProps) {
  const [detail, setDetail] = useState<FeedEntry | null>(null);

  const columns = useMemo<ColumnDef<FeedEntry>[]>(() => {
    const cols: ColumnDef<FeedEntry>[] = [];
    if (!hideTenant) {
      cols.push({
        id: 'tenant',
        accessorKey: 'tenant_name',
        header: 'Terreiro',
        meta: { mobile: true },
        cell: ({ row }) => <TenantCell entry={row.original} />,
      });
    }
    cols.push(
      {
        id: 'action',
        accessorKey: 'action',
        header: 'Ação',
        meta: { mobile: true },
        cell: ({ row }) => (
          <span className="flex flex-wrap items-center gap-1">
            <ActionBadge action={row.original.action} />
            {isFailedLogin(row.original) && <ToneBadge tone="destructive">ERRO</ToneBadge>}
          </span>
        ),
      },
      {
        id: 'resource',
        accessorKey: 'resource_type',
        header: 'Recurso',
        meta: { mobile: true },
        cell: ({ row }) => <span className="text-sm">{resourceLabel(row.original.resource_type)}</span>,
      },
      {
        id: 'user',
        accessorFn: (e) => e.user_username || e.user_email || '',
        header: 'Usuário',
        meta: { mobile: true },
        cell: ({ row }) => {
          const e = row.original;
          return (
            <span className="flex flex-col">
              <span className="text-sm">{e.user_username || e.user_email || 'sistema'}</span>
              {e.user_username && e.user_email && <span className="text-xs text-muted-foreground">{e.user_email}</span>}
            </span>
          );
        },
      },
      {
        id: 'details',
        header: 'Detalhes',
        enableSorting: false,
        meta: { mobile: true, cellClassName: 'max-w-[320px]' },
        cell: ({ row }) => <FormatDetails action={row.original.action} details={row.original.details} />,
      },
      {
        id: 'created_at',
        accessorKey: 'created_at',
        header: 'Data / hora',
        meta: { mobile: true, cellClassName: 'whitespace-nowrap' },
        cell: ({ row }) => {
          const dt = dateParts(row.original.created_at);
          return (
            <span className="flex flex-col">
              <span className="text-sm">{dt.date}</span>
              <span className="text-xs text-muted-foreground">{dt.time}</span>
            </span>
          );
        },
      },
      {
        id: 'open',
        header: '',
        enableSorting: false,
        meta: { align: 'right', width: 48 },
        cell: ({ row }) => (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={(e) => {
                  e.stopPropagation();
                  setDetail(row.original);
                }}
                aria-label="Ver detalhes completos"
              >
                <Info />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Ver detalhes completos</TooltipContent>
          </Tooltip>
        ),
      },
    );
    return cols;
  }, [hideTenant]);

  return (
    <>
      <DataTable
        columns={columns}
        data={entries}
        getRowId={(e) => e.id}
        loading={loading}
        emptyMessage={emptyMessage}
        dense
        className={cn('[&_tr[data-failed=true]]:bg-destructive/5')}
      />

      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Detalhes do evento</DialogTitle>
            <DialogDescription>Registro completo da auditoria.</DialogDescription>
          </DialogHeader>
          {detail && (
            <dl className="grid gap-3 text-sm">
              <div>
                <dt className="text-xs text-muted-foreground">Terreiro</dt>
                <dd><TenantCell entry={detail} /></dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Ação</dt>
                <dd className="mt-0.5 flex items-center gap-1"><ActionBadge action={detail.action} />{isFailedLogin(detail) && <ToneBadge tone="destructive">ERRO</ToneBadge>}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Recurso</dt>
                <dd>
                  {resourceLabel(detail.resource_type)}
                  {detail.resource_id && <span className="ml-2 text-xs text-muted-foreground">({detail.resource_id})</span>}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Usuário</dt>
                <dd>
                  {detail.user_username || detail.user_email || 'sistema'}
                  {detail.user_email && detail.user_username && <span className="ml-2 text-xs text-muted-foreground">({detail.user_email})</span>}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Data / hora</dt>
                <dd>{fmtDateTime(detail.created_at)}</dd>
              </div>
              {detail.details && (
                <div>
                  <dt className="mb-1 text-xs text-muted-foreground">Detalhes</dt>
                  <dd><FormatDetails action={detail.action} details={detail.details} /></dd>
                </div>
              )}
            </dl>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

export default AuditFeedTable;
