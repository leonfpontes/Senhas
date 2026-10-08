/**
 * "Confirmações" de uma atividade ou gira (AM-17) — painel lateral da tela Atividades e escalas.
 *
 * `GET /admin/atividades/{id}/confirmacoes` (ESCALAS:view): contadores (vão, não vão, sem
 * resposta) e a lista com o motivo de quem avisou que não vai (dado possivelmente de saúde, §6.8:
 * só aqui, para quem cuida das escalas). Com ESCALAS:insert, "Pôr na escala" (convocar à mão —
 * faxina, ritual individual, "só escalados") com médiuns e/ou grupos da corrente inteiros (AM-29,
 * `PorNaEscalaCampos`; o toast diz quantos entraram, quantos já estavam e quem o tipo não alcança);
 * com ESCALAS:edit, "Tirar da escala" (dispensar) e o abono do motivo (AM-27: "Aceitar motivo" /
 * "Recusar motivo" — `AbonoJustificativa`; recusado conta como falta sem justificativa).
 * Troca (AM-27): "Trocou com Beto" / "No lugar de Ana" na linha de quem trocou.
 * Na gira, o painel garante a âncora antes (`POST /da-gira/{id}`).
 */
import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ClipboardCheck, UserMinus, UserPlus } from 'lucide-react';
import { useSnackbar } from '@/contexts/SnackbarContext';
import { apiClient, extractApiErrorMessage } from '@/services/api_client';
import { Button } from '@/components/ui/button';
import { AbonoJustificativa } from '@/components/admin/presenca/AbonoJustificativa';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import {
  CLASSE_TOM,
  ROTULO_SITUACAO,
  TOM_SITUACAO,
  type ChamadaResponse,
  type ConvocarResponse,
} from '@/constants/presenca';
import { formatDateTimeBr } from '@/lib/dateBr';
import { cn } from '@/lib/utils';
import { PorNaEscalaCampos, textoResultadoConvocacao, useGruposDaCorrente } from './PorNaEscalaCampos';
import { API_ATIVIDADES } from './TiposEFuncoes';

export interface AlvoConfirmacoes {
  origem: 'gira' | 'atividade';
  id: string;
  titulo: string;
}

export function ConfirmacoesSheet({
  alvo,
  onClose,
  canInsert,
  canEdit,
}: {
  alvo: AlvoConfirmacoes | null;
  onClose: () => void;
  canInsert: boolean;
  canEdit: boolean;
}) {
  const { showSuccess, showError } = useSnackbar();
  const [atividadeId, setAtividadeId] = useState<string | null>(null);
  const [dados, setDados] = useState<ChamadaResponse | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [convocar, setConvocar] = useState<string[]>([]);
  const [convocarGrupos, setConvocarGrupos] = useState<string[]>([]);
  const [ocupado, setOcupado] = useState(false);
  const grupos = useGruposDaCorrente(canInsert && alvo !== null);

  const carregar = useCallback(async (aid: string) => {
    const res = await apiClient.get<ChamadaResponse>(`${API_ATIVIDADES}/${aid}/confirmacoes`);
    setDados(res.data);
  }, []);

  useEffect(() => {
    setDados(null);
    setErro(null);
    setConvocar([]);
    setConvocarGrupos([]);
    setAtividadeId(null);
    if (!alvo) return;
    let vivo = true;
    (async () => {
      try {
        let aid = alvo.id;
        if (alvo.origem === 'gira') {
          const res = await apiClient.post<{ id: string }>(
            `${API_ATIVIDADES}/da-gira/${encodeURIComponent(alvo.id)}`,
          );
          aid = res.data.id;
        }
        if (!vivo) return;
        setAtividadeId(aid);
        await carregar(aid);
      } catch (err) {
        if (vivo)
          setErro(extractApiErrorMessage(err, 'Não foi possível carregar as confirmações.'));
      }
    })();
    return () => {
      vivo = false;
    };
  }, [alvo, carregar]);

  const dispensar = async (ids: string[]) => {
    if (!atividadeId || ids.length === 0) return;
    setOcupado(true);
    try {
      const res = await apiClient.post<ChamadaResponse>(
        `${API_ATIVIDADES}/${atividadeId}/dispensar`,
        { medium_ids: ids },
      );
      setDados(res.data);
      showSuccess('Fora da escala.');
    } catch (err) {
      showError(extractApiErrorMessage(err, 'Não foi possível salvar. Tente de novo.'));
    } finally {
      setOcupado(false);
    }
  };

  const porNaEscala = async () => {
    if (!atividadeId || (convocar.length === 0 && convocarGrupos.length === 0)) return;
    setOcupado(true);
    try {
      const res = await apiClient.post<ConvocarResponse>(`${API_ATIVIDADES}/${atividadeId}/convocar`, {
        medium_ids: convocar,
        grupo_ids: convocarGrupos,
      });
      setDados(res.data);
      setConvocar([]);
      setConvocarGrupos([]);
      showSuccess(
        res.data.resultado
          ? `${textoResultadoConvocacao(res.data.resultado)} Eles veem na Área do Médium.`
          : 'Na escala. Eles veem na Área do Médium.',
      );
    } catch (err) {
      showError(extractApiErrorMessage(err, 'Não foi possível salvar. Tente de novo.'));
    } finally {
      setOcupado(false);
    }
  };

  const c = dados?.contadores;
  const encerrada = Boolean(dados?.atividade.chamada_encerrada_em);
  return (
    <Sheet open={alvo !== null} onOpenChange={(o) => !o && onClose()}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 overflow-y-auto p-0 min-[640px]:max-w-[480px]"
      >
        <SheetHeader className="gap-1 border-b px-6 pt-6 pb-4">
          <SheetTitle className="pr-8 text-lg font-bold">Confirmações · {alvo?.titulo}</SheetTitle>
          <SheetDescription>
            {dados
              ? formatDateTimeBr(dados.atividade.inicio)
              : 'Quem vai, quem avisou que não vai e quem não respondeu.'}
          </SheetDescription>
        </SheetHeader>
        <div className="flex flex-col gap-4 px-6 py-5">
          {erro ? (
            <p className="text-sm text-destructive-strong" role="alert">
              {erro}
            </p>
          ) : !dados || !c ? (
            <Skeleton className="h-40 w-full" />
          ) : (
            <>
              <div
                className="grid grid-cols-3 gap-2 text-center"
                data-testid="confirmacoes-contadores"
              >
                <div className={cn('rounded-lg p-2', CLASSE_TOM.ok)}>
                  <p className="text-2xl font-bold tabular-nums">{c.confirmados}</p>
                  <p className="text-xs font-semibold">Vão</p>
                </div>
                <div className={cn('rounded-lg p-2', CLASSE_TOM.warn)}>
                  <p className="text-2xl font-bold tabular-nums">{c.ausencias_avisadas}</p>
                  <p className="text-xs font-semibold">Não vão</p>
                </div>
                <div className={cn('rounded-lg p-2', CLASSE_TOM.muted)}>
                  <p className="text-2xl font-bold tabular-nums">{c.sem_resposta}</p>
                  <p className="text-xs font-semibold">Sem resposta</p>
                </div>
              </div>

              {canInsert &&
                !encerrada &&
                !dados.atividade.cancelada &&
                (dados.outros_mediuns.length > 0 || grupos.length > 0) && (
                  <fieldset className="flex flex-col gap-2" data-testid="por-na-escala">
                    <legend className="mb-1 text-sm font-semibold">Pôr na escala</legend>
                    <PorNaEscalaCampos
                      mediuns={dados.outros_mediuns}
                      grupos={grupos}
                      mediumIds={convocar}
                      grupoIds={convocarGrupos}
                      onMediumIds={setConvocar}
                      onGrupoIds={setConvocarGrupos}
                    />
                    <Button
                      type="button"
                      className="self-end"
                      disabled={(convocar.length === 0 && convocarGrupos.length === 0) || ocupado}
                      onClick={() => void porNaEscala()}
                    >
                      <UserPlus aria-hidden /> Pôr na escala
                    </Button>
                  </fieldset>
                )}

              <ul
                className="flex flex-col divide-y rounded-lg border"
                aria-label="Quem está na escala"
              >
                {dados.pessoas.length === 0 && (
                  <li className="p-3 text-sm text-muted-foreground">Ninguém na escala ainda.</li>
                )}
                {dados.pessoas.map((p) => (
                  <li
                    key={p.medium_id}
                    className="flex items-start gap-2 p-3"
                    data-testid="confirmacao-pessoa"
                  >
                    <div className="flex min-w-0 flex-1 flex-col gap-1">
                      <strong className="text-sm">{p.nome}</strong>
                      <span
                        className={cn(
                          'self-start rounded-full px-2 py-0.5 text-xs font-semibold',
                          CLASSE_TOM[TOM_SITUACAO[p.situacao]],
                        )}
                      >
                        {ROTULO_SITUACAO[p.situacao]}
                      </span>
                      {p.substituido_por && (
                        <span className="text-sm text-muted-foreground">Trocou com {p.substituido_por}</span>
                      )}
                      {p.no_lugar_de && (
                        <span className="text-sm text-muted-foreground">No lugar de {p.no_lugar_de}</span>
                      )}
                      {p.justificativa && (
                        <span className="text-sm">Motivo: {p.justificativa}</span>
                      )}
                      {p.justificativa && atividadeId && dados.atividade.controla_presenca && (
                        <AbonoJustificativa
                          atividadeId={atividadeId}
                          mediumId={p.medium_id}
                          nome={p.nome}
                          avaliacao={p.justificativa_avaliacao}
                          canEdit={canEdit}
                          onAtualizado={setDados}
                        />
                      )}
                    </div>
                    {canEdit && !encerrada && !p.dispensado && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        title="Tirar da escala"
                        aria-label={`Tirar ${p.nome} da escala`}
                        disabled={ocupado}
                        onClick={() => void dispensar([p.medium_id])}
                      >
                        <UserMinus />
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
              <p className="text-xs text-muted-foreground">
                O motivo só aparece para quem cuida das escalas e não vai para relatório nem e-mail.
              </p>
              {canEdit && atividadeId && dados.atividade.controla_presenca && (
                <Button asChild variant="outline">
                  <Link href={`/admin/atividades/${atividadeId}/chamada`}>
                    <ClipboardCheck aria-hidden /> Abrir a chamada
                  </Link>
                </Button>
              )}
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

export default ConfirmacoesSheet;
