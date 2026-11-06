/**
 * Ajudas para telas que se atualizam sozinhas (Porta, Modo TV) rodarem leves em aparelho antigo.
 *
 * O iPad da casa (iOS 15, 2 GB) sentia cada ciclo de 8 s da Porta: a fila chegava igual, mas virava
 * um array novo e a tela inteira era desenhada de novo. E a aba escondida (ou a tela apagada)
 * continuava buscando e desenhando.
 */
import { useEffect, useRef } from 'react';

/** Mantém o valor anterior quando o novo tem o mesmo conteúdo: o React não redesenha nada. */
export function manterSeIgual<T>(anterior: T, novo: T): T {
  if (anterior === novo) return anterior;
  try {
    return JSON.stringify(anterior) === JSON.stringify(novo) ? anterior : novo;
  } catch {
    return novo;
  }
}

/**
 * Chama `atualizar` a cada `intervaloMs` enquanto a página está visível. Com a aba escondida ou a
 * tela apagada não busca nada; ao voltar, atualiza na hora. `ativo = false` desliga.
 */
export function useAtualizacaoPeriodica(atualizar: () => void, intervaloMs: number, ativo = true): void {
  const atualizarRef = useRef(atualizar);
  atualizarRef.current = atualizar;

  useEffect(() => {
    if (!ativo) return;
    const visivel = () => typeof document === 'undefined' || document.visibilityState !== 'hidden';
    const t = setInterval(() => {
      if (visivel()) atualizarRef.current();
    }, intervaloMs);
    const aoVoltar = () => {
      if (visivel()) atualizarRef.current();
    };
    document.addEventListener('visibilitychange', aoVoltar);
    return () => {
      clearInterval(t);
      document.removeEventListener('visibilitychange', aoVoltar);
    };
  }, [intervaloMs, ativo]);
}
