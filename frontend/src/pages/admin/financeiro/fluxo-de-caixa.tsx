/**
 * Admin Financeiro — Fluxo de Caixa.
 *
 * Presets de período (ToggleGroup) + intervalo personalizado (DateField duplo), KPIs, um gráfico
 * combinado (recebido × pago + saldo acumulado), tabela mensal e exportação em PDF (prévia em
 * Dialog). "Hoje" é sempre no fuso de Brasília (`lib/dateBr`).
 */
'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { ArrowDownToLine, ArrowUpFromLine, Download, FileText, Loader2, RefreshCw, Scale, Wallet } from 'lucide-react';
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from 'recharts';
import AdminLayout from '../admin_layout';
import { useSubscription } from '../../../hooks/useSubscription';
import { usePermissions } from '../../../hooks/usePermissions';
import { useProfile } from '../../../hooks/useProfile';
import { useTenant } from '@/providers/ThemeProvider';
import { apiClient } from '../../../services/api_client';
import { useSnackbar } from '../../../contexts/SnackbarContext';
import { RelatorioFluxoCaixaPDF } from '@/components/financeiro/RelatorioFluxoCaixaPDF';
import { DataTable } from '@/components/admin/DataTable';
import { KpiCard } from '@/components/admin/KpiCard';
import { PageHeader } from '@/components/admin/PageHeader';
import { ChartCard } from '@/components/charts/ChartCard';
import { PermissionDenied, PlanLocked } from '@/components/gates';
import { DateField } from '@/components/fields';
import { chartTokens, chartTooltipStyle } from '@/lib/chartTokens';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { addDaysIso, addMonthsYm, brDateParts, formatBRL, formatDateBr, formatDateTimeBr, monthRangeIso, todayBr } from '@/lib/dateBr';
import { minPlanFor } from '@/constants/plans';

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface FluxoMes {
  ano: number;
  mes: number;
  mes_label: string;
  receitas: number;
  despesas: number;
  saldo: number;
  saldo_acumulado: number;
  a_receber: number;
  a_pagar: number;
}

type Preset = 'mes_atual' | 'mes_anterior' | 'ultimos_90' | 'personalizado';

interface Periodo {
  preset: Preset;
  inicio: string; // ISO YYYY-MM-DD
  fim: string;
}

const PRESETS: { key: Preset; label: string }[] = [
  { key: 'mes_atual', label: 'Mês atual' },
  { key: 'mes_anterior', label: 'Mês anterior' },
  { key: 'ultimos_90', label: 'Últimos 90 dias' },
  { key: 'personalizado', label: 'Personalizado' },
];

export function presetRange(preset: Exclude<Preset, 'personalizado'>, hoje: string = todayBr()): { inicio: string; fim: string } {
  const ym = hoje.slice(0, 7);
  switch (preset) {
    case 'mes_atual': {
      const { start, end } = monthRangeIso(ym);
      return { inicio: start, fim: end };
    }
    case 'mes_anterior': {
      const { start, end } = monthRangeIso(addMonthsYm(ym, -1));
      return { inicio: start, fim: end };
    }
    case 'ultimos_90':
      return { inicio: addDaysIso(hoje, -89), fim: hoje };
  }
}

const fmtShort = (v: number) => {
  const abs = Math.abs(v);
  if (abs >= 1000) return `${(v / 1000).toFixed(1)}k`;
  return String(Math.round(v));
};

// ─── Projeção (regressão linear simples) — alimenta o PDF e uma linha de texto ─

interface RegressionResult { slope: number; intercept: number; r2: number }

function linearRegression(ys: number[]): RegressionResult {
  const n = ys.length;
  const xs = ys.map((_, i) => i);
  const meanX = xs.reduce((a, b) => a + b, 0) / n;
  const meanY = ys.reduce((a, b) => a + b, 0) / n;
  const ssXX = xs.reduce((a, x) => a + (x - meanX) ** 2, 0);
  const ssXY = xs.reduce((a, x, i) => a + (x - meanX) * (ys[i] - meanY), 0);
  const ssYY = ys.reduce((a, y) => a + (y - meanY) ** 2, 0);
  const slope = ssXX === 0 ? 0 : ssXY / ssXX;
  const intercept = meanY - slope * meanX;
  const r2 = ssYY === 0 ? 1 : ssXY ** 2 / (ssXX * ssYY);
  return { slope, intercept, r2 };
}

function nextMonthLabel(last: FluxoMes, delta: number): string {
  const labels = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
  const total = last.ano * 12 + last.mes - 1 + delta;
  return `${labels[total % 12]}/${String(Math.floor(total / 12)).slice(2)}`;
}

const PROJ_MESES = 3;

function buildProjecao(dados: FluxoMes[]): { reg: RegressionResult | null; projecoes: { mes_label: string; valor: number }[] } {
  if (dados.length < 2) return { reg: null, projecoes: [] };
  const reg = linearRegression(dados.map((d) => d.saldo));
  const n = dados.length;
  let acum = dados[n - 1].saldo_acumulado;
  const projecoes: { mes_label: string; valor: number }[] = [];
  for (let i = 1; i <= PROJ_MESES; i++) {
    acum += reg.intercept + reg.slope * (n - 1 + i);
    projecoes.push({ mes_label: nextMonthLabel(dados[n - 1], i), valor: Math.round(acum * 100) / 100 });
  }
  return { reg, projecoes };
}

// ─── Página ───────────────────────────────────────────────────────────────────

export default function FluxoDeCaixaPage() {
  return (
    <AdminLayout title="Fluxo de Caixa">
      <FluxoDeCaixaContent />
    </AdminLayout>
  );
}

function FluxoDeCaixaContent() {
  const { can } = useSubscription();
  const { can: canGroup } = usePermissions();
  const { tenantName, logoUrl } = useTenant();
  const { profile } = useProfile();
  const { showError } = useSnackbar();

  const planAllows = can('contas_financeiras');
  const canView = canGroup('contas_financeiras', 'view');

  const [dados, setDados] = useState<FluxoMes[]>([]);
  const [loading, setLoading] = useState(true);
  const [periodo, setPeriodo] = useState<Periodo>(() => ({ preset: 'mes_atual', ...presetRange('mes_atual') }));

  const [pdfOpen, setPdfOpen] = useState(false);
  const [pdfExporting, setPdfExporting] = useState(false);
  const [logoBase64, setLogoBase64] = useState<string | null>(null);
  const relatorioRef = useRef<HTMLDivElement>(null);

  const fetchAll = useCallback(async () => {
    if (!planAllows || !canView) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const res = await apiClient.get<FluxoMes[]>('/api/v1/admin/financeiro/fluxo-de-caixa', {
        params: { data_inicio: periodo.inicio, data_fim: periodo.fim },
      });
      setDados(res.data);
    } catch {
      showError('Erro ao carregar o fluxo de caixa.');
      setDados([]);
    } finally {
      setLoading(false);
    }
  }, [planAllows, canView, periodo.inicio, periodo.fim, showError]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const handlePreset = (key: Preset) => {
    if (key === 'personalizado') {
      setPeriodo((p) => ({ ...p, preset: 'personalizado' }));
      return;
    }
    setPeriodo({ preset: key, ...presetRange(key) });
  };

  // ── PDF ────────────────────────────────────────────────────────────────────

  const openPdfPreview = useCallback(async () => {
    if (logoUrl) {
      try {
        const resp = await fetch(logoUrl);
        const blob = await resp.blob();
        const reader = new FileReader();
        reader.onloadend = () => setLogoBase64(reader.result as string);
        reader.readAsDataURL(blob);
      } catch {
        setLogoBase64(null);
      }
    }
    setPdfOpen(true);
  }, [logoUrl]);

  const handleExportPdf = useCallback(async () => {
    if (!relatorioRef.current) return;
    setPdfExporting(true);
    try {
      const html2canvas = (await import('html2canvas')).default;
      const jsPDF = (await import('jspdf')).default;
      const canvas = await html2canvas(relatorioRef.current, {
        scale: 2,
        useCORS: true,
        allowTaint: false,
        backgroundColor: '#FFFFFF',
        logging: false,
      });
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();
      const imgH = (canvas.height * pageW) / canvas.width;
      if (imgH <= pageH + 1) {
        pdf.addImage(imgData, 'PNG', 0, 0, pageW, imgH);
      } else {
        let posY = 0;
        while (posY < imgH) {
          if (posY > 0) pdf.addPage();
          pdf.addImage(imgData, 'PNG', 0, -posY, pageW, imgH);
          posY += pageH;
        }
      }
      const ym = (iso: string) => iso.slice(0, 7).replace('-', '');
      pdf.save(`relatorio-fluxo-caixa-${ym(periodo.inicio)}-${ym(periodo.fim)}.pdf`);
    } catch {
      showError('Não foi possível gerar o PDF.');
    } finally {
      setPdfExporting(false);
    }
  }, [periodo, showError]);

  // ── Derivados ──────────────────────────────────────────────────────────────

  const totalReceitas = dados.reduce((s, d) => s + d.receitas, 0);
  const totalDespesas = dados.reduce((s, d) => s + d.despesas, 0);
  const saldoAtual = dados[dados.length - 1]?.saldo_acumulado ?? 0;
  const pendenteLiquido = dados.reduce((s, d) => s + d.a_receber - d.a_pagar, 0);
  const { reg: projReg, projecoes } = useMemo(() => buildProjecao(dados), [dados]);

  const hojeParts = brDateParts();
  const isCurrentMonth = (d: FluxoMes) => d.ano === hojeParts.year && d.mes === hojeParts.month;

  const columns = useMemo<ColumnDef<FluxoMes>[]>(
    () => [
      {
        accessorKey: 'mes_label',
        header: 'Mês',
        enableSorting: false,
        cell: ({ row }) => (
          <span className="flex items-center gap-2 font-medium">
            {row.original.mes_label}
            {isCurrentMonth(row.original) && <Badge className="text-[0.65rem]">atual</Badge>}
          </span>
        ),
      },
      { accessorKey: 'receitas', header: 'Recebido', meta: { align: 'right' }, cell: ({ getValue }) => <span className="text-success">{formatBRL(getValue<number>())}</span> },
      { accessorKey: 'despesas', header: 'Pago', meta: { align: 'right' }, cell: ({ getValue }) => <span className="text-warning">{formatBRL(getValue<number>())}</span> },
      {
        accessorKey: 'saldo',
        header: 'Saldo do mês',
        meta: { align: 'right' },
        cell: ({ getValue }) => {
          const v = getValue<number>();
          return <span className={`font-semibold ${v >= 0 ? 'text-success' : 'text-destructive'}`}>{v >= 0 ? '+' : ''}{formatBRL(v)}</span>;
        },
      },
      { accessorKey: 'saldo_acumulado', header: 'Saldo acumulado', meta: { align: 'right' }, cell: ({ getValue }) => <span className="font-medium">{formatBRL(getValue<number>())}</span> },
      { accessorKey: 'a_receber', header: 'A receber', meta: { align: 'right' }, cell: ({ getValue }) => <span className="text-muted-foreground">{getValue<number>() > 0 ? formatBRL(getValue<number>()) : '—'}</span> },
      { accessorKey: 'a_pagar', header: 'A pagar', meta: { align: 'right' }, cell: ({ getValue }) => <span className="text-muted-foreground">{getValue<number>() > 0 ? formatBRL(getValue<number>()) : '—'}</span> },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [hojeParts.year, hojeParts.month],
  );

  const renderCard = (d: FluxoMes) => (
    <div className="flex flex-col gap-2 p-3">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-2 font-medium">
          {d.mes_label}
          {isCurrentMonth(d) && <Badge className="text-[0.65rem]">atual</Badge>}
        </span>
        <span className={`font-semibold ${d.saldo >= 0 ? 'text-success' : 'text-destructive'}`}>
          {d.saldo >= 0 ? '+' : ''}
          {formatBRL(d.saldo)}
        </span>
      </div>
      <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
        <dt className="text-muted-foreground">Recebido</dt>
        <dd className="text-right text-success">{formatBRL(d.receitas)}</dd>
        <dt className="text-muted-foreground">Pago</dt>
        <dd className="text-right text-warning">{formatBRL(d.despesas)}</dd>
        <dt className="text-muted-foreground">Acumulado</dt>
        <dd className="text-right font-medium">{formatBRL(d.saldo_acumulado)}</dd>
        {(d.a_receber > 0 || d.a_pagar > 0) && (
          <>
            <dt className="text-muted-foreground">Pendentes</dt>
            <dd className="text-right text-muted-foreground">
              +{formatBRL(d.a_receber)} / −{formatBRL(d.a_pagar)}
            </dd>
          </>
        )}
      </dl>
    </div>
  );

  // ── Gates ──────────────────────────────────────────────────────────────────

  if (!planAllows) return <PlanLocked feature="Fluxo de Caixa" minPlan={minPlanFor('contas_financeiras').label} />;
  if (!canView) return <PermissionDenied message="Você não tem permissão para visualizar o fluxo de caixa." />;

  const tabela = [...dados].reverse();

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Fluxo de Caixa"
        subtitle="Evolução de receitas, despesas e saldo acumulado"
        actions={
          <>
            <Button variant="outline" onClick={fetchAll} disabled={loading} aria-label="Atualizar">
              <RefreshCw className={loading ? 'animate-spin' : undefined} />
              <span className="hidden sm:inline">Atualizar</span>
            </Button>
            <Button variant="outline" onClick={openPdfPreview} disabled={loading || dados.length === 0}>
              <FileText />
              Exportar PDF
            </Button>
          </>
        }
      />

      <div className="flex flex-col gap-3 md:flex-row md:flex-wrap md:items-end">
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
        <KpiCard label="Saldo acumulado" value={formatBRL(saldoAtual)} icon={<Wallet />} color={saldoAtual >= 0 ? 'var(--success)' : 'var(--destructive)'} subtitle="no período" loading={loading} />
        <KpiCard label="Recebido" value={formatBRL(totalReceitas)} icon={<ArrowDownToLine />} color="var(--info)" subtitle="realizado" loading={loading} />
        <KpiCard label="Pago" value={formatBRL(totalDespesas)} icon={<ArrowUpFromLine />} color="var(--warning)" subtitle="realizado" loading={loading} />
        <KpiCard label="Pendentes (líquido)" value={formatBRL(pendenteLiquido)} icon={<Scale />} color={pendenteLiquido >= 0 ? 'var(--success)' : 'var(--destructive)'} subtitle="a receber − a pagar" loading={loading} />
      </div>

      <ChartCard
        title="Recebido × pago e saldo acumulado"
        subtitle="Por mês, no período selecionado"
        loading={loading}
        empty={!loading && dados.length === 0}
        emptyMessage="Sem lançamentos no período."
        height={280}
        footer={
          !loading && projReg && projecoes.length > 0 ? (
            <p className="text-xs text-muted-foreground">
              Tendência (regressão linear sobre os saldos mensais, R² {(projReg.r2 * 100).toFixed(0)}%): saldo acumulado
              projetado em {projecoes[PROJ_MESES - 1].mes_label} de{' '}
              <strong className="text-foreground">{formatBRL(projecoes[PROJ_MESES - 1].valor)}</strong>. Referência
              indicativa — não considera sazonalidade nem lançamentos futuros.
            </p>
          ) : !loading && dados.length > 0 && dados.length < 2 ? (
            <p className="text-xs text-muted-foreground">São necessários ao menos 2 meses de dados para estimar a tendência.</p>
          ) : undefined
        }
      >
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={dados} barCategoryGap="30%" barGap={3} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid stroke={chartTokens.grid} vertical={false} />
            <XAxis dataKey="mes_label" tick={{ fontSize: 11, fill: chartTokens.tick }} axisLine={false} tickLine={false} />
            <YAxis tickFormatter={fmtShort} tick={{ fontSize: 10, fill: chartTokens.tick }} axisLine={false} tickLine={false} width={44} />
            <ReferenceLine y={0} stroke={chartTokens.border} strokeDasharray="4 2" />
            <RechartsTooltip
              contentStyle={chartTooltipStyle}
              formatter={(v: number, name: string) => [
                formatBRL(v),
                name === 'receitas' ? 'Recebido' : name === 'despesas' ? 'Pago' : 'Saldo acumulado',
              ]}
            />
            <Legend
              formatter={(v) => (v === 'receitas' ? 'Recebido' : v === 'despesas' ? 'Pago' : 'Saldo acumulado')}
              wrapperStyle={{ fontSize: 12 }}
            />
            <Bar dataKey="receitas" name="receitas" fill={chartTokens.info} radius={[4, 4, 0, 0]} maxBarSize={28} />
            <Bar dataKey="despesas" name="despesas" fill={chartTokens.warning} radius={[4, 4, 0, 0]} maxBarSize={28} />
            <Line type="monotone" dataKey="saldo_acumulado" name="saldo_acumulado" stroke={chartTokens.primary} strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} />
          </ComposedChart>
        </ResponsiveContainer>
      </ChartCard>

      <DataTable
        columns={columns}
        data={tabela}
        getRowId={(d) => `${d.ano}-${d.mes}`}
        loading={loading}
        renderCard={renderCard}
        emptyMessage="Sem dados no período."
      />

      <Dialog open={pdfOpen} onOpenChange={setPdfOpen}>
        <DialogContent className="flex max-h-[95vh] flex-col gap-0 p-0 sm:max-w-[900px]">
          <DialogHeader className="border-b px-6 py-4">
            <DialogTitle>Prévia do relatório — Fluxo de Caixa</DialogTitle>
            <DialogDescription>
              {formatDateBr(periodo.inicio)} – {formatDateBr(periodo.fim)}
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-auto bg-muted p-4">
            <div className="flex justify-center">
              <RelatorioFluxoCaixaPDF
                ref={relatorioRef}
                dados={dados}
                projecoes={projecoes}
                r2={projReg?.r2 ?? null}
                periodo={{ inicio: formatDateBr(periodo.inicio), fim: formatDateBr(periodo.fim) }}
                tenantName={tenantName ?? 'Meu Terreiro'}
                logoUrl={logoUrl}
                logoBase64={logoBase64}
                geradoPor={profile?.full_name ?? profile?.username ?? profile?.email ?? 'Usuário'}
                geradoEm={formatDateTimeBr(new Date().toISOString()).replace(',', ' às')}
              />
            </div>
          </div>
          <DialogFooter className="border-t px-6 py-3">
            <Button variant="outline" onClick={() => setPdfOpen(false)}>
              Fechar
            </Button>
            <Button onClick={handleExportPdf} disabled={pdfExporting}>
              {pdfExporting ? <Loader2 className="animate-spin" /> : <Download />}
              {pdfExporting ? 'Gerando PDF…' : 'Baixar PDF'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
