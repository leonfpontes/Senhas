/**
 * Liga a passagem animada (lib/passagem.ts) entre o marketing e as telas de conta — montado uma vez
 * no `_app.tsx`, não renderiza nada. Só age quando a origem E o destino estão nesse trecho do site;
 * o painel admin, a plataforma e as páginas públicas dos terreiros seguem com a navegação comum.
 *
 * - Cliques em links internos (Next `Link` ou `<a>`): ouvidos na fase de captura; o
 *   `preventDefault()` faz o `Link` do Next desistir, e a navegação vai pelo router dentro da
 *   transição. Ctrl/⌘/Shift/Alt-clique, botão do meio, `target`, `download` → link comum.
 * - Voltar/avançar do navegador: `router.beforePopState` troca a página dentro da transição.
 * - `prefers-reduced-motion`: nada é interceptado.
 */
import { useEffect, useRef } from 'react';
import { useRouter } from 'next/router';
import { caminhoDe, comPassagem, movimentoReduzido, navegarComPassagem, passagemEntre, suportaTransicao } from '@/lib/passagem';

export function PassagemDeEntrada() {
  const router = useRouter();
  const atual = useRef<string>(typeof window === 'undefined' ? '/' : window.location.pathname);
  const routerRef = useRef(router);
  routerRef.current = router;

  useEffect(() => {
    if (router.asPath) atual.current = caminhoDe(router.asPath);
  }, [router.asPath]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const alvo = e.target as Element | null;
      const link = alvo?.closest?.('a[href]') as HTMLAnchorElement | null;
      if (!link || (link.target && link.target !== '_self') || link.hasAttribute('download')) return;
      let url: URL;
      try {
        url = new URL(link.href, window.location.href);
      } catch {
        return;
      }
      if (url.origin !== window.location.origin) return;
      const passagem = passagemEntre(window.location.pathname, url.pathname);
      if (!passagem || movimentoReduzido()) return;
      e.preventDefault();
      const href = `${url.pathname}${url.search}${url.hash}`;
      void navegarComPassagem((h) => Promise.resolve(routerRef.current.push(h)), href, passagem);
    };
    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, []);

  useEffect(() => {
    if (typeof router.beforePopState !== 'function') return;
    router.beforePopState(({ url, as }) => {
      const passagem = passagemEntre(atual.current, as);
      if (!passagem || !suportaTransicao()) return true;
      void comPassagem(passagem, () => Promise.resolve(routerRef.current.replace(url, as, { scroll: false })));
      return false;
    });
    return () => router.beforePopState(() => true);
  }, [router]);

  return null;
}

export default PassagemDeEntrada;
