/**
 * /admin/atividades/[id]/escala — escala por função da gira (e de atividades de tipo com escala
 * "por função") (AM-18, §8.8 do plano da Área do Médium).
 *
 * Lista as funções da casa (Cambone, Porteiro, Ogã/Atabaque...); em cada uma, médiuns um a um
 * (só os elegíveis do tipo; quem já está em outra função some da lista — uma função por médium) e/ou
 * grupos da corrente inteiros. "Salvar escala" grava tudo (quem saiu fica "fora da escala");
 * "Copiar da gira anterior" (a última anterior com escala) e "Rodízio" (`RodizioDrawer`). Resumo
 * em texto no topo. Médiuns sem função continuam na gira pelo tipo ("todos os elegíveis").
 *
 * Da gira: `?origem=gira` com o id da GIRA → `POST /admin/atividades/da-gira/{id}/escala` (âncora)
 * e troca a URL pelo id da atividade. Gates: Área liberada (`area_medium`), plano `escalas` (senão
 * `PlanLocked` com `minPlanFor('escalas')`), grupo `escalas:view`; editar com `escalas:edit`.
 * Backend: `api/v1/admin/atividades_escala.py`.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { ArrowLeft, CalendarDays, Copy, Repeat, Save, Undo2, Users } from 'lucide-react';
import AdminLayout from '../../admin_layout';
import { useSubscription } from '@/hooks/useSubscription';
import { usePermissions } from '@/hooks/usePermissions';
import { useSnackbar } from '@/contexts/SnackbarContext';
import { apiClient, extractApiErrorMessage } from '@/services/api_client';
import { ConfirmDialog } from '@/components/admin/ConfirmDialog';
import { PorNaEscalaCampos, useGruposDaCorrente } from '@/components/admin/atividades/PorNaEscalaCampos';
import { RodizioDrawer } from '@/components/admin/atividades/RodizioDrawer';
import { TipoChip } from '@/components/atividades/TipoChip';
import { GrupoChip } from '@/components/grupos/GrupoChip';
import { EmptyState } from '@/components/EmptyState';
import { PermissionDenied, PlanLocked } from '@/components/gates';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { minPlanFor } from '@/constants/plans';
import { CLASSE_TOM } from '@/constants/presenca';
import {
  API_ESCALA,
  corpoDoRascunho,
  mesmoRascunho,
  rascunhoDe,
  resumoDaEscala,
  textoResultadoEscala,
  type EscalaResponse,
  type EscalaSalvaResponse,
  type FuncaoNaEscala,
  type Rascunho,
  type RodizioResponse,
} from '@/constants/escalaGira';
import { formatDateTimeBr } from '@/lib/dateBr';
import { cn } from '@/lib/utils';

export default function AdminEscalaPage() {
  return (
    <AdminLayout title="Escala">
      <EscalaGate />
    </AdminLayout>
  );
}

function EscalaGate() {
  const { can, loading } = useSubscription();
  const { can: canGroup } = usePermissions();
  if (loading) return <Skeleton className="h-64 w-full" />;
  if (!can('area_medium')) {
    return (
      <EmptyState
        icon={<Users />}
        title="Escala"
        description="A Área do Médium ainda não está disponível para este terreiro."
      />
    );
  }
  if (!can('escalas')) {
    return <PlanLocked feature="Escala de gira por função" minPlan={minPlanFor('escalas').label} />;
  }
  if (!canGroup('escalas', 'view')) return <PermissionDenied className="mt-4" />;
  return <Escala />;
}

type Erro = { tipo: 'proibido' | 'nao_encontrada' | 'sem_escala' | 'rede'; mensagem?: string };

function erroDe(err: unknown): Erro {
  const status = (err as { status?: number; response?: { status?: number } })?.status ??
    (err as { response?: { status?: number } })?.response?.status;
  if (status === 403) return { tipo: 'proibido' };
  if (status === 404) return { tipo: 'nao_encontrada' };
  if (status === 409) return { tipo: 'sem_escala', mensagem: extractApiErrorMessage(err, '') };
  return { tipo: 'rede' };
}

function Pessoas({ funcao }: { funcao: FuncaoNaEscala }) {
  if (funcao.mediuns.length === 0 && funcao.grupos.length === 0) {
    return <p className="text-sm text-muted-foreground">Ninguém nesta função.</p>;
  }
  return (
    <div className="flex flex-col gap-1.5 text-sm">
      {funcao.grupos.map((g) => (
        <p key={g.id} className="flex flex-wrap items-center gap-1.5">
          <GrupoChip grupo={g} size="sm" />
          <span className="text-muted-foreground">
            {g.mediuns.length ? g.mediuns.map((m) => m.nome).join(', ') : 'nenhum membro ativo'}
          </span>
        </p>
      ))}
      {funcao.mediuns.length > 0 && <p>{funcao.mediuns.map((m) => m.nome).join(', ')}</p>}
    </div>
  );
}

function Escala() {
  const router = useRouter();
  const { can: canGroup } = usePermissions();
  const { showSuccess, showError } = useSnackbar();
  const id = typeof router.query.id === 'string' ? router.query.id : null;
  const daGira = router.query.origem === 'gira';
  const canEdit = canGroup('escalas', 'edit');
  const [dados, setDados] = useState<EscalaResponse | null>(null);
  const [rascunho, setRascunho] = useState<Rascunho>({});
  const [erro, setErro] = useState<Erro | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [copiar, setCopiar] = useState(false);
  const [rodizioAberto, setRodizioAberto] = useState(false);
  const grupos = useGruposDaCorrente(canEdit);

  const aplicar = useCallback((escala: EscalaResponse) => {
    setDados(escala);
    setRascunho(rascunhoDe(escala));
  }, []);

  const carregar = useCallback(async () => {
    if (!id) return;
    setErro(null);
    try {
      if (daGira) {
        const res = await apiClient.post<{ atividade_id: string }>(
          `${API_ESCALA}/da-gira/${encodeURIComponent(id)}/escala`,
        );
        await router.replace(`/admin/atividades/${res.data.atividade_id}/escala`);
        return;
      }
      const res = await apiClient.get<EscalaResponse>(`${API_ESCALA}/${encodeURIComponent(id)}/escala`);
      aplicar(res.data);
    } catch (err) {
      setErro(erroDe(err));
    }
    // router fica fora: a troca de URL já muda `id`/`daGira`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, daGira, aplicar]);

  useEffect(() => {
    if (router.isReady) void carregar();
  }, [router.isReady, carregar]);

  const original = useMemo(() => (dados ? rascunhoDe(dados) : {}), [dados]);
  const sujo = !mesmoRascunho(original, rascunho);

  if (erro?.tipo === 'proibido') return <PermissionDenied className="mt-4" />;
  if (erro) {
    return (
      <EmptyState
        icon={<CalendarDays />}
        title={
          erro.tipo === 'nao_encontrada'
            ? 'Não encontramos esta gira ou atividade'
            : erro.tipo === 'sem_escala'
              ? 'Sem escala por função'
              : 'Não foi possível abrir a escala'
        }
        description={
          erro.tipo === 'nao_encontrada'
            ? 'Ela pode ter sido excluída.'
            : erro.tipo === 'sem_escala'
              ? erro.mensagem || 'Este tipo de atividade não tem escala por função.'
              : 'Confira a internet e tente de novo.'
        }
        action={
          erro.tipo === 'rede' ? (
            <Button variant="outline" onClick={() => void carregar()}>
              Tentar de novo
            </Button>
          ) : (
            <Button asChild variant="outline">
              <Link href="/admin/atividades">Voltar para Atividades e escalas</Link>
            </Button>
          )
        }
      />
    );
  }
  if (!dados) return <Skeleton className="h-64 w-full" aria-label="Carregando a escala" />;

  const a = dados.atividade;
  const unidade = a.origem === 'gira' ? 'gira' : 'atividade';
  const editavel = canEdit && a.pode_editar;
  const ocupado = salvando;

  const mudar = (funcaoId: string, parte: Partial<Rascunho[string]>) =>
    setRascunho((r) => ({
      ...r,
      [funcaoId]: { ...(r[funcaoId] ?? { mediumIds: [], grupoIds: [] }), ...parte },
    }));

  const opcoesDe = (f: FuncaoNaEscala) => {
    const emOutras = new Set(
      Object.entries(rascunho)
        .filter(([fid]) => fid !== f.id)
        .flatMap(([, v]) => v.mediumIds),
    );
    const base = [...dados.elegiveis];
    for (const m of f.mediuns) {
      if (!base.some((e) => e.id === m.medium_id)) base.push({ id: m.medium_id, nome: m.nome });
    }
    return base.filter((m) => !emOutras.has(m.id));
  };

  const salvar = async () => {
    if (!id) return;
    setSalvando(true);
    try {
      const res = await apiClient.put<EscalaSalvaResponse>(
        `${API_ESCALA}/${encodeURIComponent(a.atividade_id)}/escala`,
        corpoDoRascunho(rascunho),
      );
      aplicar(res.data);
      showSuccess(textoResultadoEscala(res.data.resultado));
    } catch (err) {
      showError(extractApiErrorMessage(err, 'Não foi possível salvar a escala. Tente de novo.'));
    } finally {
      setSalvando(false);
    }
  };

  const copiarAnterior = async () => {
    setSalvando(true);
    try {
      const res = await apiClient.post<EscalaSalvaResponse>(
        `${API_ESCALA}/${encodeURIComponent(a.atividade_id)}/escala/copiar-anterior`,
      );
      aplicar(res.data);
      showSuccess(`Escala copiada. ${textoResultadoEscala(res.data.resultado)}`);
    } catch (err) {
      showError(extractApiErrorMessage(err, 'Não foi possível copiar a escala.'));
    } finally {
      setSalvando(false);
      setCopiar(false);
    }
  };

  const rodizioFeito = (res: RodizioResponse) => {
    aplicar(res);
    setRodizioAberto(false);
    const outros = res.rodizio.flatMap((r) => r.em_outra_funcao_nomes);
    const n = res.rodizio.length;
    showSuccess(
      `Rodízio feito em ${n} ${n === 1 ? unidade : `${unidade}s`}.` +
        (outros.length ? ` Já tinham outra função e ficaram nela: ${Array.from(new Set(outros)).join(', ')}.` : ''),
    );
  };

  return (
    <div className="flex flex-col gap-5">
      <Link
        href="/admin/atividades"
        className="inline-flex items-center gap-1.5 self-start text-sm font-semibold text-brand hover:underline"
      >
        <ArrowLeft className="size-4" aria-hidden /> Voltar para Atividades e escalas
      </Link>

      <header className="flex flex-col gap-2">
        <TipoChip tipo={a.tipo} size="sm" />
        <h1 className="text-2xl font-bold">Escala · {a.titulo}</h1>
        <p className="text-sm text-muted-foreground">
          {formatDateTimeBr(a.inicio)}
          {a.local ? ` · ${a.local}` : ''}
        </p>
        {a.cancelada && (
          <p className={cn('self-start rounded-md px-3 py-1.5 text-sm font-semibold', CLASSE_TOM.bad)}>
            {a.origem === 'gira' ? 'Gira cancelada.' : 'Atividade cancelada.'} A escala não muda mais.
          </p>
        )}
        {a.chamada_encerrada && !a.cancelada && (
          <p className={cn('self-start rounded-md px-3 py-1.5 text-sm font-semibold', CLASSE_TOM.muted)}>
            A chamada já foi encerrada. A escala não muda mais.
          </p>
        )}
      </header>

      <Card className="gap-1 px-4 py-3" data-testid="escala-resumo">
        <span className="text-sm font-semibold">
          {dados.total_na_escala === 1 ? '1 médium na escala' : `${dados.total_na_escala} médiuns na escala`}
        </span>
        <span className="text-sm text-muted-foreground">{resumoDaEscala(dados)}</span>
        {a.convocacao_padrao === 'todos_elegiveis' && (
          <span className="text-xs text-muted-foreground">
            Quem não tem função continua chamado para a {unidade} como sempre.
          </span>
        )}
      </Card>

      {editavel && (
        <div className="flex flex-wrap gap-2">
          {dados.anterior && (
            <Button
              type="button"
              variant="outline"
              disabled={ocupado || sujo}
              onClick={() => (dados.total_na_escala > 0 ? setCopiar(true) : void copiarAnterior())}
            >
              <Copy aria-hidden /> Copiar da {a.origem === 'gira' ? 'gira' : 'atividade'} anterior
            </Button>
          )}
          <Button type="button" variant="outline" disabled={ocupado || sujo} onClick={() => setRodizioAberto(true)}>
            <Repeat aria-hidden /> Rodízio
          </Button>
          {sujo && (
            <span className="self-center text-xs text-muted-foreground">
              Salve ou desfaça as mudanças para copiar ou fazer rodízio.
            </span>
          )}
        </div>
      )}

      <div className="flex flex-col gap-3">
        {dados.funcoes.length === 0 && (
          <EmptyState
            icon={<Users />}
            title="Nenhuma função cadastrada"
            description="Cadastre as funções da casa (Cambone, Porteiro...) na aba “Tipos e funções”."
          />
        )}
        {dados.funcoes.map((f) => (
          <Card key={f.id} className="gap-3 px-4 py-4" data-testid="escala-funcao" aria-label={f.nome}>
            <div className="flex flex-col gap-0.5">
              <h2 className="text-lg font-semibold">
                {f.nome}
                {f.arquivada && <span className="ml-2 text-xs font-normal text-muted-foreground">(arquivada)</span>}
              </h2>
              {f.descricao && <p className="text-sm text-muted-foreground">{f.descricao}</p>}
            </div>
            {editavel ? (
              <>
                <PorNaEscalaCampos
                  mediuns={opcoesDe(f)}
                  grupos={grupos}
                  mediumIds={rascunho[f.id]?.mediumIds ?? []}
                  grupoIds={rascunho[f.id]?.grupoIds ?? []}
                  onMediumIds={(ids) => mudar(f.id, { mediumIds: ids })}
                  onGrupoIds={(ids) => mudar(f.id, { grupoIds: ids })}
                />
                {f.grupos.length > 0 && (
                  <div className="text-xs text-muted-foreground">
                    <Pessoas funcao={{ ...f, mediuns: [] }} />
                  </div>
                )}
              </>
            ) : (
              <Pessoas funcao={f} />
            )}
          </Card>
        ))}
      </div>

      {dados.tirados.length > 0 && (
        <p className="text-sm text-muted-foreground" data-testid="escala-tirados">
          Fora da escala: {dados.tirados.map((t) => (t.funcao ? `${t.nome} (era ${t.funcao})` : t.nome)).join(', ')}.
        </p>
      )}

      {editavel && (
        <div className="sticky bottom-0 flex flex-wrap justify-end gap-2 border-t bg-background py-3">
          {sujo && (
            <Button type="button" variant="ghost" disabled={ocupado} onClick={() => setRascunho(rascunhoDe(dados))}>
              <Undo2 aria-hidden /> Desfazer
            </Button>
          )}
          <Button type="button" disabled={!sujo || ocupado} onClick={() => void salvar()}>
            <Save aria-hidden /> Salvar escala
          </Button>
        </div>
      )}

      <ConfirmDialog
        open={copiar}
        title={`Copiar da ${unidade} anterior`}
        message={
          dados.anterior
            ? `A escala desta ${unidade} vai ser trocada pela de “${dados.anterior.titulo}” (${formatDateTimeBr(dados.anterior.inicio)}). Quem sair fica fora da escala.`
            : ''
        }
        confirmText="Copiar"
        loading={ocupado}
        onConfirm={() => void copiarAnterior()}
        onCancel={() => setCopiar(false)}
      />
      {editavel && (
        <RodizioDrawer
          open={rodizioAberto}
          onClose={() => setRodizioAberto(false)}
          escala={dados}
          grupos={grupos}
          onFeito={rodizioFeito}
        />
      )}
    </div>
  );
}
