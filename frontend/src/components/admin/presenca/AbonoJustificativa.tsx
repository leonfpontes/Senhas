/**
 * Abono do motivo de uma ausência (AM-27) — "Aceitar motivo" / "Recusar motivo" no painel.
 *
 * Usado nas Confirmações (`ConfirmacoesSheet`) e no detalhe do relatório de assiduidade. Chama
 * `PUT /api/v1/admin/atividades/{id}/justificativas/{medium_id}` (`escalas:edit` — quem monta só
 * passa `canEdit` com a permissão). Motivo recusado conta como falta sem justificativa no relatório;
 * "Desfazer" volta a "não avaliado" (que vale como justificado). Um motivo novo do médium também
 * volta a "não avaliado".
 */
import React, { useState } from 'react';
import { Check, Undo2, X } from 'lucide-react';
import { useSnackbar } from '@/contexts/SnackbarContext';
import { apiClient, extractApiErrorMessage } from '@/services/api_client';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  ROTULO_AVALIACAO,
  abonoHref,
  type AvaliacaoJustificativa,
  type ChamadaResponse,
} from '@/constants/presenca';

export interface AbonoJustificativaProps {
  atividadeId: string;
  mediumId: string;
  nome: string;
  avaliacao?: AvaliacaoJustificativa | null;
  canEdit: boolean;
  onAtualizado?: (dados: ChamadaResponse) => void;
}

export function AbonoJustificativa({
  atividadeId,
  mediumId,
  nome,
  avaliacao,
  canEdit,
  onAtualizado,
}: AbonoJustificativaProps) {
  const { showSuccess, showError } = useSnackbar();
  const [ocupado, setOcupado] = useState(false);

  const avaliar = async (valor: AvaliacaoJustificativa | null) => {
    setOcupado(true);
    try {
      const res = await apiClient.put<ChamadaResponse>(abonoHref(atividadeId, mediumId), { avaliacao: valor });
      onAtualizado?.(res.data);
      showSuccess(
        valor === 'aceita'
          ? 'Motivo aceito.'
          : valor === 'recusada'
            ? 'Motivo recusado: conta como falta sem justificativa.'
            : 'Avaliação desfeita.',
      );
    } catch (err) {
      showError(extractApiErrorMessage(err, 'Não foi possível salvar. Tente de novo.'));
    } finally {
      setOcupado(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-1.5" data-testid="abono-justificativa">
      {avaliacao && (
        <span
          className={cn(
            'rounded-full px-2 py-0.5 text-xs font-semibold',
            avaliacao === 'aceita' ? 'bg-success/15 text-success-strong' : 'bg-destructive/15 text-destructive-strong',
          )}
        >
          {ROTULO_AVALIACAO[avaliacao]}
        </span>
      )}
      {canEdit && avaliacao !== 'aceita' && (
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={ocupado}
          aria-label={`Aceitar o motivo de ${nome}`}
          onClick={() => void avaliar('aceita')}
        >
          <Check aria-hidden /> Aceitar motivo
        </Button>
      )}
      {canEdit && avaliacao !== 'recusada' && (
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={ocupado}
          aria-label={`Recusar o motivo de ${nome}`}
          onClick={() => void avaliar('recusada')}
        >
          <X aria-hidden /> Recusar motivo
        </Button>
      )}
      {canEdit && avaliacao && (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={ocupado}
          aria-label={`Desfazer a avaliação do motivo de ${nome}`}
          onClick={() => void avaliar(null)}
        >
          <Undo2 aria-hidden /> Desfazer
        </Button>
      )}
    </div>
  );
}
