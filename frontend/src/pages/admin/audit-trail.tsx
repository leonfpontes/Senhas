/**
 * Admin — Auditoria: registro das ações realizadas no terreiro.
 *
 * Filtros por ação (Select) e tipo de recurso (Combobox com todos os tipos que o backend grava:
 * os explícitos dos endpoints e os automáticos do `audit_logging_middleware`, que usa o segmento
 * da rota). `DataTable` com paginação no servidor e cartões no celular. A exportação CSV é
 * montada no cliente a partir do mesmo endpoint (páginas de 500, o máximo aceito) e avisa por toast.
 */
'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { ColumnDef, PaginationState } from '@tanstack/react-table';
import { Download, Loader2, RefreshCw, XCircle } from 'lucide-react';

import AdminLayout from './admin_layout';
import { useSubscription } from '../../hooks/useSubscription';
import { usePermissions } from '../../hooks/usePermissions';
import { useSnackbar } from '../../contexts/SnackbarContext';
import { apiClient } from '../../services/api_client';
import { DataTable } from '@/components/admin/DataTable';
import { PageHeader } from '@/components/admin/PageHeader';
import { PermissionDenied, PlanLocked } from '@/components/gates';
import { Combobox } from '@/components/fields';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { formatDateTimeBr, todayBr } from '@/lib/dateBr';

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface AuditLog {
  id: string;
  action: string;
  resource_type: string;
  resource_id?: string | null;
  user_id?: string | null;
  user_name?: string | null;
  details?: Record<string, unknown> | null;
  created_at: string;
}

const PAGE_SIZE = 50;
/** Máximo do `limit` aceito por `GET /api/v1/admin/audit-logs`. */
const EXPORT_PAGE = 500;
/** Teto de linhas da exportação (10 requisições). */
const EXPORT_MAX = 5000;

// ─── Tipos de recurso ─────────────────────────────────────────────────────────

/**
 * Todos os `resource_type` gravados pelo backend. Os de rota vêm do middleware de auditoria
 * (`/api/v1/admin/<segmento>/...`), por isso aparecem no plural/kebab-case.
 */
export const RESOURCE_TYPES: Array<{ value: string; label: string; automatico?: boolean }> = [
  { value: 'Ticket', label: 'Senha (ticket)' },
  { value: 'TicketWaitlist', label: 'Lista de espera' },
  { value: 'Gira', label: 'Gira' },
  { value: 'GiraSenhaConfig', label: 'Configuração de senhas da gira' },
  { value: 'Medium', label: 'Médium' },
  { value: 'Associado', label: 'Associado' },
  { value: 'mensalidade', label: 'Mensalidade' },
  { value: 'mensalidade_config', label: 'Configuração de mensalidade' },
  { value: 'mensalidade_comprovante', label: 'Comprovante de mensalidade' },
  { value: 'mensalidade_relatorio', label: 'Relatório de mensalidades' },
  { value: 'conta_pagar', label: 'Conta a pagar' },
  { value: 'conta_receber', label: 'Conta a receber' },
  { value: 'EstoqueGrupo', label: 'Grupo de material' },
  { value: 'EstoqueItem', label: 'Item de estoque' },
  { value: 'EstoqueMovimentacao', label: 'Movimentação de estoque' },
  { value: 'CursoPresencial', label: 'Curso presencial' },
  { value: 'CursoParticipante', label: 'Participante de curso' },
  { value: 'CursoParticipantePagamento', label: 'Pagamento de curso' },
  { value: 'CursoParticipantePagamentoComprovante', label: 'Comprovante de pagamento de curso' },
  { value: 'CursoParticipanteInscricaoComprovante', label: 'Comprovante de inscrição em curso' },
  { value: 'User', label: 'Usuário' },
  { value: 'UserGroupMembership', label: 'Membro de grupo de permissão' },
  { value: 'PermissionGroup', label: 'Grupo de permissão' },
  { value: 'PermissionGroupPermissions', label: 'Permissões do grupo' },
  { value: 'Tenant', label: 'Terreiro' },
  { value: 'TenantConfig', label: 'Configuração do terreiro' },
  { value: 'subscription', label: 'Assinatura' },
  { value: 'stripe_subscription', label: 'Assinatura (Stripe)' },
  // Automáticos (rota)
  { value: 'giras', label: 'Giras (rota)', automatico: true },
  { value: 'tickets', label: 'Senhas (rota)', automatico: true },
  { value: 'validate-bulk', label: 'Validação em lote (rota)', automatico: true },
  { value: 'door', label: 'Porta (rota)', automatico: true },
  { value: 'mediuns', label: 'Médiuns (rota)', automatico: true },
  { value: 'associados', label: 'Associados (rota)', automatico: true },
  { value: 'financeiro', label: 'Financeiro (rota)', automatico: true },
  { value: 'estoque', label: 'Estoque (rota)', automatico: true },
  { value: 'cursos-presenciais', label: 'Cursos presenciais (rota)', automatico: true },
  { value: 'sites', label: 'Site do terreiro (rota)', automatico: true },
  { value: 'users', label: 'Usuários (rota)', automatico: true },
  { value: 'permission-groups', label: 'Grupos de permissão (rota)', automatico: true },
  { value: 'tenant', label: 'Terreiro (rota)', automatico: true },
  { value: 'config', label: 'Configurações (rota)', automatico: true },
  { value: 'billing', label: 'Assinatura (rota)', automatico: true },
  { value: 'support-chat', label: 'Suporte (rota)', automatico: true },
];

const RESOURCE_LABELS: Record<string, string> = Object.fromEntries(RESOURCE_TYPES.map((r) => [r.value, r.label]));

export function resourceLabel(type: string): string {
  return RESOURCE_LABELS[type] ?? type;
}

const ACTION_LABELS: Record<string, string> = {
  create: 'Criação',
  update: 'Alteração',
  delete: 'Exclusão',
  login: 'Login',
  logout: 'Logout',
  read: 'Leitura',
  token_refresh: 'Token',
  TENANT_DELETED: 'Terreiro excluído',
  TENANT_DEACTIVATED: 'Terreiro desativado',
  TENANT_REACTIVATED: 'Terreiro reativado',
};

const ACTION_CLASS: Record<string, string> = {
  create: 'bg-success text-success-foreground',
  update: 'bg-warning text-warning-foreground',
  delete: 'bg-destructive text-destructive-foreground',
  login: 'bg-info text-info-foreground',
  logout: 'bg-secondary text-secondary-foreground',
};

function ActionBadge({ action }: { action: string }) {
  return (
    <Badge className={cn('border-transparent', ACTION_CLASS[action] ?? 'bg-muted text-muted-foreground')}>
      {ACTION_LABELS[action] ?? action.toUpperCase()}
    </Badge>
  );
}

// ─── Formatação dos detalhes ─────────────────────────────────────────────────

const FIELD_LABELS: Record<string, string> = {
  nome: 'Nome', email: 'E-mail', full_name: 'Nome completo', username: 'Usuário',
  phone: 'Telefone', is_active: 'Ativo', data_inicio: 'Data de início',
  data_fim: 'Data de fim', endereco: 'Endereço', primary_color: 'Cor primária',
  secondary_color: 'Cor secundária', font_color: 'Cor da fonte',
  max_giras_per_month: 'Máx. giras/mês', max_tickets_per_gira: 'Máx. senhas/gira',
  enable_walk_in: 'Atendimento sem senha habilitado', enable_sponsors: 'Associados habilitados',
  validate_associado_on_emit: 'Validar associado na emissão',
  enable_estoque_log: 'Log de estoque ativado', walk_in_limit: 'Limite sem senha',
  slug: 'Slug', role: 'Papel', password_hash: 'Senha', status: 'Status',
  tipo: 'Tipo', consulente_nome: 'Nome do consulente', consulente_email: 'E-mail do consulente',
  consulente_telefone: 'Telefone do consulente', is_sponsor: 'É associado',
  numero: 'Número', gira_id: 'Gira', plan: 'Plano', success: 'Sucesso',
  ip_address: 'Endereço IP', timestamp: 'Data/hora', path: 'Rota',
  user_agent: 'Navegador', impersonated_by: 'Acesso assistido por', method: 'Método',
  max_tickets: 'Máx. senhas', release_start_at: 'Liberação início',
  release_end_at: 'Liberação fim', error: 'Erro', operation_type: 'Tipo de operação',
  count: 'Quantidade', resource_ids: 'IDs afetados', config_type: 'Tipo de config.',
  mes_referencia: 'Mês de referência', competencia: 'Mês de referência',
};

const HIDDEN_FIELDS = new Set([
  'id', 'tenant_id', 'created_at', 'updated_at', 'deleted_at',
  'password_hash', 'profile_photo_data', 'profile_photo_url',
  'profile_photo_content_type', 'user_agent', 'path', 'method',
]);

function fieldLabel(key: string): string {
  return FIELD_LABELS[key] || key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatValue(val: unknown): string {
  if (val === null || val === undefined) return '—';
  if (typeof val === 'boolean') return val ? 'Sim' : 'Não';
  if (Array.isArray(val)) return `${val.length} item(ns)`;
  if (typeof val === 'object') return JSON.stringify(val);
  const s = String(val);
  if (/^\d{4}-\d{2}-\d{2}T/.test(s)) return formatDateTimeBr(s, s);
  return s;
}

function diffObjects(prev: Record<string, unknown>, next: Record<string, unknown>) {
  const changes: Array<{ field: string; from: unknown; to: unknown }> = [];
  const allKeys = new Set([...Object.keys(prev), ...Object.keys(next)]);
  for (const key of allKeys) {
    if (HIDDEN_FIELDS.has(key)) continue;
    if (JSON.stringify(prev[key] ?? null) !== JSON.stringify(next[key] ?? null)) {
      changes.push({ field: key, from: prev[key], to: next[key] });
    }
  }
  return changes;
}

const muted = <span className="text-sm text-muted-foreground">—</span>;

function FormatDetails({ action, details }: { action: string; details?: Record<string, unknown> | null }) {
  if (!details) return muted;

  if (action === 'login' || action === 'logout') {
    const ok = details.success !== false;
    const ipAddress = details.ip_address as string | undefined;
    return (
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span>{action === 'login' ? 'Login' : 'Logout'}</span>
        <Badge className={cn('border-transparent', ok ? 'bg-success text-success-foreground' : 'bg-destructive text-destructive-foreground')}>
          {ok ? 'sucesso' : 'falha'}
        </Badge>
        {ipAddress && <span className="text-xs text-muted-foreground">IP: {ipAddress}</span>}
      </div>
    );
  }

  const operationType = details.operation_type as string | undefined;
  if (operationType) {
    const opLabels: Record<string, string> = { bulk_mark_used: 'Marcar como usado', bulk_cancel: 'Cancelar em massa' };
    return (
      <p className="m-0 text-sm">
        <strong>{opLabels[operationType] || operationType}</strong> — {String(details.count ?? 0)} registro(s)
      </p>
    );
  }

  const prev = (details.previous_state || details.previous_values) as Record<string, unknown> | undefined;
  const next = (details.new_state || details.new_values) as Record<string, unknown> | undefined;
  if (prev && next) {
    const changes = diffObjects(prev, next);
    if (changes.length === 0) return <span className="text-sm text-muted-foreground">Sem alterações visíveis</span>;
    return (
      <ul className="m-0 flex list-none flex-col gap-1 p-0 text-sm">
        {changes.map(({ field, from, to }) => (
          <li key={field} className="flex flex-wrap items-baseline gap-1">
            <span className="font-semibold">{fieldLabel(field)}:</span>
            <span className="break-words text-destructive line-through">{formatValue(from)}</span>
            <span aria-hidden>→</span>
            <span className="break-words font-semibold text-success">{formatValue(to)}</span>
          </li>
        ))}
      </ul>
    );
  }

  if (action === 'delete' && details.previous_state) {
    const state = details.previous_state as Record<string, unknown>;
    const summary = (state.nome || state.email || state.numero || '') as string;
    return <span className="text-sm">Removido{summary ? `: ${summary}` : ''}</span>;
  }

  if (action === 'create') {
    const meaningful = Object.entries(details).filter(([k]) => !HIDDEN_FIELDS.has(k));
    if (meaningful.length === 0) return muted;
    return (
      <ul className="m-0 flex list-none flex-col gap-0.5 p-0 text-sm">
        {meaningful.slice(0, 6).map(([key, val]) => (
          <li key={key} className="break-words">
            <strong>{fieldLabel(key)}:</strong> {formatValue(val)}
          </li>
        ))}
      </ul>
    );
  }

  const raw = JSON.stringify(details);
  return <span className="break-words text-sm">{raw.length <= 120 ? raw : `${raw.slice(0, 120)}…`}</span>;
}

// ─── CSV ──────────────────────────────────────────────────────────────────────

function csvCell(v: unknown): string {
  const s = v == null ? '' : typeof v === 'string' ? v : JSON.stringify(v);
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** CSV (separador `;`, BOM UTF-8 para o Excel em pt-BR). */
export function auditLogsToCsv(logs: AuditLog[]): string {
  const header = ['Data', 'Usuário', 'Ação', 'Recurso', 'ID do recurso', 'Detalhes'];
  const lines = logs.map((l) =>
    [
      formatDateTimeBr(l.created_at, l.created_at),
      l.user_name || 'Sistema',
      ACTION_LABELS[l.action] ?? l.action,
      resourceLabel(l.resource_type),
      l.resource_id ?? '',
      l.details ?? '',
    ]
      .map(csvCell)
      .join(';'),
  );
  return `\uFEFF${[header.join(';'), ...lines].join('\r\n')}`;
}

// ─── Página ───────────────────────────────────────────────────────────────────

export default function AdminAuditTrailPage() {
  return (
    <AdminLayout title="Auditoria">
      <AdminAuditTrailContent />
    </AdminLayout>
  );
}

function AdminAuditTrailContent() {
  const { can, loading: subLoading } = useSubscription();
  const { can: canGroup } = usePermissions();
  const { showSuccess, showError, showInfo } = useSnackbar();
  const canView = canGroup('auditoria', 'view');

  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: PAGE_SIZE });
  const [actionFilter, setActionFilter] = useState<string | null>(null);
  const [resourceTypeFilter, setResourceTypeFilter] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  const buildQuery = useCallback(
    (limit: number, skip: number) => {
      const p = new URLSearchParams();
      p.set('skip', String(skip));
      p.set('limit', String(limit));
      if (actionFilter) p.set('action_filter', actionFilter);
      if (resourceTypeFilter) p.set('resource_type_filter', resourceTypeFilter);
      return p.toString();
    },
    [actionFilter, resourceTypeFilter],
  );

  useEffect(() => {
    if (!canView) {
      setLoading(false);
      return;
    }
    const c = new AbortController();
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const q = buildQuery(pagination.pageSize, pagination.pageIndex * pagination.pageSize);
        const res = await apiClient.get(`/api/v1/admin/audit-logs?${q}`, { signal: c.signal });
        setLogs(res.data.items ?? []);
        setTotal(res.data.total ?? 0);
      } catch (e) {
        const name = (e as { name?: string })?.name;
        if (name === 'CanceledError' || name === 'AbortError') return;
        setError('Não foi possível carregar o registro de auditoria.');
      } finally {
        if (!c.signal.aborted) setLoading(false);
      }
    })();
    return () => c.abort();
  }, [canView, buildQuery, pagination.pageIndex, pagination.pageSize, reloadKey]);

  const changeAction = (v: string) => {
    setActionFilter(v === 'all' ? null : v);
    setPagination((p) => ({ ...p, pageIndex: 0 }));
  };
  const changeResource = (v: string | null) => {
    setResourceTypeFilter(v);
    setPagination((p) => ({ ...p, pageIndex: 0 }));
  };

  async function handleExport() {
    if (!canView || exporting) return;
    setExporting(true);
    try {
      const all: AuditLog[] = [];
      let expected = Infinity;
      for (let skip = 0; skip < Math.min(expected, EXPORT_MAX); skip += EXPORT_PAGE) {
        const res = await apiClient.get(`/api/v1/admin/audit-logs?${buildQuery(EXPORT_PAGE, skip)}`);
        const items: AuditLog[] = res.data.items ?? [];
        expected = res.data.total ?? items.length;
        all.push(...items);
        if (items.length < EXPORT_PAGE) break;
      }
      if (all.length === 0) {
        showInfo('Nenhum registro para exportar com os filtros atuais.');
        return;
      }
      const blob = new Blob([auditLogsToCsv(all)], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `auditoria-${todayBr()}.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      const truncated = expected > EXPORT_MAX;
      showSuccess(
        truncated
          ? `CSV exportado com os ${all.length.toLocaleString('pt-BR')} registros mais recentes (de ${expected.toLocaleString('pt-BR')}).`
          : `CSV exportado: ${all.length.toLocaleString('pt-BR')} registro${all.length === 1 ? '' : 's'}.`,
      );
    } catch {
      showError('Erro ao exportar o CSV da auditoria.');
    } finally {
      setExporting(false);
    }
  }

  const resourceOptions = useMemo(
    () =>
      RESOURCE_TYPES.map((r) => ({
        value: r.value,
        label: r.label,
        description: r.automatico ? 'registro automático da rota' : undefined,
        keywords: [r.value],
      })),
    [],
  );

  const columns = useMemo<ColumnDef<AuditLog>[]>(
    () => [
      {
        accessorKey: 'created_at',
        header: 'Data',
        enableSorting: false,
        meta: { cellClassName: 'whitespace-nowrap align-top' },
        cell: ({ getValue }) => <span className="text-sm">{formatDateTimeBr(getValue<string>())}</span>,
      },
      {
        accessorKey: 'user_name',
        header: 'Usuário',
        enableSorting: false,
        meta: { cellClassName: 'align-top' },
        cell: ({ getValue }) => <span className="text-sm">{getValue<string | null>() || 'Sistema'}</span>,
      },
      {
        accessorKey: 'action',
        header: 'Ação',
        enableSorting: false,
        meta: { cellClassName: 'align-top' },
        cell: ({ getValue }) => <ActionBadge action={getValue<string>()} />,
      },
      {
        accessorKey: 'resource_type',
        header: 'Recurso',
        enableSorting: false,
        meta: { cellClassName: 'align-top' },
        cell: ({ getValue }) => <span className="text-sm text-muted-foreground">{resourceLabel(getValue<string>())}</span>,
      },
      {
        id: 'detalhes',
        header: 'Detalhes',
        enableSorting: false,
        meta: { cellClassName: 'max-w-[28rem] whitespace-normal align-top' },
        cell: ({ row }) => <FormatDetails action={row.original.action} details={row.original.details} />,
      },
    ],
    [],
  );

  const renderCard = (log: AuditLog) => (
    <div className="flex flex-col gap-2 p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="m-0 truncate text-sm font-medium">{log.user_name || 'Sistema'}</p>
          <p className="m-0 text-xs text-muted-foreground">{formatDateTimeBr(log.created_at)}</p>
        </div>
        <ActionBadge action={log.action} />
      </div>
      <p className="m-0 text-xs font-medium text-muted-foreground">{resourceLabel(log.resource_type)}</p>
      <div className="min-w-0 break-words">
        <FormatDetails action={log.action} details={log.details} />
      </div>
    </div>
  );

  if (subLoading) {
    return (
      <div className="flex flex-col gap-3">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-28 w-full" />
      </div>
    );
  }
  if (!can('auditoria')) return <PlanLocked feature="Auditoria" minPlan="Pro" />;
  if (!canView) return <PermissionDenied message="Você não tem permissão para visualizar a auditoria." />;

  return (
    <div className="flex flex-col gap-4">
      <div data-tour="audit-header">
        <PageHeader
          title="Auditoria"
          subtitle="Registro de todas as ações realizadas no sistema"
          className="mb-0"
          actions={
            <>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Atualizar"
                title="Atualizar"
                onClick={() => setReloadKey((k) => k + 1)}
                disabled={loading}
              >
                <RefreshCw className={cn(loading && 'animate-spin')} />
              </Button>
              <Button data-tour="audit-export" variant="outline" size="sm" onClick={handleExport} disabled={exporting}>
                {exporting ? <Loader2 className="animate-spin" /> : <Download />}
                Exportar CSV
              </Button>
            </>
          }
        />
      </div>

      <Card data-tour="audit-filtros" className="gap-0 py-4">
        <CardContent className="grid grid-cols-1 items-end gap-3 px-4 sm:grid-cols-[12rem_minmax(0,18rem)_1fr]">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="audit-acao">Ação</Label>
            <Select value={actionFilter ?? 'all'} onValueChange={changeAction}>
              <SelectTrigger id="audit-acao" size="sm" className="w-full">
                <SelectValue placeholder="Ação" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                <SelectItem value="create">Criação</SelectItem>
                <SelectItem value="update">Alteração</SelectItem>
                <SelectItem value="delete">Exclusão</SelectItem>
                <SelectItem value="login">Login</SelectItem>
                <SelectItem value="logout">Logout</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Combobox
            label="Tipo de recurso"
            size="small"
            options={resourceOptions}
            value={resourceTypeFilter}
            onChange={changeResource}
            placeholder="Todos"
            searchPlaceholder="Buscar tipo..."
            clearable
          />
          {total > 0 && (
            <p className="m-0 text-xs text-muted-foreground sm:pb-2 sm:text-right">
              {total.toLocaleString('pt-BR')} registro{total !== 1 ? 's' : ''}
            </p>
          )}
        </CardContent>
      </Card>

      {error && (
        <Alert variant="destructive" role="alert">
          <XCircle aria-hidden />
          <AlertTitle>Erro ao carregar</AlertTitle>
          <AlertDescription className="flex flex-wrap items-center gap-3">
            <span>{error}</span>
            <Button size="sm" variant="outline" onClick={() => setReloadKey((k) => k + 1)}>
              Tentar novamente
            </Button>
          </AlertDescription>
        </Alert>
      )}

      <div data-tour="audit-tabela">
        <DataTable
          columns={columns}
          data={logs}
          getRowId={(l) => l.id}
          loading={loading}
          manualPagination
          pagination={pagination}
          onPaginationChange={setPagination}
          rowCount={total}
          renderCard={renderCard}
          emptyMessage="Nenhum registro encontrado."
          dense
        />
      </div>
    </div>
  );
}
