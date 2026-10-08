/**
 * Admin Financeiro — Mensalidades de médiuns e associados.
 *
 * Navegador de mês + KPIs (calculados só depois que as duas listas do mês carregaram) +
 * abas Médiuns / Associados (`CobrancaMensal`) / Histórico (gráfico).
 */
'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Wallet } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip as RechartsTooltip, XAxis, YAxis } from 'recharts';
import AdminLayout from '../admin_layout';
import { apiClient, extractApiErrorMessage } from '../../../services/api_client';
import { useSubscription } from '../../../hooks/useSubscription';
import { usePermissions } from '../../../hooks/usePermissions';
import { useSnackbar } from '../../../contexts/SnackbarContext';
import { PageHeader } from '@/components/admin/PageHeader';
import { KpiCard } from '@/components/admin/KpiCard';
import { PermissionDenied, PlanLocked } from '@/components/gates';
import { ChartCard } from '@/components/charts/ChartCard';
import { chartTokens, chartTooltipStyle } from '@/lib/chartTokens';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { MonthNavigator } from '@/components/financeiro/MonthNavigator';
import {
  CobrancaKpisGrid,
  CobrancaMensal,
  computeCobrancaKpis,
  type CobrancaItem,
  type CobrancaPagamento,
} from '@/components/financeiro/CobrancaMensal';
import { baixarComprovante, montarFormPagamento, MULTIPART } from '@/components/financeiro/comprovante';
import {
  ComprovantesParaConferir,
  ConferirComprovanteSheet,
  type ComprovanteAlvo,
} from '@/components/financeiro/ComprovantesParaConferir';
import { currentMonthBr, formatBRL, monthLabelShort } from '@/lib/dateBr';
import { minPlanFor } from '@/constants/plans';

// ─── Tipos da API ─────────────────────────────────────────────────────────────

interface MensalidadeItem {
  mediun_id: string;
  mediun_nome: string;
  mensalidade_isento: boolean;
  pagamento_id: string | null;
  status: 'PAGO' | 'PENDENTE' | 'ISENTO' | null;
  data_pagamento: string | null;
  valor_vigente: number | null;
  valor_pago: number | null;
  comprovante_filename: string | null;
  observacao: string | null;
  /** AM-12: comprovante enviado pelo médium na Área, esperando conferência. */
  comprovante_para_conferir?: boolean;
  comprovante_enviado_em?: string | null;
}

interface AssociadoMensalidadeItem {
  associado_id: string;
  associado_nome: string;
  mensalidade_isento: boolean;
  pagamento_id: string | null;
  status: 'PAGO' | 'PENDENTE' | 'ISENTO' | null;
  data_pagamento: string | null;
  valor_vigente: number | null;
  valor_pago: number | null;
  comprovante_filename: string | null;
  observacao: string | null;
}

interface Config {
  valor_mensal: number;
  dia_vencimento: number;
  ativo: boolean;
  valor_mensal_associado?: number;
  dia_vencimento_associado?: number;
  enable_mensalidade_associado?: boolean;
}

interface Resumo {
  historico: { mes: string; esperado: number; arrecadado: number; inadimplentes: number }[];
  projecao: { mes: string; projetado: number }[];
  config: { valor_mensal: number; count_ativos: number; count_isentos: number; count_pagantes: number };
}

const toCobranca = (i: MensalidadeItem): CobrancaItem => ({
  id: i.mediun_id,
  nome: i.mediun_nome,
  isentoPermanente: i.mensalidade_isento,
  status: i.status,
  data_pagamento: i.data_pagamento,
  valor_vigente: i.valor_vigente,
  valor_pago: i.valor_pago,
  comprovante_filename: i.comprovante_filename,
  observacao: i.observacao,
  comprovanteParaConferir: i.comprovante_para_conferir,
  comprovanteEnviadoEm: i.comprovante_enviado_em,
});

const assocToCobranca = (i: AssociadoMensalidadeItem): CobrancaItem => ({
  id: i.associado_id,
  nome: i.associado_nome,
  isentoPermanente: i.mensalidade_isento,
  status: i.status,
  data_pagamento: i.data_pagamento,
  valor_vigente: i.valor_vigente,
  valor_pago: i.valor_pago,
  comprovante_filename: i.comprovante_filename,
  observacao: i.observacao,
});

// ─── Página ───────────────────────────────────────────────────────────────────

export default function MensalidadesPage() {
  return (
    <AdminLayout title="Mensalidades">
      <MensalidadesContent />
    </AdminLayout>
  );
}

function MensalidadesContent() {
  const { can } = useSubscription();
  const { can: canGroup } = usePermissions();
  const { showError } = useSnackbar();

  const canView = canGroup('financeiro', 'view');
  // Registrar/editar pagamento é um POST (upsert) que o backend guarda com "insert" —
  // mostrar "Registrar"/lote só com insert (antes bastava edit e o POST voltava 403).
  const canRegistrar = canGroup('financeiro', 'insert');
  const planMediuns = can('mensalidade_mediun');
  const planAssoc = can('mensalidade_associado');
  // AM-12: comprovantes enviados pelos médiuns na Área — só com a Área no plano (piloto).
  const conferencia = can('area_medium') && planMediuns && canView;
  const [alvo, setAlvo] = useState<ComprovanteAlvo | null>(null);
  const [filaKey, setFilaKey] = useState(0);

  const [mes, setMes] = useState<string>(currentMonthBr());
  const [config, setConfig] = useState<Config | null>(null);
  const [configLoaded, setConfigLoaded] = useState(false);

  const [items, setItems] = useState<CobrancaItem[] | null>(null);
  const [assocItems, setAssocItems] = useState<CobrancaItem[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingAssoc, setLoadingAssoc] = useState(false);

  const [resumo, setResumo] = useState<Resumo | null>(null);
  const [assocResumo, setAssocResumo] = useState<Resumo | null>(null);
  const [loadingResumo, setLoadingResumo] = useState(false);

  const assocEnabled = planAssoc && !!config?.enable_mensalidade_associado;
  const showMediuns = planMediuns;
  const showAssoc = assocEnabled;

  const [tab, setTab] = useState<string>('mediuns');
  useEffect(() => {
    if (!configLoaded) return;
    if (tab === 'mediuns' && !showMediuns) setTab(showAssoc ? 'associados' : 'historico');
    if (tab === 'associados' && !showAssoc) setTab(showMediuns ? 'mediuns' : 'historico');
  }, [configLoaded, showMediuns, showAssoc, tab]);

  // ── Fetchers ─────────────────────────────────────────────────────────

  const fetchConfig = useCallback(async () => {
    // Sem mensalidade no plano (Premium) a tela mostra PlanLocked: não chama a API (evita 403).
    if (!canView || (!planMediuns && !planAssoc)) return;
    try {
      const res = await apiClient.get('/api/v1/admin/financeiro/config');
      setConfig(res.data);
    } catch {
      setConfig(null);
    } finally {
      setConfigLoaded(true);
    }
  }, [canView, planMediuns, planAssoc]);

  const fetchItems = useCallback(async () => {
    if (!planMediuns || !canView) return;
    setLoading(true);
    try {
      const res = await apiClient.get<MensalidadeItem[]>(`/api/v1/admin/financeiro/mensalidades?mes=${mes}`);
      setItems(res.data.map(toCobranca));
    } catch {
      showError('Erro ao carregar mensalidades.');
    } finally {
      setLoading(false);
    }
  }, [mes, planMediuns, canView, showError]);

  const fetchAssocItems = useCallback(async () => {
    if (!assocEnabled || !canView) return;
    setLoadingAssoc(true);
    try {
      const res = await apiClient.get<AssociadoMensalidadeItem[]>(`/api/v1/admin/financeiro/associados?mes=${mes}`);
      setAssocItems(res.data.map(assocToCobranca));
    } catch {
      showError('Erro ao carregar mensalidades dos associados.');
    } finally {
      setLoadingAssoc(false);
    }
  }, [mes, assocEnabled, canView, showError]);

  const fetchResumos = useCallback(async () => {
    if (!canView) return;
    setLoadingResumo(true);
    try {
      const [r1, r2] = await Promise.all([
        planMediuns ? apiClient.get<Resumo>('/api/v1/admin/financeiro/resumo').then((r) => r.data).catch(() => null) : null,
        assocEnabled
          ? apiClient.get<Resumo>('/api/v1/admin/financeiro/associados/resumo').then((r) => r.data).catch(() => null)
          : null,
      ]);
      setResumo(r1);
      setAssocResumo(r2);
    } finally {
      setLoadingResumo(false);
    }
  }, [canView, planMediuns, assocEnabled]);

  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);
  useEffect(() => {
    fetchItems();
  }, [fetchItems]);
  useEffect(() => {
    if (configLoaded) fetchAssocItems();
  }, [configLoaded, fetchAssocItems]);
  useEffect(() => {
    if (tab === 'historico') fetchResumos();
  }, [tab, fetchResumos]);

  const reloadAll = () => {
    setFilaKey((k) => k + 1);
    fetchItems();
    fetchAssocItems();
    if (tab === 'historico') fetchResumos();
  };

  // Depois de registrar/conferir um médium: a lista do mês e (com a Área) a fila de comprovantes.
  const aposMudarMedium = () => {
    fetchItems();
    if (conferencia) setFilaKey((k) => k + 1);
  };

  // ── Ações ────────────────────────────────────────────────────────────

  const registrarMedium = async (item: CobrancaItem, p: CobrancaPagamento) => {
    try {
      await apiClient.post(`/api/v1/admin/financeiro/mensalidades/${item.id}/${mes}`, montarFormPagamento(p), MULTIPART);
    } catch (err) {
      throw new Error(extractApiErrorMessage(err, 'Erro ao salvar.'));
    }
  };

  const registrarAssociado = async (item: CobrancaItem, p: CobrancaPagamento) => {
    try {
      await apiClient.post(`/api/v1/admin/financeiro/associados/${item.id}/${mes}`, montarFormPagamento(p), MULTIPART);
    } catch (err) {
      throw new Error(extractApiErrorMessage(err, 'Erro ao salvar.'));
    }
  };

  const baixarMedium = (item: CobrancaItem) =>
    baixarComprovante(`/api/v1/admin/financeiro/mensalidades/${item.id}/${mes}/comprovante`, item.comprovante_filename).catch(
      () => showError('Comprovante não encontrado.'),
    );

  const baixarAssociado = (item: CobrancaItem) =>
    baixarComprovante(`/api/v1/admin/financeiro/associados/${item.id}/${mes}/comprovante`, item.comprovante_filename).catch(
      () => showError('Comprovante não encontrado.'),
    );

  // ── KPIs: só com as listas exibidas já carregadas ────────────────────

  const kpisReady = configLoaded && (!showMediuns || items !== null) && (!showAssoc || assocItems !== null);
  const kpis = useMemo(() => {
    if (!kpisReady) return null;
    return computeCobrancaKpis(
      [
        ...(showMediuns
          ? [{ items: items ?? [], valor: config?.valor_mensal, diaVencimento: config?.dia_vencimento }]
          : []),
        ...(showAssoc
          ? [
              {
                items: assocItems ?? [],
                valor: config?.valor_mensal_associado,
                diaVencimento: config?.dia_vencimento_associado ?? 10,
              },
            ]
          : []),
      ],
      mes,
    );
  }, [kpisReady, showMediuns, showAssoc, items, assocItems, config, mes]);

  // ── Histórico ────────────────────────────────────────────────────────

  const effectiveResumo = resumo ?? (showAssoc ? assocResumo : null);
  const chartData = useMemo(() => {
    if (!effectiveResumo) return [];
    const assocByMes = new Map((assocResumo?.historico ?? []).map((h) => [h.mes, h.arrecadado]));
    return effectiveResumo.historico.map((h) => ({
      mes: monthLabelShort(h.mes),
      Esperado: h.esperado,
      Arrecadado: h.arrecadado,
      ...(resumo && assocResumo ? { Associados: assocByMes.get(h.mes) ?? 0 } : {}),
    }));
  }, [effectiveResumo, resumo, assocResumo]);
  const projecao = effectiveResumo?.projecao[0];

  // ── Gates ────────────────────────────────────────────────────────────

  if (!planMediuns && !planAssoc) return <PlanLocked feature="Controle de mensalidades" minPlan={minPlanFor('mensalidade_mediun').label} />;
  if (!canView) return <PermissionDenied message="Você não tem permissão para visualizar as mensalidades." />;

  const refreshing = loading || loadingAssoc;

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Mensalidades"
        subtitle="Cobrança mensal de médiuns e associados"
        actions={<MonthNavigator value={mes} onChange={setMes} onRefresh={reloadAll} refreshing={refreshing} />}
      />

      {configLoaded && !config && (
        <Alert variant="info">
          <Wallet aria-hidden />
          <AlertDescription>
            Configure o valor mensal em{' '}
            <Link href="/admin/financeiro/config" className="font-semibold underline underline-offset-2">
              Financeiro → Configuração
            </Link>{' '}
            para ativar o controle.
          </AlertDescription>
        </Alert>
      )}

      <CobrancaKpisGrid kpis={kpis} loading={!kpisReady} />
      <ComprovantesParaConferir enabled={conferencia} refreshKey={filaKey} onConferir={setAlvo} />

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="w-full sm:w-auto">
          {showMediuns && <TabsTrigger value="mediuns">Médiuns</TabsTrigger>}
          {showAssoc && <TabsTrigger value="associados">Associados</TabsTrigger>}
          <TabsTrigger value="historico">Histórico</TabsTrigger>
        </TabsList>

        {showMediuns && (
          <TabsContent value="mediuns" className="mt-3">
            <CobrancaMensal
              data-testid="cobranca-mediuns"
              mes={mes}
              items={items ?? []}
              loading={loading || items === null}
              diaVencimento={config?.dia_vencimento}
              valorPadrao={config?.valor_mensal}
              canEdit={canRegistrar}
              entidade="médium"
              onRegistrar={registrarMedium}
              onChanged={aposMudarMedium}
              onDownloadComprovante={baixarMedium}
              onConferir={
                conferencia
                  ? (i) =>
                      setAlvo({
                        mediun_id: i.id,
                        mediun_nome: i.nome,
                        mes,
                        valor: i.valor_vigente ?? config?.valor_mensal,
                        comprovante_enviado_em: i.comprovanteEnviadoEm,
                        comprovante_filename: i.comprovante_filename,
                      })
                  : undefined
              }
            />
          </TabsContent>
        )}

        {showAssoc && (
          <TabsContent value="associados" className="mt-3">
            <CobrancaMensal
              data-testid="cobranca-associados"
              mes={mes}
              items={assocItems ?? []}
              loading={loadingAssoc || assocItems === null}
              diaVencimento={config?.dia_vencimento_associado ?? 10}
              valorPadrao={config?.valor_mensal_associado}
              canEdit={canRegistrar}
              entidade="associado"
              onRegistrar={registrarAssociado}
              onChanged={fetchAssocItems}
              onDownloadComprovante={baixarAssociado}
            />
          </TabsContent>
        )}

        <TabsContent value="historico" className="mt-3 flex flex-col gap-4">
          <ChartCard
            title="Esperado × arrecadado"
            subtitle="Últimos meses"
            loading={loadingResumo}
            empty={!loadingResumo && chartData.length === 0}
            emptyMessage="Nenhum dado disponível."
            height={300}
          >
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                <CartesianGrid stroke={chartTokens.grid} vertical={false} />
                <XAxis dataKey="mes" tick={{ fill: chartTokens.tick, fontSize: 12 }} />
                <YAxis
                  tick={{ fill: chartTokens.tick, fontSize: 11 }}
                  tickFormatter={(v: number) => (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v))}
                  width={40}
                />
                <RechartsTooltip contentStyle={chartTooltipStyle} formatter={(v: number) => formatBRL(v)} />
                <Legend />
                <Bar dataKey="Esperado" fill={chartTokens.muted} radius={[4, 4, 0, 0]} />
                <Bar dataKey="Arrecadado" fill={chartTokens.primary} radius={[4, 4, 0, 0]} />
                {resumo && assocResumo && <Bar dataKey="Associados" fill={chartTokens.info} radius={[4, 4, 0, 0]} />}
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          {effectiveResumo && (
            <>
              <div className="grid grid-cols-3 gap-3">
                <KpiCard label="Ativos" value={effectiveResumo.config.count_ativos} />
                <KpiCard label="Isentos" value={effectiveResumo.config.count_isentos} />
                <KpiCard label="Pagantes" value={effectiveResumo.config.count_pagantes} color="var(--success)" />
              </div>
              {projecao && (
                <p className="text-xs text-muted-foreground">
                  Projeção para {monthLabelShort(projecao.mes)}: <strong>{formatBRL(projecao.projetado)}</strong> — valor
                  mensal atual × pagantes ativos.
                </p>
              )}
            </>
          )}
        </TabsContent>
      </Tabs>

      <ConferirComprovanteSheet
        alvo={alvo}
        onClose={() => setAlvo(null)}
        canInsert={canRegistrar}
        canEdit={canGroup('financeiro', 'edit')}
        valorPadrao={config?.valor_mensal}
        onDone={aposMudarMedium}
      />
    </div>
  );
}
