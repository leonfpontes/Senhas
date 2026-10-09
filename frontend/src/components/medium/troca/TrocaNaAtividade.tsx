/**
 * Troca na escala no detalhe da Agenda (AM-27).
 *
 * Busca `GET /api/v1/medium/atividades/{origem}/{id}/troca` e mostra: os pedidos em que o médium é
 * o colega chamado (Aceito ir / Não posso) ou em que ele foi no lugar de alguém, o pedido dele
 * (andamento, "Cancelar pedido") e o botão **Pedir troca** quando dá. Sem o plano da troca (403),
 * fora da escala ou sem nada para mostrar, não aparece nada.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { ArrowRightLeft } from 'lucide-react';
import { useSnackbar } from '@/contexts/SnackbarContext';
import { Button } from '@/components/ui/button';
import type { TrocaDaAtividade } from '@/constants/trocas';
import { estaImpersonando } from '@/components/medium/presenca/presencaApi';
import { PedirTrocaSheet } from './PedirTrocaSheet';
import { TrocaCard } from './TrocaCard';
import { pedirTroca, trocaDaAtividade } from './trocaApi';

export interface TrocaNaAtividadeProps {
  origem: 'gira' | 'atividade';
  id: string;
  /** Chamado quando a troca mudou a escala (para recarregar a participação). */
  onMudou?: () => void;
}

export function TrocaNaAtividade({ origem, id, onMudou }: TrocaNaAtividadeProps) {
  const { showSuccess } = useSnackbar();
  const [dados, setDados] = useState<TrocaDaAtividade | null>(null);
  const [aberto, setAberto] = useState(false);
  const leitura = estaImpersonando();

  const carregar = useCallback(() => {
    let vivo = true;
    trocaDaAtividade(origem, id)
      .then((d) => vivo && setDados(d && Array.isArray(d.para_mim) && Array.isArray(d.colegas) ? d : null))
      .catch(() => vivo && setDados(null));
    return () => {
      vivo = false;
    };
  }, [origem, id]);

  useEffect(() => carregar(), [carregar]);

  if (!dados) return null;
  const temAlgo = dados.pode_pedir || dados.pedido || dados.para_mim.length > 0;
  if (!temAlgo) return null;

  const mudou = () => {
    carregar();
    onMudou?.();
  };

  return (
    <section className="flex flex-col gap-3" aria-label="Troca na escala" data-testid="troca-na-atividade">
      {dados.para_mim.map((t) => (
        <TrocaCard key={`${t.id}-${t.status}`} troca={t} onAtualizado={mudou} />
      ))}
      {dados.pedido && <TrocaCard key={`${dados.pedido.id}-${dados.pedido.status}`} troca={dados.pedido} onAtualizado={mudou} />}
      {dados.pode_pedir && !leitura && (
        <>
          <Button
            type="button"
            variant="outline"
            size="touch"
            className="w-full font-bold"
            onClick={() => setAberto(true)}
          >
            <ArrowRightLeft aria-hidden />
            Não vou poder: pedir troca
          </Button>
          <PedirTrocaSheet
            open={aberto}
            onOpenChange={setAberto}
            colegas={dados.colegas}
            exigeAprovacao={dados.exige_aprovacao}
            onEnviar={async (colegaId, recado) => {
              setDados(await pedirTroca(origem, id, colegaId, recado));
              showSuccess('Pedido de troca enviado.');
            }}
          />
        </>
      )}
    </section>
  );
}
