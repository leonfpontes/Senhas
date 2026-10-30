/**
 * Página offline (P-01). O service worker (`public/sw.js`) guarda esta página na instalação e, quando
 * uma navegação falha por falta de rede, redireciona para `/offline?de=<página pedida>`. "Tentar de
 * novo" volta para essa página (só caminho da própria origem); quando a conexão volta, volta sozinha.
 * Sem `de` (acesso direto), vai para a Porta. Página estática, sem chamada à API.
 */
import React, { useCallback, useEffect } from 'react';
import Head from 'next/head';
import { RefreshCw, WifiOff } from 'lucide-react';

import { Button } from '@/components/ui/button';

const OFFLINE_MESSAGE = 'Sem conexão. A Porta volta a atualizar sozinha quando a internet voltar.';

/** Página que caiu sem rede (`?de=`) — só caminho da própria origem, nunca um site de fora. */
export function paginaDeOrigem(search: string): string | null {
  const de = new URLSearchParams(search).get('de');
  return de && de.startsWith('/') && !de.startsWith('//') && !de.startsWith('/\\') ? de : null;
}

function reloadPage() {
  if (window.location.pathname !== '/offline') window.location.reload();
  else window.location.assign(paginaDeOrigem(window.location.search) ?? '/admin/porta');
}

export default function OfflinePage() {
  const retry = useCallback(() => reloadPage(), []);

  useEffect(() => {
    window.addEventListener('online', retry);
    return () => window.removeEventListener('online', retry);
  }, [retry]);

  return (
    <>
      <Head>
        <title>Sem conexão | GiraHub</title>
        <meta name="robots" content="noindex" />
      </Head>
      <main className="flex min-h-svh flex-col items-center justify-center gap-6 bg-background px-6 py-12 text-center text-foreground">
        <span className="flex size-16 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <WifiOff className="size-8" aria-hidden />
        </span>
        <div className="flex max-w-sm flex-col gap-2">
          <h1 className="text-2xl font-bold">Sem conexão</h1>
          <p className="text-base text-muted-foreground">{OFFLINE_MESSAGE}</p>
        </div>
        <Button type="button" size="touch" onClick={retry}>
          <RefreshCw aria-hidden /> Tentar de novo
        </Button>
      </main>
    </>
  );
}
