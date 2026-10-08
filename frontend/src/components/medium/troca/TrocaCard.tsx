/**
 * Cartão de uma troca na escala (AM-27) — Início ("Para você ver agora" / "Acompanhando") e
 * detalhe da Agenda.
 *
 * Quem foi chamado vê "Ana pediu para você ir no lugar dela" com **Aceito ir** / **Não posso**;
 * quem pediu vê em que pé está ("Esperando a resposta", "Falta a direção aprovar", "Você trocou
 * com Beto") e "Cancelar pedido" enquanto está aberto. Só primeiro nome (D-07). Impersonando
 * (suporte), só leitura: as ações somem (o servidor também recusa).
 */
import React, { useState } from 'react';
import Link from 'next/link';
import { ArrowRight, ArrowRightLeft, Check, Loader2, X } from 'lucide-react';
import { useSnackbar } from '@/contexts/SnackbarContext';
import { quandoBr } from '@/components/medium/format';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { fraseDaTroca, tomDaTroca, type TrocaMedium } from '@/constants/trocas';
import { estaImpersonando, mensagemDoErro } from '@/components/medium/presenca/presencaApi';
import { acaoTroca } from './trocaApi';

const CARD =
  'flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 text-card-foreground shadow-sm';

const TOM: Record<ReturnType<typeof tomDaTroca>, string> = {
  brand: 'bg-primary/15 text-brand',
  ok: 'bg-success/15 text-success-strong',
  warn: 'bg-warning/15 text-warning-strong',
  muted: 'bg-muted text-muted-foreground',
};

export interface TrocaCardProps {
  troca: TrocaMedium;
  /** Mostra o título e o dia da atividade com o link para o detalhe (Início). */
  comAtividade?: boolean;
  onAtualizado?: (t: TrocaMedium) => void;
}

export function TrocaCard({ troca, comAtividade = false, onAtualizado }: TrocaCardProps) {
  const { showSuccess, showError } = useSnackbar();
  const [t, setT] = useState(troca);
  const [enviando, setEnviando] = useState<null | 'aceitar' | 'recusar' | 'cancelar'>(null);
  const leitura = estaImpersonando();

  const agir = async (acao: 'aceitar' | 'recusar' | 'cancelar') => {
    setEnviando(acao);
    try {
      const nova = await acaoTroca(t.id, acao);
      setT(nova);
      onAtualizado?.(nova);
      showSuccess(
        acao === 'aceitar'
          ? nova.status === 'aprovado'
            ? 'Combinado! Você está na escala no lugar do seu colega.'
            : 'Combinado! Agora falta a direção aprovar.'
          : acao === 'recusar'
            ? 'Tudo bem. Avisamos que você não pode ir.'
            : 'Pedido de troca cancelado.',
      );
    } catch (err) {
      showError(mensagemDoErro(err, 'Não conseguimos responder. Confira a internet e tente de novo.'));
    } finally {
      setEnviando(null);
    }
  };

  const href = `/medium/agenda/${t.atividade.origem}/${encodeURIComponent(t.atividade.id)}`;
  return (
    <article className={CARD} data-testid="troca-card">
      <p className="flex items-center gap-1.5 text-sm font-bold text-brand">
        <ArrowRightLeft className="size-4" aria-hidden />
        {t.papel === 'para_mim' ? 'Pedido de troca' : 'Sua troca na escala'}
      </p>
      {comAtividade && (
        <div className="min-w-0">
          <h3 className="font-display text-xl leading-tight font-semibold">{t.atividade.titulo}</h3>
          <p className="text-base text-muted-foreground first-letter:uppercase">{quandoBr(t.atividade.inicio)}</p>
        </div>
      )}
      {(t.funcao || t.grupo) && (
        <p className="text-sm text-muted-foreground">
          {t.funcao ? `Função: ${t.funcao}` : `Grupo: ${t.grupo}`}
        </p>
      )}
      <p className={cn('rounded-xl px-3 py-2.5 text-base font-semibold', TOM[tomDaTroca(t)])} role="status">
        {fraseDaTroca(t)}
      </p>
      {t.papel === 'para_mim' && t.recado && t.pode_aceitar && (
        <p className="text-base">
          <span className="font-bold">Recado:</span> {t.recado}
        </p>
      )}
      {!leitura && t.pode_aceitar && (
        <div className="grid grid-cols-2 gap-2.5">
          <Button
            type="button"
            size="touch"
            className="font-bold"
            disabled={enviando !== null}
            onClick={() => void agir('aceitar')}
          >
            {enviando === 'aceitar' ? <Loader2 className="animate-spin" aria-hidden /> : <Check aria-hidden />}
            Aceito ir
          </Button>
          <Button
            type="button"
            size="touch"
            variant="outline"
            className="font-bold"
            disabled={enviando !== null}
            onClick={() => void agir('recusar')}
          >
            {enviando === 'recusar' ? <Loader2 className="animate-spin" aria-hidden /> : <X aria-hidden />}
            Não posso
          </Button>
        </div>
      )}
      {!leitura && t.pode_cancelar && (
        <Button
          type="button"
          size="touch"
          variant="outline"
          className="w-full font-bold"
          disabled={enviando !== null}
          onClick={() => void agir('cancelar')}
        >
          {enviando === 'cancelar' && <Loader2 className="animate-spin" aria-hidden />}
          Cancelar pedido
        </Button>
      )}
      {comAtividade && (
        <Link
          href={href}
          className="inline-flex min-h-12 items-center gap-1.5 self-start font-bold text-brand underline-offset-4 outline-none hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          Ver detalhes <ArrowRight className="size-4" aria-hidden />
        </Link>
      )}
    </article>
  );
}
