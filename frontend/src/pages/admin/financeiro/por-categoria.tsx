/**
 * Admin Financeiro — Por categoria.
 *
 * Quanto entrou e saiu em cada categoria no período (`GET /financeiro/por-categoria`): presets de
 * período iguais aos do Fluxo de caixa, KPIs, Entradas/Saídas (ToggleGroup, `?lado=`), gráfico de
 * barras por categoria e tabela (com o realizado mês a mês quando o período tem até 12 meses).
 * Relatório: "Baixar PDF" (`lib/pdf/porCategoriaPdf`, base dos PDFs de listagem) e "Exportar CSV".
 *
 * Mesmas regras do Fluxo de caixa, para os totais baterem: realizado pela data de pagamento e em
 * aberto pelo vencimento. `?inicio=&fim=` abre num período (link do Fluxo de caixa e Lançamentos).
 */
'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import type { ColumnDef } from '@tanstack/react-table';
import { ArrowDownToLine, ArrowUpFromLine, FileDown, FileText, Loader2, RefreshCw, Scale, Tags } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip as RechartsTooltip, XAxis, YAxis } from 'recharts';
import AdminLayout from '../admin_layout';
import { useSubscription } from '../../../hooks/useSubscription';
import { usePermissions } from '../../../hooks/usePermissions';
import { useTenant } from '@/providers/ThemeProvider';
import { apiClient } from '../../../services/api_client';
import { useSnackbar } from '../../../contexts/SnackbarContext';
import { DataTable } from '@/components/admin/DataTable';
import { KpiCard } from '@/components/admin/KpiCard';
import { PageHeader } from '@/components/admin/PageHeader';
import { ChartCard } from '@/components/charts/ChartCard';
import { PermissionDenied, PlanLocked } from '@/components/gates';
import { DateField } from '@/components/fields';
import { chartTokens, chartTooltipStyle } from '@/lib/chartTokens';
import { Button } from '@/components/ui/button';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { formatBRL, formatDateBr, todayBr } from '@/lib/dateBr';
import { minPlanFor } from '@/constants/plans';
import {
  ROTULO_LADO,
  corDaCategoria,
  porCategoriaCsv,
  totaisDoLado,
  type CategoriaTotal,
  type LadoCategoria,
  type PorCategoriaResponse,
} from '@/lib/financeiroPorCategoria';
import { gerarPorCategoriaPdf } from '@/lib/pdf/porCategoriaPdf';
import { presetRange } from './fluxo-de-caixa';

type Preset = 'mes_atual' | 'mes_anterior' | 'ultimos_90' | 'personalizado';

const PRESETS: { key: Preset; label: string }[] = [
  { key: 'mes_atual', label: 'Mês atual' },
  { key: 'mes_anterior', label: 'Mês anterior' },
  { key: 'ultimos_90', label: 'Últimos 90 dias' },
  { key: 'personalizado', label: 'Personalizado' },
];

/** Até quantos meses a tabela da tela mostra uma coluna por mês (o PDF mostra sempre). */
const MAX_MESES_NA_TABELA = 12;

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const ladoDaQuery = (v: unknown): LadoCategoria => (v === 'despesas' ? 'despesas' : 'receitas');

const fmtShort = (v: number) => (Math.abs(v) >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(Math.round(v)));

export default function PorCategoriaPage() {
  return (
    <AdminLayout title="Financeiro por categoria">
      <PorCategoriaContent />
    </AdminLayout>
  );
}

function PorCategoriaContent() {
  const router = useRouter();
  const { can } = useSubscription();
  const { can: canGroup } = usePermissions();
  const { tenantName, logoUrl, config } = useTenant();
  const { showError } = useSnackbar();

  const planAllows = can('contas_financeiras');
  const canView = canGroup('contas_financeiras', 'view');

  const [periodo, setPeriodo] = useState<{ preset: Preset; inicio: string; fim: string }>(() => ({
    preset: 'mes_atual',
    ...presetRange('mes_atual'),
  }));
  const [dados, setDados] = useState<PorCategoriaResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [gerandoPdf, setGerandoPdf] = useState(false);
  const [pronto, setPronto] = useState(false);

  const lado = ladoDaQuery(router.query.lado);
  const rot = ROTULO_LADO[lado];
  const setLado = (next: LadoCategoria) => {
    if (next === lado) return;
    router.replace({ pathname: router.pathname, query: { ...router.query, lado: next } }, undefined, { shallow: true });
  };

  // Período vindo do link (Fluxo de caixa / Lançamentos): lido uma vez, quando a rota fica pronta.
  useEffect(() => {
    if (!router.isReady || pronto) return;
    const { inicio, fim } = router.query;
    if (typeof inicio === 'string' && typeof fim === 'string' && ISO.test(inicio) && ISO.test(fim) && inicio <= fim) {
      setPeriodo({ preset: 'personalizado', inicio, fim });
    }
    setPronto(true);
  }, [router.isReady, router.query, pronto]);

  const fetchDados = useCallback(async () => {
    if (!planAllows || !canView) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const res = await apiClient.get<PorCategoriaResponse>('/api/v1/admin/financeiro/por-categoria', {
        params: { data_inicio: periodo.inicio, data_fim: periodo.fim },
      });
      setDados(res.data);
    } catch {
      showError('Erro ao carregar o financeiro por categoria.');
      setDados(null);
    } finally {
      setLoading(false);
    }
  }, [planAllows, canView, periodo.inicio, periodo.fim, showError]);

  useEffect(() => {
    if (!pronto) return;
    fetchDados();
  }, [pronto, fetchDados]);

  const handlePreset = (key: Preset) => {
    if (key === 'personalizado') {
      setPeriodo((p) => ({ ...p, preset: 'personalizado' }));
      return;
    }
    setPeriodo({ preset: key, ...presetRange(key) });
  };

  // ── Exportar ───────────────────────────────────────────────────────────────

  const baixarPdf = async () => {
    if (!dados) return;
    setGerandoPdf(true);
    try {
      await gerarPorCategoriaPdf(dados, {
        nome: tenantName ?? 'Terreiro',
        logoUrl: logoUrl ?? undefined,
        primaryColor: config?.colors?.primary ?? '#15803d',
      });
    } catch {
      showError('Não foi possível gerar o PDF.');
    } finally {
      setGerandoPdf(false);
    }
  };

  const exportarCsv = () => {
    if (!dados) return;
    const blob = new Blob(['﻿' + porCategoriaCsv(dados)], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `financeiro-por-categoria-${dados.data_inicio}-a-${dados.data_fim}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  // ── Derivados ──────────────────────────────────────────────────────────────

  const itens = useMemo(() => dados?.[lado] ?? [], [dados, lado]);
  const cores = useMemo(() => itens.map((c, i) => corDaCategoria(c, i)), [itens]);
  const meses = useMemo(() => dados?.meses ?? [], [dados]);
  const mostrarMeses = meses.length > 1 && meses.length <= MAX_MESES_NA_TABELA;
  const totais = dados ? totaisDoLado(dados, lado) : null;
  const saldo = (dados?.total_receitas ?? 0) - (dados?.total_despesas ?? 0);
  const pendenteLiquido = (dados?.total_a_receber ?? 0) - (dados?.total_a_pagar ?? 0);
  const vazio = !dados || (dados.receitas.length === 0 && dados.despesas.length === 0);
  const grafico = itens.filter((c) => c.realizado > 0);

  const columns = useMemo<ColumnDef<CategoriaTotal>[]>(() => {
    const base: ColumnDef<CategoriaTotal>[] = [
      {
        accessorKey: 'nome',
        header: 'Categoria',
        cell: ({ row }) => (
          <span className="flex items-center gap-2 font-medium">
            <span aria-hidden className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: cores[row.index] }} />
            <span className={row.original.categoria_id === null ? 'text-muted-foreground' : undefined}>{row.original.nome}</span>
          </span>
        ),
      },
      {
        accessorKey: 'qtd_realizado',
        header: 'Lançamentos',
        meta: { align: 'right' },
        cell: ({ getValue }) => <span className="tabular-nums text-muted-foreground">{getValue<number>()}</span>,
      },
      {
        accessorKey: 'realizado',
        header: rot.realizado,
        meta: { align: 'right' },
        cell: ({ getValue }) => (
          <span className={`font-semibold tabular-nums ${lado === 'receitas' ? 'text-success' : 'text-warning'}`}>
            {formatBRL(getValue<number>())}
          </span>
        ),
      },
      {
        accessorKey: 'percentual',
        header: '% do total',
        meta: { align: 'right' },
        cell: ({ getValue }) => <span className="tabular-nums">{getValue<number>().toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%</span>,
      },
      {
        accessorKey: 'em_aberto',
        header: rot.emAberto,
        meta: { align: 'right' },
        cell: ({ getValue }) => <span className="tabular-nums text-muted-foreground">{getValue<number>() > 0 ? formatBRL(getValue<number>()) : '—'}</span>,
      },
    ];
    if (!mostrarMeses) return base;
    return [
      ...base,
      ...meses.map<ColumnDef<CategoriaTotal>>((m, i) => ({
        id: `mes-${m.ano}-${m.mes}`,
        accessorFn: (c) => c.por_mes[i] ?? 0,
        header: m.mes_label,
        meta: { align: 'right' },
        cell: ({ getValue }) => <span className="tabular-nums text-muted-foreground">{getValue<number>() ? formatBRL(getValue<number>()) : '—'}</span>,
      })),
    ];
  }, [cores, lado, rot.realizado, rot.emAberto, mostrarMeses, meses]);

  const renderCard = (c: CategoriaTotal) => {
    const i = itens.indexOf(c);
    return (
      <div className="flex flex-col gap-1.5 p-3">
        <div className="flex items-center justify-between gap-2">
          <span className="flex min-w-0 items-center gap-2 font-medium">
            <span aria-hidden className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: cores[i] }} />
            <span className="truncate">{c.nome}</span>
          </span>
          <span className={`font-semibold tabular-nums ${lado === 'receitas' ? 'text-success' : 'text-warning'}`}>{formatBRL(c.realizado)}</span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-muted">
          <div className="h-full rounded-full" style={{ width: `${Math.min(c.percentual, 100)}%`, backgroundColor: cores[i] }} />
        </div>
        <p className="text-xs text-muted-foreground">
          {c.percentual.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}% · {c.qtd_realizado}{' '}
          {c.qtd_realizado === 1 ? 'lançamento' : 'lançamentos'}
          {c.em_aberto > 0 && ` · ${rot.emAberto.toLowerCase()} ${formatBRL(c.em_aberto)}`}
        </p>
      </div>
    );
  };

  // ── Gates ──────────────────────────────────────────────────────────────────

  if (!planAllows) return <PlanLocked feature="Financeiro por categoria" minPlan={minPlanFor('contas_financeiras').label} />;
  if (!canView) return <PermissionDenied message="Você não tem permissão para visualizar o financeiro." />;

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        data-tour="categoria-header"
        title="Por categoria"
        subtitle="Quanto entrou e saiu em cada categoria no período"
        actions={
          <>
            <Button variant="outline" onClick={fetchDados} disabled={loading} aria-label="Atualizar">
              <RefreshCw className={loading ? 'animate-spin' : undefined} />
              <span className="hidden sm:inline">Atualizar</span>
            </Button>
            <Button variant="outline" onClick={exportarCsv} disabled={loading || vazio}>
              <FileDown />
              <span className="hidden sm:inline">Exportar CSV</span>
              <span className="sm:hidden">CSV</span>
            </Button>
            <Button variant="outline" onClick={baixarPdf} disabled={loading || vazio || gerandoPdf}>
              {gerandoPdf ? <Loader2 className="animate-spin" /> : <FileText />}
              {gerandoPdf ? 'Gerando PDF…' : 'Baixar PDF'}
            </Button>
          </>
        }
      />

      <div className="flex flex-col gap-3 md:flex-row md:flex-wrap md:items-end" data-tour="categoria-periodo">
        <ToggleGroup
          type="single"
          variant="outline"
          value={periodo.preset}
          onValueChange={(v) => v && handlePreset(v as Preset)}
          aria-label="Período"
          className="grid w-full grid-cols-2 sm:flex sm:w-auto"
        >
          {PRESETS.map(({ key, label }) => (
            <ToggleGroupItem key={key} value={key} className="px-3 text-xs sm:text-sm">
              {label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        {periodo.preset === 'personalizado' && (
          <div className="grid grid-cols-2 gap-2 sm:flex sm:items-end">
            <DateField
              label="De"
              size="small"
              value={periodo.inicio}
              max={periodo.fim}
              onChange={(iso) => iso && setPeriodo((p) => ({ ...p, preset: 'personalizado', inicio: iso }))}
              className="sm:w-40"
            />
            <DateField
              label="Até"
              size="small"
              value={periodo.fim}
              min={periodo.inicio}
              max={todayBr()}
              onChange={(iso) => iso && setPeriodo((p) => ({ ...p, preset: 'personalizado', fim: iso }))}
              className="sm:w-40"
            />
          </div>
        )}
        <span className="text-xs text-muted-foreground md:ml-auto">
          {formatDateBr(periodo.inicio)} – {formatDateBr(periodo.fim)}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard label="Recebido" value={formatBRL(dados?.total_receitas ?? 0)} icon={<ArrowDownToLine />} color="var(--info)" subtitle={`${dados?.receitas.length ?? 0} categorias`} loading={loading} />
        <KpiCard label="Pago" value={formatBRL(dados?.total_despesas ?? 0)} icon={<ArrowUpFromLine />} color="var(--warning)" subtitle={`${dados?.despesas.length ?? 0} categorias`} loading={loading} />
        <KpiCard label="Saldo do período" value={formatBRL(saldo)} icon={<Scale />} color={saldo >= 0 ? 'var(--success)' : 'var(--destructive)'} subtitle="recebido − pago" loading={loading} />
        <KpiCard label="Pendentes (líquido)" value={formatBRL(pendenteLiquido)} icon={<Tags />} color={pendenteLiquido >= 0 ? 'var(--success)' : 'var(--destructive)'} subtitle="a receber − a pagar" loading={loading} />
      </div>

      <ToggleGroup
        type="single"
        variant="outline"
        value={lado}
        onValueChange={(v) => v && setLado(v as LadoCategoria)}
        aria-label="Entradas ou saídas"
        data-tour="categoria-lado"
        className="grid w-full grid-cols-2 sm:flex sm:w-auto"
      >
        <ToggleGroupItem value="receitas" className="px-4">
          <ArrowDownToLine /> Entradas
        </ToggleGroupItem>
        <ToggleGroupItem value="despesas" className="px-4">
          <ArrowUpFromLine /> Saídas
        </ToggleGroupItem>
      </ToggleGroup>

      <div data-tour="categoria-grafico">
        <ChartCard
          title={`${rot.titulo} por categoria`}
          subtitle={`${rot.realizado} no período, pela data de pagamento`}
          loading={loading}
          empty={!loading && grafico.length === 0}
          emptyMessage={lado === 'receitas' ? 'Nada recebido no período.' : 'Nada pago no período.'}
          height={Math.max(160, grafico.length * 36 + 24)}
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={grafico} layout="vertical" margin={{ top: 4, right: 16, bottom: 0, left: 0 }}>
              <CartesianGrid stroke={chartTokens.grid} horizontal={false} />
              <XAxis type="number" tickFormatter={fmtShort} tick={{ fontSize: 10, fill: chartTokens.tick }} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="nome" width={120} tick={{ fontSize: 11, fill: chartTokens.tick }} axisLine={false} tickLine={false} />
              <RechartsTooltip contentStyle={chartTooltipStyle} formatter={(v: number) => [formatBRL(v), rot.realizado]} cursor={{ fill: 'var(--muted)' }} />
              <Bar dataKey="realizado" radius={[0, 4, 4, 0]} maxBarSize={24}>
                {grafico.map((c) => (
                  <Cell key={c.categoria_id ?? 'sem'} fill={cores[itens.indexOf(c)]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <div data-tour="categoria-tabela">
        <DataTable
          columns={columns}
          data={itens}
          getRowId={(c) => c.categoria_id ?? 'sem-categoria'}
          loading={loading}
          renderCard={renderCard}
          emptyMessage={lado === 'receitas' ? 'Nenhuma entrada no período.' : 'Nenhuma saída no período.'}
          data-testid="tabela-por-categoria"
        />
      </div>
      {totais && itens.length > 0 && (
        <p className="text-right text-sm text-muted-foreground" data-testid="total-lado">
          Total: <strong className="text-foreground">{formatBRL(totais.realizado)}</strong> em {totais.qtd}{' '}
          {totais.qtd === 1 ? 'lançamento' : 'lançamentos'}
          {totais.emAberto > 0 && ` · ${rot.emAberto.toLowerCase()} ${formatBRL(totais.emAberto)}`}
        </p>
      )}
      <p className="text-xs text-muted-foreground">
        {rot.realizado} conta pela data de pagamento e {rot.emAberto.toLowerCase()} pelo vencimento, como no Fluxo de caixa.
        Lançamentos cancelados não entram. Para dar categoria a um lançamento, edite-o em Lançamentos.
      </p>
    </div>
  );
}
