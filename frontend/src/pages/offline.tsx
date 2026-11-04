/**
 * Página offline (P-01). O service worker (`public/sw.js`) guarda esta página na instalação e a
 * devolve no lugar de qualquer navegação que falhe por falta de rede — o endereço continua o da
 * página pedida, então "Tentar de novo" recarrega a própria página. Quando a conexão volta, recarrega
 * sozinha. Página estática, sem chamada à API.
 *
 * Beta "Bilhete sem internet" (jornadas v2): se este aparelho guardou um bilhete ao pegar a senha
 * (`lib/bilheteGuardado.ts`), a página mostra a senha em vez do aviso genérico — é o consulente no
 * portão, sem sinal. Sem bilhete guardado, nada muda.
 */
import React, { useCallback, useEffect, useState } from 'react';
import Head from 'next/head';
import { WifiOff } from 'lucide-react';

import { cn } from '@/lib/utils';
import { fraunces } from '@/components/landing/fonts';
import { GiraHubLogo } from '@/components/landing/GiraHubLogo';

import { Button } from '@/components/ui/button';
import { Bilhete, PublicShell } from '@/components/public';
import { bilhetesGuardados, type BilheteGuardado } from '@/lib/bilheteGuardado';

function formatGuardadoEm(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const dia = d.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'numeric', timeZone: 'America/Sao_Paulo' });
  const hora = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' }).replace(':', 'h');
  return `${dia}, às ${hora}`;
}

const OFFLINE_MESSAGE = 'Sem conexão. A Porta volta a atualizar sozinha quando a internet voltar.';

function reloadPage() {
  if (window.location.pathname === '/offline') window.location.assign('/admin/porta');
  else window.location.reload();
}

export default function OfflinePage() {
  const retry = useCallback(() => reloadPage(), []);
  const [guardado, setGuardado] = useState<BilheteGuardado | null>(null);
  useEffect(() => {
    const path = window.location.pathname;
    // Só nas páginas do consulente (ou abrindo /offline direto): na Porta, o aviso de sempre.
    if (path === '/offline' || path.startsWith('/public') || path.startsWith('/s/')) {
      setGuardado(bilhetesGuardados()[0] ?? null);
    }
  }, []);

  useEffect(() => {
    window.addEventListener('online', retry);
    return () => window.removeEventListener('online', retry);
  }, [retry]);

  if (guardado) {
    const t = guardado.ticket;
    return (
      <PublicShell title="Sua senha" noindex tenantName={t.tenant_name} brand={{ primary: t.primary_color, secondary: t.secondary_color }}>
        <p className="mb-2 flex items-center gap-2.5 rounded-lg bg-warning/10 px-3.5 py-3 text-base font-semibold text-warning-strong">
          <WifiOff className="size-5 shrink-0" aria-hidden /> Sem internet. Esta é a senha guardada neste celular.
        </p>
        <Bilhete ticket={t} showNextGiras={false} />
        <p className="mt-2 text-center text-base text-muted-foreground">
          Guardada em {formatGuardadoEm(guardado.guardadoEm)}. Mostre esta tela na entrada: o número é o mesmo.
        </p>
      </PublicShell>
    );
  }

  return (
    <>
      <Head>
        <title>Sem conexão | GiraHub</title>
        <meta name="robots" content="noindex" />
      </Head>
      {/* J11 v2 · 14: a barra café com a marca, o ícone num círculo areia e o título em Fraunces. */}
      <div className={cn(fraunces.variable, 'flex min-h-svh flex-col bg-areia-50 text-tinta')}>
        <header className="flex h-16 items-center bg-cafe-950 px-4 sm:px-6">
          <GiraHubLogo className="text-white" />
        </header>
        <main className="flex flex-1 flex-col items-center justify-center gap-4 px-6 py-12 text-center">
          <span aria-hidden className="flex size-20 items-center justify-center rounded-full bg-areia-100">
            <WifiOff className="size-8 text-barro-700" />
          </span>
          <h1 className="font-display text-4xl font-medium tracking-[-0.02em]">Sem conexão</h1>
          <p className="max-w-sm text-base text-tinta-suave">{OFFLINE_MESSAGE}</p>
          <Button type="button" size="touch" className="mt-2 rounded-[10px] bg-folha-600 text-white hover:bg-folha-700" onClick={retry}>
            Tentar de novo
          </Button>
        </main>
      </div>
    </>
  );
}
