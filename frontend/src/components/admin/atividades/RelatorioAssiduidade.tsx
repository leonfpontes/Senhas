/**
 * Aba "Relatórios" de Atividades e escalas (AM-26) — assiduidade por médium e por grupo.
 *
 * `GET /admin/atividades/assiduidade` (ESCALAS:view + `atividades_corrente`; por grupo exige o
 * plano `escalas`, Pro): filtros de período (este mês, últimos 3 meses, este ano ou datas), tipo e
 * grupo; "Por médium" / "Por grupo" (sem o Pro, "Por grupo" mostra `PlanLocked` e não busca);
 * `DataTable` (cartões no celular) ordenável pelo percentual; "Baixar PDF" na base dos PDFs de
 * listagem (`lib/pdf/assiduidadePdf`).
 *
 * Detalhe por médium (tocar na linha): `GET .../assiduidade/medium/{id}` num `Sheet` com cada
 * atividade, a situação e o motivo das faltas. O motivo pode ter dado de saúde (§6.8 do plano):
 * aparece SÓ aqui, para quem tem ESCALAS:view — o PDF recebe só contagens (`dadosDoPdf`).
 *
 * A página (`pages/admin/atividades.tsx`) já fecha a tela sem `area_medium`, sem
 * `atividades_corrente` e sem `escalas:view`; aqui o gate de grupo se repete antes de buscar.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarCheck2, Download, Info, UserRound, UsersRound } from 'lucide-react';
import { useSubscription } from '@/hooks/useSubscription';
import { usePermissions } from '@/hooks/usePermissions';
import { useSnackbar } from '@/contexts/SnackbarContext';
import { useTenant } from '@/providers/ThemeProvider';
import { apiClient, extractApiErrorMessage } from '@/services/api_client';
import { DataTable, type ColumnDef, type SortingState } from '@/components/admin/DataTable';
import { DateField } from '@/components/fields';
import { PermissionDenied, PlanLocked } from '@/components/gates';
import { GrupoChip } from '@/components/grupos/GrupoChip';
import { TipoChip } from '@/components/atividades/TipoChip';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import {
  NOTA_CATEGORIA,
  OPCOES_PERIODO,
  dadosDoPdf,
  formatPercentual,
  periodoDoPreset,
  periodoValido,
  type Agrupar,
  type AssiduidadeResponse,
  type DetalheAssiduidade,
  type LinhaAssiduidade,
  type NumerosAssiduidade,
  type PresetPeriodo,
} from '@/constants/assiduidade';
import type { TipoAtividade } from '@/constants/atividades';
import { minPlanFor } from '@/constants/plans';
import { CLASSE_TOM, ROTULO_SITUACAO, TOM_SITUACAO } from '@/constants/presenca';
import { formatDateBr, formatDateTimeBr } from '@/lib/dateBr';
import { gerarAssiduidadePdf } from '@/lib/pdf/assiduidadePdf';
import { cn } from '@/lib/utils';
import { useGruposDaCorrente } from './PorNaEscalaCampos';
import { API_ATIVIDADES } from './TiposEFuncoes';

export const API_ASSIDUIDADE = `${API_ATIVIDADES}/assiduidade`;
const TODOS = 'todos';

/** Percentual → tom (verde a partir de 75%, amarelo a partir de 50%). */
function tomDoPercentual(p: number | null): string {
  if (p === null) return CLASSE_TOM.muted;
  if (p >= 75) return CLASSE_TOM.ok;
  if (p >= 50) return CLASSE_TOM.warn;
  return CLASSE_TOM.bad;
}

function Percentual({ valor }: { valor: number | null }) {
  return (
    <span
      className={cn('inline-flex min-w-12 justify-center rounded-md px-2 py-0.5 text-sm font-bold tabular-nums', tomDoPercentual(valor))}
    >
      {formatPercentual(valor)}
    </span>
  );
}

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

/** "3 presenças · 1 falta com justificativa · 2 sem chamada" (cartão do celular e resumo). */
function resumoNumeros(n: NumerosAssiduidade): string {
  const partes = [
    plural(n.convocacoes, 'convocação', 'convocações'),
    plural(n.presencas, 'presença', 'presenças'),
  ];
  if (n.ausencias_justificadas) partes.push(plural(n.ausencias_justificadas, 'falta com justificativa', 'faltas com justificativa'));
  if (n.ausencias_sem_justificativa) partes.push(plural(n.ausencias_sem_justificativa, 'falta sem justificativa', 'faltas sem justificativa'));
  if (n.sem_chamada) partes.push(`${n.sem_chamada} sem chamada`);
  return partes.join(' · ');
}

export function RelatorioAssiduidade() {
  const { can } = useSubscription();
  const { can: canGroup } = usePermissions();
  const { showError } = useSnackbar();
  const { tenantName, logoUrl, config } = useTenant();
  const canView = canGroup('escalas', 'view');
  const porGrupoNoPlano = can('escalas');

  const [preset, setPreset] = useState<PresetPeriodo>('mes');
  const [datas, setDatas] = useState<{ inicio: string | null; fim: string | null }>(() => periodoDoPreset('mes'));
  const [tipoId, setTipoId] = useState(TODOS);
  const [grupoId, setGrupoId] = useState(TODOS);
  const [agrupar, setAgrupar] = useState<Agrupar>('medium');
  const [tipos, setTipos] = useState<TipoAtividade[]>([]);
  const grupos = useGruposDaCorrente(canView);
  const [dados, setDados] = useState<AssiduidadeResponse | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [sorting, setSorting] = useState<SortingState>([{ id: 'percentual', desc: true }]);
  const [detalheDe, setDetalheDe] = useState<LinhaAssiduidade | null>(null);
  const [gerandoPdf, setGerandoPdf] = useState(false);

  const periodo = preset === 'personalizado' ? datas : periodoDoPreset(preset);
  const erroPeriodo = periodoValido(periodo);
  const bloqueadoPeloPlano = agrupar === 'grupo' && !porGrupoNoPlano;

  // Tipos que controlam presença (inclui arquivados: o relatório olha o passado).
  useEffect(() => {
    if (!canView) return;
    let vivo = true;
    apiClient
      .get<TipoAtividade[]>(`${API_ATIVIDADES}/tipos`, { params: { incluir_arquivados: true } })
      .then((res) => vivo && setTipos((Array.isArray(res.data) ? res.data : []).filter((t) => t.controla_presenca)))
      .catch(() => vivo && setTipos([]));
    return () => {
      vivo = false;
    };
  }, [canView]);

  const params = useMemo(() => {
    const p: Record<string, string> = { agrupar };
    if (periodo.inicio) p.inicio = periodo.inicio;
    if (periodo.fim) p.fim = periodo.fim;
    if (tipoId !== TODOS) p.tipo_id = tipoId;
    if (grupoId !== TODOS) p.grupo_id = grupoId;
    return p;
  }, [agrupar, periodo.inicio, periodo.fim, tipoId, grupoId]);

  useEffect(() => {
    if (!canView || bloqueadoPeloPlano || erroPeriodo) {
      setDados(null);
      return;
    }
    let vivo = true;
    setCarregando(true);
    setErro(null);
    apiClient
      .get<AssiduidadeResponse>(API_ASSIDUIDADE, { params })
      .then((res) => vivo && setDados(res.data))
      .catch((err) => {
        if (!vivo) return;
        setDados(null);
        setErro(extractApiErrorMessage(err, 'Não foi possível carregar o relatório.'));
      })
      .finally(() => vivo && setCarregando(false));
    return () => {
      vivo = false;
    };
  }, [canView, bloqueadoPeloPlano, erroPeriodo, params]);

  const columns = useMemo<ColumnDef<LinhaAssiduidade, unknown>[]>(() => {
    const num = (id: keyof NumerosAssiduidade, header: string): ColumnDef<LinhaAssiduidade, unknown> => ({
      id,
      accessorFn: (r) => r[id],
      header,
      meta: { align: 'right' },
      cell: ({ row }) => <span className="tabular-nums">{row.original[id] as number}</span>,
    });
    return [
      {
        id: 'nome',
        accessorFn: (r) => r.nome.toLowerCase(),
        header: agrupar === 'grupo' ? 'Grupo' : 'Médium',
        cell: ({ row }) =>
          agrupar === 'grupo' ? (
            <span className="flex items-center gap-2">
              <GrupoChip grupo={{ nome: row.original.nome, cor: row.original.cor ?? 'ambar' }} size="sm" />
              <span className="text-xs text-muted-foreground">{plural(row.original.membros ?? 0, 'membro', 'membros')}</span>
            </span>
          ) : (
            <span className="font-medium">
              {row.original.nome}
              {row.original.ativo === false && (
                <Badge variant="outline" className="ml-2 text-xs">
                  Inativo
                </Badge>
              )}
            </span>
          ),
      },
      num('convocacoes', 'Convocações'),
      num('presencas', 'Presenças'),
      num('ausencias_justificadas', 'Faltas com justificativa'),
      num('ausencias_sem_justificativa', 'Faltas sem justificativa'),
      num('sem_chamada', 'Sem chamada'),
      {
        id: 'percentual',
        // Sem convocação (null) fica no fim na ordem decrescente.
        accessorFn: (r) => r.percentual ?? -1,
        header: 'Presença',
        meta: { align: 'right' },
        cell: ({ row }) => <Percentual valor={row.original.percentual} />,
      },
    ];
  }, [agrupar]);

  const linhasOrdenadas = useCallback((): LinhaAssiduidade[] => {
    if (!dados) return [];
    const s = sorting[0];
    if (!s) return dados.linhas;
    const valor = (l: LinhaAssiduidade): number | string =>
      s.id === 'nome' ? l.nome.toLowerCase() : s.id === 'percentual' ? l.percentual ?? -1 : (l[s.id as keyof NumerosAssiduidade] as number);
    return [...dados.linhas].sort((a, b) => {
      const va = valor(a);
      const vb = valor(b);
      const cmp = va < vb ? -1 : va > vb ? 1 : 0;
      return s.desc ? -cmp : cmp;
    });
  }, [dados, sorting]);

  const baixarPdf = async () => {
    if (!dados) return;
    setGerandoPdf(true);
    try {
      await gerarAssiduidadePdf(dadosDoPdf(dados, linhasOrdenadas()), {
        nome: tenantName ?? 'Terreiro',
        logoUrl: logoUrl ?? undefined,
        primaryColor: config?.colors?.primary ?? '#15803d',
      });
    } catch (err) {
      showError(extractApiErrorMessage(err, 'Não foi possível gerar o PDF.'));
    } finally {
      setGerandoPdf(false);
    }
  };

  if (!canView) return <PermissionDenied className="mt-4" />;

  const mudarPreset = (v: string) => {
    const novo = v as PresetPeriodo;
    if (novo === 'personalizado') setDatas(periodo);
    setPreset(novo);
  };

  return (
    <div className="flex flex-col gap-4" data-testid="relatorio-assiduidade">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="assiduidade-periodo">Período</Label>
          <Select value={preset} onValueChange={mudarPreset}>
            <SelectTrigger id="assiduidade-periodo" className="w-44" aria-label="Período">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {OPCOES_PERIODO.map((o) => (
                <SelectItem key={o.valor} value={o.valor}>
                  {o.rotulo}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {preset === 'personalizado' && (
          <>
            <DateField
              label="De"
              value={datas.inicio}
              onChange={(v) => setDatas((d) => ({ ...d, inicio: v }))}
              className="w-40"
              fullWidth={false}
            />
            <DateField
              label="Até"
              value={datas.fim}
              onChange={(v) => setDatas((d) => ({ ...d, fim: v }))}
              className="w-40"
              fullWidth={false}
            />
          </>
        )}
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="assiduidade-tipo">Tipo</Label>
          <Select value={tipoId} onValueChange={setTipoId}>
            <SelectTrigger id="assiduidade-tipo" className="w-48" aria-label="Tipo de atividade">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={TODOS}>Todos os tipos</SelectItem>
              {tipos.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.nome}
                  {t.arquivado_em ? ' (arquivado)' : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {grupos.length > 0 && (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="assiduidade-grupo">Grupo</Label>
            <Select value={grupoId} onValueChange={setGrupoId}>
              <SelectTrigger id="assiduidade-grupo" className="w-44" aria-label="Grupo da corrente">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={TODOS}>Todos</SelectItem>
                {grupos.map((g) => (
                  <SelectItem key={g.id} value={g.id}>
                    {g.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        <ToggleGroup
          type="single"
          value={agrupar}
          onValueChange={(v) => v && setAgrupar(v as Agrupar)}
          variant="outline"
          aria-label="Ver o relatório"
          className="ml-auto"
        >
          <ToggleGroupItem value="medium" className="gap-1.5 px-3">
            <UserRound className="size-4" aria-hidden /> Por médium
          </ToggleGroupItem>
          <ToggleGroupItem value="grupo" className="gap-1.5 px-3">
            <UsersRound className="size-4" aria-hidden /> Por grupo
          </ToggleGroupItem>
        </ToggleGroup>
      </div>

      {bloqueadoPeloPlano ? (
        <PlanLocked feature="Relatório por grupo" minPlan={minPlanFor('escalas').label} />
      ) : erroPeriodo ? (
        <p className="text-sm text-destructive-strong" role="alert">
          {erroPeriodo}
        </p>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="flex items-start gap-1.5 text-sm text-muted-foreground" data-testid="assiduidade-resumo">
              <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
              {dados ? (
                <span>
                  Presença geral <strong className="text-foreground">{formatPercentual(dados.totais.percentual)}</strong>
                  {' · '}
                  {plural(dados.atividades_com_chamada, 'atividade com chamada encerrada', 'atividades com chamada encerrada')}
                  {dados.atividades_sem_chamada > 0 &&
                    ` · ${plural(dados.atividades_sem_chamada, 'sem chamada', 'sem chamada')} (fora do percentual)`}
                </span>
              ) : (
                <span>Presença = presenças ÷ convocações de atividades com a chamada encerrada.</span>
              )}
            </p>
            <Button
              type="button"
              variant="outline"
              disabled={!dados || gerandoPdf}
              onClick={() => void baixarPdf()}
            >
              <Download className="size-4" aria-hidden />
              {gerandoPdf ? 'Gerando…' : 'Baixar PDF'}
            </Button>
          </div>
          {erro ? (
            <p className="text-sm text-destructive-strong" role="alert">
              {erro}
            </p>
          ) : (
            <DataTable
              data-testid="assiduidade-tabela"
              columns={columns}
              data={dados?.linhas ?? []}
              getRowId={(r) => r.id}
              loading={carregando && !dados}
              sorting={sorting}
              onSortingChange={(updater) =>
                // Relatório sempre ordenado: clicar de novo inverte em vez de tirar a ordem.
                setSorting((prev) => {
                  const next = typeof updater === 'function' ? updater(prev) : updater;
                  return next.length ? next : prev.map((x) => ({ ...x, desc: !x.desc }));
                })
              }
              pageSize={50}
              emptyIcon={<CalendarCheck2 />}
              emptyMessage="Nenhuma escala no período"
              emptyDescription="Mude o período ou os filtros. A presença conta depois que a chamada é encerrada."
              onRowClick={agrupar === 'medium' ? (r) => setDetalheDe(r) : undefined}
              renderCard={(r) => (
                <div className="flex w-full flex-col gap-1 text-left" data-testid="assiduidade-cartao">
                  <span className="flex items-center justify-between gap-2">
                    {agrupar === 'grupo' ? (
                      <GrupoChip grupo={{ nome: r.nome, cor: r.cor ?? 'ambar' }} />
                    ) : (
                      <span className="font-semibold">{r.nome}</span>
                    )}
                    <Percentual valor={r.percentual} />
                  </span>
                  <span className="text-xs text-muted-foreground">{resumoNumeros(r)}</span>
                </div>
              )}
            />
          )}
        </>
      )}

      <DetalheAssiduidadeSheet linha={detalheDe} params={params} onClose={() => setDetalheDe(null)} />
    </div>
  );
}

function DetalheAssiduidadeSheet({
  linha,
  params,
  onClose,
}: {
  linha: LinhaAssiduidade | null;
  params: Record<string, string>;
  onClose: () => void;
}) {
  const [detalhe, setDetalhe] = useState<DetalheAssiduidade | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    setDetalhe(null);
    setErro(null);
    if (!linha) return;
    let vivo = true;
    const { inicio, fim, tipo_id } = params;
    apiClient
      .get<DetalheAssiduidade>(`${API_ASSIDUIDADE}/medium/${encodeURIComponent(linha.id)}`, {
        params: { inicio, fim, ...(tipo_id ? { tipo_id } : {}) },
      })
      .then((res) => vivo && setDetalhe(res.data))
      .catch((err) => vivo && setErro(extractApiErrorMessage(err, 'Não foi possível carregar o detalhe.')));
    return () => {
      vivo = false;
    };
  }, [linha, params]);

  return (
    <Sheet open={linha !== null} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 overflow-y-auto p-0 min-[640px]:max-w-[480px]">
        <SheetHeader className="gap-1 border-b px-6 pt-6 pb-4">
          <SheetTitle className="pr-8 text-lg font-bold">{linha?.nome}</SheetTitle>
          <SheetDescription>
            {detalhe
              ? `${formatDateBr(detalhe.inicio)} a ${formatDateBr(detalhe.fim)} · presença ${formatPercentual(detalhe.resumo.percentual)}`
              : 'Atividades do período e o motivo das faltas.'}
          </SheetDescription>
        </SheetHeader>
        <div className="flex flex-col gap-4 px-6 py-5">
          {erro ? (
            <p className="text-sm text-destructive-strong" role="alert">
              {erro}
            </p>
          ) : !detalhe ? (
            <Skeleton className="h-40 w-full" />
          ) : (
            <>
              <p className="text-sm text-muted-foreground">{resumoNumeros(detalhe.resumo)}</p>
              <p className="rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
                O motivo das faltas aparece só aqui, para quem cuida das escalas. Ele não vai para o PDF.
              </p>
              {detalhe.itens.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhuma escala no período.</p>
              ) : (
                <ul className="flex flex-col gap-2" data-testid="assiduidade-detalhe">
                  {detalhe.itens.map((i) => (
                    <li key={i.atividade_id} className="flex flex-col gap-1.5 rounded-xl border p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex min-w-0 flex-col gap-1">
                          <span className="font-semibold">{i.titulo}</span>
                          <span className="text-xs text-muted-foreground">{formatDateTimeBr(i.inicio)}</span>
                        </div>
                        <span className={cn('shrink-0 rounded-md px-2 py-0.5 text-xs font-semibold', CLASSE_TOM[TOM_SITUACAO[i.situacao]])}>
                          {ROTULO_SITUACAO[i.situacao]}
                        </span>
                      </div>
                      <TipoChip tipo={i.tipo} size="sm" className="self-start" />
                      {NOTA_CATEGORIA[i.categoria] && (
                        <span className="text-xs text-muted-foreground">{NOTA_CATEGORIA[i.categoria]}</span>
                      )}
                      {i.justificativa && (
                        <p className="rounded-lg bg-warning/15 px-3 py-2 text-sm text-warning-strong">
                          <span className="font-semibold">Motivo: </span>
                          {i.justificativa}
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
