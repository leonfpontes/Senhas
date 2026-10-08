/**
 * Aba "Trocas" de Atividades e escalas (AM-27) — trocas de escala pedidas pelos médiuns na Área.
 *
 * Lista as trocas abertas (ou o histórico de 60 dias, "Ver resolvidas"): atividade, função/grupo,
 * quem pediu, o colega e o que falta. Ações (`escalas:edit`, botões ocultos sem a permissão):
 * - **Aprovar** a troca que o colega aceitou (`ConfirmDialog`);
 * - **Escolher quem vai** no pedido "a direção escolhe" (`CrudDrawer` com `Combobox` dos médiuns
 *   que podem ir — `GET /trocas/{id}/substitutos`) e aprovar;
 * - **Recusar** (quando espera a direção) e **Cancelar** (pedido que ainda espera o colega), com
 *   `ConfirmDialog`.
 * Gates: sem `can('escalas')` → `PlanLocked` (`minPlanFor('escalas')`); sem `escalas:view` →
 * `PermissionDenied`. Backend: `api/v1/admin/atividades_trocas.py`.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { ArrowRightLeft, Check, X } from 'lucide-react';
import { useSubscription } from '@/hooks/useSubscription';
import { usePermissions } from '@/hooks/usePermissions';
import { useSnackbar } from '@/contexts/SnackbarContext';
import { apiClient, extractApiErrorMessage } from '@/services/api_client';
import CrudDrawer from '@/components/CrudDrawer';
import { ConfirmDialog } from '@/components/admin/ConfirmDialog';
import { EmptyState } from '@/components/EmptyState';
import { Combobox } from '@/components/fields/Combobox';
import { PermissionDenied, PlanLocked } from '@/components/gates';
import { TipoChip } from '@/components/atividades/TipoChip';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { minPlanFor } from '@/constants/plans';
import {
  ROTULO_STATUS_TROCA,
  TROCAS_ADMIN_URL,
  acaoTrocaAdminHref,
  situacaoTrocaAdmin,
  type TrocaAdmin,
  type TrocasAdminResponse,
} from '@/constants/trocas';
import { formatDateTimeBr } from '@/lib/dateBr';

type Acao = { tipo: 'aprovar' | 'recusar' | 'cancelar'; troca: TrocaAdmin };

export function TrocasDaEscala({ onContagem }: { onContagem?: (n: number) => void }) {
  const { can } = useSubscription();
  const { can: canGroup } = usePermissions();
  if (!can('escalas')) return <PlanLocked feature="Troca de escala" minPlan={minPlanFor('escalas').label} />;
  if (!canGroup('escalas', 'view')) return <PermissionDenied />;
  return <ListaDeTrocas canEdit={canGroup('escalas', 'edit')} onContagem={onContagem} />;
}

function ListaDeTrocas({ canEdit, onContagem }: { canEdit: boolean; onContagem?: (n: number) => void }) {
  const { showSuccess, showError } = useSnackbar();
  const [dados, setDados] = useState<TrocasAdminResponse | null>(null);
  const [erro, setErro] = useState(false);
  const [resolvidas, setResolvidas] = useState(false);
  const [acao, setAcao] = useState<Acao | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [escolher, setEscolher] = useState<TrocaAdmin | null>(null);
  const [opcoes, setOpcoes] = useState<{ id: string; nome: string }[] | null>(null);
  const [substituto, setSubstituto] = useState<string | null>(null);
  const [erroDrawer, setErroDrawer] = useState<string | null>(null);

  const carregar = useCallback(() => {
    setErro(false);
    apiClient
      .get<TrocasAdminResponse>(TROCAS_ADMIN_URL, { params: { abertas: !resolvidas } })
      .then((res) => {
        setDados(res.data);
        if (!resolvidas) onContagem?.(res.data.aguardando_direcao);
      })
      .catch(() => setErro(true));
  }, [resolvidas, onContagem]);

  useEffect(() => carregar(), [carregar]);

  useEffect(() => {
    if (!escolher) return;
    setOpcoes(null);
    setSubstituto(null);
    setErroDrawer(null);
    apiClient
      .get<{ id: string; nome: string }[]>(acaoTrocaAdminHref(escolher.id, 'substitutos'))
      .then((res) => setOpcoes(res.data))
      .catch((err) => {
        setOpcoes([]);
        setErroDrawer(extractApiErrorMessage(err, 'Não conseguimos carregar quem pode ir.'));
      });
  }, [escolher]);

  const executar = async (tipo: Acao['tipo'], troca: TrocaAdmin, substitutoId?: string | null) => {
    setEnviando(true);
    try {
      await apiClient.post(acaoTrocaAdminHref(troca.id, tipo), tipo === 'aprovar' ? { substituto_id: substitutoId ?? null } : {});
      showSuccess(
        tipo === 'aprovar' ? 'Troca aprovada. A escala já mudou.' : tipo === 'recusar' ? 'Troca recusada.' : 'Pedido cancelado.',
      );
      setAcao(null);
      setEscolher(null);
      carregar();
    } catch (err) {
      const msg = extractApiErrorMessage(err, 'Não conseguimos concluir. Tente de novo.');
      if (tipo === 'aprovar' && substitutoId) setErroDrawer(msg);
      else showError(msg);
    } finally {
      setEnviando(false);
    }
  };

  const textoAcao = (a: Acao) => {
    const quem = a.troca.solicitante.nome;
    if (a.tipo === 'aprovar') {
      return `${a.troca.substituto?.nome ?? 'O colega'} vai no lugar de ${quem} em “${a.troca.atividade.titulo}”${a.troca.funcao ? ` (${a.troca.funcao})` : ''}. A escala muda na hora.`;
    }
    if (a.tipo === 'recusar') return `${quem} continua na escala de “${a.troca.atividade.titulo}”.`;
    return `O pedido de ${quem} deixa de valer e ninguém precisa mais responder.`;
  };

  return (
    <div className="flex flex-col gap-4" data-testid="trocas-da-escala">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {dados
            ? dados.exige_aprovacao
              ? 'Nesta casa, a troca combinada entre médiuns precisa da aprovação da direção.'
              : 'Nesta casa, a troca vale assim que o colega aceita. Você ainda pode cancelar pedidos abertos.'
            : ' '}
        </p>
        <label className="flex items-center gap-2 text-sm font-medium">
          <Switch checked={resolvidas} onCheckedChange={setResolvidas} aria-label="Ver também as resolvidas" />
          Ver também as resolvidas
        </label>
      </div>

      {erro ? (
        <EmptyState
          icon={<ArrowRightLeft />}
          title="Não conseguimos carregar as trocas"
          description="Confira a internet e tente de novo."
          action={
            <Button type="button" onClick={carregar}>
              Tentar de novo
            </Button>
          }
        />
      ) : !dados ? (
        <div className="flex flex-col gap-3" role="status" aria-label="Carregando as trocas">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      ) : dados.trocas.length === 0 ? (
        <EmptyState
          icon={<ArrowRightLeft />}
          title={resolvidas ? 'Nenhuma troca nos últimos 60 dias' : 'Nenhum pedido de troca aberto'}
          description="Quando um médium pedir troca na escala pela Área, o pedido aparece aqui."
        />
      ) : (
        <ul className="flex flex-col gap-3">
          {dados.trocas.map((t) => {
            const esperaDirecao = t.aguardando === 'direcao' && t.vigente;
            const aberta = t.status === 'pedido' || t.status === 'aceito';
            return (
              <li key={t.id} className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 shadow-sm" data-testid="troca-linha">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="flex min-w-0 flex-col gap-1">
                    <TipoChip tipo={t.atividade.tipo} />
                    <p className="font-semibold">
                      {t.atividade.titulo} · {formatDateTimeBr(t.atividade.inicio)}
                    </p>
                    {(t.funcao || t.grupo) && (
                      <p className="text-sm text-muted-foreground">{t.funcao ? `Função: ${t.funcao}` : `Grupo: ${t.grupo}`}</p>
                    )}
                  </div>
                  <Badge variant={esperaDirecao ? 'default' : 'secondary'}>{ROTULO_STATUS_TROCA[t.status]}</Badge>
                </div>
                <p className="text-sm">
                  <b>{t.solicitante.nome}</b> pediu troca
                  {t.substituto ? (
                    <>
                      {' '}
                      com <b>{t.substituto.nome}</b>
                    </>
                  ) : (
                    ' e deixou a direção escolher'
                  )}
                  . <span className="text-muted-foreground">{situacaoTrocaAdmin(t)}.</span>
                </p>
                {t.recado && <p className="text-sm text-muted-foreground">Recado: {t.recado}</p>}
                <p className="text-xs text-muted-foreground">Pedido em {formatDateTimeBr(t.criada_em)}</p>
                {canEdit && aberta && (
                  <div className="flex flex-wrap gap-2">
                    {esperaDirecao && t.substituto && (
                      <Button type="button" size="sm" onClick={() => setAcao({ tipo: 'aprovar', troca: t })}>
                        <Check aria-hidden /> Aprovar
                      </Button>
                    )}
                    {esperaDirecao && !t.substituto && (
                      <Button type="button" size="sm" onClick={() => setEscolher(t)}>
                        <Check aria-hidden /> Escolher quem vai
                      </Button>
                    )}
                    {esperaDirecao && (
                      <Button type="button" size="sm" variant="outline" onClick={() => setAcao({ tipo: 'recusar', troca: t })}>
                        <X aria-hidden /> Recusar
                      </Button>
                    )}
                    {(!esperaDirecao || !t.vigente) && (
                      <Button type="button" size="sm" variant="outline" onClick={() => setAcao({ tipo: 'cancelar', troca: t })}>
                        Cancelar pedido
                      </Button>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {acao && (
        <ConfirmDialog
          open
          title={acao.tipo === 'aprovar' ? 'Aprovar a troca?' : acao.tipo === 'recusar' ? 'Recusar a troca?' : 'Cancelar o pedido?'}
          message={textoAcao(acao)}
          confirmText={acao.tipo === 'aprovar' ? 'Aprovar' : acao.tipo === 'recusar' ? 'Recusar' : 'Cancelar pedido'}
          cancelText="Voltar"
          destructive={acao.tipo !== 'aprovar'}
          loading={enviando}
          onConfirm={() => void executar(acao.tipo, acao.troca)}
          onCancel={() => setAcao(null)}
        />
      )}

      <CrudDrawer
        open={escolher !== null}
        onClose={() => setEscolher(null)}
        title="Escolher quem vai"
        subtitle={
          escolher
            ? `No lugar de ${escolher.solicitante.nome} em “${escolher.atividade.titulo}”${escolher.funcao ? ` (${escolher.funcao})` : ''}`
            : undefined
        }
        onSave={() => (escolher && substituto ? executar('aprovar', escolher, substituto) : undefined)}
        saveLabel="Aprovar a troca"
        saving={enviando}
        saveDisabled={!substituto}
        isDirty={Boolean(substituto)}
        error={erroDrawer}
      >
        <Combobox
          label="Quem vai no lugar"
          options={(opcoes ?? []).map((o) => ({ value: o.id, label: o.nome }))}
          value={substituto}
          onChange={setSubstituto}
          loading={opcoes === null}
          placeholder="Escolha um médium"
          emptyText="Ninguém que possa ir está fora da escala."
          helperText="Só médiuns ativos que este tipo de atividade alcança e que ainda não estão nesta escala."
        />
      </CrudDrawer>
    </div>
  );
}
