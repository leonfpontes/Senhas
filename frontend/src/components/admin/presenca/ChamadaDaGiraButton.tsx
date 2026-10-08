/**
 * Botão "Chamada" de uma gira (AM-17) — no cartão da gira (tela Giras) e na Porta.
 *
 * Só aparece com a Área do Médium liberada (`area_medium`), a presença no plano
 * (`atividades_corrente`) e o grupo `escalas:edit` ou `porta:edit` (o porteiro faz a chamada da
 * corrente na porta). Ao tocar, garante a âncora da gira (`POST /admin/atividades/da-gira/{id}/
 * chamada`) e abre `/admin/atividades/{atividade_id}/chamada`.
 */
import React, { useState } from 'react';
import { useRouter } from 'next/router';
import { ClipboardCheck, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useSubscription } from '@/hooks/useSubscription';
import { usePermissions } from '@/hooks/usePermissions';
import { useSnackbar } from '@/contexts/SnackbarContext';
import { apiClient, extractApiErrorMessage } from '@/services/api_client';

/** A chamada faz sentido no dia da gira e depois (correções): começa em até 12 h ou já começou. */
export function giraTemChamada(
  gira: { data_inicio: string; is_active?: boolean },
  agora: Date = new Date(),
): boolean {
  const inicio = new Date(gira.data_inicio).getTime();
  return (
    gira.is_active !== false &&
    !Number.isNaN(inicio) &&
    inicio <= agora.getTime() + 12 * 3600 * 1000
  );
}

export function usePodeFazerChamadaDaGira(): boolean {
  const { can } = useSubscription();
  const { can: canGroup } = usePermissions();
  return (
    can('area_medium') &&
    can('atividades_corrente') &&
    (canGroup('escalas', 'edit') || canGroup('porta', 'edit'))
  );
}

export function ChamadaDaGiraButton({
  giraId,
  className,
  variant = 'outline',
  size = 'default',
}: {
  giraId: string;
  className?: string;
  variant?: 'outline' | 'default' | 'ghost';
  size?: 'default' | 'sm';
}) {
  const router = useRouter();
  const { showError } = useSnackbar();
  const pode = usePodeFazerChamadaDaGira();
  const [abrindo, setAbrindo] = useState(false);
  if (!pode) return null;

  const abrir = async () => {
    setAbrindo(true);
    try {
      const res = await apiClient.post<{ atividade_id: string }>(
        `/api/v1/admin/atividades/da-gira/${encodeURIComponent(giraId)}/chamada`,
      );
      await router.push(`/admin/atividades/${res.data.atividade_id}/chamada`);
    } catch (err) {
      showError(extractApiErrorMessage(err, 'Não foi possível abrir a chamada da gira.'));
    } finally {
      setAbrindo(false);
    }
  };

  return (
    <Button
      type="button"
      variant={variant}
      size={size}
      className={className}
      onClick={() => void abrir()}
      disabled={abrindo}
    >
      {abrindo ? <Loader2 className="animate-spin" aria-hidden /> : <ClipboardCheck aria-hidden />}
      Chamada
    </Button>
  );
}

export default ChamadaDaGiraButton;
