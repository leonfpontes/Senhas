/**
 * /platform/audit_consolidated — Auditoria consolidada (todos os terreiros).
 *
 * Filtros reativos (período, terreiro, ação) recarregam resumo e feed; abas do kit (Atividade
 * recente, Por terreiro, Por ação); exportação em JSON com toast. O filtro de terreiro lê a lista
 * de `GET /api/v1/platform/tenants` (um array — a versão anterior lia `.items` e ficava vazio).
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Activity, Building2, Download, RefreshCw, ScrollText, ShieldCheck, Zap } from 'lucide-react';
import { toast } from 'sonner';
import { apiClient, extractApiErrorMessage } from '@/services/api_client';
import PlatformLayout from './layout';
import { KpiCard } from '@/components/admin/KpiCard';
import { PageHeader } from '@/components/admin/PageHeader';
import { EmptyState } from '@/components/EmptyState';
import { Combobox, TextField } from '@/components/fields';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AuditFeedTable } from '@/components/platform/AuditFeedTable';
import { ACTION_OPTIONS, ActionBadge, actionLabel, type FeedEntry } from '@/components/platform/auditFormat';
import { isoDate, isoDaysAgo } from '@/components/platform';

interface AuditSummary {
  total: number;
  by_tenant: Record<string, number>;
  by_action: Record<string, number>;
  by_user: Record<string, number>;
  period: { start?: string; end?: string };
  statistics: {
    most_common_action?: string | null;
    most_active_tenant?: string | null;
    most_active_tenant_name?: string | null;
    most_active_tenant_slug?: string | null;
    [key: string]: unknown;
  };
  by_tenant_name?: Record<string, string>;
  by_tenant_slug?: Record<string, string>;
}

interface TenantLite {
  id: string;
  name: string;
  slug: string;
}

const FEED_LIMIT = 50;
const DEBOUNCE_MS = 350;

const AuditConsolidatedPage: React.FC = () => {
  const [startDate, setStartDate] = useState(isoDaysAgo(30));
  const [endDate, setEndDate] = useState(isoDate(new Date()));
  const [filterTenant, setFilterTenant] = useState<string | null>(null);
  const [filterAction, setFilterAction] = useState<string>('all');
  const [tab, setTab] = useState('feed');

  const [tenants, setTenants] = useState<TenantLite[]>([]);
  const [summary, setSummary] = useState<AuditSummary | null>(null);
  const [feed, setFeed] = useState<FeedEntry[] | null>(null);
  const [feedPage, setFeedPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  // Lista de terreiros do filtro — resposta é um array simples.
  useEffect(() => {
    apiClient
      .get<TenantLite[]>('/api/v1/platform/tenants', { params: { limit: 1000 } })
      .then((res) => setTenants(Array.isArray(res.data) ? res.data : []))
      .catch(() => setTenants([]));
  }, []);

  const validRange = Boolean(startDate && endDate && startDate <= endDate);

  const fetchAll = useCallback(
    async (page: number) => {
      if (!validRange) return;
      setLoading(true);
      setError(null);
      const base = { start_date: startDate, end_date: endDate };
      const feedParams: Record<string, string | number> = { ...base, skip: page * FEED_LIMIT, limit: FEED_LIMIT };
      if (filterTenant) feedParams.tenant_id = filterTenant;
      if (filterAction !== 'all') feedParams.action = filterAction;
      try {
        const [summaryRes, feedRes] = await Promise.all([
          apiClient.get<AuditSummary>('/api/v1/platform/audit-logs', { params: base }),
          apiClient.get<FeedEntry[]>('/api/v1/platform/audit-logs/feed', { params: feedParams }),
        ]);
        setSummary(summaryRes.data);
        setFeed(Array.isArray(feedRes.data) ? feedRes.data : []);
        setFeedPage(page);
      } catch (err) {
        setError(extractApiErrorMessage(err, 'Falha ao carregar dados de auditoria.'));
        setFeed([]);
      } finally {
        setLoading(false);
      }
    },
    [validRange, startDate, endDate, filterTenant, filterAction],
  );

  // Filtros reativos (com debounce para digitação de datas).
  useEffect(() => {
    const t = setTimeout(() => fetchAll(0), DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [fetchAll]);

  const handleExport = async () => {
    setExporting(true);
    try {
      const params: Record<string, string | number> = { start_date: startDate, end_date: endDate, skip: 0, limit: 500 };
      if (filterTenant) params.tenant_id = filterTenant;
      if (filterAction !== 'all') params.action = filterAction;
      const resp = await apiClient.get<FeedEntry[]>('/api/v1/platform/audit-logs/feed', { params });
      const data = Array.isArray(resp.data) ? resp.data : [];
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `auditoria_${startDate}_${endDate}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`Exportação concluída: ${data.length} evento${data.length === 1 ? '' : 's'}.`);
    } catch (err) {
      toast.error(extractApiErrorMessage(err, 'Falha ao exportar os logs.'));
    } finally {
      setExporting(false);
    }
  };

  // ── Derivações ──
  const tenantOptions = useMemo(() => tenants.map((t) => ({ value: t.id, label: t.name, description: t.slug, keywords: [t.slug] })), [tenants]);
  const tenantNameById = useMemo(() => Object.fromEntries(tenants.map((t) => [t.id, t.name])), [tenants]);

  const activeTenantsCount = summary ? Object.keys(summary.by_tenant ?? {}).filter((id) => id && id !== 'None').length : 0;
  const mostCommonAction = summary?.statistics?.most_common_action ?? null;
  const mostActiveTenantId = summary?.statistics?.most_active_tenant ?? null;
  const mostActiveTenantName =
    summary?.statistics?.most_active_tenant_name ??
    (mostActiveTenantId && mostActiveTenantId !== 'None' ? tenantNameById[mostActiveTenantId] ?? `${mostActiveTenantId.slice(0, 8)}…` : null);

  const byTenantRows = useMemo(() => {
    if (!summary) return [];
    return Object.entries(summary.by_tenant ?? {})
      .map(([id, count]) => {
        const isNone = !id || id === 'None';
        return {
          id,
          isNone,
          name: isNone ? 'Plataforma' : summary.by_tenant_name?.[id] ?? tenantNameById[id] ?? `${id.slice(0, 8)}…`,
          slug: isNone ? '' : summary.by_tenant_slug?.[id] ?? tenants.find((t) => t.id === id)?.slug ?? '',
          count,
        };
      })
      .sort((a, b) => b.count - a.count);
  }, [summary, tenantNameById, tenants]);
  const maxTenantCount = byTenantRows[0]?.count ?? 1;

  const byActionRows = useMemo(
    () => (summary ? Object.entries(summary.by_action ?? {}).map(([action, count]) => ({ action, count })).sort((a, b) => b.count - a.count) : []),
    [summary],
  );
  const totalActions = byActionRows.reduce((s, r) => s + r.count, 0) || 1;

  return (
    <PlatformLayout title="Auditoria">
      <div data-tour="audit-cons-header">
        <PageHeader
          title="Auditoria consolidada"
          subtitle="Compliance e segurança em todos os terreiros."
          actions={
            <>
              <Button variant="outline" size="sm" onClick={() => fetchAll(feedPage)} disabled={loading || !validRange}>
                <RefreshCw className={loading ? 'animate-spin' : undefined} /> Atualizar
              </Button>
              <Button size="sm" onClick={handleExport} disabled={exporting || !validRange}>
                <Download /> {exporting ? 'Exportando…' : 'Exportar JSON'}
              </Button>
            </>
          }
        />
      </div>

      {/* Filtros */}
      <div data-tour="audit-cons-filtros" className="mb-4 grid gap-2 rounded-xl border bg-card p-3 sm:grid-cols-2 lg:grid-cols-4" role="search" aria-label="Filtros de auditoria">
        <TextField label="De" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} size="small" max={endDate || undefined} />
        <TextField
          label="Até"
          type="date"
          value={endDate}
          onChange={(e) => setEndDate(e.target.value)}
          size="small"
          min={startDate || undefined}
          error={!validRange && startDate && endDate ? 'A data final deve ser após a inicial' : undefined}
        />
        <Combobox
          label="Terreiro"
          options={tenantOptions}
          value={filterTenant}
          onChange={setFilterTenant}
          placeholder="Todos"
          searchPlaceholder="Nome ou slug…"
          emptyText="Nenhum terreiro"
          clearable
          size="small"
        />
        <div className="grid gap-1">
          <Label htmlFor="filter-action" className="text-xs text-muted-foreground">Ação</Label>
          <Select value={filterAction} onValueChange={setFilterAction}>
            <SelectTrigger id="filter-action" size="sm" className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas</SelectItem>
              {ACTION_OPTIONS.map((a) => <SelectItem key={a} value={a}>{actionLabel(a)}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      {error && (
        <Alert variant="destructive" className="mb-4"><AlertDescription>{error}</AlertDescription></Alert>
      )}

      {/* KPIs */}
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard label="Total de eventos" value={(summary?.total ?? 0).toLocaleString('pt-BR')} icon={<ShieldCheck />} color="var(--primary-text)" loading={loading && !summary} />
        <KpiCard label="Terreiros ativos" value={activeTenantsCount} icon={<Building2 />} color="var(--info)" loading={loading && !summary} />
        <KpiCard label="Ação mais comum" value={mostCommonAction ? actionLabel(mostCommonAction) : '—'} icon={<Zap />} color="var(--warning)" loading={loading && !summary} />
        <KpiCard label="Terreiro mais ativo" value={mostActiveTenantName ?? '—'} icon={<Activity />} color="var(--success)" loading={loading && !summary} />
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList data-tour="audit-cons-tabs" className="mb-3 h-auto w-full flex-wrap justify-start">
          <TabsTrigger value="feed"><ScrollText /> Atividade recente</TabsTrigger>
          <TabsTrigger value="tenant"><Building2 /> Por terreiro</TabsTrigger>
          <TabsTrigger value="action"><Zap /> Por ação</TabsTrigger>
        </TabsList>

        <TabsContent value="feed">
          <div className="rounded-xl border bg-card">
            <AuditFeedTable entries={feed ?? []} loading={loading || feed === null} />
          </div>
          {(feed?.length ?? 0) > 0 && (
            <nav className="mt-3 flex items-center justify-center gap-3 text-sm" aria-label="Paginação do feed">
              <Button variant="outline" size="sm" disabled={feedPage === 0 || loading} onClick={() => fetchAll(feedPage - 1)}>Anterior</Button>
              <span className="text-muted-foreground">Página {feedPage + 1}</span>
              <Button variant="outline" size="sm" disabled={(feed?.length ?? 0) < FEED_LIMIT || loading} onClick={() => fetchAll(feedPage + 1)}>Próxima</Button>
            </nav>
          )}
        </TabsContent>

        <TabsContent value="tenant">
          <div className="overflow-x-auto rounded-xl border bg-card">
            {byTenantRows.length === 0 && !loading ? (
              <EmptyState compact icon={<Building2 />} title="Sem dados no período selecionado." />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="w-10">#</TableHead>
                    <TableHead>Terreiro</TableHead>
                    <TableHead className="text-right">Eventos</TableHead>
                    <TableHead className="min-w-[200px]">Proporção</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {byTenantRows.map((row, idx) => (
                    <TableRow key={row.id || 'none'}>
                      <TableCell className="text-muted-foreground tabular-nums">{idx + 1}</TableCell>
                      <TableCell>
                        {row.isNone ? (
                          <span className="font-semibold">{row.name}</span>
                        ) : (
                          <Link href={`/platform/tenants/${row.id}`} className="font-semibold underline-offset-4 hover:underline">{row.name}</Link>
                        )}
                        {row.slug && <span className="block text-xs text-muted-foreground">{row.slug}</span>}
                      </TableCell>
                      <TableCell className="text-right font-bold tabular-nums">{row.count.toLocaleString('pt-BR')}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Progress value={(row.count / maxTenantCount) * 100} className="h-2 flex-1" aria-label={`${row.name}: ${row.count} eventos`} />
                          <span className="min-w-10 text-xs tabular-nums">{((row.count / totalActions) * 100).toFixed(1)}%</span>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        </TabsContent>

        <TabsContent value="action">
          <div className="overflow-x-auto rounded-xl border bg-card">
            {byActionRows.length === 0 && !loading ? (
              <EmptyState compact icon={<Zap />} title="Sem dados no período selecionado." />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead>Ação</TableHead>
                    <TableHead className="text-right">Eventos</TableHead>
                    <TableHead className="min-w-[200px]">Proporção</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {byActionRows.map((row) => (
                    <TableRow key={row.action}>
                      <TableCell><ActionBadge action={row.action} /></TableCell>
                      <TableCell className="text-right font-bold tabular-nums">{row.count.toLocaleString('pt-BR')}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Progress value={(row.count / totalActions) * 100} className="h-2 flex-1" aria-label={`${actionLabel(row.action)}: ${row.count} eventos`} />
                          <span className="min-w-10 text-xs tabular-nums">{((row.count / totalActions) * 100).toFixed(1)}%</span>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </PlatformLayout>
  );
};

export default AuditConsolidatedPage;
