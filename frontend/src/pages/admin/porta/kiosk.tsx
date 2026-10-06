/**
 * Modo TV — exibição em tela cheia da fila da porta, para a televisão da sala de espera.
 * Fonte enorme, alto contraste, o número atual e os três próximos; o título da aba mostra o
 * número chamado. Continua exigindo login (chamadas via apiClient → 401 leva ao /login).
 * Rota: /admin/porta/kiosk?gira=<id>  (gira opcional; sem ela usa a gira de hoje, pela mesma
 * regra do GiraContext — `pickTodayGira`).
 * Privacidade: a TV é pública na sala de espera — mostra só o primeiro nome e a inicial do
 * sobrenome ("Maria S."), nunca o nome completo.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import { Loader2 } from 'lucide-react';
import { apiClient } from '@/services/api_client';
import { pickTodayGira } from '@/components/admin/GiraContext';
import { nomeParaTv, normalizeLegacyStatus, numeroDaSenha } from '@/components/admin/senhaFormat';

const POLLING_INTERVAL_MS = 8000;

interface Gira {
  id: string;
  nome: string;
  data_inicio: string;
  is_active: boolean;
}
interface QueueItem {
  id: string;
  numero: number;
  status: string;
  consulente_nome: string | null;
  preferencial: boolean;
  is_sponsor: boolean;
  numero_formatado: string;
  checkin_em: string | null;
}

export default function PortaKioskPage() {
  const router = useRouter();
  const [giraId, setGiraId] = useState<string>('');
  const [giraNome, setGiraNome] = useState<string>('');
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [clock, setClock] = useState('');
  const prevNextRef = useRef<string | null>(null);

  const loadGiras = useCallback(async () => {
    try {
      const res = await apiClient.get('/api/v1/admin/giras');
      const all: Gira[] = Array.isArray(res.data) ? res.data : res.data.items || [];
      const queryGira = typeof router.query.gira === 'string' ? router.query.gira : '';
      // Sem ?gira: a gira de hoje (antes pegava a primeira ativa da lista, que vem da mais
      // distante no futuro para a mais antiga).
      const chosen = queryGira ? all.find((g) => g.id === queryGira) : pickTodayGira(all);
      if (chosen) {
        setGiraId(chosen.id);
        setGiraNome(chosen.nome);
      } else {
        setLoading(false);
      }
    } catch {
      setLoading(false);
    }
  }, [router.query.gira]);

  const loadQueue = useCallback(async () => {
    if (!giraId) return;
    try {
      const res = await apiClient.get(`/api/v1/admin/giras/${giraId}/door/queue`);
      setQueue(Array.isArray(res.data?.items) ? res.data.items.map(normalizeLegacyStatus) : []);
    } catch {
      /* tenta de novo no próximo ciclo */
    } finally {
      setLoading(false);
    }
  }, [giraId]);

  useEffect(() => {
    if (router.isReady) loadGiras();
  }, [router.isReady, loadGiras]);
  useEffect(() => {
    if (giraId) loadQueue();
  }, [giraId, loadQueue]);
  useEffect(() => {
    if (!giraId) return;
    const t = setInterval(loadQueue, POLLING_INTERVAL_MS);
    return () => clearInterval(t);
  }, [giraId, loadQueue]);

  useEffect(() => {
    const tick = () => setClock(new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }));
    tick();
    const t = setInterval(tick, 30_000);
    return () => clearInterval(t);
  }, []);

  const waiting = queue.filter((t) => t.status === 'emitted');
  const nextInLine = waiting.find((t) => t.checkin_em) ?? null;
  const upcoming = waiting.filter((t) => t.id !== nextInLine?.id).slice(0, 3);

  // Som quando o "próximo" muda
  useEffect(() => {
    if (nextInLine && prevNextRef.current && prevNextRef.current !== nextInLine.id) {
      try {
        const audio = new Audio('/sounds/notification.mp3');
        audio.play().catch(() => {});
      } catch {
        /* ambiente sem Audio */
      }
    }
    prevNextRef.current = nextInLine?.id ?? null;
    // Depende do id, não do objeto: o som só toca quando o "próximo" realmente muda.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nextInLine?.id]);

  const numeroAtual = nextInLine ? numeroDaSenha(nextInLine) : null;

  return (
    <>
      <Head>
        <title>{numeroAtual ? `${numeroAtual} — Porta` : 'Modo TV — Porta'}</title>
        <meta name="robots" content="noindex, nofollow" />
      </Head>
      <main
        data-testid="kiosk"
        className="flex min-h-screen flex-col items-center justify-center bg-[#05070f] px-6 py-10 text-white md:px-12"
      >
        <header className="absolute inset-x-0 top-0 flex items-start justify-between px-6 py-5 text-lg text-white/60 md:px-10 md:text-2xl">
          <span className="truncate pr-4">{giraNome}</span>
          <span className="tabular-nums" aria-label="Hora atual">
            {clock}
          </span>
        </header>

        {loading ? (
          <Loader2 className="size-12 animate-spin text-white/80" aria-label="Carregando" />
        ) : !giraId ? (
          <p className="text-3xl text-white/70">Nenhuma gira hoje.</p>
        ) : (
          <>
            <p className="mb-2 text-xl tracking-[0.35em] text-white/70 uppercase md:text-3xl">Senha</p>
            <p
              data-testid="kiosk-numero"
              className="font-mono text-[6.5rem] leading-none font-black text-[#c7d2fe] tabular-nums sm:text-[10rem] md:text-[16rem]"
              aria-live="polite"
            >
              {numeroAtual ?? '—'}
            </p>
            {nextInLine?.consulente_nome && (
              <p className="mt-4 max-w-[90vw] truncate text-3xl font-bold md:text-6xl" data-testid="kiosk-nome">
                {nomeParaTv(nextInLine.consulente_nome)}
              </p>
            )}
            {!nextInLine && (
              <p className="mt-4 text-2xl text-white/60 md:text-4xl">Aguardando a próxima pessoa chegar</p>
            )}

            {upcoming.length > 0 && (
              <section className="mt-12 flex flex-col items-center gap-3 md:mt-20" aria-label="Próximas senhas">
                <p className="text-lg tracking-[0.3em] text-white/50 uppercase md:text-2xl">Próximas</p>
                <ol className="flex flex-wrap justify-center gap-6 md:gap-12">
                  {upcoming.map((t) => (
                    <li
                      key={t.id}
                      className="font-mono text-4xl font-bold text-white/70 tabular-nums md:text-7xl"
                      data-testid="kiosk-proxima"
                    >
                      {numeroDaSenha(t)}
                    </li>
                  ))}
                </ol>
              </section>
            )}
          </>
        )}
      </main>
    </>
  );
}
