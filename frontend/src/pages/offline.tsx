/**
 * Página offline (P-01). O service worker (`public/sw.js`) guarda esta página na instalação e a
 * devolve no lugar de qualquer navegação que falhe por falta de rede — o endereço continua o da
 * página pedida, então "Tentar de novo" recarrega a própria página. Quando a conexão volta, recarrega
 * sozinha. Página estática, sem chamada à API.
 */
import React, { useCallback, useEffect } from 'react';
import Head from 'next/head';
import { RefreshCw, WifiOff } from 'lucide-react';

import { Button } from '@/components/ui/button';

const OFFLINE_MESSAGE = 'Sem conexão. A Porta volta a atualizar sozinha quando a internet voltar.';

function reloadPage() {
  if (window.location.pathname === '/offline') window.location.assign('/admin/porta');
  else window.location.reload();
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
