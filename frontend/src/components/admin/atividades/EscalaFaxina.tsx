/**
 * Aba "Escala de faxina" de /admin/atividades (AM-25, §8.7 do plano; tela J13 do protótipo).
 *
 * Planejador do mês para os tipos com escala "grupos por dia" (ex.: Faxina): escolhe o mês e o
 * tipo; se o mês não tem escala, "Copiar do mês anterior" ou "Começar vazio"; fichas coloridas dos
 * grupos com o número de dias (e "Novo grupo"); grade do mês (7 colunas, células de 44 px) — toca
 * numa ficha e depois nos dias (tocar de novo tira; um dia pode ter mais de um grupo); atalhos
 * Copiar · Girar grupos · Distribuir (dias da semana + grupos em ordem); horário por dia; resumo
 * em texto ("G1: dias 5 e 19 · G2: dias 12 e 26"); Salvar rascunho (o médium não vê) e Publicar
 * (ConfirmDialog com as contagens). Depois de publicar, "Atualizar convocações das próximas
 * faxinas" (quem mudou de grupo; o passado não muda).
 *
 * Gates (CLAUDE.md): a página já exige `area_medium`, `atividades_corrente` e `escalas:view`; aqui
 * o plano `escalas` (Pro) → `PlanLocked` com `minPlanFor('escalas')`; `escalas:edit` mexe no
 * rascunho; publicar e atualizar convocações pedem `escalas:insert` + `escalas:edit`.
 * Regras puras e tipos em `lib/escalaFaxina.ts`; backend em `api/v1/admin/escala_planos.py`.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  ArrowDown,
  ArrowUp,
  CalendarRange,
  ChevronLeft,
  ChevronRight,
  Clock,
  Copy,
  Plus,
  RefreshCw,
  Repeat,
  Send,
  Users,
} from 'lucide-react';
import { useSubscription } from '@/hooks/useSubscription';
import { usePermissions } from '@/hooks/usePermissions';
import { useSnackbar } from '@/contexts/SnackbarContext';
import { apiClient, extractApiErrorMessage } from '@/services/api_client';
import CrudDrawer from '@/components/CrudDrawer';
import { ConfirmDialog } from '@/components/admin/ConfirmDialog';
import { EmptyState } from '@/components/EmptyState';
import { TextField } from '@/components/fields';
import { PermissionDenied, PlanLocked } from '@/components/gates';
import { GrupoChip, GrupoDot } from '@/components/grupos/GrupoChip';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { API_ATIVIDADES } from '@/components/admin/atividades/TiposEFuncoes';
import type { TipoAtividade } from '@/constants/atividades';
import { corDoGrupo } from '@/constants/correnteGrupos';
import { minPlanFor } from '@/constants/plans';
import { addMonthsYm, currentMonthBr, formatDateBr, monthLabelLong } from '@/lib/dateBr';
import {
  API_ESCALA_PLANOS,
  NOMES_SEMANA,
  NOMES_SEMANA_PLURAL,
  SIGLAS_SEMANA,
  alternarGrupo,
  convocacoesPrevistas,
  dataDoDia,
  diaDaSemana,
  diaDoMes,
  diasPorGrupo,
  gradeDoMes,
  horarioTexto,
  mesmoRascunho,
  mudarHorario,
  normalizar,
  quantosDias,
  resumoTexto,
  textoResultado,
  type DiaRascunho,
  type PlanoEscala,
  type PlanoPublicado,
} from '@/lib/escalaFaxina';
import { cn } from '@/lib/utils';

const SABADO = 6;
const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

export function EscalaFaxina() {
  const { can } = useSubscription();
  const { can: canGroup } = usePermissions();
  const canView = canGroup('escalas', 'view');
  const canEdit = canGroup('escalas', 'edit');
  const canPublicar = canGroup('escalas', 'insert') && canEdit;
  if (!can('escalas')) return <PlanLocked feature="Escala de faxina" minPlan={minPlanFor('escalas').label} />;
  if (!canView) return <PermissionDenied className="mt-4" />;
  return <Planejador canEdit={canEdit} canPublicar={canPublicar} podeCriarGrupo={canGroup('mediuns', 'insert')} />;
}

export default EscalaFaxina;

interface DistribuirForm {
  semana: number[];
  grupos: string[]; // na ordem do ciclo
  hora_inicio: string;
  hora_fim: string;
}

function Planejador({
  canEdit,
  canPublicar,
  podeCriarGrupo,
}: {
  canEdit: boolean;
  canPublicar: boolean;
  podeCriarGrupo: boolean;
}) {
  const { showSuccess, showError } = useSnackbar();
  const [tipos, setTipos] = useState<TipoAtividade[] | null>(null);
  const [tipoId, setTipoId] = useState('');
  const [mes, setMes] = useState(currentMonthBr());
  const [plano, setPlano] = useState<PlanoEscala | null>(null);
  const [dias, setDias] = useState<DiaRascunho[]>([]);
  const [comecou, setComecou] = useState(false);
  const [selecionado, setSelecionado] = useState('');
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState(false);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [trocarMes, setTrocarMes] = useState<string | null>(null);
  const [publicar, setPublicar] = useState(false);
  const [atualizar, setAtualizar] = useState(false);
  const [horarioDe, setHorarioDe] = useState<string | null>(null);
  const [horario, setHorario] = useState({ hora_inicio: '', hora_fim: '' });
  const [distribuir, setDistribuir] = useState<DistribuirForm | null>(null);

  // Tipos com escala "grupos por dia" (Faxina, Cozinha...).
  useEffect(() => {
    apiClient
      .get<TipoAtividade[]>(`${API_ATIVIDADES}/tipos`)
      .then((res) => {
        const lista = (Array.isArray(res.data) ? res.data : []).filter(
          (t) => t.natureza === 'atividade' && !t.arquivado_em && t.modo_escala === 'grupos_por_dia',
        );
        setTipos(lista);
        setTipoId((atual) => atual || lista[0]?.id || '');
      })
      .catch(() => setTipos([]));
  }, []);

  const aplicar = useCallback((p: PlanoEscala) => {
    setPlano(p);
    setDias(normalizar(p.dias));
    // "Começar vazio" vale até trocar de mês/tipo (recarregar ao voltar para a aba não desfaz).
    setComecou((c) => c || p.existe);
    setSelecionado((atual) => {
      const ativos = p.grupos.filter((g) => !g.arquivado);
      return ativos.some((g) => g.id === atual) ? atual : (ativos[0]?.id ?? '');
    });
  }, []);

  const url = useCallback((acao = '') => `${API_ESCALA_PLANOS}/${tipoId}/${mes}${acao}`, [tipoId, mes]);

  useEffect(() => {
    setComecou(false);
  }, [tipoId, mes]);

  const carregar = useCallback(async () => {
    if (!tipoId) return;
    setCarregando(true);
    setErro(false);
    try {
      aplicar((await apiClient.get<PlanoEscala>(url())).data);
    } catch {
      setErro(true);
    } finally {
      setCarregando(false);
    }
  }, [tipoId, url, aplicar]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const sujo = plano !== null && !mesmoRascunho(dias, plano.dias);

  // Voltou de outra aba (ex.: criou um grupo): atualiza as fichas se não há nada por salvar.
  useEffect(() => {
    const aoVoltar = () => {
      if (!sujo && !ocupado) void carregar();
    };
    window.addEventListener('focus', aoVoltar);
    return () => window.removeEventListener('focus', aoVoltar);
  }, [sujo, ocupado, carregar]);

  const grupos = useMemo(() => plano?.grupos ?? [], [plano]);
  const gruposAtivos = useMemo(() => grupos.filter((g) => !g.arquivado), [grupos]);
  const porId = useMemo(() => new Map(grupos.map((g) => [g.id, g])), [grupos]);
  const contagem = useMemo(() => diasPorGrupo(dias, grupos), [dias, grupos]);
  const hoje = plano?.hoje ?? '';
  const padrao = { hora_inicio: plano?.hora_inicio_padrao ?? '09:00', hora_fim: plano?.hora_fim_padrao ?? null };
  const tipo = tipos?.find((t) => t.id === tipoId) ?? null;
  const rotuloMes = monthLabelLong(mes);
  const mesAnterior = monthLabelLong(addMonthsYm(mes, -1)).split(' de ')[0];

  const executar = async <T,>(rotulo: string, fn: () => Promise<T>, erroPadrao: string): Promise<T | null> => {
    setOcupado(rotulo);
    try {
      return await fn();
    } catch (err) {
      showError(extractApiErrorMessage(err, erroPadrao));
      return null;
    } finally {
      setOcupado(null);
    }
  };

  const salvar = async (aviso = true): Promise<PlanoEscala | null> => {
    const res = await executar(
      'salvar',
      () => apiClient.put<PlanoEscala>(url(), { dias: normalizar(dias) }),
      'Não foi possível salvar o rascunho.',
    );
    if (!res) return null;
    aplicar(res.data);
    if (aviso) showSuccess('Rascunho salvo. Os médiuns ainda não veem.');
    return res.data;
  };

  const salvarSeMudou = async (): Promise<PlanoEscala | null> => (sujo ? salvar(false) : plano);

  const copiar = async () => {
    const res = await executar(
      'copiar',
      () => apiClient.post<PlanoEscala>(url('/copiar-mes-anterior')),
      'Não foi possível copiar o mês anterior.',
    );
    if (!res) return;
    aplicar(res.data);
    const fora = res.data.descartados ?? 0;
    showSuccess(
      `Copiado de ${mesAnterior} pela ordem dos dias da semana.` +
        (fora ? ` ${plural(fora, 'dia ficou', 'dias ficaram')} de fora (o mês não tem a mesma ocorrência ou o grupo foi arquivado).` : ''),
    );
  };

  const girar = async () => {
    if (!(await salvarSeMudou())) return;
    const ordem = gruposAtivos.map((g) => g.id);
    const res = await executar(
      'girar',
      () => apiClient.post<PlanoEscala>(url('/girar-grupos'), { grupo_ids: ordem }),
      'Não foi possível girar os grupos.',
    );
    if (!res) return;
    aplicar(res.data);
    const nomes = gruposAtivos.map((g) => g.nome);
    showSuccess(
      nomes.length > 1
        ? `Grupos girados: ${nomes.map((n, i) => `${nomes[(i + 1) % nomes.length]} pegou os dias do ${n}`).join(', ')}.`
        : 'Com um grupo só não há o que girar.',
    );
  };

  const abrirDistribuir = () =>
    setDistribuir({
      semana: [SABADO],
      grupos: gruposAtivos.map((g) => g.id),
      hora_inicio: padrao.hora_inicio,
      hora_fim: padrao.hora_fim ?? '',
    });

  const confirmarDistribuir = async () => {
    if (!distribuir) return;
    const res = await executar(
      'distribuir',
      () =>
        apiClient.post<PlanoEscala>(url('/distribuir'), {
          dias_semana: distribuir.semana,
          grupo_ids: distribuir.grupos,
          hora_inicio: distribuir.hora_inicio || null,
          hora_fim: distribuir.hora_fim || null,
        }),
      'Não foi possível distribuir os grupos.',
    );
    if (!res) return;
    aplicar(res.data);
    setDistribuir(null);
    const nomes = distribuir.grupos.map((id) => porId.get(id)?.nome ?? '').filter(Boolean);
    showSuccess(`Dias distribuídos em ordem: ${nomes.join(', ')}.`);
  };

  const abrirPublicar = async () => {
    const atual = await salvarSeMudou();
    if (atual) setPublicar(true);
  };

  const confirmarPublicar = async () => {
    const res = await executar(
      'publicar',
      () => apiClient.post<PlanoPublicado>(url('/publicar')),
      'Não foi possível publicar a escala.',
    );
    setPublicar(false);
    if (!res) return;
    aplicar(res.data);
    showSuccess(`Escala publicada. ${textoResultado(res.data.resultado)}`);
  };

  const confirmarAtualizar = async () => {
    const res = await executar(
      'atualizar',
      () => apiClient.post<PlanoPublicado>(url('/atualizar-convocacoes')),
      'Não foi possível atualizar as convocações.',
    );
    setAtualizar(false);
    if (!res) return;
    aplicar(res.data);
    showSuccess(textoResultado(res.data.resultado, true));
  };

  const irParaMes = (alvo: string) => {
    if (sujo) setTrocarMes(alvo);
    else setMes(alvo);
  };

  const tocarDia = (data: string) => {
    if (!selecionado) return;
    setDias((atual) => alternarGrupo(atual, data, selecionado, padrao));
  };

  const abrirHorario = (data: string) => {
    const doDia = dias.find((d) => d.data === data);
    setHorario({ hora_inicio: doDia?.hora_inicio ?? padrao.hora_inicio, hora_fim: doDia?.hora_fim ?? '' });
    setHorarioDe(data);
  };

  // ── Render ────────────────────────────────────────────────────────────────

  if (tipos === null) return <PlanejadorSkeleton />;
  if (tipos.length === 0) {
    return (
      <EmptyState
        icon={<CalendarRange />}
        title="Nenhum tipo usa a escala por grupos"
        description='Em "Tipos e funções", escolha a escala "Grupos por dia do mês" no tipo Faxina (ou em outro tipo).'
      />
    );
  }

  const datasComGrupo = [...new Set(dias.map((d) => d.data))].sort();
  const publicado = plano?.status === 'publicado';
  const semDias = dias.length === 0;
  const mostraInicio = plano !== null && !plano.existe && semDias && !comecou;
  const pendente = sujo || Boolean(plano?.pendencias.tem_mudancas);
  const horarios = new Set(dias.map((d) => horarioTexto(d.hora_inicio, d.hora_fim)));
  const ocupadoAlgo = ocupado !== null;

  return (
    <div className="flex flex-col gap-4" data-testid="escala-faxina">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon-sm" onClick={() => irParaMes(addMonthsYm(mes, -1))} aria-label="Mês anterior">
            <ChevronLeft />
          </Button>
          <span className="min-w-40 text-center font-semibold first-letter:uppercase" data-testid="escala-mes">
            {rotuloMes}
          </span>
          <Button variant="ghost" size="icon-sm" onClick={() => irParaMes(addMonthsYm(mes, 1))} aria-label="Próximo mês">
            <ChevronRight />
          </Button>
        </div>
        {tipos.length > 1 && (
          <div role="group" aria-label="Tipo de atividade" className="flex flex-wrap gap-2">
            {tipos.map((t) => (
              <button
                key={t.id}
                type="button"
                aria-pressed={tipoId === t.id}
                onClick={() => (sujo ? showError('Salve o rascunho antes de trocar de tipo.') : setTipoId(t.id))}
                className={cn(
                  'min-h-9 rounded-full border px-3 text-sm font-semibold outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
                  tipoId === t.id ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card',
                )}
              >
                {t.nome}
              </button>
            ))}
          </div>
        )}
      </div>

      {carregando && !plano ? (
        <PlanejadorSkeleton />
      ) : erro || !plano ? (
        <EmptyState
          icon={<CalendarRange />}
          title="Não foi possível carregar a escala"
          description="Confira a internet e tente de novo."
          action={
            <Button variant="outline" onClick={() => void carregar()}>
              Tentar de novo
            </Button>
          }
        />
      ) : gruposAtivos.length === 0 && semDias ? (
        <EmptyState
          icon={<Users />}
          title="Crie os grupos da corrente primeiro"
          description="A escala é montada por grupos (G1, G2, G3…). Crie os grupos e ponha os médiuns em cada um."
          action={
            podeCriarGrupo ? (
              <Button asChild variant="outline">
                <Link href="/admin/mediuns/grupos">Ir para Grupos da corrente</Link>
              </Button>
            ) : undefined
          }
        />
      ) : mostraInicio ? (
        canEdit ? (
          <Card className="flex flex-col gap-3 p-4" data-testid="escala-comecar">
            <div>
              <h3 className="font-semibold">Como você quer começar {tipo ? `a ${tipo.nome.toLowerCase()}` : 'a escala'} de {rotuloMes.split(' de ')[0]}?</h3>
              <p className="text-sm text-muted-foreground">
                {plano.mes_anterior_dias > 0
                  ? `${mesAnterior[0].toUpperCase()}${mesAnterior.slice(1)} tem ${plural(plano.mes_anterior_dias, 'dia', 'dias')} na escala. Dá para copiar pela ordem dos dias da semana (o 1º sábado vai para o 1º sábado).`
                  : `${mesAnterior[0].toUpperCase()}${mesAnterior.slice(1)} não tem escala para copiar.`}
              </p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              {plano.mes_anterior_dias > 0 && (
                <Button onClick={() => void copiar()} disabled={ocupadoAlgo}>
                  <Copy aria-hidden />
                  Copiar do mês anterior
                </Button>
              )}
              <Button variant="outline" onClick={() => setComecou(true)}>
                Começar vazio
              </Button>
            </div>
          </Card>
        ) : (
          <EmptyState icon={<CalendarRange />} title="Ainda não há escala neste mês" />
        )
      ) : (
        <>
          <StatusDoPlano plano={plano} pendente={pendente} />

          <section className="flex flex-col gap-2" aria-label="Grupos">
            {canEdit && <p className="text-sm text-muted-foreground">Toque num grupo e depois nos dias dele. Tocar de novo tira.</p>}
            <div className="flex flex-wrap gap-2" role="group" aria-label="Escolher grupo">
              {grupos.map((g) => {
                const n = contagem.get(g.id)?.length ?? 0;
                const ativo = selecionado === g.id;
                return (
                  <button
                    key={g.id}
                    type="button"
                    aria-pressed={canEdit ? ativo : undefined}
                    disabled={!canEdit || g.arquivado}
                    onClick={() => setSelecionado(g.id)}
                    data-testid={`ficha-${g.nome}`}
                    className={cn(
                      'flex min-h-11 items-center gap-2 rounded-full border bg-card px-3 text-sm font-semibold outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-default',
                      ativo && canEdit ? 'border-foreground ring-2 ring-foreground/70' : 'border-border',
                      g.arquivado && 'opacity-70',
                    )}
                  >
                    <GrupoDot cor={g.cor} />
                    {g.nome}
                    <span className="font-normal text-muted-foreground">
                      {plural(n, 'dia', 'dias')}
                      {g.arquivado ? ' · arquivado' : ''}
                    </span>
                  </button>
                );
              })}
              {podeCriarGrupo && (
                <Link
                  href="/admin/mediuns/grupos"
                  target="_blank"
                  rel="noopener"
                  className="flex min-h-11 items-center gap-1 rounded-full border border-dashed border-border px-3 text-sm font-semibold text-brand outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                >
                  <Plus className="size-4" aria-hidden />
                  Novo grupo
                </Link>
              )}
            </div>
          </section>

          <GradeDoMes
            mes={mes}
            dias={dias}
            hoje={hoje}
            grupos={porId}
            selecionado={selecionado}
            editavel={canEdit && Boolean(selecionado)}
            onTocar={tocarDia}
          />

          {canEdit && (
            <div className="flex flex-wrap gap-2" aria-label="Atalhos">
              {plano.mes_anterior_dias > 0 && (
                <Button variant="outline" size="sm" onClick={() => void copiar()} disabled={ocupadoAlgo}>
                  <Copy aria-hidden />
                  Copiar do mês anterior
                </Button>
              )}
              <Button variant="outline" size="sm" onClick={() => void girar()} disabled={ocupadoAlgo || semDias || gruposAtivos.length < 2}>
                <Repeat aria-hidden />
                Girar grupos
              </Button>
              <Button variant="outline" size="sm" onClick={abrirDistribuir} disabled={ocupadoAlgo || gruposAtivos.length === 0}>
                <CalendarRange aria-hidden />
                Distribuir…
              </Button>
            </div>
          )}

          <Card className="flex flex-col gap-1 p-4" data-testid="escala-resumo">
            <strong className="text-sm">
              Resumo{horarios.size === 1 ? ` · ${[...horarios][0]}` : ''}
            </strong>
            <p className="text-sm">{resumoTexto(dias, grupos)}</p>
          </Card>

          {datasComGrupo.length > 0 && (
            <section aria-label="Dias da escala" className="flex flex-col gap-2">
              <h3 className="text-sm font-semibold">Dias e horários</h3>
              <ul className="flex flex-col divide-y rounded-xl border bg-card">
                {datasComGrupo.map((data) => {
                  const doDia = dias.filter((d) => d.data === data);
                  const passou = data < hoje;
                  return (
                    <li key={data} className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm">
                      <span className="w-24 font-semibold">
                        {NOMES_SEMANA[diaDaSemana(data)].slice(0, 3)}, {diaDoMes(data)}
                      </span>
                      <span className="flex flex-wrap gap-1">
                        {doDia.map((d) => {
                          const g = porId.get(d.grupo_id);
                          return g ? <GrupoChip key={d.grupo_id} grupo={g} size="sm" /> : null;
                        })}
                      </span>
                      <span className="text-muted-foreground">{horarioTexto(doDia[0].hora_inicio, doDia[0].hora_fim)}</span>
                      {passou && <span className="text-muted-foreground">· já passou</span>}
                      {canEdit && !passou && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="ml-auto"
                          onClick={() => abrirHorario(data)}
                          aria-label={`Mudar o horário do dia ${diaDoMes(data)}`}
                        >
                          <Clock aria-hidden />
                          Horário
                        </Button>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          {(canEdit || canPublicar) && (
            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
              {canEdit && (
                <Button variant="outline" onClick={() => void salvar()} disabled={ocupadoAlgo || !sujo}>
                  Salvar rascunho
                </Button>
              )}
              {canPublicar && (
                <Button onClick={() => void abrirPublicar()} disabled={ocupadoAlgo || (!pendente && (publicado || semDias))}>
                  <Send aria-hidden />
                  {publicado ? 'Publicar as mudanças' : 'Publicar'}
                </Button>
              )}
              {canPublicar && publicado && plano.proximas_publicadas > 0 && (
                <Button variant="outline" onClick={() => setAtualizar(true)} disabled={ocupadoAlgo}>
                  <RefreshCw aria-hidden />
                  Atualizar convocações das próximas faxinas
                </Button>
              )}
            </div>
          )}
        </>
      )}

      {plano && (
        <ConfirmDialog
          open={publicar}
          title={publicado ? 'Publicar as mudanças?' : `Publicar a escala de ${rotuloMes.split(' de ')[0]}?`}
          message={<ResumoPublicacao plano={plano} dias={dias} />}
          confirmText="Publicar"
          loading={ocupado === 'publicar'}
          onConfirm={() => void confirmarPublicar()}
          onCancel={() => setPublicar(false)}
        />
      )}

      <ConfirmDialog
        open={atualizar}
        title="Atualizar as convocações?"
        message="Confere as faxinas que ainda não aconteceram: quem entrou num grupo vai para a escala e quem saiu do grupo é tirado. As que já passaram não mudam, e quem a casa tirou da escala à mão continua fora."
        confirmText="Atualizar"
        loading={ocupado === 'atualizar'}
        onConfirm={() => void confirmarAtualizar()}
        onCancel={() => setAtualizar(false)}
      />

      <ConfirmDialog
        open={trocarMes !== null}
        title="Sair sem salvar?"
        message="As mudanças deste mês ainda não foram salvas."
        confirmText="Sair sem salvar"
        destructive
        onConfirm={() => {
          if (trocarMes) setMes(trocarMes);
          setTrocarMes(null);
        }}
        onCancel={() => setTrocarMes(null)}
      />

      <CrudDrawer
        open={horarioDe !== null}
        onClose={() => setHorarioDe(null)}
        title={horarioDe ? `Horário de ${NOMES_SEMANA[diaDaSemana(horarioDe)]}, ${diaDoMes(horarioDe)}` : 'Horário'}
        subtitle="Vale para todos os grupos deste dia."
        icon={<Clock />}
        saveLabel="Aplicar"
        saveDisabled={!horario.hora_inicio || Boolean(horario.hora_fim && horario.hora_fim <= horario.hora_inicio)}
        error={horario.hora_fim && horario.hora_inicio && horario.hora_fim <= horario.hora_inicio ? 'O fim precisa ser depois do início.' : null}
        onSave={() => {
          if (horarioDe) setDias((atual) => mudarHorario(atual, horarioDe, horario.hora_inicio, horario.hora_fim || null));
          setHorarioDe(null);
        }}
      >
        <div className="grid grid-cols-2 gap-3">
          <TextField
            label="Começa às"
            type="time"
            value={horario.hora_inicio}
            onChange={(e) => setHorario((h) => ({ ...h, hora_inicio: e.target.value }))}
          />
          <TextField
            label="Termina às"
            type="time"
            value={horario.hora_fim}
            onChange={(e) => setHorario((h) => ({ ...h, hora_fim: e.target.value }))}
          />
        </div>
      </CrudDrawer>

      <CrudDrawer
        open={distribuir !== null}
        onClose={() => setDistribuir(null)}
        title="Distribuir os grupos"
        subtitle="Os dias da semana escolhidos recebem os grupos em ordem, em ciclo. Substitui os dias já escolhidos neste mês."
        icon={<CalendarRange />}
        saveLabel="Distribuir"
        saving={ocupado === 'distribuir'}
        saveDisabled={!distribuir || distribuir.semana.length === 0 || distribuir.grupos.length === 0}
        onSave={() => void confirmarDistribuir()}
      >
        {distribuir && (
          <DistribuirCampos
            form={distribuir}
            onChange={setDistribuir}
            grupos={gruposAtivos.map((g) => ({ id: g.id, nome: g.nome, cor: g.cor }))}
          />
        )}
      </CrudDrawer>
    </div>
  );
}

function PlanejadorSkeleton() {
  return (
    <div className="flex flex-col gap-3" data-testid="escala-loading">
      <Skeleton className="h-11 w-full rounded-xl" />
      <Skeleton className="h-64 w-full rounded-xl" />
    </div>
  );
}

function StatusDoPlano({ plano, pendente }: { plano: PlanoEscala; pendente: boolean }) {
  if (plano.status === 'publicado') {
    return (
      <Alert variant={pendente ? 'warning' : 'success'}>
        <AlertDescription>
          {pendente ? (
            <span>
              <b>Há mudanças que os médiuns ainda não veem.</b> Publique para valer.
            </span>
          ) : (
            <span>
              <b>Publicada</b>
              {plano.publicado_em ? ` em ${formatDateBr(plano.publicado_em)}` : ''}
              {plano.publicado_por ? ` por ${plano.publicado_por}` : ''}. Os médiuns dos grupos já veem as faxinas na Agenda.
            </span>
          )}
        </AlertDescription>
      </Alert>
    );
  }
  return (
    <Alert variant="info">
      <AlertDescription>
        <span>
          <b>Rascunho.</b> Os médiuns só veem depois de publicar.
        </span>
      </AlertDescription>
    </Alert>
  );
}

function ResumoPublicacao({ plano, dias }: { plano: PlanoEscala; dias: DiaRascunho[] }) {
  const futuros = dias.filter((d) => d.data >= plano.hoje);
  const p = plano.pendencias;
  const ignorados = p.ignorados_passado > 0 && (
    <p>{plural(p.ignorados_passado, 'mudança em dia que já passou não vale', 'mudanças em dias que já passaram não valem')}: o passado não muda.</p>
  );
  if (plano.status !== 'publicado') {
    return (
      <div className="flex flex-col gap-2" data-testid="resumo-publicacao">
        <p>Os médiuns dos grupos passam a ver as faxinas na Agenda, com “Vou” e “Não vou”.</p>
        <p className="font-semibold text-foreground">
          {plural(futuros.length, 'faxina', 'faxinas')} em {plural(quantosDias(futuros), 'dia', 'dias')} · cerca de{' '}
          {plural(convocacoesPrevistas(futuros, plano.grupos), 'convocação', 'convocações')}
        </p>
        {ignorados}
      </div>
    );
  }
  const partes = [
    p.criar && plural(p.criar, 'faxina nova', 'faxinas novas'),
    p.trocar && plural(p.trocar, 'dia com grupo trocado', 'dias com grupo trocado'),
    p.reagendar && plural(p.reagendar, 'horário mudado', 'horários mudados'),
    p.cancelar && plural(p.cancelar, 'faxina cancelada', 'faxinas canceladas'),
  ].filter(Boolean);
  return (
    <div className="flex flex-col gap-2" data-testid="resumo-publicacao">
      <p className="font-semibold text-foreground">{partes.length ? partes.join(' · ') : 'Nada muda para os médiuns.'}</p>
      <p>
        Grupo trocado: quem era do grupo antigo sai da escala e o grupo novo entra. Dia tirado: a faxina é cancelada.
        O que não mudou continua com as respostas de cada um.
      </p>
      {ignorados}
    </div>
  );
}

function GradeDoMes({
  mes,
  dias,
  hoje,
  grupos,
  selecionado,
  editavel,
  onTocar,
}: {
  mes: string;
  dias: DiaRascunho[];
  hoje: string;
  grupos: Map<string, { id: string; nome: string; cor: string }>;
  selecionado: string;
  editavel: boolean;
  onTocar: (data: string) => void;
}) {
  const porData = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const d of dias) m.set(d.data, [...(m.get(d.data) ?? []), d.grupo_id]);
    return m;
  }, [dias]);
  return (
    <div className="rounded-xl border bg-card p-2" data-testid="grade-mes">
      <div className="grid grid-cols-7 gap-1 text-center text-xs font-semibold text-muted-foreground" aria-hidden>
        {SIGLAS_SEMANA.map((s, i) => (
          <span key={i} className="py-1">
            {s}
          </span>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {gradeDoMes(mes).map((dia, i) => {
          if (dia === null) return <span key={`v${i}`} aria-hidden />;
          const data = dataDoDia(mes, dia);
          const ids = porData.get(data) ?? [];
          const nomes = ids.map((id) => grupos.get(id)?.nome ?? 'Grupo');
          const passou = data < hoje;
          const semana = diaDaSemana(data);
          const rotulo = `Dia ${dia}, ${NOMES_SEMANA[semana]}${nomes.length ? `: ${nomes.join(' e ')}` : ''}${passou ? ' (já passou)' : ''}`;
          const conteudo = (
            <>
              <span className={cn('leading-none', semana === SABADO && 'font-bold')}>{dia}</span>
              <span className="flex max-w-full flex-wrap justify-center gap-0.5">
                {ids.slice(0, 2).map((id) => (
                  <span
                    key={id}
                    className="max-w-full truncate rounded px-1 text-[10px] leading-4 font-bold text-white"
                    style={{ backgroundColor: corDoGrupo(grupos.get(id)?.cor) }}
                  >
                    {grupos.get(id)?.nome ?? '?'}
                  </span>
                ))}
                {ids.length > 2 && <span className="text-[10px] leading-4 font-bold">+{ids.length - 2}</span>}
              </span>
            </>
          );
          const classe = cn(
            'flex min-h-11 min-w-0 flex-col items-center justify-start gap-0.5 overflow-hidden rounded-md border px-0.5 pt-1 text-sm',
            ids.length ? 'border-foreground/30 bg-muted' : 'border-transparent',
            passou && 'opacity-50',
          );
          if (!editavel || passou) {
            return (
              <div key={data} className={classe} aria-label={rotulo} role="img" data-testid={`dia-${dia}`}>
                {conteudo}
              </div>
            );
          }
          return (
            <button
              key={data}
              type="button"
              aria-label={rotulo}
              aria-pressed={ids.includes(selecionado)}
              onClick={() => onTocar(data)}
              data-testid={`dia-${dia}`}
              className={cn(classe, 'outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50')}
            >
              {conteudo}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function DistribuirCampos({
  form,
  onChange,
  grupos,
}: {
  form: DistribuirForm;
  onChange: (f: DistribuirForm) => void;
  grupos: { id: string; nome: string; cor: string }[];
}) {
  const nome = new Map(grupos.map((g) => [g.id, g]));
  const fora = grupos.filter((g) => !form.grupos.includes(g.id));
  const alternarSemana = (s: number) =>
    onChange({ ...form, semana: form.semana.includes(s) ? form.semana.filter((x) => x !== s) : [...form.semana, s].sort() });
  const mover = (i: number, delta: number) => {
    const lista = [...form.grupos];
    const j = i + delta;
    if (j < 0 || j >= lista.length) return;
    [lista[i], lista[j]] = [lista[j], lista[i]];
    onChange({ ...form, grupos: lista });
  };
  return (
    <div className="flex flex-col gap-5">
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-semibold">Dias da semana</legend>
        <div className="grid grid-cols-7 gap-1">
          {SIGLAS_SEMANA.map((s, i) => (
            <button
              key={i}
              type="button"
              aria-pressed={form.semana.includes(i)}
              aria-label={NOMES_SEMANA_PLURAL[i]}
              onClick={() => alternarSemana(i)}
              className={cn(
                'min-h-11 rounded-md border text-sm font-semibold outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
                form.semana.includes(i) ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card',
              )}
            >
              {s}
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-semibold">Grupos, na ordem</legend>
        <ol className="flex flex-col gap-1">
          {form.grupos.map((id, i) => {
            const g = nome.get(id);
            if (!g) return null;
            return (
              <li key={id} className="flex items-center gap-2 rounded-md border bg-card px-2 py-1">
                <span className="w-5 text-sm text-muted-foreground">{i + 1}º</span>
                <GrupoChip grupo={g} size="sm" />
                <span className="ml-auto flex gap-1">
                  <Button variant="ghost" size="icon-sm" onClick={() => mover(i, -1)} disabled={i === 0} aria-label={`Subir ${g.nome}`}>
                    <ArrowUp />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => mover(i, 1)}
                    disabled={i === form.grupos.length - 1}
                    aria-label={`Descer ${g.nome}`}
                  >
                    <ArrowDown />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onChange({ ...form, grupos: form.grupos.filter((x) => x !== id) })}
                    aria-label={`Tirar ${g.nome}`}
                  >
                    Tirar
                  </Button>
                </span>
              </li>
            );
          })}
        </ol>
        {fora.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {fora.map((g) => (
              <Button key={g.id} variant="outline" size="sm" onClick={() => onChange({ ...form, grupos: [...form.grupos, g.id] })}>
                <Plus aria-hidden />
                {g.nome}
              </Button>
            ))}
          </div>
        )}
      </fieldset>

      <div className="grid grid-cols-2 gap-3">
        <TextField
          label="Começa às"
          type="time"
          value={form.hora_inicio}
          onChange={(e) => onChange({ ...form, hora_inicio: e.target.value })}
        />
        <TextField
          label="Termina às"
          type="time"
          value={form.hora_fim}
          onChange={(e) => onChange({ ...form, hora_fim: e.target.value })}
        />
      </div>
    </div>
  );
}
